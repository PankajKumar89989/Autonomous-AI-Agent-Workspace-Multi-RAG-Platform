import asyncio
import json
import uuid

import pytest
from sqlalchemy import func, select, update

from app.agents import runner
from app.agents.errors import ToolError
from app.agents.runner import execute_research_run
from app.agents.tools.web_search import WebResult
from app.db.models import AgentRun, AgentRunEvent, ResearchSource
from app.rag.ingestion import process_document
from app.services import research_service
from tests.helpers import make_kb, make_user, upload

BATTERIES = ("Lithium battery storage systems hold renewable energy from solar and wind farms. "
             "Grid scale batteries improve energy storage capacity. ") * 4
COOKING = ("Slow cooked pasta sauce needs tomatoes garlic basil and olive oil. "
           "Simmer the sauce gently for an hour. ") * 4
WEB = [WebResult("Grid storage news", "https://example.com/storage?utm_source=x", "Utility scale lithium battery storage costs fell this year.", 0.9)]


class FakeSearch:
    name = "fake"

    def __init__(self, results=None, error=None, delay=0.0):
        self.results, self.error, self.delay = results or [], error, delay

    async def search(self, query, max_results):
        await asyncio.sleep(self.delay)
        if self.error:
            raise self.error
        return self.results


async def _index(client, session_maker, h, kb_id, name, text):
    doc = (await upload(client, h, kb_id, name, text.encode())).json()["data"]
    async with session_maker() as session:
        await process_document(session, uuid.UUID(doc["id"]))


async def _setup(client, session_maker, email="a@example.com"):
    h = await make_user(client, email)
    kb = await make_kb(client, h)
    await _index(client, session_maker, h, kb["id"], "batteries.txt", BATTERIES)
    await _index(client, session_maker, h, kb["id"], "cooking.txt", COOKING)
    return h, kb


async def _start(client, h, **body):
    body.setdefault("objective", "Summarise lithium battery storage for solar energy")
    return await client.post("/api/research", json=body, headers=h)


async def _finish(client, h, res):
    """Start has queued the run; do what the worker would do, then return the saved run."""
    run_id = res.json()["data"]["id"]
    await execute_research_run(uuid.UUID(run_id))
    return (await client.get(f"/api/research/{run_id}", headers=h)).json()["data"]


def _sse(res):
    out = []
    for block in res.text.strip().split("\n\n"):
        if block.startswith(":"):
            continue
        lines = block.split("\n")
        out.append((int(lines[0].removeprefix("id: ")), lines[1].removeprefix("event: "), json.loads(lines[2].removeprefix("data: "))))
    return out


async def test_start_queues_and_returns_immediately(client, session_maker, research_enqueued):
    h, kb = await _setup(client, session_maker)
    res = await _start(client, h, knowledge_base_ids=[kb["id"]])
    assert res.status_code == 201
    run = res.json()["data"]
    assert run["status"] == "queued" and run["steps"] == [] and research_enqueued == [uuid.UUID(run["id"])]
    status = (await client.get(f"/api/research/{run['id']}/status", headers=h)).json()["data"]
    assert status["status"] == "queued" and status["steps_total"] == 0


async def test_worker_completes_the_run_and_records_everything(client, session_maker):
    h, kb = await _setup(client, session_maker)
    run = await _finish(client, h, await _start(client, h, knowledge_base_ids=[kb["id"]]))
    assert run["status"] == "completed" and run["duration_ms"] is not None and run["completed_at"]
    assert [s["agent"] for s in run["steps"]] == ["planner", "document", "analyst", "summarizer", "citation"]
    assert all(s["status"] == "completed" for s in run["steps"])
    assert "## Executive Summary" in run["report"] and "## Sources" in run["report"] and "batteries.txt" in run["report"]
    assert run["sources"] and all(s["kind"] == "document" for s in run["sources"]) and run["sources"][0]["cited"] is True
    assert run["model"] == "mock-extractive"


async def test_events_replay_in_order_and_support_resuming(client, session_maker):
    h, kb = await _setup(client, session_maker)
    run = await _finish(client, h, await _start(client, h, knowledge_base_ids=[kb["id"]]))
    events = _sse(await client.get(f"/api/research/{run['id']}/events", headers=h))
    names = [e for _, e, _ in events]
    assert names[0] == "run" and names[-1] == "done"
    assert names.index("plan") < names.index("sources") < names.index("report") < names.index("done")
    assert [s for s, _, _ in events] == list(range(1, len(events) + 1))
    resumed = _sse(await client.get(f"/api/research/{run['id']}/events?after=3", headers=h))
    assert [s for s, _, _ in resumed] == [s for s, _, _ in events if s > 3]


async def test_web_and_document_sources_land_in_the_library(client, session_maker, monkeypatch):
    monkeypatch.setattr("app.agents.factory.get_search_provider", lambda: FakeSearch(WEB))
    h, kb = await _setup(client, session_maker)
    run = await _finish(client, h, await _start(client, h, knowledge_base_ids=[kb["id"]], use_web=True))
    assert {s["kind"] for s in run["sources"]} == {"document", "web"}
    web = (await client.get("/api/research/sources?kind=web", headers=h)).json()["data"]
    assert web["total"] == 1
    item = web["items"][0]
    assert item["domain"] == "example.com" and item["retrieved_at"] and item["run_id"] == run["id"] and item["run_objective"].startswith("Summarise")
    assert (await client.get("/api/research/sources?q=example.com", headers=h)).json()["data"]["total"] == 1
    assert (await client.get("/api/research/sources?q=nothing-like-this", headers=h)).json()["data"]["total"] == 0
    cited = (await client.get("/api/research/sources?cited=true", headers=h)).json()["data"]["items"]
    assert cited and all(s["cited"] for s in cited)
    assert (await client.get("/api/research/sources?kind=document", headers=h)).json()["data"]["total"] >= 1


async def test_web_failure_is_a_partial_failure(client, session_maker, monkeypatch):
    monkeypatch.setattr("app.agents.factory.get_search_provider", lambda: FakeSearch(error=ToolError("search is down")))
    h, kb = await _setup(client, session_maker)
    run = await _finish(client, h, await _start(client, h, knowledge_base_ids=[kb["id"]], use_web=True))
    assert run["status"] == "completed"
    web = next(s for s in run["steps"] if s["agent"] == "web")
    assert web["status"] == "failed" and any("results may be incomplete" in w for w in run["warnings"])


async def test_cancel_a_queued_run_means_the_worker_skips_it(client, session_maker):
    h, kb = await _setup(client, session_maker)
    run_id = (await _start(client, h, knowledge_base_ids=[kb["id"]])).json()["data"]["id"]
    res = await client.post(f"/api/research/{run_id}/cancel", headers=h)
    assert res.status_code == 200 and res.json()["data"]["status"] == "cancelled"
    await execute_research_run(uuid.UUID(run_id))  # the job still comes off the queue; it must do nothing
    run = (await client.get(f"/api/research/{run_id}", headers=h)).json()["data"]
    assert run["status"] == "cancelled" and run["steps"] == []
    assert [e for _, e, _ in _sse(await client.get(f"/api/research/{run_id}/events", headers=h))] == ["cancelled"]
    assert (await client.post(f"/api/research/{run_id}/cancel", headers=h)).status_code == 409


async def test_cancel_a_running_run(client, session_maker, monkeypatch):
    monkeypatch.setattr(runner, "CANCEL_POLL_S", 0.05)
    monkeypatch.setattr("app.agents.factory.get_search_provider", lambda: FakeSearch(WEB, delay=30))
    h, kb = await _setup(client, session_maker)
    run_id = (await _start(client, h, knowledge_base_ids=[kb["id"]], use_web=True)).json()["data"]["id"]
    worker = asyncio.create_task(execute_research_run(uuid.UUID(run_id)))
    for _ in range(100):  # wait until the web step is mid-flight
        await asyncio.sleep(0.05)
        steps = (await client.get(f"/api/research/{run_id}", headers=h)).json()["data"]["steps"]
        if any(s["agent"] == "web" and s["status"] == "running" for s in steps):
            break
    else:
        pytest.fail("the web step never started")
    assert (await client.post(f"/api/research/{run_id}/cancel", headers=h)).json()["data"]["cancel_requested"] is True
    await asyncio.wait_for(worker, 10)
    run = (await client.get(f"/api/research/{run_id}", headers=h)).json()["data"]
    assert run["status"] == "cancelled" and run["steps"][0]["agent"] == "planner"
    assert _sse(await client.get(f"/api/research/{run_id}/events", headers=h))[-1][1] == "cancelled"


async def test_enqueue_failure_marks_the_run_failed(client, session_maker, monkeypatch):
    async def broken(run_id):
        raise ConnectionError("redis down")

    monkeypatch.setattr(research_service, "enqueue_research_run", broken)
    h, kb = await _setup(client, session_maker)
    run = (await _start(client, h, knowledge_base_ids=[kb["id"]])).json()["data"]
    assert run["status"] == "failed" and "Redis" in run["error_message"]
    assert _sse(await client.get(f"/api/research/{run['id']}/events", headers=h))[-1][1] == "error"


async def test_runs_nobody_picks_up_or_that_lose_their_worker_are_failed(client, session_maker):
    h, kb = await _setup(client, session_maker)
    queued = (await _start(client, h, knowledge_base_ids=[kb["id"]])).json()["data"]["id"]
    running = (await _start(client, h, knowledge_base_ids=[kb["id"]], objective="Another objective here")).json()["data"]["id"]
    old = research_service.utcnow().replace(year=2020)
    async with session_maker() as db:
        await db.execute(update(AgentRun).where(AgentRun.id == uuid.UUID(queued)).values(created_at=old))
        await db.execute(update(AgentRun).where(AgentRun.id == uuid.UUID(running)).values(status="running", heartbeat_at=old))
        await db.commit()
    first = (await client.get(f"/api/research/{queued}", headers=h)).json()["data"]
    second = (await client.get(f"/api/research/{running}", headers=h)).json()["data"]
    assert first["status"] == "failed" and "No worker picked this run up" in first["error_message"]
    assert second["status"] == "failed" and "worker stopped responding" in second["error_message"]
    assert _sse(await client.get(f"/api/research/{queued}/events", headers=h))[-1][1] == "error"


async def test_rerun_creates_a_fresh_run_with_the_same_settings(client, session_maker, research_enqueued):
    h, kb = await _setup(client, session_maker)
    first = await _finish(client, h, await _start(client, h, knowledge_base_ids=[kb["id"]], length="short"))
    again = await client.post(f"/api/research/{first['id']}/rerun", headers=h)
    assert again.status_code == 201
    new = again.json()["data"]
    assert new["id"] != first["id"] and new["status"] == "queued" and new["objective"] == first["objective"]
    assert new["options"]["length"] == "short" and new["knowledge_base_ids"] == [kb["id"]] and len(research_enqueued) == 2
    assert (await client.get(f"/api/research/{first['id']}", headers=h)).json()["data"]["status"] == "completed"


async def test_export_markdown_and_pdf(client, session_maker):
    h, kb = await _setup(client, session_maker)
    res = await _start(client, h, knowledge_base_ids=[kb["id"]])
    run_id = res.json()["data"]["id"]
    assert (await client.get(f"/api/research/{run_id}/export", headers=h)).status_code == 409  # not finished yet
    await _finish(client, h, res)
    md = await client.get(f"/api/research/{run_id}/export?format=markdown", headers=h)
    assert md.status_code == 200 and md.headers["content-type"].startswith("text/markdown")
    assert md.headers["content-disposition"] == 'attachment; filename="summarise-lithium-battery-storage-for-solar-energy.md"'
    for heading in ("## Research Question", "## Methodology", "## Executive Summary", "## Sources"):
        assert heading in md.text
    pdf = await client.get(f"/api/research/{run_id}/export?format=pdf", headers=h)
    assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF") and pdf.headers["content-type"] == "application/pdf"
    assert (await client.get(f"/api/research/{run_id}/export?format=docx", headers=h)).status_code == 422


async def test_runs_and_sources_are_private(client, session_maker):
    owner, kb = await _setup(client, session_maker, "owner@example.com")
    intruder = await make_user(client, "intruder@example.com")
    run = await _finish(client, owner, await _start(client, owner, knowledge_base_ids=[kb["id"]]))
    base = f"/api/research/{run['id']}"
    for method, suffix in [("get", ""), ("get", "/status"), ("get", "/events"), ("post", "/cancel"), ("post", "/rerun"), ("get", "/export"), ("delete", "")]:
        assert (await getattr(client, method)(base + suffix, headers=intruder)).status_code == 404, suffix
    assert (await _start(client, intruder, knowledge_base_ids=[kb["id"]])).status_code == 404
    assert (await client.get("/api/research", headers=intruder)).json()["data"]["total"] == 0
    assert (await client.get("/api/research/sources", headers=intruder)).json()["data"]["total"] == 0
    assert (await client.get(base, headers=owner)).status_code == 200


async def test_delete_removes_events_and_sources(client, session_maker):
    h, kb = await _setup(client, session_maker)
    run = await _finish(client, h, await _start(client, h, knowledge_base_ids=[kb["id"]]))
    assert (await client.delete(f"/api/research/{run['id']}", headers=h)).status_code == 200
    assert (await client.get(f"/api/research/{run['id']}", headers=h)).status_code == 404
    async with session_maker() as db:
        assert await db.scalar(select(func.count()).select_from(AgentRunEvent)) == 0
        assert await db.scalar(select(func.count()).select_from(ResearchSource)) == 0
    assert (await client.get("/api/dashboard/overview", headers=h)).json()["data"]["stats"]["research_tasks"] == 0


async def test_no_evidence_completes_with_an_honest_report(client, session_maker):
    h, kb = await _setup(client, session_maker)
    run = await _finish(client, h, await _start(client, h, objective="zzzzqq wwwwxx yyyyvv", knowledge_base_ids=[kb["id"]]))
    assert run["status"] == "completed" and "won't guess" in run["report"] and run["sources"] == []


async def test_validation_and_auth(client):
    h = await make_user(client, "a@example.com")
    assert (await client.post("/api/research", json={"objective": "hi"}, headers=h)).status_code == 422
    assert (await client.post("/api/research", json={"objective": "a valid objective"})).status_code == 401
    assert (await client.get("/api/research/sources")).status_code == 401

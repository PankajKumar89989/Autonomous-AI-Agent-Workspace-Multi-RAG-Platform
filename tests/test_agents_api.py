import json
import uuid

from app.agents.tools.web_search import WebResult
from app.rag.llm import MockChatModel
from app.rag.pipelines import NO_EVIDENCE_MESSAGE, NO_KB_MESSAGE
from app.rag.ingestion import process_document
from app.agents.runner import execute_research_run
from app.services import agent_service, chat_service
from tests.helpers import make_kb, make_user, upload

BATTERIES = ("Lithium battery storage systems hold renewable energy from solar and wind farms. "
             "Grid scale batteries improve energy storage capacity. ") * 4
COOKING = ("Slow cooked pasta sauce needs tomatoes garlic basil and olive oil. "
           "Simmer the sauce gently for an hour. ") * 4
WEB = [WebResult("Grid storage news", "https://example.com/storage", "Utility scale lithium battery storage costs fell this year.", 0.9)]


class FakeSearch:
    name = "fake"

    async def search(self, query, max_results):
        return WEB


class Recorder(MockChatModel):
    """The mock model, plus a record of every prompt and temperature it was given."""

    def __init__(self):
        self.calls, self.models = [], []

    def factory(self, model=None):
        self.models.append(model)
        return self

    async def stream(self, messages, *, temperature=0.2):
        self.calls.append((messages, temperature))
        async for part in super().stream(messages, temperature=temperature):
            yield part


def _events(res):
    out = []
    for block in res.text.strip().split("\n\n"):
        lines = block.split("\n")
        out.append((lines[0].removeprefix("event: "), json.loads(lines[1].removeprefix("data: "))))
    return out


async def _index(client, session_maker, h, kb_id, name, text):
    doc = (await upload(client, h, kb_id, name, text.encode())).json()["data"]
    async with session_maker() as session:
        await process_document(session, uuid.UUID(doc["id"]))


async def _agent(client, h, **over):
    body = {"name": "Helper", "instructions": "Be helpful.", **over}
    res = await client.post("/api/agents", json=body, headers=h)
    assert res.status_code == 201, res.text
    return res.json()["data"]


async def _two_kbs(client, session_maker, h):
    batteries = await make_kb(client, h, name="Batteries")
    cooking = await make_kb(client, h, name="Cooking")
    await _index(client, session_maker, h, batteries["id"], "batteries.txt", BATTERIES)
    await _index(client, session_maker, h, cooking["id"], "cooking.txt", COOKING)
    return batteries, cooking


async def _ask(client, h, message, **extra):
    return _events(await client.post("/api/chat", json={"message": message, **extra}, headers=h))


def _sources(events):
    return next(p for n, p in events if n == "sources")["sources"]


async def test_options_report_models_tools_and_whether_web_search_is_ready(client, monkeypatch):
    h = await make_user(client, "a@example.com")
    monkeypatch.setattr(agent_service, "get_search_provider", lambda: None)
    data = (await client.get("/api/agents/options", headers=h)).json()["data"]
    assert "gpt-4o-mini" in data["models"] and data["styles"] == ["concise", "balanced", "detailed"]
    tools = {t["name"]: t for t in data["tools"]}
    assert set(tools) == {"search_documents", "search_web", "calculator", "analyze_csv", "summarize_text"}
    assert tools["search_web"]["available"] is False and "TAVILY_API_KEY" in tools["search_web"]["unavailable_reason"]
    assert tools["calculator"]["available"] is True
    monkeypatch.setattr(agent_service, "get_search_provider", lambda: FakeSearch())
    again = {t["name"]: t for t in (await client.get("/api/agents/options", headers=h)).json()["data"]["tools"]}
    assert again["search_web"]["available"] is True


async def test_create_read_update_delete(client, session_maker):
    h = await make_user(client, "a@example.com")
    kb = await make_kb(client, h)
    agent = await _agent(client, h, knowledge_base_ids=[kb["id"]], tools=["search_documents", "calculator"], temperature=0.5, max_steps=5)
    assert agent["knowledge_base_ids"] == [kb["id"]] and agent["tools"] == ["search_documents", "calculator"] and agent["response_style"] == "balanced"
    assert (await client.get(f"/api/agents/{agent['id']}", headers=h)).json()["data"]["max_steps"] == 5
    assert (await client.get("/api/agents", headers=h)).json()["data"]["total"] == 1
    upd = await client.put(f"/api/agents/{agent['id']}", json={"name": "Renamed", "model": "gpt-4o", "research_mode": True}, headers=h)
    saved = upd.json()["data"]
    assert saved["name"] == "Renamed" and saved["model"] == "gpt-4o" and saved["research_mode"] is True and saved["instructions"] == "Be helpful."
    cleared = (await client.put(f"/api/agents/{agent['id']}", json={"model": None}, headers=h)).json()["data"]
    assert cleared["model"] is None
    assert (await client.delete(f"/api/agents/{agent['id']}", headers=h)).status_code == 200
    assert (await client.get(f"/api/agents/{agent['id']}", headers=h)).status_code == 404


async def test_validation(client):
    h = await make_user(client, "a@example.com")
    post = lambda body: client.post("/api/agents", json=body, headers=h)  # noqa: E731
    assert (await post({"name": "x", "temperature": 1.5})).status_code == 422
    assert (await post({"name": "x", "tools": ["rm_rf"]})).status_code == 422
    assert (await post({"name": "x", "max_steps": 0})).status_code == 422
    assert (await post({"name": "   "})).status_code == 422
    assert (await post({"name": "x", "response_style": "chatty"})).status_code == 422
    bad_model = await post({"name": "x", "model": "gpt-9000"})
    assert bad_model.status_code == 422 and bad_model.json()["error"]["code"] == "INVALID_MODEL"
    assert (await post({"name": "x", "knowledge_base_ids": [str(uuid.uuid4())]})).status_code == 404
    assert (await post({"name": "Same"})).status_code == 201
    dup = await post({"name": "Same"})
    assert dup.status_code == 409 and dup.json()["error"]["code"] == "AGENT_NAME_TAKEN"
    assert (await client.post("/api/agents", json={"name": "y"})).status_code == 401


async def test_agents_and_their_knowledge_bases_are_private(client):
    owner = await make_user(client, "owner@example.com")
    intruder = await make_user(client, "intruder@example.com")
    kb = await make_kb(client, owner)
    agent = await _agent(client, owner)
    url = f"/api/agents/{agent['id']}"
    assert (await client.get(url, headers=intruder)).status_code == 404
    assert (await client.put(url, json={"name": "Hijacked"}, headers=intruder)).status_code == 404
    assert (await client.delete(url, headers=intruder)).status_code == 404
    assert (await client.get("/api/agents", headers=intruder)).json()["data"]["total"] == 0
    stolen = await client.post("/api/agents", json={"name": "Thief", "knowledge_base_ids": [kb["id"]]}, headers=intruder)
    assert stolen.status_code == 404
    assert (await client.post("/api/chat", json={"message": "hi", "agent_id": agent["id"]}, headers=intruder)).status_code == 404
    assert (await client.post("/api/research", json={"objective": "a valid objective", "agent_id": agent["id"]}, headers=intruder)).status_code == 404


async def test_agent_instructions_temperature_and_model_reach_the_model(client, session_maker, monkeypatch):
    recorder = Recorder()
    monkeypatch.setattr(chat_service, "get_chat_model", recorder.factory)
    h = await make_user(client, "a@example.com")
    kb = await make_kb(client, h)
    await _index(client, session_maker, h, kb["id"], "batteries.txt", BATTERIES)
    agent = await _agent(client, h, instructions="Always answer like a pirate.", temperature=0.7, model="gpt-4o", response_style="concise")
    events = await _ask(client, h, "lithium battery storage", agent_id=agent["id"])
    assert events[-1][0] == "done"
    system = recorder.calls[0][0][0].content
    assert "ONLY the numbered sources" in system and "Always answer like a pirate." in system and "brief" in system
    assert system.index("ONLY the numbered sources") < system.index("pirate")  # the grounding rules come first
    assert recorder.calls[0][1] == 0.7 and recorder.models[-1] == "gpt-4o"
    convo = (await client.get(f"/api/conversations/{events[0][1]['conversation_id']}", headers=h)).json()["data"]["conversation"]
    assert convo["agent_id"] == agent["id"]


async def test_editing_an_agent_changes_its_existing_chats(client, session_maker, monkeypatch):
    recorder = Recorder()
    monkeypatch.setattr(chat_service, "get_chat_model", recorder.factory)
    h = await make_user(client, "a@example.com")
    kb = await make_kb(client, h)
    await _index(client, session_maker, h, kb["id"], "batteries.txt", BATTERIES)
    agent = await _agent(client, h, instructions="First persona.")
    first = await _ask(client, h, "lithium battery storage", agent_id=agent["id"])
    await client.put(f"/api/agents/{agent['id']}", json={"instructions": "Second persona."}, headers=h)
    await _ask(client, h, "and solar energy?", conversation_id=first[0][1]["conversation_id"])
    assert "First persona." in recorder.calls[0][0][0].content and "Second persona." in recorder.calls[1][0][0].content


async def test_agent_can_only_search_its_own_knowledge_bases(client, session_maker):
    h = await make_user(client, "a@example.com")
    batteries, cooking = await _two_kbs(client, session_maker, h)
    agent = await _agent(client, h, knowledge_base_ids=[cooking["id"]])
    pasta = await _ask(client, h, "tomato garlic sauce", agent_id=agent["id"])
    assert {s["document_name"] for s in _sources(pasta)} == {"cooking.txt"}
    blocked = await _ask(client, h, "lithium battery storage solar", agent_id=agent["id"])
    assert _sources(blocked) == [] and "".join(p["text"] for n, p in blocked if n == "token").strip() == NO_EVIDENCE_MESSAGE.strip()


async def test_deleting_a_knowledge_base_never_widens_an_agents_access(client, session_maker):
    h = await make_user(client, "a@example.com")
    batteries, cooking = await _two_kbs(client, session_maker, h)
    agent = await _agent(client, h, knowledge_base_ids=[cooking["id"]])
    await client.delete(f"/api/knowledge-bases/{cooking['id']}", headers=h)
    events = await _ask(client, h, "lithium battery storage solar", agent_id=agent["id"])
    assert "".join(p["text"] for n, p in events if n == "token").strip() == NO_KB_MESSAGE.strip()  # not "all knowledge bases"


async def test_agent_without_the_document_tool_does_not_read_documents(client, session_maker):
    h = await make_user(client, "a@example.com")
    await _two_kbs(client, session_maker, h)
    agent = await _agent(client, h, tools=["calculator"])
    events = await _ask(client, h, "What is 15% of 2400?", agent_id=agent["id"])
    sources = _sources(events)
    assert [s["kind"] for s in sources] == ["tool"] and sources[0]["document_name"] == "Calculator" and sources[0]["content"] == "15% of 2400 = 360"
    assert events[-1][0] == "done" and sources[0]["chunk_id"] is None
    saved = (await client.get(f"/api/conversations/{events[0][1]['conversation_id']}", headers=h)).json()["data"]["messages"][1]
    assert saved["sources"][0]["kind"] == "tool"
    battery = await _ask(client, h, "lithium battery storage", agent_id=agent["id"])
    assert _sources(battery) == []


async def test_web_search_tool_adds_citable_web_sources(client, session_maker, monkeypatch):
    monkeypatch.setattr(chat_service, "get_search_provider", lambda: FakeSearch())
    h = await make_user(client, "a@example.com")
    agent = await _agent(client, h, tools=["search_web"])
    events = await _ask(client, h, "latest battery storage news", agent_id=agent["id"])
    web = _sources(events)[0]
    assert web["kind"] == "web" and web["domain"] == "example.com" and web["url"] == "https://example.com/storage" and web["n"] == 1
    assert [p["stage"] for n, p in events if n == "status"] == ["retrieving", "tools", "reranking", "generating"]


async def test_web_tool_without_a_provider_is_reported(client, monkeypatch):
    monkeypatch.setattr(chat_service, "get_search_provider", lambda: None)
    h = await make_user(client, "a@example.com")
    agent = await _agent(client, h, tools=["search_web"])
    events = await _ask(client, h, "latest battery storage news", agent_id=agent["id"])
    assert any("Web search is not configured" in w for w in events[-1][1]["warnings"])


async def test_deleting_an_agent_leaves_its_chat_working(client, session_maker):
    h = await make_user(client, "a@example.com")
    await _two_kbs(client, session_maker, h)
    agent = await _agent(client, h)
    first = await _ask(client, h, "lithium battery storage", agent_id=agent["id"])
    convo_id = first[0][1]["conversation_id"]
    await client.delete(f"/api/agents/{agent['id']}", headers=h)
    again = await _ask(client, h, "tomato garlic sauce", conversation_id=convo_id)
    assert again[-1][0] == "done" and _sources(again)
    assert (await client.get(f"/api/conversations/{convo_id}", headers=h)).json()["data"]["conversation"]["agent_id"] is None


async def _execute(client, h, res):
    run_id = res.json()["data"]["id"]
    await execute_research_run(uuid.UUID(run_id))
    return (await client.get(f"/api/research/{run_id}", headers=h)).json()["data"]


async def test_research_with_an_agent_uses_its_scope_style_and_name(client, session_maker):
    h = await make_user(client, "a@example.com")
    batteries, cooking = await _two_kbs(client, session_maker, h)
    agent = await _agent(client, h, knowledge_base_ids=[batteries["id"]], research_mode=True, response_style="concise", tools=["search_documents"])
    res = await client.post("/api/research", json={"objective": "Summarise lithium battery storage", "agent_id": agent["id"], "use_web": True}, headers=h)
    assert res.status_code == 201
    queued = res.json()["data"]
    assert queued["agent_id"] == agent["id"] and queued["options"] == {"use_web": False, "length": "short"}  # no web tool, concise style
    assert (await client.get("/api/research", headers=h)).json()["data"]["items"][0]["agent_name"] == "Helper"
    run = await _execute(client, h, res)
    assert run["status"] == "completed" and {s["title"] for s in run["sources"]} == {"batteries.txt"}
    other = await client.post("/api/research", json={"objective": "Summarise pasta sauce cooking", "agent_id": agent["id"]}, headers=h)
    blocked = await _execute(client, h, other)
    assert blocked["status"] == "completed" and blocked["sources"] == [] and "won't guess" in blocked["report"]


async def test_research_requires_research_mode(client):
    h = await make_user(client, "a@example.com")
    agent = await _agent(client, h, research_mode=False)
    res = await client.post("/api/research", json={"objective": "a valid objective", "agent_id": agent["id"]}, headers=h)
    assert res.status_code == 422 and res.json()["error"]["code"] == "AGENT_NOT_RESEARCH_ENABLED"


async def test_research_agent_without_documents_skips_the_document_step(client, session_maker):
    h = await make_user(client, "a@example.com")
    await _two_kbs(client, session_maker, h)
    agent = await _agent(client, h, research_mode=True, tools=["calculator"])
    res = await client.post("/api/research", json={"objective": "Summarise lithium battery storage", "agent_id": agent["id"]}, headers=h)
    run = await _execute(client, h, res)
    document = next(s for s in run["steps"] if s["agent"] == "document")
    assert document["status"] == "skipped" and "no knowledge bases" in document["summary"]
    assert run["sources"] == []

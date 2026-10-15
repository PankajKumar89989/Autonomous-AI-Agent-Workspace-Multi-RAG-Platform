import json
import uuid

from app.rag.llm import LLMError, MockChatModel
from app.rag.pipelines import NO_EVIDENCE_MESSAGE, NO_KB_MESSAGE
from app.rag.ingestion import process_document
from app.schemas.chat import ChatRequest
from app.services import chat_service
from tests.helpers import make_kb, make_user, upload

BATTERIES = ("Lithium battery storage systems hold renewable energy from solar and wind farms. "
             "Grid scale batteries improve energy storage capacity. ") * 4
COOKING = ("Slow cooked pasta sauce needs tomatoes garlic basil and olive oil. "
           "Simmer the sauce gently for an hour. ") * 4


async def _index(client, session_maker, headers, kb_id, name, text):
    doc = (await upload(client, headers, kb_id, name, text.encode())).json()["data"]
    async with session_maker() as session:
        await process_document(session, uuid.UUID(doc["id"]))


def _events(res) -> list[tuple[str, dict]]:
    events = []
    for block in res.text.strip().split("\n\n"):
        lines = block.split("\n")
        events.append((lines[0].removeprefix("event: "), json.loads(lines[1].removeprefix("data: "))))
    return events


async def _ask(client, headers, message=None, **extra):
    return await client.post("/api/chat", json={"message": message, **extra}, headers=headers)


async def _setup(client, session_maker, email="a@example.com"):
    h = await make_user(client, email)
    kb = await make_kb(client, h)
    await _index(client, session_maker, h, kb["id"], "batteries.txt", BATTERIES)
    await _index(client, session_maker, h, kb["id"], "cooking.txt", COOKING)
    return h, kb


async def test_chat_streams_a_cited_answer_and_saves_it(client, session_maker):
    h, kb = await _setup(client, session_maker)
    res = await _ask(client, h, "How do lithium batteries store solar energy?", knowledge_base_ids=[kb["id"]])
    assert res.status_code == 200 and res.headers["content-type"].startswith("text/event-stream")
    events = _events(res)
    names = [n for n, _ in events]
    assert names[0] == "meta" and names[-1] == "done"
    assert names.index("sources") < names.index("token")
    assert [p["stage"] for n, p in events if n == "status"] == ["retrieving", "reranking", "generating"]

    sources = next(p for n, p in events if n == "sources")["sources"]
    assert sources[0]["document_name"] == "batteries.txt" and sources[0]["n"] == 1
    answer = "".join(p["text"] for n, p in events if n == "token")
    assert "[1]" in answer and "tomato" not in answer.lower()

    convo_id = events[0][1]["conversation_id"]
    detail = (await client.get(f"/api/conversations/{convo_id}", headers=h)).json()["data"]
    assert [m["role"] for m in detail["messages"]] == ["user", "assistant"]
    assistant = detail["messages"][1]
    assert assistant["status"] == "complete" and assistant["content"] == answer
    assert assistant["sources"][0]["cited"] is True and assistant["model"] == "mock-extractive"
    assert detail["conversation"]["title"].startswith("How do lithium")


async def test_no_evidence_says_so_instead_of_answering(client, session_maker):
    h, kb = await _setup(client, session_maker)
    events = _events(await _ask(client, h, "zzzzqq wwwwxx yyyyvv", knowledge_base_ids=[kb["id"]]))
    assert next(p for n, p in events if n == "sources")["sources"] == []
    assert "".join(p["text"] for n, p in events if n == "token").strip() == NO_EVIDENCE_MESSAGE.strip()
    assert events[-1][0] == "done"


async def test_no_knowledge_bases_message(client):
    h = await make_user(client, "a@example.com")
    events = _events(await _ask(client, h, "anything at all"))
    assert "".join(p["text"] for n, p in events if n == "token").strip() == NO_KB_MESSAGE.strip()


async def test_follow_up_continues_the_same_conversation(client, session_maker):
    h, kb = await _setup(client, session_maker)
    first = _events(await _ask(client, h, "lithium battery storage", knowledge_base_ids=[kb["id"]]))
    convo_id = first[0][1]["conversation_id"]
    second = _events(await _ask(client, h, "and solar?", conversation_id=convo_id))
    assert second[0][1]["conversation_id"] == convo_id and second[0][1]["new_conversation"] is False
    assert next(p for n, p in second if n == "sources")["search_query"] == "lithium battery storage and solar?"
    assert next(p for n, p in second if n == "sources")["sources"]
    detail = (await client.get(f"/api/conversations/{convo_id}", headers=h)).json()["data"]
    assert [m["role"] for m in detail["messages"]] == ["user", "assistant", "user", "assistant"]


async def test_regenerate_replaces_the_last_answer(client, session_maker):
    h, kb = await _setup(client, session_maker)
    first = _events(await _ask(client, h, "lithium battery storage", knowledge_base_ids=[kb["id"]]))
    convo_id, old_id = first[0][1]["conversation_id"], first[0][1]["assistant_message_id"]
    again = _events(await client.post("/api/chat", json={"conversation_id": convo_id, "regenerate": True}, headers=h))
    assert again[0][1]["assistant_message_id"] != old_id
    detail = (await client.get(f"/api/conversations/{convo_id}", headers=h)).json()["data"]
    assert [m["role"] for m in detail["messages"]] == ["user", "assistant"]
    assert detail["messages"][1]["id"] != old_id and detail["messages"][1]["status"] == "complete"


async def test_request_validation(client):
    h = await make_user(client, "a@example.com")
    assert (await client.post("/api/chat", json={}, headers=h)).status_code == 422
    nothing = await client.post("/api/chat", json={"regenerate": True}, headers=h)
    assert nothing.status_code == 422 and nothing.json()["error"]["code"] == "NOTHING_TO_REGENERATE"
    assert (await client.post("/api/chat", json={"message": "hi"})).status_code == 401


async def test_conversations_are_private(client, session_maker):
    owner, kb = await _setup(client, session_maker, "owner@example.com")
    intruder = await make_user(client, "intruder@example.com")
    convo_id = _events(await _ask(client, owner, "lithium battery", knowledge_base_ids=[kb["id"]]))[0][1]["conversation_id"]
    url = f"/api/conversations/{convo_id}"
    assert (await client.get(url, headers=intruder)).status_code == 404
    assert (await client.patch(url, json={"title": "x"}, headers=intruder)).status_code == 404
    assert (await client.delete(url, headers=intruder)).status_code == 404
    assert (await _ask(client, intruder, "more", conversation_id=convo_id)).status_code == 404
    assert (await _ask(client, intruder, "hi", knowledge_base_ids=[kb["id"]])).status_code == 404
    assert (await client.get("/api/conversations", headers=intruder)).json()["data"]["total"] == 0


async def test_rename_list_delete_and_dashboard_counts(client, session_maker):
    h, kb = await _setup(client, session_maker)
    convo_id = _events(await _ask(client, h, "lithium battery", knowledge_base_ids=[kb["id"]]))[0][1]["conversation_id"]
    renamed = await client.patch(f"/api/conversations/{convo_id}", json={"title": "Battery notes"}, headers=h)
    assert renamed.json()["data"]["title"] == "Battery notes"
    assert (await client.get("/api/conversations", headers=h)).json()["data"]["items"][0]["title"] == "Battery notes"
    stats = (await client.get("/api/dashboard/overview", headers=h)).json()["data"]["stats"]
    assert stats["conversations"] == 1 and stats["ai_requests"] == 1
    assert (await client.delete(f"/api/conversations/{convo_id}", headers=h)).status_code == 200
    assert (await client.get(f"/api/conversations/{convo_id}", headers=h)).status_code == 404


async def test_model_failure_keeps_partial_text_and_marks_failed(client, session_maker, monkeypatch):
    class Flaky(MockChatModel):
        async def stream(self, messages, *, temperature=0.2):
            yield "Partial answer "
            raise LLMError("OpenAI rate limit or quota exceeded. Try again later.")

    monkeypatch.setattr(chat_service, "get_chat_model", lambda: Flaky())
    h, kb = await _setup(client, session_maker)
    events = _events(await _ask(client, h, "lithium battery storage", knowledge_base_ids=[kb["id"]]))
    assert events[-1][0] == "error" and events[-1][1]["code"] == "GENERATION_FAILED"
    convo_id = events[0][1]["conversation_id"]
    message = (await client.get(f"/api/conversations/{convo_id}", headers=h)).json()["data"]["messages"][1]
    assert message["status"] == "failed" and message["content"] == "Partial answer " and "quota" in message["error_message"]


async def test_stopping_mid_stream_saves_what_was_written(client, session_maker):
    h, kb = await _setup(client, session_maker)
    me = (await client.get("/api/auth/me", headers=h)).json()["data"]
    async with session_maker() as db:
        from app.db.models import User

        user = await db.get(User, uuid.UUID(me["id"]))
        turn = await chat_service.prepare_turn(
            db, user, ChatRequest(message="lithium battery storage", knowledge_base_ids=[uuid.UUID(kb["id"])])
        )
    stream = chat_service.stream_turn(turn)
    seen = []
    async for event, payload in stream:
        seen.append(event)
        if event == "token":
            break
    await stream.aclose()  # what happens when the client disconnects
    await chat_service.wait_for_background()
    detail = (await client.get(f"/api/conversations/{turn.conversation_id}", headers=h)).json()["data"]
    message = detail["messages"][1]
    assert message["status"] == "stopped" and message["content"].strip() != "" and "done" not in seen

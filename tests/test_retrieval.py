import uuid

from sqlalchemy import func, select

from app.db.models import LocalVector
from app.rag import ingestion
from app.rag.embeddings import EmbeddingError
from app.rag.ingestion import process_document
from tests.helpers import make_kb, make_user, upload

BATTERIES = ("Lithium battery storage systems hold renewable energy from solar and wind farms. "
             "Grid scale batteries improve energy storage capacity. ") * 5
COOKING = ("Slow cooked pasta sauce needs tomatoes garlic basil and olive oil. "
           "Simmer the sauce gently for an hour. ") * 5


async def _index(client, session_maker, headers, kb_id, name, text):
    doc = (await upload(client, headers, kb_id, name, text.encode())).json()["data"]
    async with session_maker() as session:
        await process_document(session, uuid.UUID(doc["id"]))
    return doc


async def _search(client, headers, **body):
    res = await client.post("/api/search", json=body, headers=headers)
    return res


async def _vector_count(session_maker) -> int:
    async with session_maker() as session:
        return await session.scalar(select(func.count()).select_from(LocalVector))


async def test_indexing_stores_one_vector_per_chunk(client, session_maker):
    h = await make_user(client, "a@example.com")
    kb = await make_kb(client, h, chunk_size=200, chunk_overlap=20)
    doc = await _index(client, session_maker, h, kb["id"], "batteries.txt", BATTERIES)
    done = (await client.get(f"/api/documents/{doc['id']}", headers=h)).json()["data"]
    assert done["status"] == "completed" and done["embedding_model"] == "mock:256"
    assert await _vector_count(session_maker) == done["chunk_count"] > 1


async def test_hybrid_search_ranks_the_right_document_first(client, session_maker):
    h = await make_user(client, "a@example.com")
    kb = await make_kb(client, h)
    await _index(client, session_maker, h, kb["id"], "batteries.txt", BATTERIES)
    await _index(client, session_maker, h, kb["id"], "cooking.txt", COOKING)

    res = await _search(client, h, query="lithium battery energy storage", knowledge_base_ids=[kb["id"]])
    assert res.status_code == 200
    body = res.json()["data"]
    top = body["results"][0]
    assert top["document_name"] == "batteries.txt" and top["sources"] == ["vector", "keyword"]
    assert top["knowledge_base_id"] == kb["id"] and "battery" in top["content"].lower()
    assert 0 < top["score"] <= 1 and body["warnings"] == []

    pasta = (await _search(client, h, query="tomato garlic sauce")).json()["data"]["results"]
    assert pasta[0]["document_name"] == "cooking.txt"


async def test_vector_and_keyword_modes(client, session_maker):
    h = await make_user(client, "a@example.com")
    kb = await make_kb(client, h)
    await _index(client, session_maker, h, kb["id"], "batteries.txt", BATTERIES)
    await _index(client, session_maker, h, kb["id"], "cooking.txt", COOKING)

    vector = (await _search(client, h, query="solar battery storage", mode="vector")).json()["data"]["results"]
    assert vector and vector[0]["sources"] == ["vector"] and vector[0]["keyword_score"] is None
    keyword = (await _search(client, h, query="solar battery storage", mode="keyword")).json()["data"]["results"]
    assert keyword and {r["document_name"] for r in keyword} == {"batteries.txt"}
    assert keyword[0]["vector_score"] is None


async def test_unrelated_query_returns_nothing(client, session_maker):
    h = await make_user(client, "a@example.com")
    kb = await make_kb(client, h)
    await _index(client, session_maker, h, kb["id"], "batteries.txt", BATTERIES)
    res = (await _search(client, h, query="zzzzqq wwwwxx")).json()["data"]
    assert res["results"] == []


async def test_top_k_limits_results(client, session_maker):
    h = await make_user(client, "a@example.com")
    kb = await make_kb(client, h, chunk_size=200, chunk_overlap=0)
    await _index(client, session_maker, h, kb["id"], "batteries.txt", BATTERIES * 4)
    res = (await _search(client, h, query="battery storage", top_k=2)).json()["data"]["results"]
    assert len(res) == 2


async def test_search_never_crosses_users(client, session_maker):
    owner = await make_user(client, "owner@example.com")
    intruder = await make_user(client, "intruder@example.com")
    kb = await make_kb(client, owner)
    await _index(client, session_maker, owner, kb["id"], "batteries.txt", BATTERIES)

    assert (await _search(client, intruder, query="lithium battery")).json()["data"]["results"] == []
    assert (await _search(client, intruder, query="lithium", knowledge_base_ids=[kb["id"]])).status_code == 404
    assert (await _search(client, intruder, query="lithium", workspace_id=kb["workspace_id"])).status_code == 404
    assert (await client.post("/api/search", json={"query": "x"})).status_code == 401


async def test_search_scoped_to_workspace(client, session_maker):
    h = await make_user(client, "a@example.com")
    kb_a = await make_kb(client, h, name="A")
    kb_b = await make_kb(client, h, name="B")
    await _index(client, session_maker, h, kb_a["id"], "batteries.txt", BATTERIES)
    await _index(client, session_maker, h, kb_b["id"], "also-batteries.txt", BATTERIES + " extra")
    res = (await _search(client, h, query="battery storage", workspace_id=kb_a["workspace_id"])).json()["data"]
    assert {r["knowledge_base_id"] for r in res["results"]} == {kb_a["id"]}


async def test_blank_query_rejected(client):
    h = await make_user(client, "a@example.com")
    assert (await _search(client, h, query="   ")).status_code == 422


async def test_reindex_replaces_vectors_instead_of_piling_up(client, session_maker):
    h = await make_user(client, "a@example.com")
    kb = await make_kb(client, h, chunk_size=1000, chunk_overlap=0)
    doc = await _index(client, session_maker, h, kb["id"], "b.txt", BATTERIES * 3)
    await client.patch(f"/api/knowledge-bases/{kb['id']}", json={"chunk_size": 200, "chunk_overlap": 0}, headers=h)
    await client.post(f"/api/documents/{doc['id']}/reindex", headers=h)
    async with session_maker() as session:
        await process_document(session, uuid.UUID(doc["id"]))
    chunks = (await client.get(f"/api/documents/{doc['id']}", headers=h)).json()["data"]["chunk_count"]
    assert await _vector_count(session_maker) == chunks


async def test_deleting_document_and_knowledge_base_removes_vectors(client, session_maker):
    h = await make_user(client, "a@example.com")
    kb = await make_kb(client, h)
    doc = await _index(client, session_maker, h, kb["id"], "b.txt", BATTERIES)
    await _index(client, session_maker, h, kb["id"], "c.txt", COOKING)
    assert await _vector_count(session_maker) >= 2
    await client.delete(f"/api/documents/{doc['id']}", headers=h)
    left = await _vector_count(session_maker)
    assert 0 < left
    assert (await _search(client, h, query="lithium battery", mode="vector")).json()["data"]["results"] == []
    await client.delete(f"/api/knowledge-bases/{kb['id']}", headers=h)
    assert await _vector_count(session_maker) == 0


async def test_embedding_failure_marks_document_failed(client, session_maker, monkeypatch):
    class BrokenEmbedder:
        model_id = "broken"
        dimensions = 1

        async def embed_documents(self, texts):
            raise EmbeddingError("OpenAI rate limit or quota exceeded. Try again later.")

    monkeypatch.setattr(ingestion, "get_embedder", lambda: BrokenEmbedder())
    h = await make_user(client, "a@example.com")
    kb = await make_kb(client, h)
    doc = await _index(client, session_maker, h, kb["id"], "b.txt", BATTERIES)
    failed = (await client.get(f"/api/documents/{doc['id']}", headers=h)).json()["data"]
    assert failed["status"] == "failed" and "quota" in failed["error_message"]
    assert await _vector_count(session_maker) == 0


async def test_hybrid_degrades_to_keywords_when_embeddings_fail(client, session_maker, monkeypatch):
    h = await make_user(client, "a@example.com")
    kb = await make_kb(client, h)
    await _index(client, session_maker, h, kb["id"], "batteries.txt", BATTERIES)

    from app.services import retrieval_service

    class Down:
        async def embed_query(self, text):
            raise EmbeddingError("Could not reach OpenAI. Check your network connection.")

    monkeypatch.setattr(retrieval_service, "get_embedder", lambda: Down())
    res = (await _search(client, h, query="battery storage")).json()["data"]
    assert res["results"] and res["warnings"] and "keyword" in res["warnings"][0]
    strict = await _search(client, h, query="battery storage", mode="vector")
    assert strict.status_code == 502 and strict.json()["error"]["code"] == "SEMANTIC_SEARCH_FAILED"

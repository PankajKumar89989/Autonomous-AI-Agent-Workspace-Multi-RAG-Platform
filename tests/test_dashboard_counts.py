from tests.helpers import make_kb, make_user, upload


async def test_overview_counts_documents_and_knowledge_bases(client):
    h = await make_user(client, "a@example.com")
    kb = await make_kb(client, h)
    await upload(client, h, kb["id"], "a.txt", b"hello world")
    stats = (await client.get("/api/dashboard/overview", headers=h)).json()["data"]["stats"]
    assert stats["knowledge_bases"] == 1 and stats["documents"] == 1

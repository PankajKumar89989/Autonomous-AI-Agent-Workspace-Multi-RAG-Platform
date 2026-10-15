from tests.helpers import make_kb, make_user


async def test_create_list_get_update_delete(client):
    h = await make_user(client, "a@example.com")
    kb = await make_kb(client, h, description="Tech reports", chunk_size=800, chunk_overlap=100)
    assert kb["chunk_size"] == 800 and kb["document_count"] == 0
    assert kb["workspace_name"].startswith("WS for")
    listing = (await client.get("/api/knowledge-bases", headers=h)).json()["data"]
    assert listing["total"] == 1
    got = await client.get(f"/api/knowledge-bases/{kb['id']}", headers=h)
    assert got.json()["data"]["name"] == "Reports"
    upd = await client.patch(f"/api/knowledge-bases/{kb['id']}", json={"name": "Renamed"}, headers=h)
    assert upd.json()["data"]["name"] == "Renamed"
    assert (await client.delete(f"/api/knowledge-bases/{kb['id']}", headers=h)).status_code == 200
    assert (await client.get(f"/api/knowledge-bases/{kb['id']}", headers=h)).status_code == 404


async def test_overlap_larger_than_half_chunk_rejected(client):
    h = await make_user(client, "a@example.com")
    ws = (await client.post("/api/workspaces", json={"name": "W"}, headers=h)).json()["data"]
    res = await client.post(
        "/api/knowledge-bases",
        json={"workspace_id": ws["id"], "name": "K", "chunk_size": 400, "chunk_overlap": 300},
        headers=h,
    )
    assert res.status_code == 422
    kb = await make_kb(client, h)
    bad = await client.patch(f"/api/knowledge-bases/{kb['id']}", json={"chunk_overlap": 500}, headers=h)
    assert bad.status_code == 422


async def test_duplicate_name_in_workspace_conflicts(client):
    h = await make_user(client, "a@example.com")
    ws = (await client.post("/api/workspaces", json={"name": "W"}, headers=h)).json()["data"]
    body = {"workspace_id": ws["id"], "name": "Same"}
    assert (await client.post("/api/knowledge-bases", json=body, headers=h)).status_code == 201
    dup = await client.post("/api/knowledge-bases", json=body, headers=h)
    assert dup.status_code == 409


async def test_cannot_use_another_users_workspace_or_kb(client):
    owner = await make_user(client, "owner@example.com")
    intruder = await make_user(client, "intruder@example.com")
    kb = await make_kb(client, owner)
    ws_id = kb["workspace_id"]
    res = await client.post("/api/knowledge-bases", json={"workspace_id": ws_id, "name": "X"}, headers=intruder)
    assert res.status_code == 404
    url = f"/api/knowledge-bases/{kb['id']}"
    assert (await client.get(url, headers=intruder)).status_code == 404
    assert (await client.patch(url, json={"name": "Hacked"}, headers=intruder)).status_code == 404
    assert (await client.delete(url, headers=intruder)).status_code == 404
    assert (await client.get("/api/knowledge-bases", headers=intruder)).json()["data"]["total"] == 0


async def test_deleting_workspace_removes_its_knowledge_bases(client):
    h = await make_user(client, "a@example.com")
    kb = await make_kb(client, h)
    await client.delete(f"/api/workspaces/{kb['workspace_id']}", headers=h)
    assert (await client.get(f"/api/knowledge-bases/{kb['id']}", headers=h)).status_code == 404

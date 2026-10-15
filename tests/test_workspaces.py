import uuid


async def _user(client, email: str) -> dict:
    res = await client.post(
        "/api/auth/register", json={"email": email, "password": "Secret123", "full_name": "Test User"}
    )
    client.cookies.clear()
    return {"Authorization": f"Bearer {res.json()['data']['access_token']}"}


async def _create(client, headers, name="Market Research", description="Q4 reports"):
    return await client.post("/api/workspaces", json={"name": name, "description": description}, headers=headers)


async def test_create_list_get(client):
    h = await _user(client, "a@example.com")
    created = await _create(client, h)
    assert created.status_code == 201
    ws = created.json()["data"]
    listing = (await client.get("/api/workspaces", headers=h)).json()["data"]
    assert listing["total"] == 1 and listing["items"][0]["id"] == ws["id"]
    got = await client.get(f"/api/workspaces/{ws['id']}", headers=h)
    assert got.json()["data"]["description"] == "Q4 reports"


async def test_requires_auth(client):
    assert (await client.get("/api/workspaces")).status_code == 401
    assert (await client.get("/api/dashboard/overview")).status_code == 401


async def test_duplicate_name_conflict(client):
    h = await _user(client, "a@example.com")
    await _create(client, h)
    res = await _create(client, h)
    assert res.status_code == 409
    assert res.json()["error"]["code"] == "WORKSPACE_NAME_TAKEN"


async def test_blank_name_rejected(client):
    h = await _user(client, "a@example.com")
    assert (await _create(client, h, name="   ")).status_code == 422


async def test_update_and_delete(client):
    h = await _user(client, "a@example.com")
    ws = (await _create(client, h)).json()["data"]
    upd = await client.patch(f"/api/workspaces/{ws['id']}", json={"name": "Renamed"}, headers=h)
    assert upd.status_code == 200 and upd.json()["data"]["name"] == "Renamed"
    assert upd.json()["data"]["description"] == "Q4 reports"  # untouched field preserved
    assert (await client.delete(f"/api/workspaces/{ws['id']}", headers=h)).status_code == 200
    assert (await client.get(f"/api/workspaces/{ws['id']}", headers=h)).status_code == 404


async def test_users_cannot_access_each_others_workspaces(client):
    owner = await _user(client, "owner@example.com")
    intruder = await _user(client, "intruder@example.com")
    ws = (await _create(client, owner)).json()["data"]
    url = f"/api/workspaces/{ws['id']}"
    assert (await client.get(url, headers=intruder)).status_code == 404
    assert (await client.patch(url, json={"name": "Hacked"}, headers=intruder)).status_code == 404
    assert (await client.delete(url, headers=intruder)).status_code == 404
    assert (await client.get("/api/workspaces", headers=intruder)).json()["data"]["total"] == 0
    assert (await client.get(url, headers=owner)).status_code == 200  # still intact


async def test_unknown_id_returns_404(client):
    h = await _user(client, "a@example.com")
    assert (await client.get(f"/api/workspaces/{uuid.uuid4()}", headers=h)).status_code == 404


async def test_search_and_pagination(client):
    h = await _user(client, "a@example.com")
    for name in ["Alpha", "Beta", "Alphabet", "100%_real"]:
        await _create(client, h, name=name)
    found = (await client.get("/api/workspaces?q=alph", headers=h)).json()["data"]
    assert found["total"] == 2
    literal = (await client.get("/api/workspaces?q=%25", headers=h)).json()["data"]
    assert literal["total"] == 1  # '%' is matched literally, not as a wildcard
    page = (await client.get("/api/workspaces?page=2&page_size=3", headers=h)).json()["data"]
    assert page["total"] == 4 and len(page["items"]) == 1


async def test_dashboard_overview_tracks_activity(client):
    h = await _user(client, "a@example.com")
    ws = (await _create(client, h)).json()["data"]
    await client.patch(f"/api/workspaces/{ws['id']}", json={"name": "Renamed"}, headers=h)
    data = (await client.get("/api/dashboard/overview", headers=h)).json()["data"]
    assert data["stats"]["workspaces"] == 1
    types = [a["type"] for a in data["recent_activity"]]
    assert types == ["workspace.renamed", "workspace.created"]
    other = await _user(client, "b@example.com")
    assert (await client.get("/api/dashboard/overview", headers=other)).json()["data"]["recent_activity"] == []

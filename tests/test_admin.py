import uuid

from sqlalchemy import update

from app.db.models import User
from app.rag.ingestion import process_document
from tests.helpers import make_kb, make_user, upload

BATTERIES = ("Lithium battery storage systems hold renewable energy from solar and wind farms. " * 6)


async def _admin(client, session_maker, email="admin@example.com"):
    headers = await make_user(client, email)
    async with session_maker() as db:
        await db.execute(update(User).where(User.email == email).values(role="ADMIN"))
        await db.commit()
    return headers


async def _chat(client, h, kb_id):
    res = await client.post("/api/chat", json={"message": "lithium battery storage", "knowledge_base_ids": [kb_id]}, headers=h)
    assert res.status_code == 200 and "event: done" in res.text


async def _index(client, session_maker, h, kb_id):
    doc = (await upload(client, h, kb_id, "batteries.txt", BATTERIES.encode())).json()["data"]
    async with session_maker() as db:
        await process_document(db, uuid.UUID(doc["id"]))


async def test_admin_endpoints_are_admin_only(client, session_maker):
    user = await make_user(client, "user@example.com")
    admin = await _admin(client, session_maker)
    for path in ("/api/admin/overview", "/api/admin/usage", "/api/admin/users"):
        assert (await client.get(path)).status_code == 401
        denied = await client.get(path, headers=user)
        assert denied.status_code == 403 and denied.json()["error"]["code"] == "FORBIDDEN"
        assert (await client.get(path, headers=admin)).status_code == 200


async def test_usage_is_recorded_and_reported(client, session_maker):
    admin = await _admin(client, session_maker)
    user = await make_user(client, "user@example.com")
    kb = await make_kb(client, user)
    await _index(client, session_maker, user, kb["id"])
    await _chat(client, user, kb["id"])
    await _chat(client, user, kb["id"])

    report = (await client.get("/api/admin/usage?days=7", headers=admin)).json()["data"]
    assert len(report["by_day"]) == 7
    today = report["by_day"][-1]
    assert today["requests"] == 3  # one embedding batch and two chat answers
    assert today["prompt_tokens"] > 0 and today["errors"] == 0
    kinds = {k["kind"]: k for k in report["by_kind"]}
    assert kinds["chat"]["requests"] == 2 and kinds["embedding"]["requests"] == 1 and kinds["embedding"]["tokens"] > 0
    models = {m["model"] for m in report["by_model"]}
    assert models == {"mock-extractive", "mock:256"}

    overview = (await client.get("/api/admin/overview", headers=admin)).json()["data"]
    assert overview["ai_requests_30d"] == 2 and overview["users"] == 2 and overview["admins"] == 1
    assert overview["documents"] == 1 and overview["failed_documents"] == 0 and overview["conversations"] == 2
    assert overview["error_rate_30d"] == 0.0 and overview["avg_duration_ms_30d"] is not None
    assert overview["health"]["database"] is True and overview["health"]["providers"]["chat"] == "mock"
    assert "sk-" not in str(overview)  # provider names only, never keys


async def test_users_can_see_only_their_own_usage(client, session_maker):
    a, b = await make_user(client, "a@example.com"), await make_user(client, "b@example.com")
    kb = await make_kb(client, a)
    await _chat(client, a, kb["id"])
    mine = (await client.get("/api/usage/me", headers=a)).json()["data"]
    assert mine["ai_requests"] == 1 and mine["tokens"] > 0 and mine["by_kind"][0]["kind"] == "chat"
    theirs = (await client.get("/api/usage/me", headers=b)).json()["data"]
    assert theirs["ai_requests"] == 0 and theirs["tokens"] == 0
    assert (await client.get("/api/usage/me")).status_code == 401


async def test_user_list_search_and_counts(client, session_maker):
    admin = await _admin(client, session_maker)
    user = await make_user(client, "grace@example.com")
    kb = await make_kb(client, user)
    await _chat(client, user, kb["id"])
    listing = (await client.get("/api/admin/users?q=grace", headers=admin)).json()["data"]
    assert listing["total"] == 1
    row = listing["items"][0]
    assert row["email"] == "grace@example.com" and row["workspaces"] == 1 and row["requests_30d"] == 1 and row["is_active"] is True
    assert (await client.get("/api/admin/users", headers=admin)).json()["data"]["total"] == 2


async def test_admin_can_deactivate_promote_and_restore_users(client, session_maker):
    admin = await _admin(client, session_maker)
    res = await client.post("/api/auth/register", json={"email": "bob@example.com", "password": "Secret123", "full_name": "Bob"})
    bob_id, bob_token = res.json()["data"]["user"]["id"], res.json()["data"]["access_token"]
    client.cookies.clear()
    url = f"/api/admin/users/{bob_id}"
    off = await client.patch(url, json={"is_active": False}, headers=admin)
    assert off.status_code == 200 and off.json()["data"]["is_active"] is False
    assert (await client.get("/api/auth/me", headers={"Authorization": f"Bearer {bob_token}"})).status_code == 401
    assert (await client.post("/api/auth/login", json={"email": "bob@example.com", "password": "Secret123"})).status_code == 401
    on = await client.patch(url, json={"is_active": True, "role": "ADMIN"}, headers=admin)
    assert on.json()["data"]["is_active"] is True and on.json()["data"]["role"] == "ADMIN"
    assert (await client.post("/api/auth/login", json={"email": "bob@example.com", "password": "Secret123"})).status_code == 200
    assert (await client.get("/api/admin/overview", headers={"Authorization": f"Bearer {bob_token}"})).status_code == 200  # now an admin


async def test_admin_guards(client, session_maker):
    admin = await _admin(client, session_maker)
    me = (await client.get("/api/auth/me", headers=admin)).json()["data"]
    own = await client.patch(f"/api/admin/users/{me['id']}", json={"is_active": False}, headers=admin)
    assert own.status_code == 400 and own.json()["error"]["code"] == "CANNOT_MODIFY_SELF"
    assert (await client.patch(f"/api/admin/users/{uuid.uuid4()}", json={"is_active": False}, headers=admin)).status_code == 404
    assert (await client.patch(f"/api/admin/users/{me['id']}", json={"role": "SUPERUSER"}, headers=admin)).status_code == 422
    plain = await make_user(client, "plain@example.com")
    victim = (await client.get("/api/admin/users?q=admin", headers=admin)).json()["data"]["items"][0]["id"]
    assert (await client.patch(f"/api/admin/users/{victim}", json={"role": "USER"}, headers=plain)).status_code == 403

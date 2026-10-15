CREDS = {"email": "Ada@Example.com", "password": "Secret123", "full_name": "Ada Lovelace"}


async def _register(client, **overrides):
    res = await client.post("/api/auth/register", json={**CREDS, **overrides})
    cookie = res.cookies.get("refresh_token")
    client.cookies.clear()
    return res, cookie


def _cookie(token: str) -> dict:
    return {"Cookie": f"refresh_token={token}"}


async def test_register_then_me(client):
    res, cookie = await _register(client)
    assert res.status_code == 201
    data = res.json()["data"]
    assert data["user"]["email"] == "ada@example.com"
    assert data["user"]["role"] == "USER"
    assert "hashed_password" not in data["user"]
    assert cookie
    me = await client.get("/api/auth/me", headers={"Authorization": f"Bearer {data['access_token']}"})
    assert me.status_code == 200
    assert me.json()["data"]["full_name"] == "Ada Lovelace"


async def test_duplicate_email_rejected(client):
    await _register(client)
    res, _ = await _register(client, email="ada@example.com")
    assert res.status_code == 409
    assert res.json()["error"]["code"] == "EMAIL_ALREADY_REGISTERED"


async def test_weak_password_rejected(client):
    res, _ = await _register(client, password="onlyletters")
    assert res.status_code == 422
    assert res.json()["success"] is False


async def test_login_success_and_wrong_password(client):
    await _register(client)
    ok = await client.post("/api/auth/login", json={"email": "ada@example.com", "password": "Secret123"})
    assert ok.status_code == 200
    bad = await client.post("/api/auth/login", json={"email": "ada@example.com", "password": "Wrong123"})
    assert bad.status_code == 401
    assert bad.json()["error"]["code"] == "INVALID_CREDENTIALS"


async def test_me_requires_valid_token(client):
    assert (await client.get("/api/auth/me")).status_code == 401
    res = await client.get("/api/auth/me", headers={"Authorization": "Bearer not-a-token"})
    assert res.status_code == 401


async def test_refresh_rotates_token(client):
    _, first = await _register(client)
    res = await client.post("/api/auth/refresh", headers=_cookie(first))
    assert res.status_code == 200
    second = res.cookies.get("refresh_token")
    client.cookies.clear()
    assert second and second != first
    # Replaying the old token right after rotation is rejected...
    replay = await client.post("/api/auth/refresh", headers=_cookie(first))
    assert replay.status_code == 401
    client.cookies.clear()
    # ...but the new one still works (inside the race-grace window).
    assert (await client.post("/api/auth/refresh", headers=_cookie(second))).status_code == 200


async def test_logout_revokes_refresh_token(client):
    _, token = await _register(client)
    assert (await client.post("/api/auth/logout", headers=_cookie(token))).status_code == 200
    client.cookies.clear()
    assert (await client.post("/api/auth/refresh", headers=_cookie(token))).status_code == 401

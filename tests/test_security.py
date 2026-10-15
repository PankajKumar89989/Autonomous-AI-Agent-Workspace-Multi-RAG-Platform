import pytest

from app.core import rate_limit
from app.core.config import Settings, get_settings
from tests.helpers import make_user

CREDS = {"email": "ada@example.com", "password": "Secret123", "full_name": "Ada"}


async def test_security_headers_on_api_responses(client):
    res = await client.get("/api/health")
    assert res.headers["x-content-type-options"] == "nosniff" and res.headers["x-frame-options"] == "DENY"
    assert res.headers["referrer-policy"] == "no-referrer" and "frame-ancestors 'none'" in res.headers["content-security-policy"]
    assert "geolocation=()" in res.headers["permissions-policy"]
    assert "strict-transport-security" not in res.headers  # only in production
    docs = await client.get("/docs")
    assert "content-security-policy" not in docs.headers  # Swagger UI needs its scripts
    auth = await client.post("/api/auth/login", json={"email": "x@example.com", "password": "nope"})
    assert auth.headers["cache-control"] == "no-store"


async def test_request_id_is_generated_echoed_and_shown_in_errors(client):
    generated = await client.get("/api/health")
    assert len(generated.headers["x-request-id"]) == 32
    honoured = await client.get("/api/health", headers={"X-Request-ID": "trace-12345678"})
    assert honoured.headers["x-request-id"] == "trace-12345678"
    replaced = await client.get("/api/health", headers={"X-Request-ID": "bad id with spaces!"})
    assert replaced.headers["x-request-id"] != "bad id with spaces!"
    missing = await client.get("/api/nope", headers={"X-Request-ID": "trace-87654321"})
    body = missing.json()
    assert missing.status_code == 404 and body["error"]["code"] == "NOT_FOUND" and body["error"]["request_id"] == "trace-87654321"


async def test_oversized_json_bodies_are_refused(client):
    res = await client.post("/api/auth/login", content=b'{"email": "' + b"a" * 2_000_000 + b'"}', headers={"Content-Type": "application/json"})
    assert res.status_code == 413 and res.json()["error"]["code"] == "PAYLOAD_TOO_LARGE"


async def test_auth_endpoints_are_rate_limited_per_ip(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "rate_limit_auth_per_minute", 3)
    statuses = [(await client.post("/api/auth/login", json={"email": f"u{i}@example.com", "password": "Wrong123"})).status_code for i in range(4)]
    assert statuses == [401, 401, 401, 429]
    blocked = await client.post("/api/auth/login", json={"email": "u9@example.com", "password": "Wrong123"})
    assert blocked.status_code == 429 and blocked.json()["error"]["code"] == "RATE_LIMITED" and int(blocked.headers["retry-after"]) >= 1
    monkeypatch.setattr(get_settings(), "trust_proxy_headers", True)
    other = await client.post("/api/auth/login", json={"email": "u9@example.com", "password": "Wrong123"}, headers={"X-Forwarded-For": "203.0.113.9"})
    assert other.status_code == 401  # a different client IP has its own allowance


async def test_repeated_wrong_passwords_lock_that_ip_and_email_only(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "trust_proxy_headers", True)
    await client.post("/api/auth/register", json=CREDS)
    client.cookies.clear()
    login = lambda pw, ip="198.51.100.1", email=CREDS["email"]: client.post(  # noqa: E731
        "/api/auth/login", json={"email": email, "password": pw}, headers={"X-Forwarded-For": ip})
    for _ in range(5):
        assert (await login("Wrong123")).status_code == 401
    locked = await login("Secret123")  # even the right password is refused while locked
    assert locked.status_code == 429 and "failed sign-in attempts" in locked.json()["error"]["message"]
    assert (await login("Secret123", ip="198.51.100.2")).status_code == 200  # the real owner elsewhere is unaffected
    assert (await login("Wrong123", email="other@example.com")).status_code == 401  # other emails aren't locked


async def test_a_successful_login_clears_the_failure_count(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "trust_proxy_headers", True)
    await client.post("/api/auth/register", json=CREDS)
    login = lambda pw: client.post("/api/auth/login", json={"email": CREDS["email"], "password": pw}, headers={"X-Forwarded-For": "198.51.100.5"})  # noqa: E731
    for _ in range(4):
        await login("Wrong123")
    assert (await login("Secret123")).status_code == 200
    for _ in range(4):
        assert (await login("Wrong123")).status_code == 401
    assert (await login("Secret123")).status_code == 200


async def test_chat_is_limited_per_user(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "rate_limit_chat_per_minute", 2)
    first, second = await make_user(client, "a@example.com"), await make_user(client, "b@example.com")
    ask = lambda h: client.post("/api/chat", json={"message": "hello there"}, headers=h)  # noqa: E731
    assert [(await ask(first)).status_code for _ in range(3)] == [200, 200, 429]
    assert (await ask(second)).status_code == 200


async def test_rate_limiting_can_be_switched_off_and_fails_open(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "rate_limit_auth_per_minute", 1)
    monkeypatch.setattr(get_settings(), "rate_limit_enabled", False)
    assert [(await client.post("/api/auth/login", json={"email": "a@example.com", "password": "x"})).status_code for _ in range(3)] == [401] * 3
    monkeypatch.setattr(get_settings(), "rate_limit_enabled", True)

    async def broken():
        raise ConnectionError("redis down")

    monkeypatch.setattr(rate_limit, "get_limiter", broken)
    assert (await client.post("/api/auth/login", json={"email": "a@example.com", "password": "x"})).status_code == 401  # not 500


async def test_deactivated_users_lose_access_everywhere(client, session_maker):
    from sqlalchemy import update

    from app.db.models import User

    res = await client.post("/api/auth/register", json=CREDS)
    token, cookie = res.json()["data"]["access_token"], res.cookies.get("refresh_token")
    client.cookies.clear()
    async with session_maker() as db:
        await db.execute(update(User).where(User.email == CREDS["email"]).values(is_active=False))
        await db.commit()
    assert (await client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})).status_code == 401
    assert (await client.post("/api/auth/refresh", headers={"Cookie": f"refresh_token={cookie}"})).status_code == 401
    assert (await client.post("/api/auth/login", json={"email": CREDS["email"], "password": CREDS["password"]})).status_code == 401


def test_production_refuses_unsafe_configuration():
    safe = dict(environment="production", jwt_secret_key="x" * 40, cookie_secure=True, cors_origins="https://app.example.com")
    Settings(_env_file=None, **safe)  # a safe production config is accepted
    for override, expected in [
        ({"jwt_secret_key": "short"}, "JWT_SECRET_KEY"),
        ({"jwt_secret_key": "change-me"}, "JWT_SECRET_KEY"),
        ({"cookie_secure": False}, "COOKIE_SECURE"),
        ({"cors_origins": "*"}, "CORS_ORIGINS"),
    ]:
        with pytest.raises(ValueError, match=expected):
            Settings(_env_file=None, **{**safe, **override})
    Settings(_env_file=None, environment="development", jwt_secret_key="dev")  # development stays easy


async def test_readiness_probe(client):
    res = await client.get("/api/health/ready")
    body = res.json()
    assert body["data"]["database"] is True and res.status_code in (200, 503) and res.status_code == (200 if body["data"]["redis"] else 503)

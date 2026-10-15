async def test_health_returns_envelope(client):
    res = await client.get("/api/health")
    assert res.status_code == 200
    body = res.json()
    assert body["success"] is True
    assert body["data"]["database"] is True

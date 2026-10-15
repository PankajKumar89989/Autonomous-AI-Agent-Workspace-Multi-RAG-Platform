import logging

from app.core.limiter_backends import MemoryLimiter
from app.core.logging import RedactingFormatter, redact


def test_redacts_the_secrets_that_could_end_up_in_a_log_line():
    cases = {
        "key sk-proj-abcdefghijklmnop1234": "sk-proj-abcdefghijklmnop1234",
        "tavily tvly-abcdefghijklmnop1234": "tvly-abcdefghijklmnop1234",
        "Authorization: Bearer abcdef.ghijkl-mnopqr_stuv": "abcdef.ghijkl-mnopqr_stuv",
        "token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnop": "eyJhbGciOiJIUzI1NiJ9",
        'payload {"password": "hunter2hunter2"}': "hunter2hunter2",
        "OPENAI_API_KEY=abc123abc123abc123": "abc123abc123abc123",
        "postgresql+asyncpg://postgres:supersecret@localhost:5432/db": "supersecret",
        "redis://:redispass@cache:6379/0": "redispass",
    }
    for text, secret in cases.items():
        cleaned = redact(text)
        assert secret not in cleaned and "redacted" in cleaned, text


def test_redaction_leaves_ordinary_text_alone():
    text = "Processed document 42 for user a1b2 in 120 ms (skip this: sk-short)"
    assert redact(text) == text


def test_formatter_scrubs_tracebacks_too():
    try:
        raise RuntimeError("connection to postgresql://u:topsecretpw@db/x failed")
    except RuntimeError:
        import sys

        record = logging.LogRecord("t", logging.ERROR, __file__, 1, "boom", None, sys.exc_info())
    out = RedactingFormatter("%(message)s").format(record)
    assert "topsecretpw" not in out and "boom" in out and "[redacted]" in out


def test_memory_limiter_counts_windows_and_resets():
    import asyncio

    async def scenario():
        limiter = MemoryLimiter()
        assert [(await limiter.hit("k", 60))[0] for _ in range(3)] == [1, 2, 3]
        count, ttl = await limiter.peek("k")
        assert count == 3 and 1 <= ttl <= 60
        assert (await limiter.hit("other", 60))[0] == 1
        await limiter.delete("k")
        assert await limiter.peek("k") == (0, 0)
        await limiter.hit("short", 1)
        await asyncio.sleep(1.05)
        assert (await limiter.hit("short", 1))[0] == 1  # a new window starts after the old one expires

    asyncio.run(scenario())

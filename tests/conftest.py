import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import get_settings
from app.db import database, models  # noqa: F401
from app.db.database import Base, get_db
from app.main import app as fastapi_app
from app.core import rate_limit
from app.services import document_service, research_service

_BASE_URL = get_settings().database_url.rsplit("/", 1)[0]
TEST_DB = "ai_workspace_test"


async def _ensure_test_database() -> None:
    admin = create_async_engine(f"{_BASE_URL}/postgres", isolation_level="AUTOCOMMIT", poolclass=NullPool)
    async with admin.connect() as conn:
        exists = await conn.scalar(text("SELECT 1 FROM pg_database WHERE datname = :n"), {"n": TEST_DB})
        if not exists:
            await conn.execute(text(f"CREATE DATABASE {TEST_DB}"))
    await admin.dispose()


@pytest.fixture(autouse=True)
def storage_dir(monkeypatch, tmp_path):
    monkeypatch.setattr(get_settings(), "upload_dir", str(tmp_path / "uploads"))
    return tmp_path / "uploads"


@pytest.fixture(autouse=True)
def fresh_rate_limiter(monkeypatch):
    """Every test starts with empty in-memory counters, and never needs Redis."""
    monkeypatch.setattr(get_settings(), "rate_limit_backend", "memory")
    monkeypatch.setattr(rate_limit, "_limiter", None)


@pytest.fixture(autouse=True)
def offline_providers(monkeypatch):
    """Tests never call OpenAI or Pinecone, whatever is in your .env."""
    settings = get_settings()
    monkeypatch.setattr(settings, "embedding_provider", "mock")
    monkeypatch.setattr(settings, "vector_store", "local")
    monkeypatch.setattr(settings, "embedding_dimensions", 256)
    monkeypatch.setattr(settings, "chat_provider", "mock")
    monkeypatch.setattr(settings, "reranker", "lexical")
    monkeypatch.setattr(settings, "similarity_threshold", 0.2)


@pytest.fixture(autouse=True)
def enqueued(monkeypatch):
    """Replace the Redis queue with a recorder so tests need no Redis."""
    calls: list = []

    async def fake_enqueue(document_id):
        calls.append(document_id)

    monkeypatch.setattr(document_service, "enqueue_document_processing", fake_enqueue)
    return calls


@pytest.fixture(autouse=True)
def research_enqueued(monkeypatch):
    """Research runs are executed by calling the runner directly, never through Redis."""
    calls: list = []

    async def fake_enqueue(run_id):
        calls.append(run_id)

    monkeypatch.setattr(research_service, "enqueue_research_run", fake_enqueue)
    return calls


@pytest_asyncio.fixture
async def session_maker(monkeypatch):
    await _ensure_test_database()
    engine = create_async_engine(f"{_BASE_URL}/{TEST_DB}", poolclass=NullPool)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    maker = async_sessionmaker(engine, expire_on_commit=False)
    monkeypatch.setattr(database, "SessionLocal", maker)  # the local vector store opens its own sessions
    yield maker
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest_asyncio.fixture
async def client(session_maker):
    async def override_get_db():
        async with session_maker() as session:
            yield session

    fastapi_app.dependency_overrides[get_db] = override_get_db
    async with AsyncClient(transport=ASGITransport(app=fastapi_app), base_url="http://test") as c:
        yield c
    fastapi_app.dependency_overrides.clear()

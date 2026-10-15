import uuid

from app.core.config import get_settings
from app.rag.ingestion import process_document
from tests.helpers import make_docx, make_kb, make_pdf, make_user, upload

TEXT = ("Renewable energy storage is changing. " * 60).encode()


async def _run_worker(session_maker, document_id: str) -> None:
    async with session_maker() as session:
        await process_document(session, uuid.UUID(document_id))


async def test_upload_queues_then_worker_processes(client, session_maker, enqueued):
    h = await make_user(client, "a@example.com")
    kb = await make_kb(client, h, chunk_size=200, chunk_overlap=20)
    res = await upload(client, h, kb["id"], "report.txt", TEXT)
    assert res.status_code == 201
    doc = res.json()["data"]
    assert doc["status"] == "uploaded" and doc["source_type"] == "txt"
    assert enqueued == [uuid.UUID(doc["id"])]

    await _run_worker(session_maker, doc["id"])
    done = (await client.get(f"/api/documents/{doc['id']}", headers=h)).json()["data"]
    assert done["status"] == "completed" and done["chunk_count"] > 1 and done["processed_at"]

    chunks = (await client.get(f"/api/documents/{doc['id']}/chunks?page_size=50", headers=h)).json()["data"]
    assert chunks["total"] == done["chunk_count"]
    assert chunks["items"][0]["chunk_index"] == 0
    kb_after = (await client.get(f"/api/knowledge-bases/{kb['id']}", headers=h)).json()["data"]
    assert kb_after["document_count"] == 1 and kb_after["indexed_count"] == 1


async def test_pdf_and_docx_pipeline(client, session_maker):
    h = await make_user(client, "a@example.com")
    kb = await make_kb(client, h)
    pdf = (await upload(client, h, kb["id"], "a.pdf", make_pdf("Quarterly revenue grew"), "application/pdf")).json()["data"]
    docx_mime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    docx = (await upload(client, h, kb["id"], "b.docx", make_docx(["Battery chemistry notes."]), docx_mime)).json()["data"]
    for doc in (pdf, docx):
        await _run_worker(session_maker, doc["id"])
    pdf_done = (await client.get(f"/api/documents/{pdf['id']}", headers=h)).json()["data"]
    assert pdf_done["status"] == "completed" and pdf_done["page_count"] == 1
    chunk = (await client.get(f"/api/documents/{pdf['id']}/chunks", headers=h)).json()["data"]["items"][0]
    assert chunk["page_number"] == 1 and "Quarterly revenue" in chunk["content"]
    assert (await client.get(f"/api/documents/{docx['id']}", headers=h)).json()["data"]["status"] == "completed"


async def test_unreadable_document_is_marked_failed(client, session_maker):
    h = await make_user(client, "a@example.com")
    kb = await make_kb(client, h)
    doc = (await upload(client, h, kb["id"], "blank.txt", b"   \n  \n")).json()["data"]
    await _run_worker(session_maker, doc["id"])
    failed = (await client.get(f"/api/documents/{doc['id']}", headers=h)).json()["data"]
    assert failed["status"] == "failed" and "No readable text" in failed["error_message"]


async def test_rejects_bad_uploads(client):
    h = await make_user(client, "a@example.com")
    kb = await make_kb(client, h)
    assert (await upload(client, h, kb["id"], "run.exe", b"MZ", "application/octet-stream")).status_code == 415
    fake_pdf = await upload(client, h, kb["id"], "fake.pdf", b"just text", "application/pdf")
    assert fake_pdf.status_code == 415 and fake_pdf.json()["error"]["code"] == "FILE_TYPE_MISMATCH"
    wrong_mime = await upload(client, h, kb["id"], "x.txt", b"hello", "image/png")
    assert wrong_mime.status_code == 415
    assert (await upload(client, h, kb["id"], "empty.txt", b"")).status_code == 400
    binary = await upload(client, h, kb["id"], "bin.txt", b"abc\x00def")
    assert binary.status_code == 415


async def test_file_size_limit(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "max_file_size", 1024 * 1024)
    h = await make_user(client, "a@example.com")
    kb = await make_kb(client, h)
    res = await upload(client, h, kb["id"], "big.txt", b"a" * (1024 * 1024 + 1))
    assert res.status_code == 413 and res.json()["error"]["code"] == "FILE_TOO_LARGE"


async def test_duplicate_upload_rejected(client):
    h = await make_user(client, "a@example.com")
    kb = await make_kb(client, h)
    assert (await upload(client, h, kb["id"], "one.txt", TEXT)).status_code == 201
    dup = await upload(client, h, kb["id"], "copy.txt", TEXT)
    assert dup.status_code == 409 and dup.json()["error"]["code"] == "DOCUMENT_DUPLICATE"


async def test_filename_is_sanitized_and_file_stored_safely(client, storage_dir):
    h = await make_user(client, "a@example.com")
    kb = await make_kb(client, h)
    doc = (await upload(client, h, kb["id"], "../../etc/evil.txt", TEXT)).json()["data"]
    assert doc["filename"] == "evil.txt"
    stored = [p for p in storage_dir.rglob("*") if p.is_file()]
    assert len(stored) == 1 and storage_dir in stored[0].parents


async def test_delete_document_removes_file_and_chunks(client, session_maker, storage_dir):
    h = await make_user(client, "a@example.com")
    kb = await make_kb(client, h)
    doc = (await upload(client, h, kb["id"], "a.txt", TEXT)).json()["data"]
    await _run_worker(session_maker, doc["id"])
    assert (await client.delete(f"/api/documents/{doc['id']}", headers=h)).status_code == 200
    assert (await client.get(f"/api/documents/{doc['id']}", headers=h)).status_code == 404
    assert not [p for p in storage_dir.rglob("*") if p.is_file()]


async def test_reindex_uses_new_chunk_settings(client, session_maker, enqueued):
    h = await make_user(client, "a@example.com")
    kb = await make_kb(client, h, chunk_size=1000, chunk_overlap=0)
    doc = (await upload(client, h, kb["id"], "a.txt", TEXT)).json()["data"]
    await _run_worker(session_maker, doc["id"])
    before = (await client.get(f"/api/documents/{doc['id']}", headers=h)).json()["data"]["chunk_count"]
    await client.patch(f"/api/knowledge-bases/{kb['id']}", json={"chunk_size": 200, "chunk_overlap": 0}, headers=h)
    res = await client.post(f"/api/documents/{doc['id']}/reindex", headers=h)
    assert res.status_code == 200 and res.json()["data"]["status"] == "uploaded"
    assert len(enqueued) == 2
    await _run_worker(session_maker, doc["id"])
    after = (await client.get(f"/api/documents/{doc['id']}", headers=h)).json()["data"]["chunk_count"]
    assert after > before


async def test_documents_are_private_to_their_owner(client, session_maker):
    owner = await make_user(client, "owner@example.com")
    intruder = await make_user(client, "intruder@example.com")
    kb = await make_kb(client, owner)
    assert (await upload(client, intruder, kb["id"], "x.txt", TEXT)).status_code == 404
    doc = (await upload(client, owner, kb["id"], "x.txt", TEXT)).json()["data"]
    await _run_worker(session_maker, doc["id"])
    for method, url in [
        ("get", f"/api/documents/{doc['id']}"),
        ("get", f"/api/documents/{doc['id']}/chunks"),
        ("delete", f"/api/documents/{doc['id']}"),
        ("post", f"/api/documents/{doc['id']}/reindex"),
    ]:
        assert (await getattr(client, method)(url, headers=intruder)).status_code == 404
    assert (await client.get("/api/documents", headers=intruder)).json()["data"]["total"] == 0


async def test_list_filters(client):
    h = await make_user(client, "a@example.com")
    kb = await make_kb(client, h)
    await upload(client, h, kb["id"], "alpha.txt", b"alpha text")
    await upload(client, h, kb["id"], "beta.txt", b"beta text")
    res = (await client.get(f"/api/documents?knowledge_base_id={kb['id']}&q=alph", headers=h)).json()["data"]
    assert res["total"] == 1 and res["items"][0]["filename"] == "alpha.txt"
    assert (await client.get("/api/documents?status=completed", headers=h)).json()["data"]["total"] == 0

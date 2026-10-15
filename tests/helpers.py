import io

from docx import Document as DocxDocument


async def make_user(client, email: str) -> dict:
    res = await client.post(
        "/api/auth/register", json={"email": email, "password": "Secret123", "full_name": "Test User"}
    )
    client.cookies.clear()
    return {"Authorization": f"Bearer {res.json()['data']['access_token']}"}


async def make_kb(client, headers: dict, name: str = "Reports", **extra) -> dict:
    ws = await client.post("/api/workspaces", json={"name": f"WS for {name}"}, headers=headers)
    res = await client.post(
        "/api/knowledge-bases",
        json={"workspace_id": ws.json()["data"]["id"], "name": name, **extra},
        headers=headers,
    )
    assert res.status_code == 201, res.text
    return res.json()["data"]


async def upload(client, headers: dict, kb_id: str, name: str, data: bytes, mime: str = "text/plain"):
    return await client.post(
        "/api/documents/upload",
        data={"knowledge_base_id": kb_id},
        files={"file": (name, data, mime)},
        headers=headers,
    )


def make_pdf(text: str) -> bytes:
    content = f"BT /F1 12 Tf 20 100 Td ({text}) Tj ET".encode()
    objects = [
        b"<</Type/Catalog/Pages 2 0 R>>",
        b"<</Type/Pages/Kids[3 0 R]/Count 1>>",
        b"<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 200]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>",
        b"<</Length %d>>\nstream\n" % len(content) + content + b"\nendstream",
        b"<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>",
    ]
    out = b"%PDF-1.4\n"
    offsets = []
    for number, body in enumerate(objects, start=1):
        offsets.append(len(out))
        out += f"{number} 0 obj\n".encode() + body + b"\nendobj\n"
    xref = len(out)
    out += f"xref\n0 {len(objects) + 1}\n".encode() + b"0000000000 65535 f \n"
    out += b"".join(f"{offset:010d} 00000 n \n".encode() for offset in offsets)
    out += f"trailer\n<</Root 1 0 R/Size {len(objects) + 1}>>\nstartxref\n{xref}\n%%EOF".encode()
    return out


def make_docx(paragraphs: list[str]) -> bytes:
    doc = DocxDocument()
    for text in paragraphs:
        doc.add_paragraph(text)
    buffer = io.BytesIO()
    doc.save(buffer)
    return buffer.getvalue()

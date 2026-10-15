from app.rag.chunking import chunk_document, estimate_tokens
from app.rag.cleaning import clean_text
from app.rag.parsing import ParsedPage


def _para(n: int) -> str:
    return f"Paragraph {n}. " + "word " * 40


def test_chunks_respect_size_and_keep_order():
    text = "\n\n".join(_para(i) for i in range(30))
    chunks = chunk_document([ParsedPage(None, text)], chunk_size=200, chunk_overlap=40)
    assert len(chunks) > 3
    assert [c.chunk_index for c in chunks] == list(range(len(chunks)))
    assert all(c.token_count <= 200 + 2 for c in chunks)


def test_overlap_repeats_trailing_content():
    text = "\n\n".join(_para(i) for i in range(10))
    chunks = chunk_document([ParsedPage(None, text)], chunk_size=200, chunk_overlap=60)
    first_tail = chunks[0].text.split("\n\n")[-1]
    assert first_tail in chunks[1].text


def test_no_overlap_when_zero():
    text = "\n\n".join(_para(i) for i in range(10))
    chunks = chunk_document([ParsedPage(None, text)], chunk_size=200, chunk_overlap=0)
    assert chunks[0].text.split("\n\n")[-1] not in chunks[1].text


def test_page_numbers_preserved():
    pages = [ParsedPage(1, _para(1)), ParsedPage(2, _para(2))]
    chunks = chunk_document(pages, chunk_size=500, chunk_overlap=50)
    assert [c.page_number for c in chunks] == [1, 2]


def test_oversized_text_without_breaks_is_split():
    chunks = chunk_document([ParsedPage(None, "x" * 5000)], chunk_size=200, chunk_overlap=0)
    assert len(chunks) >= 6
    assert all(estimate_tokens(c.text) <= 200 for c in chunks)


def test_long_paragraph_split_on_sentences():
    text = " ".join(f"This is sentence number {i}." for i in range(200))
    chunks = chunk_document([ParsedPage(None, text)], chunk_size=200, chunk_overlap=0)
    assert all(c.text.rstrip().endswith(".") for c in chunks)


def test_clean_text_unwraps_pdf_lines_and_hyphens():
    raw = "A para-\ngraph that wraps\nacross lines.\n\n\n\nNext   paragraph."
    cleaned = clean_text(raw, "pdf")
    assert cleaned == "A paragraph that wraps across lines.\n\nNext paragraph."


def test_clean_text_keeps_line_breaks_for_markdown():
    assert clean_text("- a\n- b\n\x00", "md") == "- a\n- b"

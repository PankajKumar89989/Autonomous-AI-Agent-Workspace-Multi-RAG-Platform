import pytest

from app.rag.parsing import ParseError, parse_document
from tests.helpers import make_docx, make_pdf


def test_parse_pdf_extracts_text_and_pages():
    parsed = parse_document(make_pdf("Hello PDF world"), "pdf")
    assert parsed.page_count == 1
    assert parsed.pages[0].page_number == 1
    assert "Hello PDF world" in parsed.pages[0].text


def test_parse_docx_reads_paragraphs():
    parsed = parse_document(make_docx(["First paragraph.", "Second paragraph."]), "docx")
    assert "First paragraph." in parsed.pages[0].text and "Second paragraph." in parsed.pages[0].text


def test_parse_csv_labels_columns():
    parsed = parse_document(b"name,age\nAda,36\nGrace,45\n", "csv")
    assert "name: Ada | age: 36" in parsed.pages[0].text
    assert "name: Grace | age: 45" in parsed.pages[0].text


def test_parse_markdown_and_text():
    assert parse_document(b"# Title\n\nBody", "md").pages[0].text.startswith("# Title")
    assert parse_document("héllo".encode(), "txt").pages[0].text == "héllo"


def test_corrupt_pdf_raises_parse_error():
    with pytest.raises(ParseError):
        parse_document(b"%PDF-1.4 not really a pdf", "pdf")

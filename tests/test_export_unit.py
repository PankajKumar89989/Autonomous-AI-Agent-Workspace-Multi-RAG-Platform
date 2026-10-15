from datetime import datetime, timezone

from app.services.export_service import ExportData, ExportSource, build_markdown, inline_to_reportlab, methodology, slugify


def _data(**overrides):
    base = dict(
        objective="Compare grid battery chemistries & costs",
        created_at=datetime(2026, 10, 8, tzinfo=timezone.utc), status="completed", duration_ms=4200, model="gpt-4o-mini",
        options={"use_web": True, "length": "medium"},
        steps=[{"agent": "planner", "status": "completed"}, {"agent": "document", "status": "completed"}, {"agent": "web", "status": "failed"}],
        report="## Executive Summary\n\nBatteries are cheaper [1].\n\n## Sources\n\n- [1] a.pdf, page 2 (your documents)",
        sources=[ExportSource(1, "document", "a.pdf", None, None, 2, None, True),
                 ExportSource(2, "web", "News", "https://x.com/a", "x.com", None, "2026-10-07", False)],
        warnings=["1 statement(s) have no citation."], prompt_tokens=100, completion_tokens=50,
    )
    base.update(overrides)
    return ExportData(**base)


def test_slugify_is_filename_safe():
    assert slugify("Compare Grid-Batteries & Costs!?") == "compare-grid-batteries-costs"
    assert slugify("../../etc/passwd") == "etc-passwd"
    assert slugify("???") == "research-report"
    assert len(slugify("x " * 100)) <= 50


def test_markdown_has_the_expected_sections_in_order():
    md = build_markdown(_data())
    order = [md.index(h) for h in ("# Compare grid", "## Research Question", "## Methodology", "## Executive Summary", "## Sources", "## Verification Notes")]
    assert order == sorted(order)
    assert "Generated 08 October 2026" in md and "- 1 statement(s) have no citation." in md


def test_methodology_is_derived_from_what_actually_happened():
    text = "\n".join(methodology(_data()))
    assert "planner, document search" in text and "web research" not in text.split("completed:")[1].split(".")[0]
    assert "Your documents: kept 1 passage(s) from 1 document(s)." in text
    assert "Web: kept 1 source(s) from 1 site(s), retrieved 2026-10-07." in text
    assert "Model: gpt-4o-mini. Tokens: 100 in, 50 out." in text
    no_web = "\n".join(methodology(_data(options={"use_web": False}, sources=[])))
    assert "Web research was not enabled" in no_web
    asked = "\n".join(methodology(_data(sources=[])))
    assert "requested but returned no usable sources" in asked


def test_inline_conversion_escapes_and_formats():
    out = inline_to_reportlab("**Bold** & <b>raw</b> `code` [Site](https://x.com/a?b=1&c=2) [3]")
    assert "<b>Bold</b>" in out and "&amp;" in out and "&lt;b&gt;raw" in out
    assert '<font face="Courier">code</font>' in out and 'href="https://x.com/a?b=1&amp;c=2"' in out and out.endswith("[3]")
    assert "<link" not in inline_to_reportlab("[x](javascript:alert(1))")  # only http(s) URLs become links

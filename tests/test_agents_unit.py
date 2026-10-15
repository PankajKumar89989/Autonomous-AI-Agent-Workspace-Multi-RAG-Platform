import asyncio
from types import SimpleNamespace

from app.agents.analyst_agent import AnalystAgent, extract_findings, validate_analysis
from app.agents.base import AgentContext, Limits, TrackedChatModel
from app.agents.citation_agent import CitationAgent, build_bibliography, find_uncited, strip_invalid_citations
from app.agents.errors import AgentOutputError
from app.agents.planner_agent import PlannerAgent, heuristic_plan, normalize_plan
from app.agents.state import EvidenceRegistry, PlanStep, RunOptions, RunState, normalize_url
from app.agents.summarizer_agent import template_report
from app.rag.llm import ChatMessage, MockChatModel


def _hit(chunk="c1", name="a.pdf", page=2, text="Lithium batteries store solar energy for the grid."):
    return SimpleNamespace(chunk_id=chunk, document_id="d1", knowledge_base_id="k1", document_name=name,
                           page_number=page, chunk_index=0, content=text)


class ScriptedModel:
    """A non-mock chat model that replays canned replies."""

    model_id, is_mock = "scripted", False

    def __init__(self, *replies):
        self.replies = list(replies)

    async def complete(self, messages, *, temperature=0.0, max_tokens=300):
        return self.replies.pop(0)

    async def stream(self, messages, *, temperature=0.2):
        yield ""


def _ctx(model):
    return AgentContext(user_id=None, kb_ids=None, workspace_id=None, chat_model=TrackedChatModel(model),
                        search_provider=None, reranker=None, limits=Limits())


def _state(**opts):
    return RunState("compare battery storage", RunOptions(**opts))


def _run(coro):
    return asyncio.run(coro)


def test_normalize_url_collapses_duplicates():
    a = normalize_url("HTTPS://Example.com/post/?utm_source=x&id=7#top")
    b = normalize_url("https://example.com/post?id=7")
    assert a == b == "https://example.com/post?id=7"


def test_registry_numbers_once_and_dedupes():
    reg = EvidenceRegistry()
    assert reg.add_document(_hit(), 0.9) and not reg.add_document(_hit(), 0.9)
    assert reg.add_web("T", "https://x.com/a?utm_campaign=1", "text") and not reg.add_web("T2", "https://x.com/a", "other")
    assert [e.n for e in reg.items] == [1, 2] and reg.items[1].domain == "x.com" and reg.items[1].retrieved_at
    assert len(reg.of_kind("web")) == 1


def test_registry_has_a_cap():
    reg = EvidenceRegistry()
    for i in range(40):
        reg.add_web("t", f"https://x.com/{i}", "c")
    assert len(reg) == EvidenceRegistry.MAX_ITEMS


def test_heuristic_plan_respects_availability():
    docs_only = heuristic_plan("q question", RunOptions(use_web=True, web_available=False, has_documents=True))
    assert [s.agent for s in docs_only] == ["document"]
    both = heuristic_plan("q question", RunOptions(use_web=True, web_available=True, has_documents=True))
    assert [s.agent for s in both] == ["document", "web"]
    web_only = heuristic_plan("q question", RunOptions(use_web=True, web_available=True, has_documents=False))
    assert [s.agent for s in web_only] == ["web"]


def test_normalize_plan_filters_and_caps():
    opts = RunOptions(use_web=False, web_available=False, has_documents=True)
    raw = [
        {"agent": "web", "task": "x", "queries": ["not allowed"]},
        {"agent": "document", "task": "a", "queries": ["alpha query", "alpha query", "x", "beta query", "gamma", "delta"]},
        "junk",
        {"agent": "document", "task": "b", "queries": ["second step"]},
        {"agent": "document", "task": "c", "queries": ["third step"]},
    ]
    steps = normalize_plan(raw, opts, "objective", max_retrieval=2)
    assert [s.id for s in steps] == ["s1", "s2"] and steps[0].queries == ["alpha query", "beta query", "gamma"]
    assert normalize_plan([{"agent": "web", "queries": ["z z z"]}], opts, "my objective", 3)[0].queries == ["my objective"]


def test_planner_uses_model_plan_and_falls_back_on_garbage():
    state = _state(has_documents=True)
    reply = '{"steps":[{"agent":"document","task":"find","queries":["battery chemistry","grid storage cost"]}],"analysis":"compare costs","report":"cost table"}'
    _run(PlannerAgent().run(_ctx(ScriptedModel(reply)), PlanStep("planner", "planner", "", []), state))
    assert state.plan[0].queries == ["battery chemistry", "grid storage cost"] and state.analyst_task == "compare costs"
    bad = _state(has_documents=True)
    try:
        _run(PlannerAgent().run(_ctx(ScriptedModel("no json here")), PlanStep("planner", "planner", "", []), bad))
        raise AssertionError("expected AgentOutputError")
    except AgentOutputError:
        pass
    _run(PlannerAgent().fallback(_ctx(MockChatModel()), PlanStep("planner", "planner", "", []), bad))
    assert bad.plan and bad.plan[0].queries == [bad.objective]


def test_validate_analysis_drops_unsupported_findings():
    data = {
        "findings": [
            {"claim": "Real finding", "sources": [1, 9], "confidence": "high"},
            {"claim": "Cites nothing real", "sources": [9]},
            {"claim": "", "sources": [1]},
        ],
        "contradictions": [{"topic": "t", "sources": [1, 2], "description": "they disagree"}, {"description": "x", "sources": [1]}],
        "gaps": ["no cost data", " "],
    }
    findings, contradictions, gaps = validate_analysis(data, {1, 2})
    assert findings == [{"claim": "Real finding", "sources": [1], "confidence": "high"}]
    assert len(contradictions) == 1 and gaps == ["no cost data"]


def test_offline_analyst_quotes_best_sentence_per_source():
    reg = EvidenceRegistry()
    reg.add_document(_hit(text="Pasta needs salt. Lithium battery storage keeps solar energy for later."), 0.5)
    findings = extract_findings("lithium battery storage", reg.items)
    assert len(findings) == 1 and "Lithium battery storage" in findings[0]["claim"] and findings[0]["sources"] == [1]


def test_analyst_agent_rejects_unreadable_model_output():
    state = _state()
    state.evidence.add_document(_hit(), 0.5)
    try:
        _run(AnalystAgent().run(_ctx(ScriptedModel("sorry")), PlanStep("a", "analyst", "", []), state))
        raise AssertionError("expected AgentOutputError")
    except AgentOutputError:
        pass


def test_summarizer_template_and_length():
    state = _state()
    state.findings = [{"claim": f"Fact number {i} about storage", "sources": [1], "confidence": "low"} for i in range(10)]
    state.options.length = "short"
    short = template_report(state)
    state.options.length = "detailed"
    assert short.count("\n- Fact") == 3 and template_report(state).count("\n- Fact") == 10
    assert "## Executive Summary" in short and "[1]" in short and "development mode" in short


def test_citation_helpers():
    assert strip_invalid_citations("A [1] and B [7].", {1, 2}) == "A [1] and B ."
    body = "## Findings\n- This is a long statement without any citation attached to it at all, honestly.\n- Short.\n- A cited statement that is long enough to be checked properly by the checker [1].\n## Limitations\n- A long limitation line that has no citation but sits in the limitations section so is fine."
    assert len(find_uncited(body)) == 1
    reg = EvidenceRegistry()
    reg.add_document(_hit(), 0.5)
    reg.add_web("Site", "https://x.com/a", "c")
    bib = build_bibliography(reg.items)
    assert "- [1] a.pdf, page 2 (your documents)" in bib and "[Site](https://x.com/a) (web, x.com, retrieved" in bib


def test_citation_agent_strips_flags_and_appends_sources():
    state = _state()
    state.evidence.add_document(_hit(), 0.5)
    state.evidence.add_document(_hit(chunk="c2", name="b.pdf"), 0.4)
    state.report = "## Summary\n- Lithium batteries store solar energy for the grid, as the first report explains well [1][5].\n- An uncited and rather long claim that nobody supports with any source whatsoever here."
    result = _run(CitationAgent().run(_ctx(MockChatModel()), PlanStep("c", "citation", "", []), state))
    assert "[5]" not in state.final_report and "## Sources" in state.final_report and "b.pdf" not in state.final_report
    assert [e.cited for e in state.evidence.items] == [True, False] and "1 uncited" in result.summary
    assert any("no citation" in w for w in state.warnings)


def test_tracked_model_counts_tokens():
    model = TrackedChatModel(ScriptedModel("x" * 40))
    _run(model.complete([ChatMessage("user", "y" * 80)]))
    assert (model.prompt_tokens, model.completion_tokens) == (20, 10)

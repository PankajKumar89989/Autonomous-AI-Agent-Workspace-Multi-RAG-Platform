import asyncio
from types import SimpleNamespace

import pytest

from app.rag.llm import ChatMessage, MockChatModel
from app.rag.pipelines import (
    build_context,
    build_messages,
    build_user_prompt,
    extract_cited,
    heuristic_rewrite,
    trim_history,
)
from app.rag.reranker import Candidate, LexicalReranker, RerankError, parse_scores


def _hit(name, text, page=None):
    return SimpleNamespace(document_name=name, content=text, page_number=page)


def test_build_context_numbers_sources_and_respects_budget():
    hits = [_hit("a.pdf", "x" * 100, 3), _hit("b.pdf", "y" * 100), _hit("c.pdf", "z" * 100)]
    context, used = build_context(hits, max_chars=260)
    assert len(used) == 2 and context.startswith("[1] a.pdf, page 3\n") and "[2] b.pdf\n" in context
    assert "c.pdf" not in context


def test_build_context_always_keeps_the_first_source():
    context, used = build_context([_hit("big.pdf", "q" * 9000)], max_chars=100)
    assert len(used) == 1 and len(context) < 6100  # truncated per source, not dropped


def test_extract_cited_ignores_unknown_numbers():
    assert extract_cited("Fact [1]. More [3][1]. Bogus [9].", 3) == [1, 3]
    assert extract_cited("no citations", 3) == []


def test_trim_history_keeps_recent_and_shortens():
    history = [ChatMessage("user", f"m{i} " + "x" * 5000) for i in range(10)]
    trimmed = trim_history(history, max_messages=4, max_chars_each=100)
    assert len(trimmed) == 4 and trimmed[0].content.startswith("m6") and all(len(m.content) == 100 for m in trimmed)


def test_heuristic_rewrite_borrows_previous_question_for_short_followups():
    history = [ChatMessage("user", "lithium battery storage"), ChatMessage("assistant", "answer")]
    assert heuristic_rewrite(history, "and solar?") == "lithium battery storage and solar?"
    assert heuristic_rewrite(history, "explain the grid battery storage costs") == "explain the grid battery storage costs"
    assert heuristic_rewrite([], "and solar?") == "and solar?"


def test_lexical_reranker_prefers_the_passage_that_matches():
    candidates = [
        Candidate("a", "Tomato sauce needs garlic and basil.", 0.5),
        Candidate("b", "Lithium battery storage keeps solar energy for the grid.", 0.5),
    ]
    scores = asyncio.run(LexicalReranker().rerank("lithium battery storage", candidates))
    assert scores["b"] > scores["a"]


def test_parse_scores_validates_shape():
    assert parse_scores('Sure: {"scores": [10, 3, 0]}', 3) == [10.0, 3.0, 0.0]
    assert parse_scores('{"scores": [99, -4]}', 2) == [10.0, 0.0]
    for bad in ("nonsense", '{"scores": [1]}', '{"scores": "x"}'):
        with pytest.raises(RerankError):
            parse_scores(bad, 2)


def _stream_text(prompt: str) -> str:
    async def run():
        parts = []
        async for part in MockChatModel().stream([ChatMessage("user", prompt)]):
            if isinstance(part, str):
                parts.append(part)
        return "".join(parts)

    return asyncio.run(run())


def test_mock_model_quotes_matching_sentences_with_citations():
    context = "[1] a.txt\nLithium batteries store solar energy for the grid. Pasta needs salt.\n\n[2] b.txt\nOther text."
    answer = _stream_text(build_user_prompt(context, "How do lithium batteries store solar energy?"))
    assert "Lithium batteries store solar energy for the grid. [1]" in answer and "Pasta" not in answer


def test_mock_model_admits_when_sources_do_not_match():
    answer = _stream_text(build_user_prompt("[1] a.txt\nPasta needs salt and water.", "quantum chromodynamics"))
    assert "couldn't find this in your documents" in answer


def test_system_prompt_is_first_message():
    messages = build_messages([ChatMessage("user", "hi")], "prompt")
    assert messages[0].role == "system" and messages[-1].content == "prompt" and len(messages) == 3

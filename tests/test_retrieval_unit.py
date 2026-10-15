import asyncio
import math

from app.rag.embeddings import MockEmbedder
from app.rag.retriever import build_tsquery, normalize_fused, reciprocal_rank_fusion


def _cosine(a, b):
    return sum(x * y for x, y in zip(a, b))


def test_mock_embedder_is_deterministic_and_normalized():
    embedder = MockEmbedder(128)
    first = asyncio.run(embedder.embed_query("lithium battery storage"))
    second = asyncio.run(embedder.embed_query("lithium battery storage"))
    assert first == second and len(first) == 128
    assert math.isclose(math.sqrt(sum(v * v for v in first)), 1.0, rel_tol=1e-9)


def test_mock_embedder_scores_related_text_higher():
    embedder = MockEmbedder(256)
    query = asyncio.run(embedder.embed_query("battery storage for solar energy"))
    related, unrelated = asyncio.run(
        embedder.embed_documents(["Grid battery storage helps solar energy", "Tomato sauce with garlic and basil"])
    )
    assert _cosine(query, related) > _cosine(query, unrelated) + 0.3


def test_rrf_rewards_agreement_between_lists():
    fused = reciprocal_rank_fusion([["a", "b", "c"], ["c", "a", "d"]])
    assert max(fused, key=fused.get) == "a"  # ranked 1st and 2nd beats 3rd and 1st
    assert fused["a"] > fused["b"] and fused["c"] > fused["d"]


def test_normalize_fused_hits_one_for_top_in_every_list():
    fused = reciprocal_rank_fusion([["a"], ["a"]])
    assert math.isclose(normalize_fused(fused["a"], 2), 1.0)
    assert normalize_fused(0.5, 0) == 0.0


def test_build_tsquery_is_or_of_clean_words():
    assert build_tsquery("What are the conclusions?") == "what | are | the | conclusions"
    assert build_tsquery("a b") is None
    assert build_tsquery("'; DROP TABLE x; --") == "drop | table"

"""Requires the database to be migrated and seeded (poetry run migrate && poetry run seed)."""
import pytest

from app.rag.retriever import retrieve


def _db_available() -> bool:
    from app.db import check_db_connection

    ok, _ = check_db_connection()
    return ok


pytestmark = pytest.mark.skipif(not _db_available(), reason="requires a seeded database")


def test_exact_error_code_ranks_first_lexical():
    results = retrieve("VPN error 619", strategy="lexical_heavy", dept="IT", top_k=5)
    assert results
    assert "619" in results[0]["title"]


def test_exact_error_code_ranks_first_hybrid():
    results = retrieve("VPN error 619", strategy="hybrid_rerank", dept="IT", top_k=5)
    assert results
    assert "619" in results[0]["title"]


def test_vague_query_returns_results_semantic():
    results = retrieve("my laptop is super slow", strategy="semantic_heavy", dept="IT", top_k=5)
    assert len(results) == 5
    titles = " ".join(r["title"].lower() for r in results)
    assert "laptop" in titles or "wi-fi" in titles


def test_hr_dept_filter_excludes_it_articles():
    results = retrieve("parental leave policy", strategy="hybrid_rerank", dept="HR", top_k=5)
    assert results
    assert all(r["dept"] == "HR" for r in results)

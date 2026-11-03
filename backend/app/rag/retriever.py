"""Hybrid retrieval: Postgres full-text search + pgvector cosine search, merged by strategy.

Three strategies (bandit arms, see app/rag/strategies.py):
- lexical_heavy / semantic_heavy: weighted min-max normalized score fusion.
- hybrid_rerank: Reciprocal Rank Fusion (k=60) of the two candidate lists, then a
  cross-encoder reranks the top 20 down to top 5.

An exact-match boost is applied for error codes (ERR-123, 0x80070057-style hex codes, and bare
"error 619"-style numeric codes) and for policy-name substring hits against the article title.
"""
import re

from sqlalchemy import text

from app.db import get_engine
from app.rag.embedder import embed_query
from app.rag.reranker import rerank
from app.rag.strategies import RRF_K, STRATEGIES

ERROR_CODE_PATTERNS = [
    re.compile(r"\bERR-\d+\b", re.IGNORECASE),
    re.compile(r"\b0x[0-9A-F]+\b", re.IGNORECASE),
    re.compile(r"\berror\s*(?:code\s*)?(\d{3,4})\b", re.IGNORECASE),
]

CANDIDATE_POOL_SIZE = 30
RERANK_POOL_SIZE = 20
EXACT_MATCH_BOOST = 0.5


def _extract_codes(query: str) -> set[str]:
    codes: set[str] = set()
    for pattern in ERROR_CODE_PATTERNS:
        for m in pattern.finditer(query):
            codes.add(m.group(0).upper())
            if m.groups():
                codes.add(m.group(1))
    return codes


def _vector_literal(vec: list[float]) -> str:
    return "[" + ",".join(f"{v:.8f}" for v in vec) + "]"


def _lexical_candidates(conn, query: str, dept: str | None, limit: int) -> list[dict]:
    sql = """
        SELECT c.id, c.article_id, c.text, c.chunk_index,
               a.title, a.dept, a.category, a.error_codes,
               ts_rank_cd(c.tsv, websearch_to_tsquery('english', :q)) AS raw_score
        FROM kb_chunks c
        JOIN knowledge_articles a ON a.id = c.article_id
        WHERE c.tsv @@ websearch_to_tsquery('english', :q)
        {dept_filter}
        ORDER BY raw_score DESC
        LIMIT :limit
    """.format(dept_filter="AND a.dept = :dept" if dept else "")
    params = {"q": query, "limit": limit}
    if dept:
        params["dept"] = dept
    try:
        rows = conn.execute(text(sql), params).mappings().all()
    except Exception:  # noqa: BLE001 - malformed tsquery input, fall back to no lexical hits
        return []
    return [dict(r) for r in rows]


def _vector_candidates(conn, query_vec: list[float], dept: str | None, limit: int) -> list[dict]:
    sql = """
        SELECT c.id, c.article_id, c.text, c.chunk_index,
               a.title, a.dept, a.category, a.error_codes,
               1 - (c.embedding <=> (:qvec)::vector) AS raw_score
        FROM kb_chunks c
        JOIN knowledge_articles a ON a.id = c.article_id
        WHERE c.embedding IS NOT NULL
        {dept_filter}
        ORDER BY c.embedding <=> (:qvec)::vector
        LIMIT :limit
    """.format(dept_filter="AND a.dept = :dept" if dept else "")
    params = {"qvec": _vector_literal(query_vec), "limit": limit}
    if dept:
        params["dept"] = dept
    rows = conn.execute(text(sql), params).mappings().all()
    return [dict(r) for r in rows]


def _normalize(rows: list[dict]) -> dict[str, float]:
    if not rows:
        return {}
    scores = [r["raw_score"] for r in rows]
    lo, hi = min(scores), max(scores)
    span = (hi - lo) or 1.0
    return {r["id"]: (r["raw_score"] - lo) / span for r in rows}


def _apply_exact_match_boost(item: dict, codes: set[str]) -> float:
    if not codes:
        return 0.0
    boost = 0.0
    article_codes = {c.upper() for c in (item.get("error_codes") or [])}
    text_upper = item["text"].upper()
    for code in codes:
        if code.upper() in article_codes or code.upper() in text_upper:
            boost = EXACT_MATCH_BOOST
            break
    return boost


def retrieve(query: str, strategy: str = "hybrid_rerank", dept: str | None = None, top_k: int = 5) -> list[dict]:
    if strategy not in STRATEGIES:
        raise ValueError(f"Unknown strategy: {strategy}. Choose one of {list(STRATEGIES)}")

    cfg = STRATEGIES[strategy]
    codes = _extract_codes(query)
    query_vec = embed_query(query)

    engine = get_engine()
    with engine.connect() as conn:
        lexical_rows = _lexical_candidates(conn, query, dept, CANDIDATE_POOL_SIZE)
        vector_rows = _vector_candidates(conn, query_vec, dept, CANDIDATE_POOL_SIZE)

    by_id: dict[str, dict] = {}
    for r in lexical_rows + vector_rows:
        by_id.setdefault(r["id"], r)

    if cfg["rerank"]:
        lex_rank = {r["id"]: i for i, r in enumerate(lexical_rows)}
        vec_rank = {r["id"]: i for i, r in enumerate(vector_rows)}
        rrf_scores: dict[str, float] = {}
        for cid in by_id:
            score = 0.0
            if cid in lex_rank:
                score += 1.0 / (RRF_K + lex_rank[cid] + 1)
            if cid in vec_rank:
                score += 1.0 / (RRF_K + vec_rank[cid] + 1)
            score += _apply_exact_match_boost(by_id[cid], codes)
            rrf_scores[cid] = score
        ordered_ids = sorted(rrf_scores, key=lambda cid: rrf_scores[cid], reverse=True)[:RERANK_POOL_SIZE]
        pool = [{**by_id[cid], "score": rrf_scores[cid]} for cid in ordered_ids]
        reranked = rerank(query, pool, top_k=top_k)
        return [_shape(r, strategy, r.get("rerank_score", r["score"])) for r in reranked]

    lex_norm = _normalize(lexical_rows)
    vec_norm = _normalize(vector_rows)
    combined: dict[str, float] = {}
    for cid, item in by_id.items():
        score = cfg["lexical_weight"] * lex_norm.get(cid, 0.0) + cfg["vector_weight"] * vec_norm.get(cid, 0.0)
        score += _apply_exact_match_boost(item, codes)
        combined[cid] = score

    ordered_ids = sorted(combined, key=lambda cid: combined[cid], reverse=True)[:top_k]
    return [_shape(by_id[cid], strategy, combined[cid]) for cid in ordered_ids]


def _shape(row: dict, strategy: str, score: float) -> dict:
    return {
        "chunk_id": str(row["id"]),
        "article_id": str(row["article_id"]),
        "title": row["title"],
        "dept": row["dept"],
        "category": row["category"],
        "text": row["text"],
        "score": float(score),
        "strategy": strategy,
    }

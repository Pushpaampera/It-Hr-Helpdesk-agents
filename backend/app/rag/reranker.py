"""Cross-encoder reranker: cross-encoder/ms-marco-MiniLM-L-6-v2."""
from functools import lru_cache

from app.config import get_settings


@lru_cache
def _model():
    from sentence_transformers import CrossEncoder

    settings = get_settings()
    return CrossEncoder(settings.CROSS_ENCODER_MODEL)


def rerank(query: str, candidates: list[dict], top_k: int = 5) -> list[dict]:
    """candidates: list of dicts with a 'text' key. Returns top_k, each with a 'rerank_score'."""
    if not candidates:
        return []
    pairs = [(query, c["text"]) for c in candidates]
    scores = _model().predict(pairs)
    scored = list(zip(candidates, scores, strict=True))
    scored.sort(key=lambda pair: pair[1], reverse=True)
    out = []
    for cand, score in scored[:top_k]:
        item = dict(cand)
        item["rerank_score"] = float(score)
        out.append(item)
    return out

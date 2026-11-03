"""GET /api/kb/search, GET /api/kb/articles/{id}, GET /api/kb/compare — the lexical-vs-vector-
vs-hybrid comparison endpoint for one query, used by the Knowledge Core showcase."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models.user import User
from app.rag.retriever import retrieve
from app.rag.strategies import STRATEGIES

router = APIRouter(prefix="/api/kb", tags=["kb"])


@router.get("/search")
def search(
    q: str, dept: str | None = None, strategy: str = "hybrid_rerank", top_k: int = 5,
    current_user: User = Depends(get_current_user),
):
    if strategy not in STRATEGIES:
        raise HTTPException(400, f"strategy must be one of {list(STRATEGIES)}")
    return {"query": q, "strategy": strategy, "results": retrieve(q, strategy=strategy, dept=dept, top_k=top_k)}


@router.get("/compare")
def compare(q: str, dept: str | None = None, current_user: User = Depends(get_current_user)):
    """Runs the same query through all three bandit-arm strategies side by side — the
    'why did the bandit pick this' demo view."""
    return {
        "query": q,
        "strategies": {
            name: retrieve(q, strategy=name, dept=dept, top_k=5) for name in STRATEGIES
        },
    }


@router.get("/articles/{article_id}")
def get_article(article_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    article = db.execute(
        text(
            """SELECT id, dept, category, title, body, error_codes, source_name, version, updated_at, created_at
               FROM knowledge_articles WHERE id = :id"""
        ),
        {"id": article_id},
    ).mappings().first()
    if not article:
        raise HTTPException(404, "Article not found")
    chunks = db.execute(
        text("SELECT id, chunk_index, text, metadata FROM kb_chunks WHERE article_id = :id ORDER BY chunk_index"),
        {"id": article_id},
    ).mappings().all()
    return {"article": dict(article), "chunks": [dict(c) for c in chunks]}

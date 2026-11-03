"""Local embedding model wrapper: sentence-transformers/all-MiniLM-L6-v2, 384 dims.

No embedding API key is ever needed — this runs fully on-device.
"""
from functools import lru_cache

import numpy as np

from app.config import get_settings


@lru_cache
def _model():
    from sentence_transformers import SentenceTransformer

    settings = get_settings()
    return SentenceTransformer(settings.EMBEDDING_MODEL)


def embed_texts(texts: list[str]) -> list[list[float]]:
    if not texts:
        return []
    vectors = _model().encode(texts, batch_size=32, show_progress_bar=False, normalize_embeddings=True)
    return [v.tolist() for v in vectors]


def embed_query(text: str) -> list[float]:
    vector = _model().encode([text], normalize_embeddings=True)[0]
    return np.asarray(vector).tolist()

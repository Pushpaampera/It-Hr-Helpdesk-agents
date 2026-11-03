"""The three retrieval strategies, selectable per-run by the LinUCB bandit (see app/bandit/).

Stored verbatim (name -> config) in bandit_arms.config during seeding.
"""

STRATEGIES: dict[str, dict] = {
    "lexical_heavy": {
        "description": "Weights Postgres full-text search (BM25-style) more heavily than vector similarity.",
        "lexical_weight": 0.7,
        "vector_weight": 0.3,
        "rerank": False,
    },
    "semantic_heavy": {
        "description": "Weights pgvector cosine similarity more heavily than lexical search.",
        "lexical_weight": 0.3,
        "vector_weight": 0.7,
        "rerank": False,
    },
    "hybrid_rerank": {
        "description": "Reciprocal Rank Fusion of lexical + vector results, then cross-encoder rerank.",
        "lexical_weight": 0.5,
        "vector_weight": 0.5,
        "rerank": True,
    },
}

RRF_K = 60

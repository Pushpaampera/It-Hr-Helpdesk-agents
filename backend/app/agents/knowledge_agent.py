"""Shared retrieval + answer-synthesis logic used by both Iris (IT Support) and Hana (HR
Policy). Picks a retrieval strategy via the live LinUCB bandit, retrieves from kb_chunks, and
synthesizes a cited answer (real LLM call, or a deterministic template in LLM_MOCK_MODE)."""
from datetime import datetime, timezone

from app.agents.llm import call_gemini_with_groq_fallback
from app.bandit import store as bandit_store
from app.bandit.features import build_context_vector
from app.bandit.linucb import select_arm
from app.rag.retriever import retrieve

UNRESOLVED_SCORE_FLOOR = {
    "lexical_heavy": 0.10,
    "semantic_heavy": 0.10,
    "hybrid_rerank": -2.0,
}


def _mock_answer(query: str, chunks: list[dict], dept_label: str) -> str:
    if not chunks:
        return (
            f"I searched the {dept_label} knowledge base but couldn't find anything that "
            f"confidently answers \"{query}\". I'll hand this to a human who can help further."
        )
    top = chunks[0]
    body = top["text"].split("\n", 1)[-1].strip()
    lines = body.split("\n")
    snippet = "\n".join(lines[:6]).strip()
    return f"{snippet}\n\n(Source: {top['title']})"


async def answer_from_knowledge(
    dept: str, query: str, run_id: str, supervisor_confidence: float,
    gemini_model: str, groq_fallback_model: str, system_prompt: str, dept_label: str,
) -> dict:
    arms = bandit_store.load_arms()
    hour = datetime.now(timezone.utc).hour
    context_vec = build_context_vector(dept, query, hour, supervisor_confidence)
    linucb_arms = {name: arm for name, (_, arm) in arms.items()}
    arm_name, ucb_scores = select_arm(context_vec, linucb_arms)
    arm_id = arms[arm_name][0]

    decision_id = bandit_store.record_decision(
        run_id, {"dept": dept, "query": query, "hour": hour, "features": context_vec}, arm_id, ucb_scores,
    )

    chunks = retrieve(query, strategy=arm_name, dept=dept, top_k=5)

    floor = UNRESOLVED_SCORE_FLOOR[arm_name]
    unresolved = not chunks or chunks[0]["score"] < floor

    sources = [
        {"chunk_id": c["chunk_id"], "article_id": c["article_id"], "title": c["title"], "score": round(c["score"], 3)}
        for c in chunks
    ]

    mock_text = _mock_answer(query, chunks, dept_label)

    if unresolved:
        answer = mock_text if not chunks else (
            f"I found some related material but I'm not confident enough to answer \"{query}\" "
            f"precisely. I'll create a ticket so a human can take a closer look."
        )
        return {
            "answer": answer, "sources": sources, "unresolved": True, "arm_name": arm_name,
            "decision_id": decision_id, "tokens_in": 0, "tokens_out": 0, "latency_ms": 0, "model": "n/a",
        }

    context_block = "\n\n---\n\n".join(c["text"] for c in chunks[:3])
    user_prompt = (
        f"Employee question: {query}\n\n"
        f"Relevant knowledge base excerpts:\n{context_block}\n\n"
        "Answer the employee's question directly and concisely using only the excerpts above. "
        "Cite which excerpt(s) you used by article title. If the excerpts don't fully answer the "
        "question, say what you do know and note what's missing."
    )
    result = await call_gemini_with_groq_fallback(system_prompt, user_prompt, gemini_model, groq_fallback_model, mock_text)

    return {
        "answer": result.text.strip(), "sources": sources, "unresolved": False, "arm_name": arm_name,
        "decision_id": decision_id, "tokens_in": result.tokens_in, "tokens_out": result.tokens_out,
        "latency_ms": result.latency_ms, "model": result.model,
    }

"""Shared retrieval + answer-synthesis logic used by both Iris (IT Support) and Hana (HR
Policy). Picks a retrieval strategy via the live LinUCB bandit, retrieves from kb_chunks, and
synthesizes a cited answer (real LLM call, or a deterministic template in LLM_MOCK_MODE)."""
import re
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


_STEP_MARKER = re.compile(r"^\d+[.)]\s+")


def _format_steps(body: str) -> str:
    """Formats a chunk's body as a numbered Markdown step list, or returns it as a single
    paragraph for freeform prose. Seeded KB article bodies that are step-by-step guides are
    already hand-written as "1. ...\\n2. ...", wrapping long steps onto an indented
    continuation line rather than a new numbered line — so this merges each continuation line
    back into the step above it before re-numbering, instead of treating every physical line
    as its own step (which produced literal doubled numbering like "1. 1." once the caller's
    own "N. " prefix was added on top of the source text's own "N. " marker)."""
    steps: list[str] = []
    for raw in body.split("\n")[:12]:
        line = raw.strip()
        if not line:
            continue
        if _STEP_MARKER.match(line):
            steps.append(_STEP_MARKER.sub("", line))
        elif steps:
            steps[-1] = f"{steps[-1]} {line}"
        else:
            steps.append(line)
    steps = steps[:6]
    if len(steps) <= 1:
        return steps[0] if steps else body.strip()
    return "\n".join(f"{i}. {line}" for i, line in enumerate(steps, start=1))


def _mock_answer(query: str, chunks: list[dict], dept_label: str) -> str:
    """Builds a deterministic answer from real retrieved chunk text — no LLM call, no
    randomness, so the same chunks always produce the same answer (required for test
    stability under LLM_MOCK_MODE). Formats step-like bodies as a numbered list and cites
    every article actually used, synthesizing from the top two chunks when they're close
    enough in score to both be genuinely relevant."""
    if not chunks:
        return (
            f"I searched the {dept_label} knowledge base but couldn't find anything that "
            f"confidently answers \"{query}\". I'll hand this to a human who can help further."
        )

    top = chunks[0]
    top_body = top["text"].split("\n", 1)[-1].strip()
    steps = _format_steps(top_body)

    second = chunks[1] if len(chunks) > 1 else None
    use_second = second is not None and (top["score"] - second["score"]) <= 0.15 and second["title"] != top["title"]

    if use_second:
        second_body = second["text"].split("\n", 1)[-1].strip()
        second_lines = [ln.strip() for ln in second_body.split("\n")[:2] if ln.strip()]
        related = " ".join(second_lines)
        return (
            f"{steps}\n\nAlso relevant — \"{second['title']}\": {related}\n\n"
            f"(Sources: {top['title']}, {second['title']})"
        )

    return f"{steps}\n\n(Source: {top['title']})"


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

    mock_text = _mock_answer(query, chunks, dept_label)

    if unresolved:
        if not chunks:
            answer = mock_text
            used_sources = []
        else:
            # Retrieval found real candidates, just not confidently enough to answer outright —
            # show them instead of discarding them. A flat "I'm not confident" message with no
            # content behind it reads as the agent having done nothing at all, even though it
            # genuinely searched and found plausibly-related material.
            top_titles = ", ".join(dict.fromkeys(c["title"] for c in chunks[:3]))
            answer = (
                f"I couldn't find a precise match for \"{query}\", but here's the closest related "
                f"material I found:\n\n{mock_text}\n\n"
                f"(related topics: {top_titles})"
            )
            used_sources = chunks[:2]
        sources = [
            {"chunk_id": c["chunk_id"], "article_id": c["article_id"], "title": c["title"], "score": round(c["score"], 3)}
            for c in used_sources
        ]
        return {
            "answer": answer, "sources": sources, "unresolved": True, "arm_name": arm_name,
            "decision_id": decision_id, "tokens_in": 0, "tokens_out": 0, "latency_ms": 0, "model": "n/a",
        }

    # Resolved answers only ever cite the top chunk, plus a second one when `_mock_answer`
    # judged it close enough in score to genuinely be used too — never the full top_k=5
    # retrieval set, most of which was never shown to the employee (the operator's "don't list
    # loosely related articles" complaint).
    second = chunks[1] if len(chunks) > 1 else None
    cites_second = second is not None and (chunks[0]["score"] - second["score"]) <= 0.15 and second["title"] != chunks[0]["title"]
    used_sources = chunks[:2] if cites_second else chunks[:1]
    sources = [
        {"chunk_id": c["chunk_id"], "article_id": c["article_id"], "title": c["title"], "score": round(c["score"], 3)}
        for c in used_sources
    ]

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

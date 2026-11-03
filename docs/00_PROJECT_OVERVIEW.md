# 00 — Project Overview

## Goal
A runnable demo of an enterprise IT/HR helpdesk run by a team of cooperating AI agents, built
to impress a non-technical HR audience in a live demo. Real RAG over pgvector, real LangGraph
agent orchestration, real SSE event stream — the cinematic frontend animation is driven only by
genuine backend events, never fake timers.

## Users and roles
- **employee** — asks the AI Assistant questions, files/tracks requests, sees only their own data.
- **manager** — everything an employee sees, plus Approvals and Team.
- **hr** — everything an employee sees, plus HR Insights, Policy Knowledge Base, leave queries.
- **admin** — everything, plus Control Room, Reinforcement Lab, Evaluation, Costs, Audit Log.

Role checks are enforced in the backend (`app/deps.py` dependencies on every router), not just
hidden in the UI.

## Demo accounts (seeded in Phase 2, password `Demo@1234` for all)
| Role | Email | Lands on |
|------|-------|----------|
| employee | emma.employee@acme.test | AI Assistant |
| manager | mark.manager@acme.test | Overview (Approvals badge) |
| hr | hannah.hr@acme.test | HR Insights |
| admin | alex.admin@acme.test | Control Room |

## Agent list (internal name → friendly name shown to the audience, model)
| Internal | Friendly name / job | Model |
|----------|---------------------|-------|
| Supervisor | **Sage**, the Request Router | Groq `llama-3.1-8b-instant` |
| Guard | **Gus**, the Privacy Guardian | rules engine, no LLM |
| IT Support | **Iris**, the IT Specialist | Gemini Flash-Lite |
| HR Policy | **Hana**, the HR Policy Expert | Gemini Flash-Lite |
| Action Agent | **Atlas**, the Task Doer | Groq `openai/gpt-oss-20b` (tool calling) |
| Ticketing | **Tess**, the Case Handler | Groq `openai/gpt-oss-20b` |
| Feedback | **Finn**, the Quality Keeper | rules + bandit update, no LLM call |

All LLM calls route through `backend/app/agents/llm.py`: retries, fallback between providers,
token/latency accounting, and `LLM_MOCK_MODE` support for deterministic offline demos.

## Full tech stack
**Backend**: Python 3.11+, FastAPI, Uvicorn, SQLAlchemy 2 (+ plain SQL migration files instead
of Alembic — see `docs/06_DECISIONS.md`), psycopg 3, pgvector, LangGraph, langchain-core, groq
SDK, google-genai SDK, sentence-transformers (local `all-MiniLM-L6-v2`, 384 dims — no embedding
API key needed), cross-encoder `cross-encoder/ms-marco-MiniLM-L-6-v2`, Postgres full-text search
for BM25 (no `rank-bm25` package), pydantic v2, python-jose, passlib[bcrypt], sse-starlette,
numpy, pytest, tenacity, prometheus-client. Optional langfuse (off unless keys present).

**Frontend**: Vite + React 18 + TypeScript, react-router-dom, three, @react-three/fiber,
@react-three/drei, @react-three/postprocessing, framer-motion, gsap (+ ScrollTrigger), zustand,
recharts, lucide-react, @fontsource (Space Grotesk / Inter / JetBrains Mono, installed locally).

## Constraints
See `CLAUDE.md` for the authoritative, always-loaded list (no Docker/sudo/CI/Tailwind, secrets
only via `.env`, pgvector-only database, no placeholders, `LLM_MOCK_MODE` support, 60fps target).

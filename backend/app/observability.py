"""Optional Langfuse tracing hook. A true no-op unless both LANGFUSE_PUBLIC_KEY and
LANGFUSE_SECRET_KEY are set in .env (they're empty by default — see CLAUDE.md: secrets only
ever come from .env). When enabled, mirrors each agent_event and the final run outcome to
Langfuse as a trace/span, purely for observability; nothing in the critical request path
depends on it, and any Langfuse call failure is swallowed so it can never break a demo.

Enabling it also requires `poetry add langfuse` (not a default dependency, to keep the base
install light for an offline/local demo) — if the package isn't installed, this stays a no-op
even with the keys set, and says so once at startup.
"""
from app.config import get_settings

_client = None
_warned = False


def _get_client():
    global _client, _warned
    settings = get_settings()
    if not (settings.LANGFUSE_PUBLIC_KEY and settings.LANGFUSE_SECRET_KEY):
        return None
    if _client is not None:
        return _client
    try:
        from langfuse import Langfuse  # type: ignore[import-not-found]

        _client = Langfuse(public_key=settings.LANGFUSE_PUBLIC_KEY, secret_key=settings.LANGFUSE_SECRET_KEY)
        return _client
    except ImportError:
        if not _warned:
            print(
                "[observability] LANGFUSE_PUBLIC_KEY/LANGFUSE_SECRET_KEY are set but the "
                "'langfuse' package isn't installed — run `poetry add langfuse` to enable "
                "tracing. Continuing without it."
            )
            _warned = True
        return None


def is_enabled() -> bool:
    return _get_client() is not None


def trace_run_start(run_id: str, user_id: str, query: str) -> None:
    client = _get_client()
    if client is None:
        return
    try:
        client.trace(id=run_id, name="helpdesk_agent_run", user_id=user_id, input={"query": query})
    except Exception as exc:  # noqa: BLE001
        print(f"[observability] langfuse trace_run_start failed (ignored): {exc}")


def trace_event(run_id: str, agent: str, status: str, detail: dict, latency_ms: int | None, model: str | None) -> None:
    client = _get_client()
    if client is None:
        return
    try:
        client.span(
            trace_id=run_id, name=f"{agent}.{status}", input=detail, metadata={"model": model},
            start_time=None, end_time=None,
        ) if latency_ms is None else client.span(
            trace_id=run_id, name=f"{agent}.{status}", input=detail, metadata={"model": model, "latency_ms": latency_ms},
        )
    except Exception as exc:  # noqa: BLE001
        print(f"[observability] langfuse trace_event failed (ignored): {exc}")


def trace_run_end(run_id: str, outcome: str, answer: str) -> None:
    client = _get_client()
    if client is None:
        return
    try:
        client.trace(id=run_id, output={"outcome": outcome, "answer": answer})
    except Exception as exc:  # noqa: BLE001
        print(f"[observability] langfuse trace_run_end failed (ignored): {exc}")

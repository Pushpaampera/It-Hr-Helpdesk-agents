"""Single provider wrapper for every LLM call in the system.

Handles: Groq + Gemini SDKs, tenacity retries with exponential backoff, automatic fallback
(Gemini fails -> try Groq, and the reverse), token/latency accounting, and full LLM_MOCK_MODE
support (deterministic canned responses, still returning the same shape so callers never branch
on mock vs. real).
"""
import asyncio
import json
import time
from dataclasses import dataclass
from typing import Any

from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from app.config import get_settings

settings = get_settings()


@dataclass
class LLMResult:
    text: str
    tokens_in: int
    tokens_out: int
    latency_ms: int
    model: str


def is_mock_mode() -> bool:
    return settings.LLM_MOCK_MODE or not (settings.GROQ_API_KEY or settings.GEMINI_API_KEY)


class ProviderError(Exception):
    pass


_groq_client = None
_gemini_client = None


def _groq():
    global _groq_client
    if _groq_client is None:
        from groq import Groq

        _groq_client = Groq(api_key=settings.GROQ_API_KEY)
    return _groq_client


def _gemini():
    global _gemini_client
    if _gemini_client is None:
        from google import genai

        _gemini_client = genai.Client(api_key=settings.GEMINI_API_KEY)
    return _gemini_client


def _retrying():
    return retry(
        reraise=True,
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=0.5, min=0.5, max=4),
        retry=retry_if_exception_type(ProviderError),
    )


@_retrying()
def _groq_call_sync(system: str, user: str, model: str, json_mode: bool = False) -> LLMResult:
    t0 = time.monotonic()
    try:
        kwargs: dict[str, Any] = {
            "model": model,
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
            "temperature": 0.2,
        }
        if json_mode:
            kwargs["response_format"] = {"type": "json_object"}
        resp = _groq().chat.completions.create(**kwargs)
    except Exception as exc:  # noqa: BLE001
        raise ProviderError(str(exc)) from exc
    latency_ms = int((time.monotonic() - t0) * 1000)
    choice = resp.choices[0].message.content or ""
    usage = getattr(resp, "usage", None)
    tin = getattr(usage, "prompt_tokens", 0) or 0
    tout = getattr(usage, "completion_tokens", 0) or 0
    return LLMResult(text=choice, tokens_in=tin, tokens_out=tout, latency_ms=latency_ms, model=model)


@_retrying()
def _gemini_call_sync(system: str, user: str, model: str) -> LLMResult:
    t0 = time.monotonic()
    try:
        client = _gemini()
        resp = client.models.generate_content(
            model=model,
            contents=user,
            config={"system_instruction": system, "temperature": 0.2},
        )
    except Exception as exc:  # noqa: BLE001
        raise ProviderError(str(exc)) from exc
    latency_ms = int((time.monotonic() - t0) * 1000)
    text = resp.text or ""
    usage = getattr(resp, "usage_metadata", None)
    tin = getattr(usage, "prompt_token_count", 0) or 0
    tout = getattr(usage, "candidates_token_count", 0) or 0
    return LLMResult(text=text, tokens_in=tin, tokens_out=tout, latency_ms=latency_ms, model=model)


async def call_groq_json(system: str, user: str, model: str, mock_text: str) -> LLMResult:
    """Used by the Supervisor for strict-JSON routing decisions."""
    if is_mock_mode():
        await asyncio.sleep(0)
        return LLMResult(text=mock_text, tokens_in=len(user.split()), tokens_out=len(mock_text.split()),
                          latency_ms=120, model=f"{model} (mock)")
    try:
        return await asyncio.to_thread(_groq_call_sync, system, user, model, True)
    except ProviderError:
        # No secondary JSON-capable fallback configured; surface a safe default instead of crashing.
        return LLMResult(text=mock_text, tokens_in=0, tokens_out=0, latency_ms=0, model=f"{model} (fallback)")


async def call_gemini_with_groq_fallback(system: str, user: str, gemini_model: str, groq_fallback_model: str, mock_text: str) -> LLMResult:
    """Used by IT Support / HR Policy to synthesize an answer. Gemini first, Groq on failure."""
    if is_mock_mode():
        await asyncio.sleep(0)
        return LLMResult(text=mock_text, tokens_in=len(user.split()), tokens_out=len(mock_text.split()),
                          latency_ms=400, model=f"{gemini_model} (mock)")
    try:
        if not settings.GEMINI_API_KEY:
            # No Gemini key: go straight to Groq instead of spending ~2s on retries that
            # can't succeed.
            raise ProviderError("GEMINI_API_KEY not set")
        return await asyncio.to_thread(_gemini_call_sync, system, user, gemini_model)
    except ProviderError:
        try:
            return await asyncio.to_thread(_groq_call_sync, system, user, groq_fallback_model, False)
        except ProviderError:
            return LLMResult(text=mock_text, tokens_in=0, tokens_out=0, latency_ms=0, model="fallback-template")


async def call_groq_tools(system: str, user: str, model: str, tools: list[dict], mock_tool_call: dict | None) -> tuple[dict | None, LLMResult]:
    """Used by the Action Agent. Returns (tool_call_dict_or_None, LLMResult)."""
    if is_mock_mode():
        await asyncio.sleep(0)
        result = LLMResult(text=json.dumps(mock_tool_call) if mock_tool_call else "", tokens_in=len(user.split()),
                            tokens_out=10, latency_ms=150, model=f"{model} (mock)")
        return mock_tool_call, result

    t0 = time.monotonic()
    try:
        resp = await asyncio.to_thread(
            lambda: _groq().chat.completions.create(
                model=model,
                messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
                tools=tools,
                tool_choice="auto",
                temperature=0.1,
            )
        )
    except Exception as exc:  # noqa: BLE001
        latency_ms = int((time.monotonic() - t0) * 1000)
        return mock_tool_call, LLMResult(text="", tokens_in=0, tokens_out=0, latency_ms=latency_ms, model=f"{model} (error-fallback)")

    latency_ms = int((time.monotonic() - t0) * 1000)
    msg = resp.choices[0].message
    usage = getattr(resp, "usage", None)
    tin = getattr(usage, "prompt_tokens", 0) or 0
    tout = getattr(usage, "completion_tokens", 0) or 0
    tool_call = None
    if msg.tool_calls:
        call = msg.tool_calls[0]
        tool_call = {"name": call.function.name, "arguments": json.loads(call.function.arguments)}
    return tool_call, LLMResult(text=msg.content or "", tokens_in=tin, tokens_out=tout, latency_ms=latency_ms, model=model)

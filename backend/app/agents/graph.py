"""LangGraph wiring: guard -> supervisor -> (action if it's a request to DO something | it_support |
hr_policy | other_reply) -> ticketing (if unresolved/escalated) -> feedback. A completed action
ends without the "did this solve your problem?" question; if Atlas can't tell what to do, the
question goes to the knowledge agent instead.

request_access pauses the graph via a LangGraph NodeInterrupt; approvals.decide() in the
routers layer resumes it. A module-level MemorySaver checkpointer keeps paused-run state across
the two separate HTTP requests (the demo's own process never restarts between them — see
docs/06_DECISIONS.md for why this is an acceptable simplification for a local demo).
"""
import asyncio
import re
from typing import NotRequired, TypedDict

from langgraph.checkpoint.memory import MemorySaver
from langgraph.errors import NodeInterrupt
from langgraph.graph import END, StateGraph

from app.agents import action as action_agent
from app.agents import clarify
from app.agents import general_chat
from app.agents import guard as guard_agent
from app.agents import hr_policy as hr_policy_agent
from app.agents import it_support as it_support_agent
from app.agents import supervisor as supervisor_agent
from app.agents import ticketing as ticketing_agent
from app.agents.events import EventSink, drop_queue, get_queue
from app.agents.runs_store import create_run, get_run, last_event_seq, update_run
from app.mock_apis import approvals as approvals_api
from app import observability

_CHECKPOINTER = MemorySaver()

# Keyword classifiers for the "did this solve your problem?" / "want a ticket?" confirmation
# gates. Deliberately simple regex, not an LLM call — LLM_MOCK_MODE must stay deterministic and
# key-free, and a plain yes/no reply doesn't need more than this.
AFFIRMATIVE_RE = re.compile(
    r"\b(yes|yep|yeah|yup|sure|please|correct|solved|that worked|thanks|ok|okay)\b", re.IGNORECASE
)
NEGATIVE_RE = re.compile(
    r"\b(no|nope|not really|didn'?t|doesn'?t|still|not solved|not working)\b", re.IGNORECASE
)


def _is_affirmative(text: str) -> bool:
    return bool(AFFIRMATIVE_RE.search(text)) and not bool(NEGATIVE_RE.search(text))


def _is_negative(text: str) -> bool:
    return bool(NEGATIVE_RE.search(text))


def is_gate_reply(text: str) -> bool:
    """True if a message answers a pending yes/no question rather than asking something new
    ("how can I put leave" while "did this solve your problem?" is open is a new question)."""
    return _is_affirmative(text) or _is_negative(text)


# Follow-up replies after a confirmation gate. The person has already seen the full answer (it
# was part of the "Did this solve your problem?" prompt), so the final turn must close the loop
# instead of repeating that answer back to them.
SOLVED_REPLY = "Great, I'm glad that solved it! Is there anything else I can help you with?"
DECLINED_TICKET_REPLY = (
    "Okay, I won't open a ticket. If you change your mind or need help with anything else, just ask."
)


class AgentState(TypedDict):
    run_id: str
    user_id: str
    query: str
    route: NotRequired[str]
    confidence: NotRequired[float]
    needs_action: NotRequired[bool]
    intent: NotRequired[str]
    guard_blocked: NotRequired[bool]
    guard_reason: NotRequired[str]
    answer: NotRequired[str]
    sources: NotRequired[list]
    unresolved: NotRequired[bool]
    action_result: NotRequired[dict]
    ticket_number: NotRequired[str]
    approved: NotRequired[bool]
    ended: NotRequired[bool]
    user_reply: NotRequired[str | None]
    offered_ticket: NotRequired[bool]
    action_fallback: NotRequired[bool]
    # Set when the run is answering the reply to a clarifying question, so it never asks a
    # second one in a row.
    clarified: NotRequired[bool]
    clarify: NotRequired[bool]
    suggestions: NotRequired[list]


class RunContext:
    def __init__(self, run_id: str, user: dict, sink: EventSink):
        self.run_id = run_id
        self.user = user
        self.sink = sink


def build_graph(ctx: RunContext):
    async def node_guard(state: AgentState) -> dict:
        await ctx.sink.emit("guard", "working")
        result = guard_agent.check(state["query"], ctx.user)
        await ctx.sink.emit(
            "guard", "completed", action="privacy_check",
            detail={"blocked": result["blocked"], "reason": result["reason"]},
        )
        return {"guard_blocked": result["blocked"], "guard_reason": result["reason"] or ""}

    async def node_blocked_reply(state: AgentState) -> dict:
        answer = f"I can't help with that — {state.get('guard_reason', 'it touches private data I can’t share.')}"
        return {"answer": answer, "unresolved": False}

    async def node_supervisor(state: AgentState) -> dict:
        await ctx.sink.emit("supervisor", "working")
        # Small talk ("hi, how can you help me?", "who are you?", "thanks") never needs routing —
        # answer it directly instead of letting it fall through to a generic OTHER reply.
        if general_chat.small_talk_kind(state["query"]):
            await ctx.sink.emit(
                "supervisor", "completed", action="route", caption="Sage is answering this one directly.",
                detail={"route": "OTHER", "confidence": 1.0, "intent": "small talk"},
            )
            return {"route": "OTHER", "confidence": 1.0, "needs_action": False, "intent": "small talk"}
        result = await supervisor_agent.route(state["query"])
        await ctx.sink.emit(
            "supervisor", "completed", action="route",
            detail={"route": result["route"], "confidence": result["confidence"], "intent": result["intent"]},
            model=result["model"], latency_ms=result["latency_ms"],
            tokens_in=result["tokens_in"], tokens_out=result["tokens_out"],
        )
        if result["route"] in ("IT", "HR"):
            # Requests to DO something go straight to Atlas; questions go to the knowledge agent.
            if result["needs_action"]:
                friendly_agent = "action"
            else:
                friendly_agent = "it_support" if result["route"] == "IT" else "hr_policy"
            await ctx.sink.emit_handoff("supervisor", friendly_agent, result["intent"] or "routing decision")
        return {
            "route": result["route"], "confidence": result["confidence"],
            "needs_action": result["needs_action"], "intent": result["intent"],
        }

    async def node_other_reply(state: AgentState) -> dict:
        first_name = (ctx.user.get("name") or "").split(" ")[0]
        kind = general_chat.small_talk_kind(state["query"])
        if kind:
            return {"answer": general_chat.small_talk_reply(kind, first_name), "unresolved": False}

        # A general question that isn't IT or HR: answer it like a normal assistant would. Unsafe
        # or private-data requests were already stopped by the Guard before routing.
        await ctx.sink.emit("supervisor", "working", caption="Sage is answering a general question.")
        result = await general_chat.general_answer(state["query"], first_name)
        await ctx.sink.emit(
            "supervisor", "completed", action="answer", model=result.model, latency_ms=result.latency_ms,
            tokens_in=result.tokens_in, tokens_out=result.tokens_out,
        )
        return {"answer": result.text.strip(), "unresolved": False}

    async def _maybe_clarify(agent: str, state: AgentState) -> dict | None:
        """Vague question ("I have an issue with my laptop"): ask what's happening instead of
        guessing which article fits. Skipped for a run that is already answering the reply to
        a clarifying question."""
        if state.get("clarified"):
            return None
        subject = clarify.find_vague_subject(state["query"])
        if subject is None:
            return None
        await ctx.sink.emit(
            agent, "completed", action="clarify",
            caption="The question was broad, so the assistant asked what exactly is happening.",
            detail={"subject": subject.key},
        )
        return {
            "answer": clarify.clarifying_reply(subject), "suggestions": list(subject.options),
            "clarify": True, "unresolved": False, "sources": [],
        }

    async def node_it_support(state: AgentState) -> dict:
        if (asked := await _maybe_clarify("it_support", state)) is not None:
            return asked
        await ctx.sink.emit("it_support", "retrieving", action="hybrid_search")
        result = await it_support_agent.answer(state["query"], ctx.run_id, state.get("confidence", 0.6))
        await ctx.sink.emit(
            "it_support", "completed", action="answer",
            detail={"unresolved": result["unresolved"], "strategy": result["arm_name"], "top_chunks": result["sources"]},
            model=result["model"], latency_ms=result["latency_ms"],
            tokens_in=result["tokens_in"], tokens_out=result["tokens_out"],
        )
        return {"answer": result["answer"], "sources": result["sources"], "unresolved": result["unresolved"]}

    async def node_hr_policy(state: AgentState) -> dict:
        if (asked := await _maybe_clarify("hr_policy", state)) is not None:
            return asked
        await ctx.sink.emit("hr_policy", "retrieving", action="hybrid_search")
        result = await hr_policy_agent.answer(state["query"], ctx.run_id, state.get("confidence", 0.6), ctx.user["id"])
        await ctx.sink.emit(
            "hr_policy", "completed", action="answer",
            detail={"unresolved": result["unresolved"], "strategy": result["arm_name"], "top_chunks": result["sources"]},
            model=result["model"], latency_ms=result["latency_ms"],
            tokens_in=result["tokens_in"], tokens_out=result["tokens_out"],
        )
        return {"answer": result["answer"], "sources": result["sources"], "unresolved": result["unresolved"]}

    async def node_action(state: AgentState) -> dict:
        await ctx.sink.emit("action", "working")

        existing = approvals_api.find_by_run(ctx.run_id)
        if existing:
            if existing["status"] == "pending":
                raise NodeInterrupt("awaiting_manager_approval")
            if existing["status"] == "approved":
                system = existing["payload"].get("system", "the system")
                await ctx.sink.emit("action", "completed", action="request_access",
                                     detail={"tool": "request_access", "approved": True})
                return {"answer": f"Good news — your access to {system} was approved and is now active.",
                        "unresolved": False}
            system = existing["payload"].get("system", "the system")
            await ctx.sink.emit("action", "completed", action="request_access",
                                 detail={"tool": "request_access", "approved": False})
            return {"answer": f"Your request for {system} access was declined. I've created a ticket so HR/IT can follow up.",
                     "unresolved": True}

        result = await action_agent.decide_and_execute(state["query"], ctx.user["id"], ctx.run_id)
        if not result.get("tool") or result.get("message") == "Action not recognized.":
            # Atlas couldn't tell what to do: answer it as a question instead (knowledge agent).
            await ctx.sink.emit("action", "completed", caption="Atlas handed this back to be answered as a question.",
                                model=result.get("model"), latency_ms=result.get("latency_ms"),
                                tokens_in=result.get("tokens_in"), tokens_out=result.get("tokens_out"))
            return {"needs_action": False, "action_fallback": True}
        await ctx.sink.emit(
            "action", "tool_call", action=result.get("tool"),
            detail={"tool": result.get("tool"), "args": result.get("args")},
            model=result.get("model"), latency_ms=result.get("latency_ms"),
            tokens_in=result.get("tokens_in"), tokens_out=result.get("tokens_out"),
        )

        if result.get("paused"):
            approval = result["result"]
            await ctx.sink.emit_approval_required(approval["approval_id"], approval["approver_name"], result["args"]["system"])
            raise NodeInterrupt("awaiting_manager_approval")

        await ctx.sink.emit("action", "completed", action=result.get("tool"), detail={"tool": result.get("tool")})
        answer = state.get("answer") or ""
        answer = (answer + ("\n\n" if answer else "") + result["message"]).strip()
        return {"answer": answer, "unresolved": False}

    async def node_confirm_resolution(state: AgentState) -> dict:
        # NodeInterrupt discards any returned state update (LangGraph only persists state from a
        # *returned* dict, never from code reached after a raise) — so "first entry vs resumed"
        # has to be read purely from whether user_reply is set, same trick node_action already
        # uses with approvals_api.find_by_run instead of a pre-interrupt state field.
        reply = state.get("user_reply")
        if reply is None:
            prompt = f"{state.get('answer', '')}\n\nDid this solve your problem?"
            await ctx.sink.emit_confirmation_required(prompt, "resolution_confirm", sources=state.get("sources", []))
            raise NodeInterrupt("awaiting_user_confirmation")

        if _is_affirmative(reply):
            return {"user_reply": None, "unresolved": False, "answer": SOLVED_REPLY, "sources": []}
        if _is_negative(reply):
            return {"user_reply": None, "unresolved": True}

        # Ambiguous reply: re-ask rather than guessing. This re-interrupts (so it can't carry a
        # retry counter across the boundary either), but it's bounded by the user actually
        # replying with something recognizable — not an unbounded background loop.
        await ctx.sink.emit_confirmation_required(
            "Sorry, I didn't quite catch that — did the answer solve your problem? (yes/no)",
            "resolution_confirm", sources=state.get("sources", []),
        )
        raise NodeInterrupt("awaiting_user_confirmation")

    async def node_offer_ticket(state: AgentState) -> dict:
        reply = state.get("user_reply")
        if reply is None:
            await ctx.sink.emit_confirmation_required(
                "Would you like me to open a support ticket so a human can help with this?",
                "ticket_offer", sources=state.get("sources", []),
            )
            raise NodeInterrupt("awaiting_user_confirmation")

        if _is_affirmative(reply):
            return {"user_reply": None, "offered_ticket": True}
        if _is_negative(reply):
            return {"user_reply": None, "offered_ticket": False, "unresolved": False,
                    "answer": DECLINED_TICKET_REPLY, "sources": []}

        await ctx.sink.emit_confirmation_required(
            "Sorry — would you like me to open a support ticket? (yes/no)",
            "ticket_offer", sources=state.get("sources", []),
        )
        raise NodeInterrupt("awaiting_user_confirmation")

    async def node_ticketing(state: AgentState) -> dict:
        await ctx.sink.emit("ticketing", "working")
        summary_note = (
            f"The assistant's best attempt: \"{state.get('answer', '')}\"." if state.get("answer")
            else "No confident automated answer was available."
        )
        context = {
            "original_question": state["query"], "route": state.get("route"),
            "sources": state.get("sources", []), "summary_note": summary_note,
        }
        result = ticketing_agent.create_ticket(ctx.user["id"], ctx.run_id, state.get("route", "OTHER"), state["query"], context)
        await ctx.sink.emit("ticketing", "completed", action="create_ticket", detail={"ticket_number": result["number"]})
        # Only reached after the person said "yes" to the ticket offer, so the attempted answer
        # was already shown — just confirm the ticket rather than repeating it.
        team = {"IT": "IT", "HR": "HR"}.get(state.get("route") or "", "support")
        answer = (
            f"Thanks for letting me know. I've created ticket **{result['number']}** so someone from "
            f"the {team} team can take it from here. You can follow its progress on the Tickets page."
        )
        return {"answer": answer, "ticket_number": result["number"]}

    async def node_feedback(state: AgentState) -> dict:
        resolved = not state.get("unresolved", False)
        await ctx.sink.emit_final(
            answer=state.get("answer", "I'm not sure how to help with that."),
            sources=state.get("sources", []), route=state.get("route"), resolved=resolved,
            ticket_number=state.get("ticket_number"), suggestions=state.get("suggestions") or None,
        )
        await ctx.sink.emit("feedback", "started", caption="Finn is waiting to hear how that went.")

        if state.get("clarify"):
            # chat.py looks for this outcome to treat the next message as the answer to the
            # clarifying question (see runs_store.find_pending_clarification).
            outcome = "needs_clarification"
        elif state.get("ticket_number"):
            outcome = "escalated"
        else:
            outcome = "blocked" if state.get("guard_blocked") else "resolved"
        update_run(
            ctx.run_id,
            route=state.get("route"), status="escalated" if state.get("ticket_number") else "resolved",
            outcome=outcome,
        )
        observability.trace_run_end(ctx.run_id, outcome, state.get("answer", ""))
        return {"ended": True}

    graph = StateGraph(AgentState)
    graph.add_node("guard", node_guard)
    graph.add_node("blocked_reply", node_blocked_reply)
    graph.add_node("supervisor", node_supervisor)
    graph.add_node("other_reply", node_other_reply)
    graph.add_node("it_support", node_it_support)
    graph.add_node("hr_policy", node_hr_policy)
    graph.add_node("action", node_action)
    graph.add_node("confirm_resolution", node_confirm_resolution)
    graph.add_node("offer_ticket", node_offer_ticket)
    graph.add_node("ticketing", node_ticketing)
    graph.add_node("feedback", node_feedback)

    graph.set_entry_point("guard")
    graph.add_conditional_edges("guard", lambda s: "blocked_reply" if s.get("guard_blocked") else "supervisor")
    graph.add_edge("blocked_reply", "feedback")
    def _after_supervisor(s: AgentState) -> str:
        # A vague "I have an issue with my laptop" goes to the knowledge agent to be clarified,
        # even if the supervisor read it as a request for Atlas: there's nothing to DO yet.
        vague = not s.get("clarified") and clarify.find_vague_subject(s["query"]) is not None
        if s.get("route") in ("IT", "HR") and s.get("needs_action") and not vague:
            return "action"
        return {"IT": "it_support", "HR": "hr_policy"}.get(s.get("route"), "other_reply")

    graph.add_conditional_edges("supervisor", _after_supervisor)
    graph.add_edge("other_reply", "feedback")

    def _after_knowledge(s: AgentState) -> str:
        if s.get("clarify"):
            return "feedback"  # a question back to the person: no "did this solve it?" step
        if s.get("needs_action"):
            return "action"
        if s.get("unresolved") and not s.get("sources"):
            # Genuinely no retrieved candidates at all — asking "did this solve your problem?"
            # about an answer that doesn't exist reads as broken, so skip straight to the
            # ticket offer.
            return "offer_ticket"
        return "confirm_resolution"

    graph.add_conditional_edges("it_support", _after_knowledge)
    graph.add_conditional_edges("hr_policy", _after_knowledge)
    def _after_action(s: AgentState) -> str:
        if s.get("action_fallback"):
            return "hr_policy" if s.get("route") == "HR" else "it_support"
        # A completed request (leave sent to HR, password reset, access approved) needs no
        # "did this solve your problem?" question; only a failed/declined one does.
        return "confirm_resolution" if s.get("unresolved") else "feedback"

    graph.add_conditional_edges("action", _after_action)
    graph.add_conditional_edges("confirm_resolution", lambda s: "offer_ticket" if s.get("unresolved") else "feedback")
    graph.add_conditional_edges("offer_ticket", lambda s: "ticketing" if s.get("offered_ticket") else "feedback")
    graph.add_edge("ticketing", "feedback")
    graph.add_edge("feedback", END)

    return graph.compile(checkpointer=_CHECKPOINTER)


async def _settle_or_pause(run_id: str, queue: asyncio.Queue, graph, config: dict) -> None:
    """After a successful ainvoke(), figure out whether the graph finished, is waiting on a
    manager approval (leave the queue open — the decision may arrive via a completely separate
    HTTP request), or is waiting on the user's own next chat message (close this SSE turn; the
    next POST /chat/stream on this conversation will detect and resume the paused run)."""
    snapshot = graph.get_state(config)
    next_node = snapshot.next[0] if snapshot.next else None

    if next_node == "action":
        update_run(run_id, status="awaiting_approval")
        return  # queue stays open/registered for resume_after_approval()

    if next_node in ("confirm_resolution", "offer_ticket"):
        update_run(run_id, status="awaiting_user_confirmation")
        drop_queue(run_id)
        await queue.put(None)
        return

    # Finished — node_feedback already wrote the terminal status/outcome itself.
    drop_queue(run_id)
    await queue.put(None)


async def start_chat(user: dict, query: str, conversation_id: str | None, run_id: str, queue: asyncio.Queue,
                     clarified: bool = False) -> None:
    """Runs (or starts, if it pauses for approval/confirmation) one full chat turn, streaming
    events into `queue` as they happen. Returns once the graph finishes OR pauses."""
    sink = EventSink(run_id, queue)
    create_run(run_id, user["id"], conversation_id, query)
    observability.trace_run_start(run_id, user["id"], query)
    ctx = RunContext(run_id, user, sink)
    graph = build_graph(ctx)
    config = {"configurable": {"thread_id": run_id}}

    try:
        await graph.ainvoke(
            {"run_id": run_id, "user_id": user["id"], "query": query, "clarified": clarified}, config=config,
        )
    except Exception as exc:  # noqa: BLE001
        await sink.emit_error(str(exc))
        update_run(run_id, status="failed", outcome="error")
        return

    await _settle_or_pause(run_id, queue, graph, config)


async def resume_after_approval(run_id: str, approved: bool) -> None:
    queue = get_queue(run_id)
    if queue is None:
        queue = asyncio.Queue()  # original SSE connection is gone; resume still updates the DB correctly
    start_seq = last_event_seq(run_id)
    sink = EventSink(run_id, queue, start_seq=start_seq)
    run = get_run(run_id)
    user = {"id": str(run["user_id"])} if run else {"id": None}
    ctx = RunContext(run_id, user, sink)
    graph = build_graph(ctx)
    config = {"configurable": {"thread_id": run_id}}

    try:
        graph.update_state(config, {"approved": approved})
        await graph.ainvoke(None, config=config)
    except Exception as exc:  # noqa: BLE001
        await sink.emit_error(str(exc))
        update_run(run_id, status="failed", outcome="error")
        return

    await _settle_or_pause(run_id, queue, graph, config)


async def resume_after_user_reply(run_id: str, user_reply: str, queue: "asyncio.Queue | None" = None) -> None:
    """Resumes a run paused at confirm_resolution/offer_ticket with the user's own next chat
    message as the reply. Mirrors resume_after_approval's shape exactly."""
    if queue is None:
        queue = get_queue(run_id)
        if queue is None:
            queue = asyncio.Queue()
    start_seq = last_event_seq(run_id)
    sink = EventSink(run_id, queue, start_seq=start_seq)
    run = get_run(run_id)
    user = {"id": str(run["user_id"])} if run else {"id": None}
    ctx = RunContext(run_id, user, sink)
    graph = build_graph(ctx)
    config = {"configurable": {"thread_id": run_id}}

    try:
        graph.update_state(config, {"user_reply": user_reply})
        await graph.ainvoke(None, config=config)
    except Exception as exc:  # noqa: BLE001
        await sink.emit_error(str(exc))
        update_run(run_id, status="failed", outcome="error")
        return

    await _settle_or_pause(run_id, queue, graph, config)

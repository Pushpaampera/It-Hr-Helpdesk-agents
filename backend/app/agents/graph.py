"""LangGraph wiring: guard -> supervisor -> (it_support | hr_policy | other_reply)
-> action (if needs_action) -> ticketing (if unresolved/escalated) -> feedback.

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

# A greeting-only message ("hi", "hello there") routes to OTHER the same as any other
# low-confidence message, but shouldn't get the same "I'm not totally sure how to help"
# clarifying template — that reads as broken/unresponsive for something as simple as "hello".
GREETING_RE = re.compile(
    r"^\s*(hi|hi there|hiya|hey|hey there|hello|hello there|howdy|yo|good morning|good afternoon|"
    r"good evening|greetings)[\s!.,]*$",
    re.IGNORECASE,
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
        result = await supervisor_agent.route(state["query"])
        await ctx.sink.emit(
            "supervisor", "completed", action="route",
            detail={"route": result["route"], "confidence": result["confidence"], "intent": result["intent"]},
            model=result["model"], latency_ms=result["latency_ms"],
            tokens_in=result["tokens_in"], tokens_out=result["tokens_out"],
        )
        if result["route"] in ("IT", "HR"):
            friendly_agent = "it_support" if result["route"] == "IT" else "hr_policy"
            await ctx.sink.emit_handoff("supervisor", friendly_agent, result["intent"] or "routing decision")
        return {
            "route": result["route"], "confidence": result["confidence"],
            "needs_action": result["needs_action"], "intent": result["intent"],
        }

    async def node_other_reply(state: AgentState) -> dict:
        if GREETING_RE.match(state["query"]):
            answer = (
                f"Hey {ctx.user['name'].split()[0]}! I'm your IT/HR assistant — ask me about "
                "things like a VPN error, your leave balance, or resetting a password, and "
                "I'll route it to the right specialist."
            )
        else:
            answer = (
                f"I'm not totally sure how to help with \"{state['query']}\". Could you tell me a "
                "bit more — is this an IT issue (laptop, VPN, password, email) or an HR question "
                "(leave, payroll, benefits)?"
            )
        return {"answer": answer, "unresolved": False}

    async def node_it_support(state: AgentState) -> dict:
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
        answer = state.get("answer") or "I couldn't fully resolve this myself."
        answer += f"\n\nI've created ticket {result['number']} so a human can take it from here."
        return {"answer": answer, "ticket_number": result["number"]}

    async def node_feedback(state: AgentState) -> dict:
        resolved = not state.get("unresolved", False)
        await ctx.sink.emit_final(
            answer=state.get("answer", "I'm not sure how to help with that."),
            sources=state.get("sources", []), route=state.get("route"), resolved=resolved,
            ticket_number=state.get("ticket_number"),
        )
        await ctx.sink.emit("feedback", "started", caption="Finn is waiting to hear how that went.")

        outcome = "escalated" if state.get("ticket_number") else ("blocked" if state.get("guard_blocked") else "resolved")
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
    graph.add_node("ticketing", node_ticketing)
    graph.add_node("feedback", node_feedback)

    graph.set_entry_point("guard")
    graph.add_conditional_edges("guard", lambda s: "blocked_reply" if s.get("guard_blocked") else "supervisor")
    graph.add_edge("blocked_reply", "feedback")
    graph.add_conditional_edges(
        "supervisor",
        lambda s: {"IT": "it_support", "HR": "hr_policy"}.get(s.get("route"), "other_reply"),
    )
    graph.add_edge("other_reply", "feedback")
    graph.add_conditional_edges(
        "it_support", lambda s: "action" if s.get("needs_action") else ("ticketing" if s.get("unresolved") else "feedback")
    )
    graph.add_conditional_edges(
        "hr_policy", lambda s: "action" if s.get("needs_action") else ("ticketing" if s.get("unresolved") else "feedback")
    )
    graph.add_conditional_edges("action", lambda s: "ticketing" if s.get("unresolved") else "feedback")
    graph.add_edge("ticketing", "feedback")
    graph.add_edge("feedback", END)

    return graph.compile(checkpointer=_CHECKPOINTER)


async def start_chat(user: dict, query: str, conversation_id: str | None, run_id: str, queue: asyncio.Queue) -> None:
    """Runs (or starts, if it pauses for approval) one full chat turn, streaming events into
    `queue` as they happen. Returns once the graph finishes OR pauses for manager approval."""
    sink = EventSink(run_id, queue)
    create_run(run_id, user["id"], conversation_id, query)
    observability.trace_run_start(run_id, user["id"], query)
    ctx = RunContext(run_id, user, sink)
    graph = build_graph(ctx)
    config = {"configurable": {"thread_id": run_id}}

    paused = False
    try:
        await graph.ainvoke({"run_id": run_id, "user_id": user["id"], "query": query}, config=config)
        # ainvoke() returns normally even when a node raised NodeInterrupt — check whether the
        # graph actually finished or is sitting paused before a pending node.
        snapshot = graph.get_state(config)
        paused = bool(snapshot.next)
    except Exception as exc:  # noqa: BLE001
        await sink.emit_error(str(exc))
        update_run(run_id, status="failed", outcome="error")

    if paused:
        update_run(run_id, status="awaiting_approval")
        # Leave the queue registered and open — resume_after_approval() will continue pushing
        # into it once a manager decides, and the SSE connection stays open waiting.
    else:
        drop_queue(run_id)
        await queue.put(None)  # sentinel: stream is done


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

    drop_queue(run_id)
    await queue.put(None)

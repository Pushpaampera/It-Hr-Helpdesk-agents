"""LangGraph wiring: guard -> supervisor -> (action if it's a request to DO something | password_reset |
it_support | hr_policy | other_reply) -> ticketing (if unresolved/escalated) -> feedback. A completed action
ends without the "did this solve your problem?" question; if Atlas can't tell what to do, the
question goes to the knowledge agent instead.

password_reset (Atlas, see app/agents/password_reset.py) explains the steps, asks before doing
anything, emails a code and waits for it: each of those waits is a NodeInterrupt resumed by the
person's next chat message, like the confirm_resolution/offer_ticket gates.

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
from app.agents import leave_request as leave
from app.agents import spelling
from app.agents import password_reset as pw_reset
from app.agents import payslip as payslip_view
from app.agents import supervisor as supervisor_agent
from app.agents import ticketing as ticketing_agent
from app.agents.events import EventSink, drop_queue, get_queue
from app.agents.runs_store import create_run, get_run, last_event_seq, update_run
from app.mock_apis import approvals as approvals_api
from app.mock_apis import company_accounts, hr_system, it_system, log_action
from app.mock_apis.directory import get_user
from app import observability

_CHECKPOINTER = MemorySaver()

# Keyword classifiers for the "did this solve your problem?" / "want a ticket?" confirmation
# gates. Deliberately simple regex, not an LLM call — LLM_MOCK_MODE must stay deterministic and
# key-free, and a plain yes/no reply doesn't need more than this.
AFFIRMATIVE_RE = re.compile(
    r"\b(yes|yep|yeah|yup|sure|please|correct|solved|that worked|thanks|ok|okay|go ahead|proceed|do it)\b",
    re.IGNORECASE,
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
    vague: NotRequired[bool]
    suggestions: NotRequired[list]
    # Password reset (Atlas): set when the message asks to reset the person's own password.
    wants_password_reset: NotRequired[bool]
    # Leave request (Atlas, step by step): set when the message asks for leave.
    wants_leave: NotRequired[bool]
    # Payslip (Atlas): set when the message asks to see the person's own payslip.
    wants_payslip: NotRequired[bool]
    # The person's own words, when spelling fixes changed what the agents read (state["query"]).
    original_query: NotRequired[str]
    # Which account the action agent's tool call named ('email', 'windows', ...), if any.
    reset_system: NotRequired[str | None]
    # 3 wrong codes: Tess opens the IT ticket straight away (no "want a ticket?" question).
    reset_blocked: NotRequired[bool]
    # Shown in front of the "want a ticket?" question (e.g. the code email couldn't be sent).
    offer_intro: NotRequired[str]
    # Who wrote the final answer when it isn't the route's specialist ("action" = Atlas).
    author: NotRequired[str]
    # What traces/logs get instead of the answer when the answer holds a secret.
    trace_answer: NotRequired[str]


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
        # "I forgot my password" (any role, even said to the HR side): always IT, always Atlas's
        # verified reset. Decided by a word check, so it never depends on a model's guess.
        if pw_reset.is_reset_request(state["query"]):
            await ctx.sink.emit(
                "supervisor", "completed", action="route",
                caption="Sage saw this is a password reset and handed it to Atlas, the Task Doer, on the IT side.",
                detail={"route": "IT", "confidence": 1.0, "intent": "password reset"},
            )
            await ctx.sink.emit_handoff("supervisor", "action", "password reset")
            return {"route": "IT", "confidence": 1.0, "needs_action": True, "intent": "password reset",
                    "vague": False, "wants_password_reset": True}
        # "I want a leave" / "i want to put a sick leave tomorrow": always HR, always Atlas's
        # step-by-step leave request (a word check, so a model can't mistake it for a question).
        if leave.is_leave_request(state["query"]):
            await ctx.sink.emit(
                "supervisor", "completed", action="route",
                caption="Sage saw this is a leave request and handed it to Atlas, the Task Doer, to send to HR.",
                detail={"route": "HR", "confidence": 1.0, "intent": "leave request"},
            )
            await ctx.sink.emit_handoff("supervisor", "action", "leave request")
            return {"route": "HR", "confidence": 1.0, "needs_action": True, "intent": "leave request",
                    "vague": False, "wants_leave": True}
        # "I want my payslip": always HR, always Atlas showing the person's own payslip (a word
        # check; "my payslip looks wrong" is not this and stays a question for Hana).
        if payslip_view.is_payslip_request(state["query"]):
            await ctx.sink.emit(
                "supervisor", "completed", action="route",
                caption="Sage saw this is a request to see a payslip and handed it to Atlas, the Task Doer.",
                detail={"route": "HR", "confidence": 1.0, "intent": "view payslip"},
            )
            await ctx.sink.emit_handoff("supervisor", "action", "view payslip")
            return {"route": "HR", "confidence": 1.0, "needs_action": True, "intent": "view payslip",
                    "vague": False, "wants_payslip": True}
        result = await supervisor_agent.route(state["query"])
        await ctx.sink.emit(
            "supervisor", "completed", action="route",
            detail={"route": result["route"], "confidence": result["confidence"], "intent": result["intent"]},
            model=result["model"], latency_ms=result["latency_ms"],
            tokens_in=result["tokens_in"], tokens_out=result["tokens_out"],
        )
        if result["route"] in ("IT", "HR"):
            # Requests to DO something go straight to Atlas; questions go to the knowledge agent.
            vague = result["vague"] or clarify.find_vague_subject(state["query"]) is not None
            if result["needs_action"] and not vague:
                friendly_agent = "action"
            else:
                friendly_agent = "it_support" if result["route"] == "IT" else "hr_policy"
            await ctx.sink.emit_handoff("supervisor", friendly_agent, result["intent"] or "routing decision")
        return {
            "route": result["route"], "confidence": result["confidence"],
            "needs_action": result["needs_action"], "intent": result["intent"], "vague": result["vague"],
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

    def _is_vague(state: AgentState) -> bool:
        if state.get("clarified"):
            return False  # never ask twice in a row
        return bool(state.get("vague")) or clarify.find_vague_subject(state["query"]) is not None

    async def _maybe_clarify(agent: str, state: AgentState) -> dict | None:
        """Vague question ("I have an issue with my laptop"): ask what's happening instead of
        guessing which article fits. Skipped for a run that is already answering the reply to
        a clarifying question."""
        if not _is_vague(state):
            return None
        # The word check names the subject; if only the supervisor judged it vague, use the one
        # subject the message mentions (for its options), else a general "tell me more".
        subject = clarify.find_vague_subject(state["query"]) or clarify.single_subject(state["query"])
        await ctx.sink.emit(
            agent, "completed", action="clarify",
            caption="The question was broad, so the assistant asked what exactly is happening.",
            detail={"subject": subject.key if subject else None},
        )
        if subject:
            answer, suggestions = clarify.clarifying_reply(subject), list(subject.options)
        else:
            answer, suggestions = clarify.generic_clarifying_reply(), []
        return {
            "answer": answer, "suggestions": suggestions,
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
                raise NodeInterrupt("awaiting_access_approval")
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
        if result.get("tool") == "apply_leave":
            await ctx.sink.emit("action", "completed", caption="Atlas will put the leave request together with you first.",
                                model=result.get("model"), latency_ms=result.get("latency_ms"),
                                tokens_in=result.get("tokens_in"), tokens_out=result.get("tokens_out"))
            return {"wants_leave": True}
        if result.get("tool") == "get_payslip":
            await ctx.sink.emit("action", "completed", caption="Atlas will look up your own payslip.",
                                model=result.get("model"), latency_ms=result.get("latency_ms"),
                                tokens_in=result.get("tokens_in"), tokens_out=result.get("tokens_out"))
            return {"wants_payslip": True}
        if result.get("tool") == "reset_password":
            # Never reset straight away: go through the explained, email-verified flow.
            await ctx.sink.emit("action", "completed", caption="Atlas will check it's really you before resetting the password.",
                                model=result.get("model"), latency_ms=result.get("latency_ms"),
                                tokens_in=result.get("tokens_in"), tokens_out=result.get("tokens_out"))
            system = (result.get("args") or {}).get("system")
            return {"wants_password_reset": True,
                    "reset_system": system if system in company_accounts.SYSTEMS else None}
        await ctx.sink.emit(
            "action", "tool_call", action=result.get("tool"),
            detail={"tool": result.get("tool"), "args": result.get("args")},
            model=result.get("model"), latency_ms=result.get("latency_ms"),
            tokens_in=result.get("tokens_in"), tokens_out=result.get("tokens_out"),
        )

        if result.get("paused"):
            approval = result["result"]
            await ctx.sink.emit_approval_required(approval["approval_id"], approval["approver_name"], result["args"]["system"])
            raise NodeInterrupt("awaiting_access_approval")

        await ctx.sink.emit("action", "completed", action=result.get("tool"), detail={"tool": result.get("tool")})
        answer = state.get("answer") or ""
        answer = (answer + ("\n\n" if answer else "") + result["message"]).strip()
        return {"answer": answer, "unresolved": False}

    async def _ask(prompt: str, gate: str, caption: str | None = None, options: list[str] | None = None) -> None:
        """Atlas asks the person something and the run waits for their next chat message."""
        await ctx.sink.emit_confirmation_required(prompt, gate, agent="action", caption=caption, options=options)
        raise NodeInterrupt("awaiting_user_confirmation")

    def _announce(user_id: str, kind: str, title: str, body: str) -> None:
        """Bell + email (security notices are always 'important'), off the event loop."""
        from app.notify import notify

        asyncio.get_running_loop().run_in_executor(
            None, lambda: notify(user_id, kind, title, body, link="/app/assistant", important=True)
        )

    async def _needs_it_support(user_id: str, intro: str, step: str, audit: str) -> dict:
        """Atlas can't verify the person here: explain, then offer a ticket for IT support."""
        log_action(user_id, audit, "user", user_id, {})
        await ctx.sink.emit("action", "completed", action="password_reset", detail={"tool": "password_reset", "step": step},
                            caption="Atlas can't check it's really you here, so IT support needs to help.")
        return {"user_reply": None, "unresolved": True, "answer": "", "sources": [], "offer_intro": intro}

    async def _explain(reset: dict, person: dict) -> dict:
        """Explains the steps and waits for a yes. If the code would have nowhere to go (a work
        email password but no personal email on file), says so and offers IT support instead."""
        if not pw_reset.code_destination(reset["system"], person)[0]:
            pw_reset.update(str(reset["id"]), system=reset["system"], status="no_recovery_email")
            return await _needs_it_support(str(person.get("id") or reset["user_id"]),
                                           pw_reset.no_recovery_email_intro(person),
                                           "no_personal_email", "password_reset_no_personal_email")
        await ctx.sink.emit("action", "tool_call", action="password_reset",
                            detail={"tool": "password_reset", "step": "explain", "account": reset["system"]},
                            caption=f"Atlas explained how resetting the {company_accounts.label(reset['system'])} "
                                    "password works and is waiting for a yes before doing anything.")
        await _ask(pw_reset.consent_prompt(reset["system"], person), pw_reset.CONSENT_GATE)

    async def node_password_reset(state: AgentState) -> dict:
        # Like the other gates, which step we're on is read from the database (password_resets),
        # never from state set before an interrupt: LangGraph drops that.
        user_id = state["user_id"]
        person = get_user(user_id) or {}
        reply = state.get("user_reply")
        reset = pw_reset.get_for_run(ctx.run_id)
        detail = {"tool": "password_reset"}

        if reset is None:
            block = pw_reset.active_block(user_id)
            if block:
                await ctx.sink.emit("action", "completed", action="password_reset", detail={**detail, "blocked": True},
                                    caption="Atlas found self-service reset is paused for this person; IT support has it in hand.")
                return {"answer": pw_reset.blocked_already_reply(block), "unresolved": False, "sources": [],
                        "author": "action", "user_reply": None}
            system = state.get("reset_system") or pw_reset.system_in(state["query"])
            reset = pw_reset.create(user_id, ctx.run_id, system)
            if not system:
                await ctx.sink.emit("action", "tool_call", action="password_reset", detail={**detail, "step": "which_account"},
                                    caption="Atlas is asking which account's password you forgot.")
                await _ask(pw_reset.SYSTEM_PROMPT, pw_reset.SYSTEM_GATE, options=pw_reset.system_options())
            return await _explain(reset, person)

        reset_id = str(reset["id"])
        system = reset["system"]
        account = company_accounts.label(system)
        detail["account"] = system

        if reset["status"] == "awaiting_system":
            chosen = pw_reset.read_system_reply(reply or "")
            if chosen == "cancel":
                pw_reset.update(reset_id, status="cancelled")
                return {"user_reply": None, "unresolved": False, "answer": pw_reset.CANCELLED_REPLY,
                        "sources": [], "author": "action"}
            if chosen:
                pw_reset.update(reset_id, system=chosen, status="awaiting_consent")
                return await _explain({**reset, "system": chosen}, person)
            await _ask(pw_reset.SYSTEM_REASK_PROMPT, pw_reset.SYSTEM_GATE, options=pw_reset.system_options())

        if reset["status"] == "awaiting_consent":
            if reply and _is_affirmative(reply):
                address, sent_to = pw_reset.code_destination(system, person)
                if not address:  # personal email removed since the steps were explained
                    pw_reset.update(reset_id, status="no_recovery_email")
                    return await _needs_it_support(user_id, pw_reset.no_recovery_email_intro(person),
                                                    "no_personal_email", "password_reset_no_personal_email")
                await ctx.sink.emit("action", "working", action="send_code", detail={**detail, "step": "send_code"},
                                    caption=f"Atlas is emailing a 6-digit code to your {sent_to} email.")
                if not await pw_reset.send_code(reset, person):
                    return await _needs_it_support(user_id, pw_reset.EMAIL_FAILED_INTRO, "email_failed",
                                                    "password_reset_email_failed")
                log_action(user_id, "password_reset_code_sent", "user", user_id,
                           {"account": account, "sent_to": f"{sent_to} email", "valid_minutes": pw_reset.CODE_MINUTES})
                await ctx.sink.emit("action", "completed", action="send_code", detail={**detail, "step": "code_sent"},
                                    caption="Atlas emailed the code and is waiting for you to type it in.")
                await _ask(pw_reset.code_sent_prompt(system, person), pw_reset.CODE_GATE,
                           caption="Waiting for the code from your email.")
            if reply and _is_negative(reply):
                pw_reset.update(reset_id, status="declined")
                log_action(user_id, "password_reset_declined", "user", user_id, {"account": account})
                await ctx.sink.emit("action", "completed", action="password_reset", detail={**detail, "step": "declined"},
                                    caption="Atlas stopped: you chose not to reset the password.")
                return {"user_reply": None, "unresolved": False, "answer": pw_reset.DECLINED_REPLY,
                        "sources": [], "author": "action"}
            await _ask(pw_reset.CONSENT_REASK_PROMPT, pw_reset.CONSENT_GATE)

        if reset["status"] == "awaiting_code":
            kind, code = pw_reset.read_code_reply(reply or "")
            if kind == "cancel":
                pw_reset.update(reset_id, status="cancelled", code_hash=None)
                log_action(user_id, "password_reset_cancelled", "user", user_id, {"account": account})
                await ctx.sink.emit("action", "completed", action="password_reset", detail={**detail, "step": "cancelled"},
                                    caption="Atlas stopped the reset. Nothing was changed.")
                return {"user_reply": None, "unresolved": False, "answer": pw_reset.CANCELLED_REPLY,
                        "sources": [], "author": "action"}

            if kind == "resend":
                if reset["resends"] >= pw_reset.MAX_RESENDS:
                    await _ask(pw_reset.RESEND_LIMIT_PROMPT, pw_reset.CODE_GATE)
                await ctx.sink.emit("action", "working", action="send_code", detail={**detail, "step": "resend_code"},
                                    caption="Atlas is emailing you a new code.")
                if not await pw_reset.send_code(reset, person, resend=True):
                    return await _needs_it_support(user_id, pw_reset.EMAIL_FAILED_INTRO, "email_failed",
                                                    "password_reset_email_failed")
                log_action(user_id, "password_reset_code_resent", "user", user_id, {"account": account})
                await _ask(pw_reset.code_sent_prompt(system, person, resent=True), pw_reset.CODE_GATE,
                           caption="Waiting for the new code from your email.")

            if kind == "code":
                outcome, tries_left = pw_reset.check_code(reset, code)
                if outcome == "ok":
                    issued = it_system.issue_temporary_password(user_id, user_id, "email_code",
                                                                {"reset_id": reset_id, "run_id": ctx.run_id}, system=system)
                    expires = pw_reset.local_time(issued["expires_at"])
                    await ctx.sink.emit("action", "completed", action="reset_password",
                                        detail={**detail, "step": "completed"},
                                        caption=f"Atlas confirmed the code and issued a temporary {account} password "
                                                "(valid 15 minutes).")
                    _announce(user_id, "password_reset", f"Your {account} password was reset",
                              f"Your {account} password was reset in the HelpDesk assistant after you confirmed the code "
                              f"sent to your email. The temporary password works until {expires} and must be changed "
                              "when you sign in. If this wasn't you, contact IT support right away.")
                    return {"user_reply": None, "unresolved": False, "sources": [], "author": "action",
                            "answer": pw_reset.success_reply(system, person, issued["temporary_password"],
                                                             issued["expires_at"]),
                            "trace_answer": pw_reset.success_reply_for_trace(system)}
                if outcome == "expired":
                    await _ask(pw_reset.EXPIRED_CODE_PROMPT, pw_reset.CODE_GATE)
                if tries_left > 0:
                    log_action(user_id, "password_reset_wrong_code", "user", user_id,
                               {"account": account, "attempt": pw_reset.MAX_ATTEMPTS - tries_left, "tries_left": tries_left})
                    await ctx.sink.emit("action", "completed", action="check_code", detail={**detail, "step": "wrong_code"},
                                        caption=f"That code didn't match. {tries_left} tr{'y' if tries_left == 1 else 'ies'} left.")
                    await _ask(pw_reset.wrong_code_prompt(tries_left), pw_reset.CODE_GATE)
                log_action(user_id, "password_reset_blocked", "user", user_id,
                           {"account": account, "wrong_codes": pw_reset.MAX_ATTEMPTS, "reset_id": reset_id})
                await ctx.sink.emit("action", "completed", action="password_reset", detail={**detail, "step": "blocked"},
                                    caption=f"Atlas blocked the reset after {pw_reset.MAX_ATTEMPTS} wrong codes and asked Tess for a ticket.")
                _announce(user_id, "password_reset_blocked", f"{account} password reset blocked",
                          f"A reset of your {account} password was stopped after {pw_reset.MAX_ATTEMPTS} wrong codes. "
                          "Your password hasn't changed. IT support will help you reset it. If this wasn't you, "
                          "tell IT support right away.")
                return {"user_reply": None, "unresolved": True, "reset_blocked": True, "answer": "", "sources": []}

            # Digits that aren't a 6-digit code (or anything else typed at this step).
            await _ask(pw_reset.BAD_CODE_PROMPT, pw_reset.CODE_GATE)

        # Already finished (shouldn't be reached): close politely instead of starting over.
        return {"user_reply": None, "unresolved": False, "sources": [], "author": "action",
                "answer": "This password reset has already finished. If you still need help, just ask me again."}

    async def _leave_ask(draft: dict, user_id: str, problem: str | None = None) -> dict:
        """Asks for the next missing detail (or the final yes) and waits for the reply."""
        step = leave.next_missing(draft)
        draft = leave.update(str(draft["id"]), status=f"awaiting_{step}")
        if step == "type":
            await _ask(leave.type_prompt(hr_system.get_leave_balances(user_id)), leave.TYPE_GATE,
                       caption="Atlas is asking what kind of leave you need.", options=leave.TYPE_OPTIONS)
        if step == "dates":
            await _ask(leave.dates_prompt(draft["leave_type"], draft.get("duration_days"), problem), leave.DATES_GATE,
                       caption="Atlas is asking which days you need.", options=leave.DATE_OPTIONS)
        if step == "reason":
            await _ask(leave.reason_prompt(draft["leave_type"]), leave.REASON_GATE,
                       caption="Atlas is asking the reason for HR.", options=leave.REASON_OPTIONS.get(draft["leave_type"]))
        await ctx.sink.emit("action", "tool_call", action="apply_leave", detail={"tool": "apply_leave", "step": "summary"},
                            caption="Atlas put the leave request together and is waiting for your OK to send it to HR.")
        await _ask(leave.confirm_prompt(draft, hr_system.get_leave_balances(user_id)), leave.CONFIRM_GATE,
                   options=leave.CONFIRM_OPTIONS)
        return {}

    def _leave_with_dates(draft: dict, user_id: str, found: dict) -> tuple[dict, str | None]:
        """Stores dates from a message if they're usable; else returns why not."""
        if not found["start"]:
            if found["duration"]:
                draft = leave.update(str(draft["id"]), duration_days=found["duration"])
            return draft, None
        problem = leave.date_problem(draft.get("leave_type"), found["start"], found["end"])
        if not problem:
            existing = leave.overlapping_leave(user_id, found["start"], found["end"])
            problem = leave.overlap_problem(existing) if existing else None
        if problem:
            return draft, problem
        return leave.update(str(draft["id"]), start_date=found["start"], end_date=found["end"],
                            duration_days=found["duration"]), None

    async def node_leave_request(state: AgentState) -> dict:
        user_id = state["user_id"]
        draft = leave.get_for_run(ctx.run_id)
        done = {"user_reply": None, "unresolved": False, "sources": [], "author": "action"}

        if draft is None:
            query = state["query"]
            details = {"leave_type": leave.extract_type(query), "reason": leave.extract_reason(query)}
            draft = leave.create(user_id, ctx.run_id, details)
            draft, problem = _leave_with_dates(draft, user_id, leave.extract_dates(query))
            await ctx.sink.emit("action", "working", action="apply_leave", detail={"tool": "apply_leave", "step": "start"},
                                caption="Atlas is putting your leave request together.")
            return await _leave_ask(draft, user_id, problem)

        reply = spelling.correct(state.get("user_reply") or "")
        step = leave.open_step_for_run(ctx.run_id)
        draft_id = str(draft["id"])

        if step == "confirm":
            choice = leave.read_confirm(reply)
            if choice == "send":
                result = hr_system.apply_leave(user_id, draft["leave_type"], draft["start_date"].isoformat(),
                                               draft["end_date"].isoformat(), draft["reason"])
                leave.update(draft_id, status="submitted", leave_request_id=result["leave_request_id"])
                action_agent._announce_leave_request(user_id, result)
                await ctx.sink.emit("action", "completed", action="apply_leave", detail={"tool": "apply_leave"},
                                    caption="Atlas sent the leave request to HR for approval.")
                return {**done, "answer": leave.submitted_reply(draft)}
            if choice == "cancel":
                leave.update(draft_id, status="cancelled")
                return {**done, "answer": leave.CANCELLED_REPLY}
            if choice == "change_dates":
                draft = leave.update(draft_id, start_date=None, end_date=None, duration_days=None)
            elif choice == "change_reason":
                draft = leave.update(draft_id, reason=None)
            elif choice == "change_type":
                draft = leave.update(draft_id, leave_type=None)
            else:
                await _ask(leave.CONFIRM_REASK, leave.CONFIRM_GATE, options=leave.CONFIRM_OPTIONS)
            return await _leave_ask(draft, user_id)

        if leave.is_cancel(reply):
            leave.update(draft_id, status="cancelled")
            return {**done, "answer": leave.CANCELLED_REPLY}

        problem = None
        if step == "type":
            leave_type = leave.extract_type(reply)
            if not leave_type:
                await _ask(leave.TYPE_REASK, leave.TYPE_GATE, options=leave.TYPE_OPTIONS)
            draft = leave.update(draft_id, leave_type=leave_type)
        if step in ("type", "dates"):
            # A reply may carry more than was asked ("sick, tomorrow, I have fever"): keep it all.
            found = leave.extract_dates(reply, known_duration=draft.get("duration_days"))
            draft, problem = _leave_with_dates(draft, user_id, found)
            if not draft.get("reason") and (reason := leave.extract_reason(reply)):
                draft = leave.update(draft_id, reason=reason)
            if step == "dates" and not found["start"] and not found["duration"] and not problem:
                problem = "Sorry, I couldn't tell which day you mean."
        if step == "reason":
            reason = leave.reason_from_answer(reply)
            if not reason:
                await _ask(leave.reason_prompt(draft["leave_type"]), leave.REASON_GATE,
                           options=leave.REASON_OPTIONS.get(draft["leave_type"]))
            draft = leave.update(draft_id, reason=reason)
        return await _leave_ask(draft, user_id, problem)

    async def node_payslip(state: AgentState) -> dict:
        """Atlas shows the signed-in person's own payslip (never anyone else's: ctx.user only)."""
        await ctx.sink.emit("action", "working", caption="Atlas is looking up your payslip.")
        user_id = ctx.user["id"]
        available = hr_system.list_payslip_months(user_id)
        month = payslip_view.requested_month(state["query"], available)
        if not available:
            answer = payslip_view.NO_PAYSLIPS_REPLY
        elif month and month not in available:
            answer = payslip_view.missing_month_reply(month, available)
        else:
            slip = hr_system.get_payslip(user_id, month or available[0])
            answer = payslip_view.format_payslip(slip, available) if slip else payslip_view.NO_PAYSLIPS_REPLY
        await ctx.sink.emit("action", "completed", action="get_payslip",
                            caption="Atlas showed you your own payslip.", detail={"tool": "get_payslip"})
        return {"answer": answer, "unresolved": False, "sources": [], "author": "action"}

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
        intro = state.get("offer_intro")
        if reply is None:
            question = "Would you like me to open a support ticket so a human can help with this?"
            await ctx.sink.emit_confirmation_required(
                f"{intro}\n\n{question}" if intro else question,
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
        user_id = state["user_id"]
        if state.get("reset_blocked"):
            return await _password_reset_ticket(state)
        if state.get("offer_intro"):
            summary_note = f"{state['offer_intro']} The person asked for a human to help."
        else:
            summary_note = (
                f"The assistant's best attempt: \"{state.get('answer', '')}\"." if state.get("answer")
                else "No confident automated answer was available."
            )
        context = {
            "original_question": state["query"], "route": state.get("route"),
            "sources": state.get("sources", []), "summary_note": summary_note,
        }
        if state.get("wants_password_reset"):
            # IT support can reset the password straight from this ticket.
            reset = pw_reset.get_for_run(ctx.run_id) or {}
            context["kind"] = "password_reset"
            context["account"] = reset.get("system", "windows")
        result = ticketing_agent.create_ticket(user_id, ctx.run_id, state.get("route", "OTHER"), state["query"], context)
        await ctx.sink.emit(
            "ticketing", "completed", action="create_ticket",
            detail={"ticket_number": result["number"], "assignee": result["assignee_name"]},
        )
        # Tell the assigned person off the event loop (it may send email).
        asyncio.get_running_loop().run_in_executor(None, ticketing_agent.announce_new_ticket, result, state["query"])
        # Only reached after the person said "yes" to the ticket offer, so the attempted answer
        # was already shown — just confirm the ticket rather than repeating it.
        team = {"IT": "IT support", "HR": "HR"}.get(state.get("route") or "", "IT support")
        who = (f"**{result['assignee_name']}** from the {team} team" if result["assignee_name"]
               else f"someone from the {team} team")
        answer = (
            f"Thanks for letting me know. I've created ticket **{result['number']}** and {who} will take it "
            "from here. They may message you on the ticket if they need more details. You can follow it "
            "on the Tickets page."
        )
        return {"answer": answer, "ticket_number": result["number"]}

    async def _password_reset_ticket(state: AgentState) -> dict:
        """3 wrong codes: Tess opens a high-priority IT ticket with the whole story, without asking
        first (the reset is blocked, so a person has to take over)."""
        user_id = state["user_id"]
        person = get_user(user_id) or {}
        reset = pw_reset.get_for_run(ctx.run_id) or {}
        sent_at = reset.get("code_sent_at")
        context = {
            "original_question": state["query"], "route": "IT", "sources": [],
            "kind": "password_reset_blocked",
            "account": reset.get("system", "windows"),
            "summary_note": (
                f"Self-service reset of their {company_accounts.label(reset.get('system', 'windows'))} password was "
                f"blocked after {pw_reset.MAX_ATTEMPTS} wrong verification codes. "
                f"The code was emailed to their {reset.get('code_sent_to') or 'work'} email"
                f"{f' at {pw_reset.local_time(sent_at)}' if sent_at else ''}. The password was NOT changed. "
                "Please confirm it's really them (for example on a video call), then use \"Issue temporary "
                "password\" on this ticket."
            ),
            "wrong_codes": reset.get("attempts", pw_reset.MAX_ATTEMPTS),
            "codes_resent": reset.get("resends", 0),
        }
        result = ticketing_agent.create_ticket(user_id, ctx.run_id, "IT", state["query"], context, priority="high")
        if reset.get("id"):
            pw_reset.update(str(reset["id"]), ticket_id=result["ticket_id"])
        await ctx.sink.emit(
            "ticketing", "completed", action="create_ticket",
            detail={"ticket_number": result["number"], "assignee": result["assignee_name"]},
        )
        asyncio.get_running_loop().run_in_executor(
            None, lambda: ticketing_agent.announce_new_ticket(
                result, state["query"],
                body=(f"{person.get('name', 'Someone')}'s password reset was blocked after {pw_reset.MAX_ATTEMPTS} wrong "
                      "codes. Please confirm it's really them, then issue a temporary password from the ticket."),
            ),
        )
        who = (f"**{result['assignee_name']}** from IT support" if result["assignee_name"]
               else "someone from the IT support team")
        answer = (
            f"That's {pw_reset.MAX_ATTEMPTS} wrong codes, so I've stopped the reset to keep your account safe. "
            "Your password hasn't changed.\n\n"
            f"Tess has opened ticket **{result['number']}** with everything that happened, and {who} will confirm "
            "it's really you and then help you reset your password. You can follow it on the Tickets page."
        )
        return {"answer": answer, "ticket_number": result["number"], "author": "ticketing"}

    async def node_feedback(state: AgentState) -> dict:
        resolved = not state.get("unresolved", False)
        await ctx.sink.emit_final(
            answer=state.get("answer", "I'm not sure how to help with that."),
            sources=state.get("sources", []), route=state.get("route"), resolved=resolved,
            ticket_number=state.get("ticket_number"), suggestions=state.get("suggestions") or None,
            agent=state.get("author"),
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
        # Never send a temporary password to traces: trace_answer replaces such an answer.
        observability.trace_run_end(ctx.run_id, outcome, state.get("trace_answer") or state.get("answer", ""))
        return {"ended": True}

    graph = StateGraph(AgentState)
    graph.add_node("guard", node_guard)
    graph.add_node("blocked_reply", node_blocked_reply)
    graph.add_node("supervisor", node_supervisor)
    graph.add_node("other_reply", node_other_reply)
    graph.add_node("it_support", node_it_support)
    graph.add_node("hr_policy", node_hr_policy)
    graph.add_node("action", node_action)
    graph.add_node("password_reset", node_password_reset)
    graph.add_node("leave_request", node_leave_request)
    graph.add_node("payslip", node_payslip)
    graph.add_node("confirm_resolution", node_confirm_resolution)
    graph.add_node("offer_ticket", node_offer_ticket)
    graph.add_node("ticketing", node_ticketing)
    graph.add_node("feedback", node_feedback)

    graph.set_entry_point("guard")
    graph.add_conditional_edges("guard", lambda s: "blocked_reply" if s.get("guard_blocked") else "supervisor")
    graph.add_edge("blocked_reply", "feedback")
    def _after_supervisor(s: AgentState) -> str:
        if s.get("wants_password_reset"):
            return "password_reset"
        if s.get("wants_leave"):
            return "leave_request"
        if s.get("wants_payslip"):
            return "payslip"
        # A vague "I have an issue with my laptop" goes to the knowledge agent to be clarified,
        # even if the supervisor read it as a request for Atlas: there's nothing to DO yet.
        if s.get("route") in ("IT", "HR") and s.get("needs_action") and not _is_vague(s):
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
        if s.get("wants_password_reset"):
            return "password_reset"
        if s.get("wants_leave"):
            return "leave_request"
        if s.get("wants_payslip"):
            return "payslip"
        if s.get("action_fallback"):
            return "hr_policy" if s.get("route") == "HR" else "it_support"
        # A completed request (leave sent to HR, password reset, access approved) needs no
        # "did this solve your problem?" question; only a failed/declined one does.
        return "confirm_resolution" if s.get("unresolved") else "feedback"

    graph.add_conditional_edges("action", _after_action)

    def _after_password_reset(s: AgentState) -> str:
        if s.get("reset_blocked"):
            return "ticketing"  # 3 wrong codes: straight to Tess
        if s.get("unresolved"):
            return "offer_ticket"  # the code email couldn't be sent
        return "feedback"

    graph.add_conditional_edges("password_reset", _after_password_reset)
    graph.add_edge("leave_request", "feedback")
    graph.add_edge("payslip", "feedback")
    graph.add_conditional_edges("confirm_resolution", lambda s: "offer_ticket" if s.get("unresolved") else "feedback")
    graph.add_conditional_edges("offer_ticket", lambda s: "ticketing" if s.get("offered_ticket") else "feedback")
    graph.add_edge("ticketing", "feedback")
    graph.add_edge("feedback", END)

    return graph.compile(checkpointer=_CHECKPOINTER)


async def _settle_or_pause(run_id: str, queue: asyncio.Queue, graph, config: dict) -> None:
    """After a successful ainvoke(), figure out whether the graph finished, is waiting on a
    admin approval (leave the queue open — the decision may arrive via a completely separate
    HTTP request), or is waiting on the user's own next chat message (close this SSE turn; the
    next POST /chat/stream on this conversation will detect and resume the paused run)."""
    snapshot = graph.get_state(config)
    next_node = snapshot.next[0] if snapshot.next else None

    if next_node == "action":
        update_run(run_id, status="awaiting_approval")
        return  # queue stays open/registered for resume_after_approval()

    if next_node in ("confirm_resolution", "offer_ticket", "password_reset", "leave_request"):
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
            # Agents read the message with likely typos fixed ("sicck leave tomorow"); the chat and
            # history keep the person's own words.
            {"run_id": run_id, "user_id": user["id"], "query": spelling.correct(query), "original_query": query,
             "clarified": clarified},
            config=config,
        )
    except Exception as exc:  # noqa: BLE001
        await sink.emit_error(str(exc))
        update_run(run_id, status="failed", outcome="error")
        # End this chat turn's stream, or the chat would wait forever for more events.
        drop_queue(run_id)
        await queue.put(None)
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
        # End this chat turn's stream, or the chat would wait forever for more events.
        drop_queue(run_id)
        await queue.put(None)
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

    if not graph.get_state(config).next:
        # The paused step only lives in this process's memory (see the module docstring); after a
        # server restart it's gone. Say so plainly instead of leaving the chat hanging.
        pw_reset.cancel_open_for_run(run_id)
        update_run(run_id, status="resolved", outcome="moved_on")
        await sink.emit_error("That step timed out because the assistant was restarted. Please ask your question again.")
        drop_queue(run_id)
        await queue.put(None)
        return

    try:
        graph.update_state(config, {"user_reply": user_reply})
        await graph.ainvoke(None, config=config)
    except Exception as exc:  # noqa: BLE001
        await sink.emit_error(str(exc))
        update_run(run_id, status="failed", outcome="error")
        # End this chat turn's stream, or the chat would wait forever for more events.
        drop_queue(run_id)
        await queue.put(None)
        return

    await _settle_or_pause(run_id, queue, graph, config)

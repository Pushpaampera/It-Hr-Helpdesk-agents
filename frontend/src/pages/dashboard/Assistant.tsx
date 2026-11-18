/** The AI Assistant page. A real chat UI against the live LangGraph agent graph
 * (POST /api/chat/stream, SSE): the side panel shows which helper is working, driven by the real
 * event stream (docs/01_ARCHITECTURE.md); approval_required shows a live "waiting on a human"
 * banner (the SSE connection stays open, so the eventual decision elsewhere resolves this same
 * turn); and a final answer surfaces its cited sources plus a feedback widget that feeds the
 * live bandit.
 *
 * Accessibility: a hidden live region announces "working on it" and then the finished answer
 * once (not token by token), the message box has a label, and errors are announced.
 */
import { AlertTriangle, BookOpen, Clock, Send, ShieldAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import { useSearchParams } from "react-router-dom";
import remarkGfm from "remark-gfm";

import { apiPost } from "../../api/client";
import { streamSSE } from "../../api/sse";
import type { ChatEvent, ChatSource, Conversation } from "../../api/types";
import AgentActivityPanel, { type AgentDeskState, type CaptionLogEntry } from "../../components/chat/AgentActivityPanel";
import FeedbackWidget from "../../components/chat/FeedbackWidget";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import InfoBanner from "../../components/ui/InfoBanner";
import Panel from "../../components/ui/Panel";
import { AGENT_ORDER, AGENTS, type AgentKey } from "../../design/agents";
import AgentAvatar from "../../components/ui/AgentAvatar";
import { useUIStore } from "../../store/uiStore";

function isKnownAgent(agent: string | null): agent is AgentKey {
  return !!agent && (AGENT_ORDER as readonly string[]).includes(agent);
}

function emptyAgentStates(): Partial<Record<AgentKey, AgentDeskState>> {
  return {};
}

// The backend's `final` event's `route` is the department the supervisor picked — "IT"/"HR"/
// "OTHER" (see backend/app/agents/supervisor.py) — not an agent key. Mirrors the same IT->Iris/
// HR->Hana convention backend/app/agents/events.py's own caption builder already uses.
function routeToAgentKey(route: string | null): AgentKey | null {
  if (route === "IT") return "it_support";
  if (route === "HR") return "hr_policy";
  return null;
}

// A mix of IT and HR starter questions — the same Assistant page serves every role, so this
// covers both departments rather than branching by the logged-in user's role.
const SUGGESTED_QUESTIONS = [
  "My laptop won't connect to the VPN, error 619",
  "I'm having Wi-Fi problems on my laptop",
  "How do I reset my password?",
  "How many sick days do I have left?",
  "What's the parental leave policy?",
  "I need access to the Finance system",
];

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: ChatSource[];
  ticketNumber?: string | null;
  resolved?: boolean;
  runId?: string;
  pending?: boolean;
  route?: string | null;
  /** The chain of agents this turn actually passed through, in order (e.g. ["guard",
   * "supervisor", "it_support"]) — rendered as a routing strip above the answer so the
   * employee can see who handled it, not just the final author. */
  routeChain?: AgentKey[];
};

type PulseState = { from: string; to: string; trigger: number };
type ApprovalState = { approvalId: string; approverName: string; system: string };
type PendingGateState = { gate: "resolution_confirm" | "ticket_offer" };

export default function Assistant() {
  const reduceMotion = useUIStore((s) => s.reduceMotion);

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [searchParams, setSearchParams] = useSearchParams();
  const [input, setInput] = useState(() => searchParams.get("q") ?? "");
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeAgent, setActiveAgent] = useState<string | null>(null);
  const [pulse, setPulse] = useState<PulseState | null>(null);
  const [captions, setCaptions] = useState<CaptionLogEntry[]>([]);
  const [agentStates, setAgentStates] = useState<Partial<Record<AgentKey, AgentDeskState>>>(emptyAgentStates());
  const [approval, setApproval] = useState<ApprovalState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingGate, setPendingGate] = useState<PendingGateState | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Announced to screen readers: "working…" while streaming, then the finished answer once.
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant" && !m.pending);
  const announcement = isStreaming ? "The assistant is working on your question." : (lastAssistant?.content ?? "");

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
  }, [messages, reduceMotion]);

  useEffect(() => {
    if (searchParams.get("q")) setSearchParams({}, { replace: true });
    // Only strip the prefill param once, right after reading it into `input` above — not on
    // every searchParams change, or this would fight the browser's own URL updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  async function ensureConversation(): Promise<string> {
    if (conversationId) return conversationId;
    const conv = await apiPost<Conversation>("/conversations", {});
    setConversationId(conv.id);
    return conv.id;
  }

  async function handleSend(override?: string) {
    const query = (override ?? input).trim();
    if (!query || isStreaming) return;
    setInput("");
    setError(null);
    setCaptions([]);
    setPulse(null);
    setApproval(null);
    setActiveAgent(null);
    setPendingGate(null);
    setAgentStates(emptyAgentStates());

    const assistantMsgId = crypto.randomUUID();
    setMessages((m) => [
      ...m,
      { id: crypto.randomUUID(), role: "user", content: query },
      { id: assistantMsgId, role: "assistant", content: "", pending: true },
    ]);
    setIsStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;
    let streamedAnswer = "";
    const routeChain: AgentKey[] = [];
    let lastSpecialist: "it_support" | "hr_policy" | null = null;
    function pushRoute(agent: string | null) {
      if (!isKnownAgent(agent)) return;
      if (agent === "it_support" || agent === "hr_policy") lastSpecialist = agent;
      if (routeChain[routeChain.length - 1] !== agent) routeChain.push(agent);
    }

    try {
      const convId = await ensureConversation();

      await streamSSE<ChatEvent>(
        "/chat/stream",
        { message: query, conversation_id: convId },
        (event) => {
          switch (event.type) {
            case "agent_event": {
              setCaptions((c) => [...c, { id: crypto.randomUUID(), agent: event.agent, caption: event.caption }]);
              pushRoute(event.agent);
              const agentKey = event.agent as AgentKey;
              if (["started", "working", "retrieving", "tool_call"].includes(event.status)) {
                setActiveAgent(event.agent);
                setAgentStates((s) => ({ ...s, [agentKey]: { working: true, done: false, bubble: event.caption } }));
              } else if (event.status === "completed") {
                setActiveAgent((cur) => (cur === event.agent ? null : cur));
                setAgentStates((s) => ({ ...s, [agentKey]: { working: false, done: true, bubble: event.caption } }));
              }
              break;
            }

            case "handoff": {
              setCaptions((c) => [...c, { id: crypto.randomUUID(), agent: event.from, caption: event.caption }]);
              pushRoute(event.from);
              pushRoute(event.to);
              setPulse((p) => ({ from: event.from, to: event.to, trigger: (p?.trigger ?? 0) + 1 }));
              setActiveAgent(event.to);
              const toKey = event.to as AgentKey;
              setAgentStates((s) => ({ ...s, [toKey]: { working: true, done: false, bubble: event.caption } }));
              break;
            }

            case "token":
              streamedAnswer += event.text;
              setMessages((m) => m.map((msg) => (msg.id === assistantMsgId ? { ...msg, content: streamedAnswer } : msg)));
              break;

            case "approval_required":
              setApproval({ approvalId: event.approval_id, approverName: event.approver_name, system: event.system });
              setCaptions((c) => [...c, { id: crypto.randomUUID(), agent: "action", caption: event.caption }]);
              break;

            case "confirmation_required": {
              setPendingGate({ gate: event.gate });
              setCaptions((c) => [...c, { id: crypto.randomUUID(), agent: "feedback", caption: event.caption }]);
              const gateRoute = lastSpecialist === "it_support" ? "IT" : lastSpecialist === "hr_policy" ? "HR" : null;
              setMessages((m) =>
                m.map((msg) =>
                  msg.id === assistantMsgId
                    ? { ...msg, content: event.prompt, sources: event.sources, route: gateRoute, routeChain: [...routeChain], pending: false }
                    : msg,
                ),
              );
              break;
            }

            case "final":
              setApproval(null);
              setPendingGate(null);
              setActiveAgent(null);
              pushRoute(event.route ? routeToAgentKey(event.route) : null);
              const finalRouteKey = routeToAgentKey(event.route);
              if (finalRouteKey) {
                setAgentStates((s) => ({ ...s, [finalRouteKey]: { working: false, done: true, bubble: s[finalRouteKey]?.bubble ?? null } }));
              }
              setMessages((m) =>
                m.map((msg) =>
                  msg.id === assistantMsgId
                    ? {
                        ...msg,
                        content: event.answer,
                        sources: event.sources,
                        ticketNumber: event.ticket_number,
                        resolved: event.resolved,
                        runId: event.run_id,
                        route: event.route,
                        routeChain: [...routeChain],
                        pending: false,
                      }
                    : msg,
                ),
              );
              break;

            case "error":
              setError(event.message);
              setMessages((m) => m.map((msg) => (msg.id === assistantMsgId ? { ...msg, pending: false } : msg)));
              break;
          }
        },
        controller.signal,
      );
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        setError(err instanceof Error ? err.message : "Something went wrong talking to the assistant.");
      }
      setMessages((m) => m.map((msg) => (msg.id === assistantMsgId ? { ...msg, pending: false } : msg)));
    } finally {
      setIsStreaming(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="assistant-layout">
      <div className="sr-only" role="status" aria-live="polite">{announcement}</div>
      <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        <h1 style={{ fontSize: "1.375rem", marginBottom: "var(--space-1)" }}>Ask the Assistant</h1>
        <p style={{ marginBottom: "var(--space-4)" }}>Ask an IT or HR question, or ask it to do something for you.</p>
        <InfoBanner id="assistant">
          Ask anything IT or HR related. The AI will try to answer and ask if it solved your problem — if not, it'll offer to raise a ticket for a human to help.
        </InfoBanner>

        <Panel style={{ flex: 1, display: "flex", flexDirection: "column", padding: "var(--space-4)", overflow: "hidden" }}>
          <div
            aria-label="Conversation"
            role="region"
            tabIndex={0}
            style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "var(--space-4)", paddingRight: "var(--space-2)" }}
          >
            <div
              style={{
                display: messages.length === 0 ? "flex" : "none",
                flexDirection: "column", alignItems: "center", textAlign: "center", padding: "var(--space-6) var(--space-4)",
              }}
            >
              <AgentAvatar agent="supervisor" size={64} style={{ marginBottom: "var(--space-4)" }} />
              <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", marginBottom: "var(--space-4)", maxWidth: 420 }}>
                Ask me anything IT or HR — or try one of these:
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)", justifyContent: "center", maxWidth: 480 }}>
                {SUGGESTED_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    onClick={() => handleSend(q)}
                    disabled={isStreaming}
                    style={{
                      fontSize: "0.8125rem", fontFamily: "var(--font-body)", padding: "10px 16px", minHeight: 44,
                      borderRadius: "var(--radius-full)", border: "1px solid var(--border-strong)",
                      background: "var(--bg-elevated)", color: "var(--text-secondary)",
                      cursor: isStreaming ? "not-allowed" : "pointer",
                    }}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
            <div ref={messagesEndRef} />
          </div>

          {pendingGate && !isStreaming && (
            <div style={{ display: "flex", gap: "var(--space-2)", marginTop: "var(--space-3)" }}>
              <Button variant="primary" onClick={() => handleSend("Yes")}>
                Yes
              </Button>
              <Button variant="ghost" onClick={() => handleSend("No")}>
                No
              </Button>
            </div>
          )}

          {approval && (
            <div
              role="status"
              style={{
                display: "flex", alignItems: "center", gap: "var(--space-3)", marginTop: "var(--space-3)",
                padding: "var(--space-3) var(--space-4)", borderRadius: "var(--radius-md)",
                background: "var(--bg-elevated)", border: "1px solid var(--warning)", fontSize: "0.8125rem",
              }}
            >
              <ShieldAlert size={18} color="var(--warning)" style={{ flexShrink: 0 }} aria-hidden="true" />
              <span>
                Waiting for <strong>{approval.approverName}</strong>'s approval to access <strong>{approval.system}</strong>.
                This will continue automatically once decided.
              </span>
              <Clock size={16} color="var(--text-muted)" style={{ marginLeft: "auto", flexShrink: 0 }} aria-hidden="true" />
            </div>
          )}

          {error && (
            <div role="alert" style={{ display: "flex", alignItems: "center", gap: 6, marginTop: "var(--space-3)", fontSize: "0.8125rem", color: "var(--danger)" }}>
              <AlertTriangle size={14} aria-hidden="true" /> {error}
            </div>
          )}

          <div style={{ display: "flex", gap: "var(--space-3)", marginTop: "var(--space-4)", alignItems: "flex-end" }}>
            <textarea
              aria-label="Your message to the assistant"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isStreaming ? "Waiting for a response..." : "Type a message..."}
              disabled={isStreaming}
              rows={1}
              style={{
                flex: 1, resize: "none", fontFamily: "var(--font-body)", fontSize: "0.875rem",
                padding: "var(--space-3) var(--space-4)", borderRadius: "var(--radius-md)",
                background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)",
                color: "var(--text-primary)", maxHeight: 120,
              }}
            />
            <Button
              variant="primary"
              onClick={() => handleSend()}
              disabled={isStreaming || !input.trim()}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0 }}
            >
              <Send size={16} aria-hidden="true" /> Send
            </Button>
          </div>
        </Panel>
      </div>

      <AgentActivityPanel activeAgent={activeAgent} pulse={pulse} captions={captions} agentStates={agentStates} />
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  const routeKey = !isUser ? routeToAgentKey(message.route ?? null) : null;
  const identity = routeKey ? AGENTS[routeKey] : null;
  const chain = !isUser ? (message.routeChain ?? []).filter((k) => k !== routeKey || (message.routeChain?.length ?? 0) === 1) : [];
  return (
    <div style={{ display: "flex", justifyContent: isUser ? "flex-end" : "flex-start" }}>
      <div
        style={{
          maxWidth: "80%", padding: "var(--space-3) var(--space-4)", borderRadius: "var(--radius-md)",
          background: isUser ? "var(--agent-supervisor)" : "var(--bg-elevated)",
          color: isUser ? "#fff" : "var(--text-primary)",
          border: isUser ? "none" : "1px solid var(--border-subtle)",
          fontSize: "0.875rem", lineHeight: 1.5,
        }}
      >
        {!isUser && chain.length > 1 && (
          <div
            style={{
              display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap", fontSize: "0.8125rem",
              color: "var(--text-muted)", marginBottom: "var(--space-2)",
            }}
          >
            {chain.map((key, i) => (
              <span key={key} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ fontWeight: 600, color: AGENTS[key].color }}>
                  {AGENTS[key].name} ({AGENTS[key].role})
                </span>
                {i < chain.length - 1 && <span>→</span>}
              </span>
            ))}
          </div>
        )}
        {identity && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: "var(--space-2)" }}>
            <AgentAvatar agent={routeKey as AgentKey} size={22} />
            <span style={{ fontSize: "0.8125rem", fontWeight: 700, color: identity.color }}>
              {identity.name}, {identity.role}
            </span>
          </div>
        )}
        {isUser || message.pending ? (
          message.content || (message.pending ? "..." : "")
        ) : (
          <div className="markdown-answer">
            <Markdown remarkPlugins={[remarkGfm]}>{message.content}</Markdown>
          </div>
        )}

        {!isUser && message.ticketNumber && (
          <div style={{ marginTop: "var(--space-3)" }}>
            <Badge label={`Ticket ${message.ticketNumber}`} tone="warning" />
          </div>
        )}

        {!isUser && message.sources && message.sources.length > 0 && (
          <div style={{ marginTop: "var(--space-3)", display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
            {Array.from(new Set(message.sources.map((s) => s.title))).map((title) => (
              <span
                key={title}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 4, fontSize: "0.8125rem",
                  color: "var(--text-muted)", border: "1px solid var(--border-subtle)",
                  borderRadius: "var(--radius-full)", padding: "2px 8px",
                }}
              >
                <BookOpen size={12} aria-hidden="true" /> Source: {title}
              </span>
            ))}
          </div>
        )}

        {!isUser && !message.pending && message.runId && (
          <div style={{ marginTop: "var(--space-3)" }}>
            <FeedbackWidget runId={message.runId} resolved={message.resolved ?? false} />
          </div>
        )}
      </div>
    </div>
  );
}

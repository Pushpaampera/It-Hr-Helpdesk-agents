/** The AI Assistant page — the project's centerpiece. A real chat UI against the live
 * LangGraph agent graph (POST /api/chat/stream, SSE), with the Phase 5 3D building blocks
 * wired to the actual event stream per docs/01_ARCHITECTURE.md's event→animation mapping:
 * handoffs drive DataPulse beams between AgentOrbs, in-flight agents pulse, approval_required
 * shows a live "waiting on a human" banner (the SSE connection stays open — see
 * docs/01_ARCHITECTURE.md — so the eventual decision elsewhere resolves this same turn), and a
 * final answer surfaces its cited sources plus a feedback widget that feeds the live bandit.
 */
import { AlertTriangle, BookOpen, Clock, Send, ShieldAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { apiPost } from "../../api/client";
import { streamSSE } from "../../api/sse";
import type { ChatEvent, ChatSource, Conversation } from "../../api/types";
import AgentActivityPanel, { type CaptionLogEntry } from "../../components/chat/AgentActivityPanel";
import FeedbackWidget from "../../components/chat/FeedbackWidget";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import Panel from "../../components/ui/Panel";
import { useUIStore } from "../../store/uiStore";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: ChatSource[];
  ticketNumber?: string | null;
  resolved?: boolean;
  runId?: string;
  pending?: boolean;
};

type PulseState = { from: string; to: string; trigger: number };
type ApprovalState = { approvalId: string; approverName: string; system: string };

export default function Assistant() {
  const reduceMotion = useUIStore((s) => s.reduceMotion);

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeAgent, setActiveAgent] = useState<string | null>(null);
  const [pulse, setPulse] = useState<PulseState | null>(null);
  const [captions, setCaptions] = useState<CaptionLogEntry[]>([]);
  const [approval, setApproval] = useState<ApprovalState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
  }, [messages, reduceMotion]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  async function ensureConversation(): Promise<string> {
    if (conversationId) return conversationId;
    const conv = await apiPost<Conversation>("/conversations", {});
    setConversationId(conv.id);
    return conv.id;
  }

  async function handleSend() {
    const query = input.trim();
    if (!query || isStreaming) return;
    setInput("");
    setError(null);
    setCaptions([]);
    setPulse(null);
    setApproval(null);
    setActiveAgent(null);

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

    try {
      const convId = await ensureConversation();

      await streamSSE<ChatEvent>(
        "/chat/stream",
        { message: query, conversation_id: convId },
        (event) => {
          switch (event.type) {
            case "agent_event":
              setCaptions((c) => [...c, { id: crypto.randomUUID(), agent: event.agent, caption: event.caption }]);
              if (["started", "working", "retrieving", "tool_call"].includes(event.status)) {
                setActiveAgent(event.agent);
              } else if (event.status === "completed") {
                setActiveAgent((cur) => (cur === event.agent ? null : cur));
              }
              break;

            case "handoff":
              setCaptions((c) => [...c, { id: crypto.randomUUID(), agent: event.from, caption: event.caption }]);
              setPulse((p) => ({ from: event.from, to: event.to, trigger: (p?.trigger ?? 0) + 1 }));
              setActiveAgent(event.to);
              break;

            case "token":
              streamedAnswer += event.text;
              setMessages((m) => m.map((msg) => (msg.id === assistantMsgId ? { ...msg, content: streamedAnswer } : msg)));
              break;

            case "approval_required":
              setApproval({ approvalId: event.approval_id, approverName: event.approver_name, system: event.system });
              setCaptions((c) => [...c, { id: crypto.randomUUID(), agent: "action", caption: event.caption }]);
              break;

            case "final":
              setApproval(null);
              setActiveAgent(null);
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
    <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: "var(--space-5)", height: "calc(100vh - 110px)" }}>
      <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        <h1 style={{ fontSize: 22, marginBottom: "var(--space-1)" }}>AI Assistant</h1>
        <p style={{ marginBottom: "var(--space-4)" }}>Ask an IT or HR question, or ask it to do something for you.</p>

        <Panel style={{ flex: 1, display: "flex", flexDirection: "column", padding: "var(--space-4)", overflow: "hidden" }}>
          <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "var(--space-4)", paddingRight: "var(--space-2)" }}>
            {messages.length === 0 && (
              <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
                Try: "My laptop won't connect to the VPN, error 619" or "How many sick days do I have left?"
              </p>
            )}
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
            <div ref={messagesEndRef} />
          </div>

          {approval && (
            <div
              style={{
                display: "flex", alignItems: "center", gap: "var(--space-3)", marginTop: "var(--space-3)",
                padding: "var(--space-3) var(--space-4)", borderRadius: "var(--radius-md)",
                background: "var(--bg-elevated)", border: "1px solid var(--warning)", fontSize: 13,
              }}
            >
              <ShieldAlert size={18} color="var(--warning)" style={{ flexShrink: 0 }} />
              <span>
                Waiting for <strong>{approval.approverName}</strong>'s approval to access <strong>{approval.system}</strong>.
                This will continue automatically once decided.
              </span>
              <Clock size={16} color="var(--text-muted)" style={{ marginLeft: "auto", flexShrink: 0 }} />
            </div>
          )}

          {error && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: "var(--space-3)", fontSize: 13, color: "var(--danger)" }}>
              <AlertTriangle size={14} /> {error}
            </div>
          )}

          <div style={{ display: "flex", gap: "var(--space-3)", marginTop: "var(--space-4)", alignItems: "flex-end" }}>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isStreaming ? "Waiting for a response..." : "Type a message..."}
              disabled={isStreaming}
              rows={1}
              style={{
                flex: 1, resize: "none", fontFamily: "var(--font-body)", fontSize: 14,
                padding: "var(--space-3) var(--space-4)", borderRadius: "var(--radius-md)",
                background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)",
                color: "var(--text-primary)", outline: "none", maxHeight: 120,
              }}
            />
            <Button
              variant="primary"
              onClick={handleSend}
              disabled={isStreaming || !input.trim()}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0 }}
            >
              <Send size={16} /> Send
            </Button>
          </div>
        </Panel>
      </div>

      <AgentActivityPanel activeAgent={activeAgent} pulse={pulse} captions={captions} />
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <div style={{ display: "flex", justifyContent: isUser ? "flex-end" : "flex-start" }}>
      <div
        style={{
          maxWidth: "80%", padding: "var(--space-3) var(--space-4)", borderRadius: "var(--radius-md)",
          background: isUser ? "var(--agent-supervisor)" : "var(--bg-elevated)",
          color: isUser ? "#fff" : "var(--text-primary)",
          border: isUser ? "none" : "1px solid var(--border-subtle)",
          whiteSpace: "pre-wrap", fontSize: 14, lineHeight: 1.5,
        }}
      >
        {message.content || (message.pending ? "..." : "")}

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
                  display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11,
                  color: "var(--text-muted)", border: "1px solid var(--border-subtle)",
                  borderRadius: "var(--radius-full)", padding: "2px 8px",
                }}
              >
                <BookOpen size={10} /> {title}
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

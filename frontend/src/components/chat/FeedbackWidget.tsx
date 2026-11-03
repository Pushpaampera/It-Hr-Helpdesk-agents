/** Shown under the final answer of a resolved chat turn. Posts to POST /api/feedback, which
 * computes the LinUCB reward and updates the live bandit (app/agents/feedback.py) — the
 * frontend half of the Reinforcement Lab story. */
import { CheckCircle2, Star } from "lucide-react";
import { useState } from "react";

import { apiPost } from "../../api/client";
import type { FeedbackResponse } from "../../api/types";
import Button from "../ui/Button";

type FeedbackWidgetProps = { runId: string; resolved: boolean };

export default function FeedbackWidget({ runId, resolved }: FeedbackWidgetProps) {
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (rating === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiPost<FeedbackResponse>("/feedback", { run_id: runId, rating, resolved });
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't submit feedback");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--success)" }}>
        <CheckCircle2 size={14} /> Thanks — Finn is learning from that.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", flexWrap: "wrap" }}>
      <span style={{ fontSize: 12, color: "var(--text-muted)" }}>How was this?</span>
      <div style={{ display: "flex", gap: 2 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setRating(n)}
            onMouseEnter={() => setHovered(n)}
            onMouseLeave={() => setHovered(0)}
            aria-label={`Rate ${n} star${n > 1 ? "s" : ""}`}
            style={{ background: "transparent", border: "none", padding: 2, cursor: "pointer", color: "var(--warning)" }}
          >
            <Star size={16} fill={(hovered || rating) >= n ? "currentColor" : "none"} />
          </button>
        ))}
      </div>
      {rating > 0 && (
        <Button variant="ghost" onClick={handleSubmit} disabled={submitting} style={{ padding: "var(--space-1) var(--space-3)", fontSize: 12 }}>
          {submitting ? "Sending..." : "Submit"}
        </Button>
      )}
      {error && <span style={{ fontSize: 12, color: "var(--danger)" }}>{error}</span>}
    </div>
  );
}

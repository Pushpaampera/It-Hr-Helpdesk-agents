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
      <div role="status" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.875rem", fontWeight: 600, color: "var(--success)" }}>
        <CheckCircle2 size={16} aria-hidden="true" /> Thanks — Finn is learning from that.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", flexWrap: "wrap" }}>
      <span id="feedback-label" style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}>How was this?</span>
      <div role="group" aria-labelledby="feedback-label" style={{ display: "flex", gap: 2 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setRating(n)}
            onMouseEnter={() => setHovered(n)}
            onMouseLeave={() => setHovered(0)}
            onFocus={() => setHovered(n)}
            onBlur={() => setHovered(0)}
            aria-label={`Rate ${n} star${n > 1 ? "s" : ""}`}
            aria-pressed={rating === n}
            style={{ background: "transparent", border: "none", width: 44, height: 44, display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--warning)" }}
          >
            <Star size={22} aria-hidden="true" fill={(hovered || rating) >= n ? "currentColor" : "none"} />
          </button>
        ))}
      </div>
      {rating > 0 && (
        <Button variant="ghost" onClick={handleSubmit} disabled={submitting} >
          {submitting ? "Sending..." : "Submit"}
        </Button>
      )}
      {error && <span role="alert" style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--danger)" }}>{error}</span>}
    </div>
  );
}

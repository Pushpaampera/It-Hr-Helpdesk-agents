/** Policy Knowledge Base page (hr/admin). Search over the real RAG knowledge base
 * (GET /api/kb/search) with a dept filter, a "compare strategies" view
 * (GET /api/kb/compare — the lexical-vs-semantic-vs-hybrid demo the bandit picks between), and
 * an article reader (GET /api/kb/articles/{id}). */
import { Search } from "lucide-react";
import { useEffect, useState } from "react";

import { apiGet } from "../../api/client";
import type { KbArticleDetail, KbResult } from "../../api/types";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import InfoBanner from "../../components/ui/InfoBanner";
import InfoTooltip from "../../components/ui/InfoTooltip";
import Panel from "../../components/ui/Panel";
import TextField from "../../components/ui/TextField";
import DashboardHeader from "../../components/dashboard/DashboardHeader";
import PageTransition from "../../design/pageTransition";
import hover from "../../design/hoverEffects.module.css";

const STRATEGIES = ["lexical_heavy", "semantic_heavy", "hybrid_rerank"] as const;

// Visible labels only — the internal strategy id strings stay as-is for API calls/keys.
function formatStrategyName(name: string): string {
  return name
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export default function KnowledgeBase() {
  const [query, setQuery] = useState("");
  const [dept, setDept] = useState<string>("");
  const [compareMode, setCompareMode] = useState(false);
  const [results, setResults] = useState<KbResult[] | null>(null);
  const [compareResults, setCompareResults] = useState<Record<string, KbResult[]> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(null);

  async function search() {
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setError(null);
    setResults(null);
    setCompareResults(null);
    try {
      const deptQs = dept ? `&dept=${dept}` : "";
      if (compareMode) {
        const res = await apiGet<{ strategies: Record<string, KbResult[]> }>(`/kb/compare?q=${encodeURIComponent(q)}${deptQs}`);
        setCompareResults(res.strategies);
      } else {
        const res = await apiGet<{ results: KbResult[] }>(`/kb/search?q=${encodeURIComponent(q)}${deptQs}&strategy=hybrid_rerank`);
        setResults(res.results);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <PageTransition routeKey="kb">
    <div>
      <DashboardHeader
        title="Policy Knowledge Base"
        subtitle="Search the same knowledge base the AI Assistant retrieves from — see exactly what it cites."
      />
      <InfoBanner id="knowledge-base">
        Search the same articles the AI assistant uses to answer questions, so you can check what it's citing or find a policy yourself.
      </InfoBanner>

      <Panel style={{ padding: "var(--space-5)", marginBottom: "var(--space-5)" }}>
        <div style={{ display: "flex", gap: "var(--space-3)", alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <TextField
              label="Search query"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && search()}
              placeholder="e.g. VPN error 619, parental leave policy"
            />
          </div>
          <label style={{ fontSize: 12, color: "var(--text-muted)" }}>
            Department
            <select
              value={dept}
              onChange={(e) => setDept(e.target.value)}
              style={{ display: "block", marginTop: 4, padding: "var(--space-3)", borderRadius: "var(--radius-md)", background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)" }}
            >
              <option value="">Any</option>
              <option value="IT">IT</option>
              <option value="HR">HR</option>
            </select>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text-secondary)", paddingBottom: 10 }}>
            <input type="checkbox" checked={compareMode} onChange={(e) => setCompareMode(e.target.checked)} />
            Compare search strategies
            <InfoTooltip text="See how 3 different search approaches rank the same query, side by side." />
          </label>
          <Button variant="primary" onClick={search} disabled={loading || !query.trim()} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Search size={14} /> Search
          </Button>
        </div>
      </Panel>

      {error && <Panel style={{ padding: "var(--space-5)", color: "var(--danger)", marginBottom: "var(--space-5)" }}>{error}</Panel>}

      {selectedArticleId && (
        <ArticleReader articleId={selectedArticleId} onClose={() => setSelectedArticleId(null)} />
      )}

      {!selectedArticleId && results && (
        <ResultsList title="Results" results={results} onSelect={setSelectedArticleId} />
      )}

      {!selectedArticleId && compareResults && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "var(--space-4)" }}>
          {STRATEGIES.map((s) => (
            <div key={s}>
              <ResultsList title={formatStrategyName(s)} results={compareResults[s] ?? []} onSelect={setSelectedArticleId} compact />
            </div>
          ))}
        </div>
      )}
    </div>
    </PageTransition>
  );
}

function ResultsList({
  title, results, onSelect, compact,
}: {
  title: string; results: KbResult[]; onSelect: (id: string) => void; compact?: boolean;
}) {
  return (
    <div>
      <h2 style={{ fontSize: 13, textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "var(--space-3)" }}>{title}</h2>
      {results.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--text-muted)" }}>No results.</p>
      ) : (
        <div style={{ display: "grid", gap: "var(--space-3)" }}>
          {results.map((r) => (
            <Panel
              key={r.chunk_id}
              onClick={() => onSelect(r.article_id)}
              className={hover.liftOnHover}
              style={{ padding: compact ? "var(--space-3) var(--space-4)" : "var(--space-4) var(--space-5)", cursor: "pointer" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "var(--space-3)", marginBottom: 6 }}>
                <strong style={{ fontSize: compact ? 13 : 14 }}>{r.title}</strong>
                <Badge label={r.dept} tone={r.dept === "IT" ? "info" : "success"} />
              </div>
              <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 6, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                {r.text}
              </p>
              <p style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>match strength {r.score.toFixed(3)}</p>
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
}

function ArticleReader({ articleId, onClose }: { articleId: string; onClose: () => void }) {
  const [detail, setDetail] = useState<KbArticleDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDetail(null);
    apiGet<KbArticleDetail>(`/kb/articles/${articleId}`)
      .then(setDetail)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load article"));
  }, [articleId]);

  return (
    <Panel style={{ padding: "var(--space-5)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "var(--space-4)" }}>
        <h2 style={{ fontSize: 18 }}>{detail?.article.title ?? "Loading..."}</h2>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 13 }}>
          ← Back to results
        </button>
      </div>
      {error && <p style={{ color: "var(--danger)", fontSize: 13 }}>{error}</p>}
      {detail && (
        <>
          <div style={{ display: "flex", gap: "var(--space-2)", marginBottom: "var(--space-4)" }}>
            <Badge label={detail.article.dept} tone={detail.article.dept === "IT" ? "info" : "success"} />
            <Badge label={detail.article.category} tone="neutral" />
            {detail.article.error_codes && detail.article.error_codes.length > 0 && (
              <Badge label={detail.article.error_codes.join(", ")} tone="warning" />
            )}
          </div>
          <div style={{ fontSize: 14, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{detail.article.body}</div>
          <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: "var(--space-4)" }}>
            Source: {detail.article.source_name} · v{detail.article.version} · updated{" "}
            {new Date(detail.article.updated_at).toLocaleDateString()}
          </p>
        </>
      )}
    </Panel>
  );
}

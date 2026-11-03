# 04 — Frontend

Updated through Phase 11.

## Routes (Phase 11 state — every nav item is now implemented)
| Path | Page | Notes |
|------|------|-------|
| `/` | `Landing` | The real cinematic landing page: hero (Scene + 7 AgentOrbs + DataPulse + ParticleField, bloom on), "Meet the team", "How it works", closing CTA. |
| `/login` | `Login` | Real email/password form + demo-account quick-picker. Redirects to `/app` (or wherever `RequireAuth` remembered) on success. |
| `/app` (wrapped in `RequireAuth`) | `DashboardLayout` | Sidebar + top bar shell. `index` redirects to `overview`. |
| `/app/overview` | `Overview` | Staff (manager/hr/admin): KPI cards + 30-day runs chart from `/api/analytics/*`. Employee: own open tickets + conversation count. |
| `/app/assistant` | `Assistant` | The real chat UI against the live agent graph (`POST /api/chat/stream`, SSE) — the project's centerpiece. |
| `/app/tickets` | `Tickets` | All roles; own vs. company-wide list (`GET /api/tickets`), detail + timeline (`GET /api/tickets/{id}`), staff status/priority edits (`PATCH /api/tickets/{id}`). |
| `/app/approvals` | `Approvals` | Manager/admin; list by status (`GET /api/approvals`), decide (`POST /api/approvals/{id}/decide` — note **POST**, not PATCH, see `docs/phases/PHASE_10.md`). |
| `/app/team` | `Team` | Manager only; a manager's direct reports + real signal (`GET /api/team`, new this phase). |
| `/app/hr-insights` | `HrInsights` | HR only; company-wide headcount/leave posture + pending leave decisions (`GET /api/hr/overview`, `GET`/`PATCH /api/hr/leave-requests`, new this phase). |
| `/app/kb` | `KnowledgeBase` | HR/admin; search/compare/read the real RAG knowledge base (`GET /api/kb/{search,compare,articles/{id}}`). |
| `/app/control-room` | `ControlRoom` | Admin; per-agent health, an always-on live feed of every user's agent activity (`GET /api/agents/live`, SSE), recent runs + Replay (`GET /api/agents/runs` new this phase, `GET /api/runs/{id}/events`). |
| `/app/reinforcement-lab` | `ReinforcementLab` | Admin (nav-gated; backend allows manager/hr too); the LinUCB bandit's real state (`GET /api/bandit/stats`). |
| `/app/evaluation` | `Evaluation` | Admin; trigger + inspect golden-set runs (`POST /api/eval/run`, `GET /api/eval/runs`, `GET /api/eval/runs/{id}` new this phase). |
| `/app/costs` | `Costs` | Admin (nav-gated; backend allows manager/hr too); token/$ spend (`GET /api/costs`). |
| `/app/audit-log` | `AuditLog` | Admin; the real `audit_log` table (`GET /api/admin/audit-log` + `.../actions`, new this phase). |

## Structure
- `src/main.tsx` — React root, wraps `<App>` in `<BrowserRouter>`, imports `design/global.css`.
- `src/App.tsx` — renders `<AppRoutes>`.
- `src/routes.tsx` — `react-router-dom` route table.
- `src/design/tokens.css` — CSS variables: base surface colors (`--bg: #05060f` dark "AI
  operations room"), the 8 agent identity colors (Supervisor violet `#8B5CF6`, IT cyan
  `#22D3EE`, HR pink `#F472B6`, Action amber `#FBBF24`, Ticketing coral `#FB7185`, Feedback
  green `#34D399`, Knowledge blue `#60A5FA`, Guard red `#F87171`), typography
  (`--font-heading`/`--font-body`/`--font-mono`), spacing/radius/shadow/motion scales, and a
  `[data-reduce-motion="true"]` global override.
- `src/design/global.css` — font imports (`@fontsource`, installed locally, no network font
  loading), base element resets, `.glass-panel` utility class.
- `src/design/motion.ts` — shared Framer Motion variants (`fadeUp`, `fadeIn`, `scaleIn`,
  `staggerContainer`, `slideInRight`) and `prefersReducedMotion()` (reads the same
  `data-reduce-motion` flag `uiStore` sets).
- `src/store/uiStore.ts` (Phase 5) — global `reduceMotion` (persisted, syncs
  `<html data-reduce-motion>`) and `tabVisible` (from `visibilitychange`, read by `Scene`).
- `src/store/authStore.ts` (Phase 5) — JWT + logged-in `User`, persisted to `localStorage`;
  `login`/`logout`/`refreshMe` call the Phase 4 `/api/auth/*` endpoints via `api/client.ts`.
- `src/api/client.ts` / `src/api/types.ts` (Phase 5) — `apiFetch`/`apiGet`/`apiPost`/`apiPatch`
  (attaches the bearer token, normalizes FastAPI error responses, logs out on `401`) and the
  typed response shapes every later page will reuse. `types.ts` grew the full `ChatEvent`
  discriminated union in Phase 9.
- `src/api/sse.ts` (Phase 9) — manual SSE client for `POST /api/chat/stream` (native
  `EventSource` can't do POST + auth headers). Normalizes `\r\n` → `\n` before splitting frames
  — sse-starlette's actual line ending, found the hard way (see `docs/phases/PHASE_09.md`).
- `src/three/Scene.tsx` (Phase 5; `bloom` option added Phase 6) — shared `<Canvas>` wrapper:
  `dpr={[1, 2]}`, `frameloop` switches to `"demand"` when the tab is hidden, base lighting, and
  an opt-in `bloom` prop (`@react-three/postprocessing`'s `EffectComposer`/`Bloom`) for scenes
  worth the extra render pass — the landing hero is the first to use it.
- `src/three/AgentOrb.tsx` (Phase 5) — one agent's glowing sphere in its identity color
  (`AGENT_COLORS`, kept in sync by hand with `tokens.css`'s `--agent-*` values); idle rotation +
  an `active` pulse, both skipped under reduced motion.
- `src/three/DataPulse.tsx` (Phase 5) — a beam with a travelling particle fired by incrementing
  a `trigger` prop; the primitive behind the `handoff` → beam mapping below.
- `src/three/ParticleField.tsx` (Phase 5) — ambient background starfield, one `THREE.Points`
  draw call, hard-capped at 500 particles.
- `src/components/ReduceMotionToggle.tsx` (Phase 5) — the on-screen control for `uiStore`'s
  `reduceMotion` flag.
- `src/components/ui/{Button,Badge,Panel}.tsx` (Phase 5) — hand-rolled UI atoms (no UI kit, no
  Tailwind), styled from the CSS variable tokens.
- `src/components/ui/TextField.tsx` (Phase 7) — hand-rolled labeled input.
- `src/components/Reveal.tsx` (Phase 6) — scroll-triggered fade-up wrapper (`whileInView`,
  once). Renders a plain `<div>` with no Framer Motion component at all under reduced motion —
  see the Phase 6 decision log entry on why this is the pattern to copy, not the conditional-
  prop approach that briefly shipped broken.
- `src/components/RequireAuth.tsx` (Phase 7) — route guard; redirects to `/login` (remembering
  the attempted destination in router state) when `authStore.isAuthenticated` is false. Every
  real dashboard route Phase 8+ adds should wrap in this the same way `/app` does.
- `src/layouts/DashboardLayout.tsx` + `.module.css` (Phase 8) — the persistent `/app/*` shell:
  sidebar (nav + user card), top bar (`ReduceMotionToggle`), `<Outlet>`. Collapses to an
  off-canvas drawer under 860px — the first real `@media` breakpoint in the project, hence the
  first `.module.css` file (CLAUDE.md sanctions "CSS variables + CSS modules"; every other page
  still uses inline styles).
- `src/layouts/navItems.ts` (Phase 8) — the role-aware nav table from
  `docs/00_PROJECT_OVERVIEW.md`'s role list. Every entry's `implemented` flag is `true` as of
  Phase 11 — there is no longer a disabled "Soon" row anywhere in the nav.
- `src/api/sse.ts`'s `streamGetSSE` (Phase 11) — a GET sibling of the Phase 9 `streamSSE`
  (POST-only), for `GET /api/agents/live`'s always-on feed; native `EventSource` still can't
  carry the bearer header even on a GET.
- `src/pages/Landing.tsx` (Phase 6) — the real landing page.
- `src/pages/Login.tsx` (Phase 7) — real login form + demo-account quick-picker, calls
  `authStore.login()`, redirects on success/if-already-authenticated.
- `src/pages/dashboard/Overview.tsx` (Phase 8) — the first real dashboard page and the first use
  of `recharts` (a day-one dependency, unused until now).
- `src/pages/dashboard/Assistant.tsx` (Phase 9) — the real chat UI; see the event mapping below.
- `src/components/chat/AgentActivityPanel.tsx` (Phase 9) — live 3D visualization: all 7
  `AgentOrb`s in a row (tight `1.05` spacing — a wider spacing clipped the two outermost orbs
  outside this panel's narrow frustum, caught via a live screenshot), the in-flight agent's orb
  `active`, a `DataPulse` on each `handoff`, and a scrolling plain-English caption log.
- `src/components/chat/FeedbackWidget.tsx` (Phase 9) — star rating, posts to `POST
  /api/feedback`.
- `src/pages/dashboard/Tickets.tsx` (Phase 10) — role-scoped ticket list with status filter
  chips, a detail side panel with the real event timeline, inline staff status/priority edits.
- `src/pages/dashboard/Approvals.tsx` (Phase 10) — approval list by status, decide
  (approve/reject) via `POST /api/approvals/{id}/decide`.
- `src/pages/dashboard/Team.tsx` (Phase 10) — a manager's direct reports as cards, each showing
  real open-ticket/pending-leave/last-activity signal.
- `src/pages/dashboard/HrInsights.tsx` (Phase 10) — company-wide headcount/leave-balance/
  upcoming-leave stats plus a live pending-leave-request decide list.
- `src/pages/dashboard/KnowledgeBase.tsx` (Phase 10) — search/compare-strategies/article-reader
  over the real RAG knowledge base; the "Compare strategies" view is the same lexical/semantic/
  hybrid comparison the bandit picks between.
- `src/pages/dashboard/ControlRoom.tsx` (Phase 11) — per-agent 24h health cards, an always-on
  live feed over `GET /api/agents/live` (via `streamGetSSE`), and a recent-runs table with a
  Replay panel (`GET /api/runs/{id}/events`).
- `src/pages/dashboard/ReinforcementLab.tsx` (Phase 11) — the LinUCB bandit's real state: per-
  arm pulls/reward, cumulative regret, a reward-over-time `recharts` line chart, context win
  rates.
- `src/pages/dashboard/Evaluation.tsx` (Phase 11) — triggers a real synchronous 70-question
  golden-set run and drills into any past run's full per-question breakdown.
- `src/pages/dashboard/Costs.tsx` (Phase 11) — token/$ spend totals, a daily chart, by-route/
  by-model breakdowns. Its "by route" list keys rows by array index, not the backend's `route`
  value — two distinct backend groups (`NULL` and literal `'OTHER'`) both display as `"OTHER"`,
  a real duplicate-key bug caught via live browser testing (`docs/phases/PHASE_11.md`).
- `src/pages/dashboard/AuditLog.tsx` (Phase 11) — the real `audit_log` table, filterable by
  action.

## Design tokens already decided (ahead of Phase 5, so later phases don't redo this)
Dark background `#05060F`, glassmorphism panels (`.glass-panel`: translucent + blurred + 1px
subtle border + panel shadow), agent colors as above.

## Frontend ↔ event mapping (live as of Phase 9 — see docs/01_ARCHITECTURE.md and
docs/phases/PHASE_09.md)
- `handoff` events → `DataPulse` beams between the two agents' `AgentOrb`s (`AgentActivityPanel`
  increments that beam's `trigger` prop on each event). **Live.**
- Every `AgentOrb` toggles `active` (and its pulse) while that agent has an in-flight
  `agent_event` (`started`/`working`/`retrieving`/`tool_call`) for the current run. **Live.**
- `token` events stream into the assistant message bubble live; the `final` event replaces it
  with the canonical answer + sources + ticket number. **Live.**
- `approval_required` → a visible "waiting on a human" banner; the still-open SSE connection
  delivers `final` automatically once a manager decides elsewhere. **Live** — Phase 10's
  Approvals page (`/app/approvals`) now gives that decision a real in-app UI too.
- `final` + a 1-5 star rating → `FeedbackWidget`, posts to `POST /api/feedback`. **Live.**
- `agent_event` with `status: "retrieving"` highlighting a specific KB chunk (a dedicated
  `KnowledgeCore` visual, not just the caption log) is **not** built — deferred, not required for
  the current demo script.

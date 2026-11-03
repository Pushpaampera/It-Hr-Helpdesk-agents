# 04 — Frontend

Updated through Phase 9.

## Routes (Phase 9 state)
| Path | Page | Notes |
|------|------|-------|
| `/` | `Landing` | The real cinematic landing page: hero (Scene + 7 AgentOrbs + DataPulse + ParticleField, bloom on), "Meet the team", "How it works", closing CTA. |
| `/login` | `Login` | Real email/password form + demo-account quick-picker. Redirects to `/app` (or wherever `RequireAuth` remembered) on success. |
| `/app` (wrapped in `RequireAuth`) | `DashboardLayout` | Sidebar + top bar shell. `index` redirects to `overview`. |
| `/app/overview` | `Overview` | Staff (manager/hr/admin): KPI cards + 30-day runs chart from `/api/analytics/*`. Employee: own open tickets + conversation count. |
| `/app/assistant` | `Assistant` | The real chat UI against the live agent graph (`POST /api/chat/stream`, SSE) — the project's centerpiece. |

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
  `docs/00_PROJECT_OVERVIEW.md`'s role list. Each entry has an `implemented` flag; only
  `Overview` is true so far, everything else renders as a role-filtered, disabled "Soon" row
  until its own phase builds it.
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
  delivers `final` automatically once a manager decides elsewhere. **Live** (no in-app approve
  UI yet — that's Phase 10's "Approvals" page).
- `final` + a 1-5 star rating → `FeedbackWidget`, posts to `POST /api/feedback`. **Live.**
- `agent_event` with `status: "retrieving"` highlighting a specific KB chunk (a dedicated
  `KnowledgeCore` visual, not just the caption log) is **not** built — deferred, not required for
  the current demo script.

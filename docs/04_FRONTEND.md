# 04 — Frontend

Updated through Phase 7.

## Routes (Phase 7 state)
| Path | Page | Notes |
|------|------|-------|
| `/` | `Landing` | The real cinematic landing page: hero (Scene + 7 AgentOrbs + DataPulse + ParticleField, bloom on), "Meet the team", "How it works", closing CTA. |
| `/login` | `Login` | Real email/password form + demo-account quick-picker. Redirects to `/app` (or wherever `RequireAuth` remembered) on success. |
| `/app` (wrapped in `RequireAuth`) | `AppPlaceholder` | Temporary post-login landing; Phase 8 replaces it with the real per-role dashboard shell. |

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
  typed response shapes every later page will reuse.
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
- `src/pages/Landing.tsx` (Phase 6) — the real landing page.
- `src/pages/Login.tsx` (Phase 7) — real login form + demo-account quick-picker, calls
  `authStore.login()`, redirects on success/if-already-authenticated.
- `src/pages/AppPlaceholder.tsx` (Phase 7) — temporary; Phase 8 replaces it.

## Design tokens already decided (ahead of Phase 5, so later phases don't redo this)
Dark background `#05060F`, glassmorphism panels (`.glass-panel`: translucent + blurred + 1px
subtle border + panel shadow), agent colors as above.

## Frontend ↔ event mapping (building blocks exist as of Phase 5; wiring to live SSE events is
Phase 9's job — see `docs/01_ARCHITECTURE.md`)
- `handoff` events → `DataPulse` beams between the two agents' `AgentOrb`s (increment that
  beam's `trigger` prop on each event).
- `agent_event` with `status: "retrieving"` → highlight the relevant `KnowledgeCore` chunk
  (component not yet built — Phase 9).
- `agent_event` with `status: "tool_call"` → the Action Agent's tool card (not yet built).
- `approval_required` → the approval banner/card (not yet built).
- `final` + a 1-5 star rating → a feedback burst (not yet built).
- Every `AgentOrb` toggles its `active` prop (and therefore its pulse) while that agent has an
  in-flight `agent_event` for the current run.

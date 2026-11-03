# Phase 8 — Dashboard shell and Overview

## Scope delivered
1. **`src/layouts/DashboardLayout.tsx` + `DashboardLayout.module.css`** — the persistent
   dashboard shell every `/app/*` page renders inside from now on: a sidebar (product name,
   role-filtered nav, user card with avatar/name/role/sign-out) and a content area with a top
   bar (`ReduceMotionToggle`) over a routed `<Outlet>`. Collapses to an off-canvas drawer with a
   backdrop below 860px — the first page needing a real `@media` breakpoint, which inline styles
   can't express, so this is the first `.module.css` file in the project (sanctioned by
   CLAUDE.md's "CSS variables + CSS modules"); every other page still uses plain inline styles.
2. **`src/layouts/navItems.ts`** — the role-aware nav table from
   `docs/00_PROJECT_OVERVIEW.md`'s role list. Only `Overview` is `implemented: true` this phase;
   every other entry (AI Assistant, Tickets, Approvals, Team, HR Insights, Policy Knowledge
   Base, Control Room, Reinforcement Lab, Evaluation, Costs, Audit Log) renders as a disabled
   "Soon" row, filtered to the roles that will eventually see it, so the shell shows its real
   intended shape without inventing page content ahead of its own phase.
3. **`src/components/RequireAuth.tsx`** (Phase 7) is now actually exercised by a real nested
   route tree: `/app` → `DashboardLayout` → `index` redirects to `overview`.
4. **`src/pages/dashboard/Overview.tsx`** — the first real dashboard page, and the first use of
   `recharts` (listed in the project's tech stack since Phase 1, unused until now):
   - **Staff view** (manager/hr/admin): KPI cards from `GET /api/analytics/kpis` (total runs,
     resolved/escalation rate, avg rating, open tickets, pending approvals) and a 30-day runs
     `AreaChart` from `GET /api/analytics/timeseries`.
   - **Employee view**: their own open-ticket count and conversation count (`GET /api/tickets`,
     `GET /api/conversations` — both already role-scoped server-side to "own data only" since
     Phase 4), and a list of their open tickets.
   - The branch is literally `STAFF_ROLES.includes(user.role)` — no new backend logic needed;
     Phase 4's existing role gates (`analytics` routes 403 for employee) are what make this
     split necessary in the first place.
5. **`src/routes.tsx`** — updated nested route tree; `src/pages/AppPlaceholder.tsx` deleted
   (fully superseded).
6. **`src/api/types.ts`** — added `Kpis`, `TimeseriesPoint`, `TicketSummary`,
   `ConversationSummary`, mirroring the backend response shapes used by Overview.

## Files touched
- New: `src/layouts/{DashboardLayout.tsx,DashboardLayout.module.css,navItems.ts}`,
  `src/pages/dashboard/Overview.tsx`.
- Modified: `src/routes.tsx`, `src/api/types.ts`.
- Deleted: `src/pages/AppPlaceholder.tsx` (Phase 7's stand-in, fully superseded).

## Verification
- `npx tsc -b --noEmit` and `npm run build`: both succeed (one real type error caught and fixed
  along the way — `navItems.ts` typed each nav item's `icon` as a narrowed `ComponentType<{size}>`,
  which doesn't structurally match lucide-react's actual `LucideIcon` type; fixed by importing
  `LucideIcon` directly instead of hand-rolling a narrower prop type).
- Full live end-to-end test (real backend + frontend dev server, Chrome + playwright-core, same
  ad hoc setup as Phases 6-7):
  - Logged in as `alex.admin@acme.test`: lands on `/app/overview`, sees the full admin nav set
    (Overview, AI Assistant, Tickets, Approvals, Policy Knowledge Base, Control Room,
    Reinforcement Lab, Evaluation, Costs, Audit Log — correctly *not* HR Insights or Team), real
    KPI numbers and a real 30-day chart from the live seeded data.
  - Logged in as `emma.employee@acme.test`: sees only Overview/AI Assistant/Tickets in nav, a
    personalized "Welcome back, Emma" heading, and her own real open-ticket list (not another
    employee's).
  - Logged in as `mark.manager@acme.test`: sees Overview/AI Assistant/Tickets/Approvals/Team —
    confirms the per-role filtering isn't just hardcoded to one role.
  - Clicking a disabled "Soon" nav item does nothing (URL unchanged) — confirmed programmatically,
    not just visually.
  - Mobile viewport (420px): sidebar collapses to a hamburger-triggered off-canvas drawer with a
    backdrop; confirmed both closed and open states render correctly.
  - Reduce-motion toggled on (as `hannah.hr@acme.test`): dashboard renders fully and correctly,
    HR-specific nav (HR Insights, Policy Knowledge Base) correct.
  - Console: zero app-level errors in every case; only the pre-existing favicon 404.

## Known issues / deferred
- The recharts `AreaChart` uses literal hex color strings (`#8b5cf6`, `#6b7097`) rather than
  CSS `var()` references, since SVG gradient stops need concrete values — same duplication
  tradeoff already noted for `AgentOrb`'s `AGENT_COLORS` (`docs/phases/PHASE_05.md`).
- Every "Soon" nav item is a real, named placeholder for its own future phase — not a TODO, a
  deliberate structural preview. Phases 9-11 replace them one at a time; this file doesn't need
  updating as that happens (each phase's own doc covers it).

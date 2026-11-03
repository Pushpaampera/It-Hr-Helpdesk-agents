# Phase 6 — Landing page

## Scope delivered
1. **`src/pages/Landing.tsx`** — the real cinematic landing page, replacing `PlaceholderHome`
   outright (deleted). Composed entirely from Phase 5's building blocks:
   - A full-viewport hero: `Scene` (with its new `bloom` option — see below) running
     `ParticleField` plus all 7 `AgentOrb`s arranged in a ring behind the headline, two
     `DataPulse` beams firing on a timer (paused under reduced motion), a radial scrim between
     the canvas and the text so the headline stays legible regardless of orb placement, a
     staggered Framer Motion entrance (`fadeUp`/`staggerContainer` from `design/motion.ts`), and
     a CTA into `/login`.
   - "Meet the team": the 7 agents (name + job, mirroring `backend/app/agents/events.py`'s
     `FRIENDLY_NAMES`/`AGENT_JOBS`) as scroll-revealed `Panel` cards.
   - "How it works": 4 steps (ask → routed → grounded answer or real action → learns over time),
     same card treatment, `lucide-react` icons.
   - A closing CTA section and footer.
   - A sticky header with the product name, `ReduceMotionToggle`, and a "Sign in" button.
2. **`src/components/Reveal.tsx`** — scroll-triggered fade-up wrapper (`whileInView`, once),
   reused for every section heading and every grid card. Fully skips animation (plain `<div>`,
   no Framer Motion component at all) under reduced motion rather than just shortening it.
3. **`src/pages/LoginPlaceholder.tsx`** — a minimal stand-in for Phase 7's real login page, so
   the landing page's CTA has somewhere real to navigate instead of a 404. Phase 7 replaces this
   file entirely.
4. **`src/routes.tsx`** — `/` → `Landing`, `/login` → `LoginPlaceholder`.
5. **`src/three/Scene.tsx`** — added an optional `bloom` prop (`@react-three/postprocessing`'s
   `EffectComposer`/`Bloom`, already a Phase 1 dependency, unused until now) for a soft glow on
   emissive materials. Off by default (one more render pass); the landing hero is the first
   scene to opt in.

## A real bug found and fixed during this phase's own verification
The first hero implementation conditionally passed `undefined` for `initial`/`animate`/
`variants` *props* on `motion.*` components to "turn off" animation under reduced motion, while
child `motion.*` elements kept an unconditional `variants={fadeUp}`. Screenshotting the page
with Reduce-motion toggled on showed the entire hero headline, subtext, and CTA button were
invisible — Framer Motion children that only receive a `variants` map, with no live `initial`/
`animate` state propagating from a parent, never resolve off their `"hidden"` starting style.
**Fix**: stopped trying to neuter motion props conditionally and instead branch the render
itself — a plain `<div>` tree under reduced motion, a `motion.*` tree with real "hidden"/
"visible" variants otherwise (see `Landing.tsx`'s hero block). The two scroll-revealed grids
(team, steps) were simplified the same way by reusing `Reveal` per card instead of a parent-
`staggerContainer`/child-`variants` pair, which removes this entire bug class rather than
patching each instance. **This was caught, not assumed fixed** — see verification below.

## Files touched
- New: `src/pages/Landing.tsx`, `src/pages/LoginPlaceholder.tsx`, `src/components/Reveal.tsx`.
- Modified: `src/routes.tsx`, `src/three/Scene.tsx` (added `bloom`).
- Deleted: `src/pages/PlaceholderHome.tsx` (Phase 5's showcase page, fully superseded).

## Verification
- `npx tsc -b --noEmit`: no type errors.
- `npm run build`: succeeds (same expected "three.js chunk is large" bundler note as Phase 5).
- **This phase had a browser tool available** (Chrome + `playwright-core`, installed ad hoc into
  the session's scratchpad directory for this verification only — not added to
  `package.json`), closing the gap Phase 5 flagged. Screenshotted the hero, team, steps, and
  login placeholder sections, and toggled Reduce-motion live via the on-page control, for both
  states:
  - Default: hero renders legibly over the orb constellation, staggered entrance works, the
    "scroll to explore" chevron bounces, team/steps cards reveal on scroll.
  - Reduced motion on: chevron bounce disappears, orb idle rotation and particle drift stop
    (`AgentOrb`/`ParticleField` already respected this from Phase 5), and — after the fix above
    — all text content is fully visible immediately with no animation.
  - Console: zero errors from the app itself; the one logged 404 is the browser's default
    `/favicon.ico` request (no `<link rel="icon">` was ever added, pre-existing since Phase 1,
    unrelated to this phase).
- Did **not** re-verify actual frame rate under load (no FPS-counter tooling wired up this
  phase) — the particle/orb counts are unchanged from Phase 5's already-capped primitives, so
  this is a reasonable, not a blind, inference.

## Known issues / deferred
- `LoginPlaceholder.tsx` is intentionally temporary; Phase 7 replaces it.
- The production JS bundle crossed Vite's 500kB chunk-size warning threshold (now ~1.1MB raw,
  330kB gzipped) now that `@react-three/postprocessing` is in the bundle. Not addressed this
  phase — a single-page local demo doesn't need code-splitting yet, and premature splitting
  would add complexity for no user-facing benefit until there are multiple real routes to split
  across (Phase 8+).
- The ad hoc `playwright-core` install used for this phase's visual verification lives only in
  the session's scratchpad directory, not in `frontend/package.json` — it was deliberately kept
  out of the project's own dependency tree since it's a verification tool, not a runtime or
  build dependency.

# Phase 5 — Frontend design system and 3D building blocks

## Scope delivered
Phase 1 already shipped the core design tokens (`src/design/tokens.css`), font imports and base
resets (`src/design/global.css`), and shared Framer Motion variants (`src/design/motion.ts`), so
Phase 5's real work is everything later pages (Phase 6+) will assemble from:

1. **Zustand stores** (cross-component state, per CLAUDE.md's coding conventions):
   - `src/store/uiStore.ts` — the global "Reduce motion" flag (persisted to `localStorage`,
     falls back to `prefers-reduced-motion`, and mirrors itself onto
     `<html data-reduce-motion>` so `src/design/motion.ts`'s existing `prefersReducedMotion()`
     and the global CSS override in `tokens.css` both respect it) and `tabVisible` (tracks
     `visibilitychange`, read by `Scene` to pause rendering when the tab is backgrounded).
   - `src/store/authStore.ts` — JWT + logged-in user, persisted to `localStorage` (`login`,
     `logout`, `refreshMe`). Phase 7 (Login page) is the first page that actually calls `login`,
     but it needs somewhere to read/write the session from, and that's a store concern per the
     project's own conventions, not a page concern.
2. **API client**: `src/api/client.ts` (`apiFetch`/`apiGet`/`apiPost`/`apiPatch` — attaches the
   bearer token from `authStore`, normalizes FastAPI's `{detail: "..."}` error shape, logs the
   caller out on a `401`) and `src/api/types.ts` (`User`, `LoginResponse`, `HealthResponse`,
   mirroring the Pydantic response models in `docs/03_BACKEND.md`).
3. **3D building blocks** (`src/three/`), each respecting the 60fps hard constraints from
   CLAUDE.md:
   - `Scene.tsx` — the shared `<Canvas>` wrapper: `dpr={[1, 2]}` (capped device pixel ratio),
     `frameloop` switches from `"always"` to `"demand"` when `uiStore.tabVisible` is false
     (pauses rendering work when the tab is backgrounded), base lighting.
   - `AgentOrb.tsx` — one agent's 3D presence: a glowing sphere in that agent's identity color
     (`AGENT_COLORS`, kept in sync by hand with the `--agent-*` tokens in `tokens.css` since
     Three.js materials need real color values, not CSS variable references). Idle rotation and
     an `active` pulse, both skipped when `reduceMotion` is set.
   - `DataPulse.tsx` — a beam between two points with a travelling particle fired by
     incrementing a `trigger` prop — the primitive behind `docs/01_ARCHITECTURE.md`'s "handoff
     events drive DataPulse beams between AgentOrbs" mapping. Under reduced motion the pulse
     still happens (it's a real event worth surfacing) but resolves instantly instead of
     animating a travel.
   - `ParticleField.tsx` — an ambient background starfield as a single `THREE.Points` draw call
     (not one mesh per particle), count hard-capped at 500 — "instancing, capped particle
     counts" applied to the simplest case that needed it this phase.
4. **UI atoms** (`src/components/ui/`): `Button.tsx` (primary/ghost/danger variants),
   `Badge.tsx` (status pill, tone-colored from the semantic tokens), `Panel.tsx` (typed wrapper
   around the existing `.glass-panel` utility class). No UI kit, no Tailwind — plain CSS variable
   styling, per CLAUDE.md.
5. **`src/components/ReduceMotionToggle.tsx`** — the one on-screen control for the global
   Reduce-motion flag, wired to `uiStore`.
6. **`PlaceholderHome.tsx` extended** (still temporary — Phase 6 replaces it outright) to
   exercise every one of the above together: live backend health check via the new `apiFetch`,
   the UI atoms and agent color swatches, and a `Scene` with 5 `AgentOrb`s, 2 `DataPulse` beams
   firing every 2.2s, and a `ParticleField` background, plus the `ReduceMotionToggle`. This is
   how Phase 5 is actually exercised end to end before any real page depends on it.

## Files touched
- New: `src/store/{uiStore,authStore}.ts`, `src/api/{client,types}.ts`,
  `src/three/{Scene,AgentOrb,DataPulse,ParticleField}.tsx`,
  `src/components/{ReduceMotionToggle}.tsx`, `src/components/ui/{Button,Badge,Panel}.tsx`.
- Modified: `src/pages/PlaceholderHome.tsx` (now a Phase 5 showcase, still temporary).
- No new dependencies — `zustand`, `@react-three/fiber`, `three`, `framer-motion` were already
  in `package.json` from the Phase 1 scaffold.

## Verification
- `npx tsc -b --noEmit`: no type errors.
- `npm run build`: succeeds (`dist/` produced; only warning is the expected "three.js makes a
  large chunk" bundler note — no code-splitting work is warranted yet since no real pages exist
  past the placeholder).
- `npm run dev`: boots cleanly on port 5173, Vite's dependency optimizer picked up
  `@react-three/fiber`/`three`/`zustand`/`zustand/middleware` with no transform errors.
- Live full-stack check: started the backend (`poetry run uvicorn app.main:app --port 8000` —
  port 8000 was actually free this session, unlike the note in `docs/phases/PHASE_04.md`/
  `HANDOFF.md`; that note stands for whenever it *is* occupied) and confirmed `GET
  http://localhost:5173/api/health` through the Vite proxy returns the real healthy payload,
  i.e. the extended `PlaceholderHome` would render live `"connected"`/`"enabled"` status rather
  than its error-fallback text.
- **Not verified**: actual visual rendering, frame rate, and the Reduce-motion toggle's visible
  effect in a real browser — no browser/screenshot tool is available in this session. The
  `tsc`/`build`/dev-server checks above confirm the code is correct and wired together, but the
  operator should open `http://localhost:5173/` themselves to confirm the 3D scene actually
  looks right and the "Reduce motion" button visibly freezes the orb rotation and particle
  drift.

## Known issues / deferred
- `AGENT_COLORS` in `src/three/AgentOrb.tsx` duplicates the `--agent-*` values from
  `src/design/tokens.css` by hand, since Three.js materials need real color values. If the CSS
  tokens are ever retuned, this map needs updating alongside them — noted here so Phase 6+
  doesn't rediscover the duplication as a bug.
- `PlaceholderHome.tsx` remains the only route; Phase 6 replaces it with the real landing page
  and this file goes away entirely.

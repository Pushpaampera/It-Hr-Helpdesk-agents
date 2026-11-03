# Phase 7 — Login page

## Scope delivered
1. **`src/pages/Login.tsx`** — the real login page, replacing `LoginPlaceholder.tsx` (deleted):
   - A real email/password form posting through `useAuthStore().login()` (built in Phase 5,
     exercised for the first time here), with loading state and an inline error message on
     failure.
   - A demo-account quick-picker: one button per seeded demo account
     (`emma.employee@acme.test`/`mark.manager@acme.test`/`hannah.hr@acme.test`/
     `alex.admin@acme.test`, all `Demo@1234`), each logging in with one click.
   - Redirects to wherever the visitor was headed (`location.state.from`, set by `RequireAuth`)
     or `/app` by default, both on successful login and immediately on mount if already
     authenticated.
   - Follows the reduced-motion render-branching rule from `docs/06_DECISIONS.md` (Phase 6's
     finding): `reduceMotion ? content : <motion.div variants={fadeUp}>{content}</motion.div>`,
     not conditional motion props.
2. **`src/components/RequireAuth.tsx`** — a route guard (`react-router-dom`'s `<Outlet>`
   pattern) that redirects to `/login` (remembering the attempted destination) when there's no
   authenticated session. Wraps `/app` now; every real dashboard route Phase 8+ adds reuses it.
3. **`src/pages/AppPlaceholder.tsx`** — temporary post-login landing page (Phase 8 replaces it
   with the real dashboard shell). Confirms the session is real (name/email/role badge) and
   shows which page this role would actually land on, per `docs/00_PROJECT_OVERVIEW.md`'s
   "lands on" column (employee → AI Assistant, manager → Overview, hr → HR Insights, admin →
   Control Room) — useful both as a sanity check and as a spec reference for Phase 8.
4. **`src/components/ui/TextField.tsx`** — hand-rolled labeled input (no UI kit), reused for
   email/password.
5. **`src/App.tsx`** — calls `useAuthStore().refreshMe()` once on mount, so a persisted-but-
   expired/revoked token gets logged out automatically on page load rather than silently acting
   authenticated until the first API call fails.
6. **`src/routes.tsx`** — `/login` → `Login`; `/app` wrapped in `<RequireAuth>` → `AppPlaceholder`.

## Files touched
- New: `src/pages/{Login,AppPlaceholder}.tsx`, `src/components/RequireAuth.tsx`,
  `src/components/ui/TextField.tsx`.
- Modified: `src/routes.tsx`, `src/App.tsx`.
- Deleted: `src/pages/LoginPlaceholder.tsx` (Phase 6's stand-in, fully superseded).

## Verification
- `npx tsc -b --noEmit` and `npm run build`: both succeed.
- Full end-to-end live test (frontend `npm run dev` + real backend `poetry run uvicorn` on port
  8000, both reachable through the Vite proxy; Chrome + `playwright-core`, the same ad hoc setup
  from Phase 6, scripted through the actual flow — not just screenshotted statically):
  - Visiting `/app` while logged out redirects to `/login` (confirmed via `RequireAuth`).
  - Manual form login as `emma.employee@acme.test` succeeds against the real `POST
    /api/auth/login`, redirects to `/app`, and shows the correct name/email/role/"AI Assistant"
    landing text.
  - Sign-out returns to `/`; the demo quick-picker (`Alex — Admin`) logs in with one click and
    shows "Control Room" as its landing page — confirming the per-role mapping is wired
    correctly, not just hardcoded to one role.
  - A wrong password shows "Invalid email or password" inline (the backend's real `401` message,
    surfaced through `apiFetch`'s error normalization) without crashing or losing the form state.
  - Reduce-motion toggled on the login page: form renders fully and immediately, no invisible-
    content regression (the exact bug class Phase 6 found and fixed).
  - Console: zero app-level errors in the success paths; the expected `401` "Failed to load
    resource" browser log appears only for the deliberate wrong-password test, which is correct
    behavior, not a bug.

## Known issues / deferred
- `AppPlaceholder.tsx` is intentionally temporary; Phase 8 replaces it with the real per-role
  dashboard shell and pages.
- The "lands on" destinations are currently all the same `/app` route with different display
  text — Phase 8 is where they become real, distinct routes/pages.

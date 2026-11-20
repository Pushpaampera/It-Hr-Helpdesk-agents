# PROGRESS.md

## LATEST (2026-11-19, night): small readable demo data (`poetry run reset-demo` before demos)
6 people (Emma is the main demo employee), ~27 chats, 11 tickets — see docs/07_CHANGELOG.md.
Start the backend with `poetry run dev`. Not yet committed.
Later the same night: emails are plain (no card / button) and decision emails list the full
request + decision details; access-request examples are Jira / Zendesk / Power BI, never "Finance
System" (migration 0011). Another session is working on password reset in parallel.

## 2026-11-19: manager role replaced by IT support (IT tickets + own self-service)
One IT support login, Ivan IT (ivan.it@acme.test): Overview + Tickets for IT work, plus Ask the
Assistant + Talk to HR for their own needs (no approvals); works IT
tickets the AI couldn't solve (auto-assigned + bell, take / ask employee / ask admin / resolve with
a note). Admin approves access requests. Demo data: `poetry run reset-demo`.
Migrations 0007 + 0008 applied to the dev DB (dumps in backups/). pytest 81/81, tsc clean.
Not yet committed. Next planned: real password reset / forgot-password flow.

## LATEST (2026-11-18, later): Campus Hire navy + magenta colours, new landing page + 3D orbit
Whole app recoloured to match the Ampera Campus Hire portal (navy sidebar/banners, magenta
actions); landing page redesigned full width, with a 3D orbit animation in the hero (src/three/HeroOrbit.tsx); Accessibility button is
an icon-only wheelchair button. See docs/07_CHANGELOG.md. Not yet committed.

## LATEST (2026-11-18): Light / Dark / Match-my-device added; settings saved per signed-in person
UI only. See `docs/07_CHANGELOG.md` (2026-11-18). Stage 1 (below) is committed (`eb5c89d`); this
theme work (appearance choice + official Ampera colours/logo, no non-brand hues) sits on top of it.

## LATEST (2026-11-17): Stage 1 done — Ampera brand + plain UI + accessibility
UI only; no backend or feature changes. See `docs/07_CHANGELOG.md` (2026-11-17). Next stage (not
started): new HR features, to be planned with the operator first.

## RESUME HERE (2026-11-04, bright agent-world redesign is committed; now closing real brief gaps)
- **Correction to this file's own stale claim**: the text below used to say the redesign
  (Phases 0-4) was "not yet committed" — that was wrong by the time this entry was written. It
  landed in `63682da` (6-step overhaul commit) and a follow-up `66144e3` (back-arrow nav). `git
  status`/`git log` are the source of truth, not this file's own prose — always verify against
  them before trusting a "not committed yet" claim here.
- **Re-checked the operator's original full brief against the actual running app** (not just
  against what this file claimed was done) and found several real, verifiable gaps the prior
  "DONE end to end" phase write-ups missed:
  - AI Assistant answers were plain `white-space: pre-wrap` text, not real Markdown — **fixed**:
    `react-markdown`+`remark-gfm` now render every answer (`Assistant.tsx`'s `MessageBubble`).
  - **Found and fixed the exact "doubled numbering" bug the brief named**: seeded KB article
    bodies are already hand-written as numbered steps ("1. ...\n2. ... wraps onto an indented
    continuation line\n3. ..."); `knowledge_agent.py`'s `_format_steps` blindly re-numbered every
    physical line on top of that, producing literal "1. 1.", "2. 2." text and splitting wrapped
    continuation lines into their own bogus un-numbered items. Rewrote it to merge continuation
    lines back into their step and strip any pre-existing "N. " marker before re-numbering once.
    Verified against the real "VPN Error 619" article's actual stored text.
  - Chat answers listed every retrieved chunk (up to 5) as a source chip regardless of relevance
    — **fixed**: `answer_from_knowledge` now only returns the 1-2 chunks actually cited in the
    answer (same "is the second chunk close enough in score" check `_mock_answer` already used
    to decide whether to cite it), not the full top-5 retrieval set.
  - No routing strip and no agent *role* shown on answers — **fixed**: `Assistant.tsx` now tracks
    the real per-turn agent chain from `agent_event`/`handoff` SSE events and renders it above
    the answer (e.g. "Gus (Privacy) → Sage (Router)"), plus the answering agent's name *and role*
    ("Iris, IT Support" not just "Iris"). The confirm-resolution gate message (before "Yes"/"No")
    previously showed no agent identity at all since `confirmation_required` events carry no
    `route` field — fixed by tracking the last specialist agent seen in the stream and attaching
    it to that message too.
  - All verified live end to end (Chrome + playwright-core): a real VPN-619 IT question (numbered
    steps, 1 source chip, routing strip, "Iris, IT Support" label) and a real parental-leave HR
    question through the full confirm-resolution "Yes" resume path (2 near-equal-score source
    chips, feedback stars on the final resolved message) — zero console errors both times.
    `poetry run pytest -q` 25/25, `npx tsc -b --noEmit` clean.
- **Still open from the operator's original brief, not yet re-verified or fixed this pass**
  (found by reading the brief against the code, not assumed from old phase write-ups — treat
  prior "DONE end to end" claims for these areas as unverified until re-checked):
  - 30-real-question answer-quality test pass + written report — never actually run.
  - Agent Workroom's exact per-state visuals from the brief (waiting = dimmed + pulsing ring +
    hourglass + "waiting for X" label; blocked = red shield pulse) — `AgentMascot`'s state
    machine exists (idle/waving/thinking/working/success/blocked) but hasn't been checked
    against these exact visual specifics live.
  - Robots were built procedurally (brief's explicit fallback-if-cannot-download clause), not
    from `RobotExpressive.glb`/a CC0 pack — acceptable per the brief's own wording, not a gap,
    but noting it since no actual download attempt is on record.
  - Landing page's "camera moves from desk to desk on scroll" — already disclosed as
    intentionally simplified to a fixed hero + separate scrolled "meet the team" grid (see Phase
    1 below); still true, not revisited this pass.
- If resuming: don't re-trust old "done" labels at face value for chat/KB-answer behavior —
  re-verify live, the same way this pass did, before building on top of them.
- **Also found and fixed, same pass**: Landing's headline card was still covering the robots in
  the real running app — the operator's exact original complaint ("the headline card covers the
  robots… the agent world must be the first thing visitors see, large and unblocked"), despite
  Phase 1 below claiming this was handled. Root cause: `Landing.tsx`'s hero content wrapper used
  `bottom: "var(--space-10)"` to pin the card near the bottom, but `tokens.css` only defines
  spacing tokens up to `--space-8` (64px) — `--space-10` resolves to nothing, so the browser
  dropped the `bottom` offset entirely and the "compact glass strip" fell back to its static
  position near the top of the section, overlapping Sage's core robot exactly like the original
  centered-card bug. Fixed by using the real `--space-8` token; the strip is now genuinely a
  compact, non-covering bar at the bottom, robots fully visible above it in both normal and
  Reduce-motion states — re-screenshotted to confirm.
- **Also fixed, same pass, operator-reported**: the agent-to-agent connection lines on the
  Landing hero were nearly invisible against the light background — `DataPulse.tsx`'s beam was a
  raw WebGL `<line>` (1px regardless of any `linewidth` setting, a well-known three.js
  limitation) at 0.25 opacity, which reads as a near-white hairline against the new light theme.
  Rewrote it using drei's `<Line>` (real pixel width) as two passes — a soft wide glow underneath
  a brighter core — in each agent's own vivid color, clearly visible now. Also added an `ambient`
  prop: every desk's beam now loops a continuously-traveling small cube independent of the
  `trigger`-driven handoff pulse (phase-offset per desk so they don't all move in lockstep),
  wired on for Landing's desk connections so the whole scene has constant motion, not just
  whichever desk is the current "active" one — addresses the operator's "add some moving
  objects... realistic AI world" ask without changing `DataPulse`'s props for its other callers
  (`AgentActivityPanel.tsx`'s workroom beam keeps its old single-pulse-per-handoff behavior,
  `ambient` defaults to off). Verified live: zero console errors on Landing, Overview, and the AI
  Assistant workroom (all three use the shared component).

## RESUME HERE (pre-redesign state, still accurate for everything below)
- **All 12 planned phases are DONE** (Phase 10B explicitly skipped by operator instruction,
  2026-11-03). Since Phase 12 closed out the original checklist, the operator has been giving
  **live, direct UX/rebrand feedback on the running app**, worked on in real time rather than as
  numbered phases — see "Post-Phase-12 work" below. Treat this as an ongoing, feature-complete
  product being iterated on, not a finished/frozen build.
- Last updated: 2026-11-04 (6-step overhaul: animation, mascot state machine, confirm-before-
  ticket chatbot flow, dashboard redesign, approvals safety, plain-English UI — see "6-step
  overhaul" below).
- Next step: none standing as a plan — this is now reactive, operator-directed work. If
  resuming, verify current state first (`poetry run pytest -q`, `npx tsc -b --noEmit`, a quick
  live login as each demo role) before assuming anything in this file is current, then check with
  the operator for what's next. **Update this file and `docs/07_CHANGELOG.md` in the same step
  as any further change** — a run of 3 commits after Phase 12 landed without doing this, caught
  when the operator asked "are you updating everything?"; don't repeat that gap.
- Blocker/dependency: none. `.env` unchanged, `LLM_MOCK_MODE=true` confirmed still set — Step 3's
  chatbot answer-quality work was done entirely in mock-mode synthesis, not real API keys.
- Backend tests: `poetry run pytest -q` → **25/25 passed** (the one previously-known intermittent
  failure, `test_e_unanswerable_question_creates_ticket`, no longer exists in its old form — it
  was rewritten for the new multi-turn confirm-before-ticket flow and is green; see below). Two
  new migrations landed: `0002_confirmation_status.sql` (new `agent_runs.status` value,
  `'awaiting_user_confirmation'`), `0003_leave_request_undo.sql` (`decided_at` column on
  `leave_requests`, needed for the undo-window check). Run `poetry run migrate` after pulling.

## Bright agent-world redesign (2026-11-04, operator-directed, in progress)
Full brief: bright/colorful "AI agent world" look (no black/navy/dark-green anywhere), a real
SVG logo replacing the plain underlined text, 7 visually distinct procedural robots (one per
agent, not one robot recolored), and the same treatment applied to every page. Working phase by
phase in the operator's given order; checked live in a browser after each phase (screenshots,
zero console errors) before moving on, per HANDOFF.md's established verification pattern.

**Phase 0 — Colours + logo — DONE, verified live:**
- `src/design/tokens.css` rewritten: light lavender/white gradient background, frosted-glass
  panels, 7 vivid agent colors (violet/sky-blue/pink/orange/teal/yellow/coral), `color-scheme:
  light`. Old dark theme (`#0a0a0c` bg, muted agent colors) fully replaced.
- **New `src/design/agents.ts`**: single source of truth for all 7 agents' name/role/color/
  accent/robot-shape/sample-line, keyed by the real backend route key (`supervisor`, `it_support`,
  `hr_policy`, `action`, `ticketing`, `feedback`, `guard`). Backend agent keys map 1:1 onto the
  brief's 7 named characters (Sage/Iris/Hana/Atlas/Tess/Finn/Gus) — no renaming needed.
  `src/three/AgentOrb.tsx` now imports its color map from here instead of hand-duplicating hex
  values (HANDOFF.md's "Known issues" flagged this duplication — not fully eliminated yet, see
  below, but reduced by one file).
- **New `src/components/ui/Logo.tsx` (+`.module.css`)**: SVG mark (gradient violet→sky-blue core
  + 3 orbiting dots in the other agent colors) + "Ampera" wordmark in Plus Jakarta Sans (new
  `@fontsource/plus-jakarta-sans` dependency) + a "HelpDesk" pill badge. No underline. Replaces
  the old `<img src={amperaLogo}>` + plain text everywhere it appeared (`DashboardLayout.tsx`,
  `Landing.tsx`, `Login.tsx`); `src/assets/ampera-logo.png` is now unused (not yet deleted — still
  referenced by nothing, safe to remove in a later cleanup pass). Also the new favicon
  (`public/favicon.svg`, wired in `index.html`) — the project never had one before (HANDOFF.md's
  "only logged error is favicon 404" is now stale, worth re-checking next phase).
- `src/three/RoboCompanion.tsx` gained a `kind` prop (`RobotKind`, 7 values) driving different
  head geometry + one signature accessory mesh per kind (headset/clipboard/tool-arm/ticket-badge/
  star/shield), so the 7 agents are visually distinct robots, not one robot recolored. Same state
  machine (idle/waving/thinking/working/success/blocked) as before, unchanged. `AgentMascot.tsx`
  now resolves an agent's full identity from `agents.ts` instead of its own hand-rolled color map.
- **New `src/three/AgentDesk.tsx`**: a reusable "hex platform + robot + floating artifact icon +
  optional speech bubble" unit, built for the Landing hero and meant to be reused on the AI
  Assistant workroom (Phase 2) and Overview (Phase 3) so the agent world reads as one consistent
  place. Artifact icon shape also varies per agent (gear/document/ticket-card/star/shield/core).
- `src/three/Scene.tsx`: brighter ambient light + new violet point-light color (was tuned for a
  dark backdrop).
- **Environment fix, not cosmetic**: `vite.config.ts`'s backend proxy target is now
  `` `http://localhost:${process.env.BACKEND_PORT ?? 8000}` `` instead of a hardcoded 8000 — this
  sandbox had an unrelated project's processes already bound to 8000/5173, matching HANDOFF.md's
  documented "port 8000 occupied" quirk exactly; `BACKEND_PORT=8099 npm run dev` now works around
  it without editing the file. Backend's own port is already configurable via `.env`'s `APP_PORT`.

**Phase 1 — Landing page — DONE, verified live (screenshots, zero console errors, both normal and
Reduce-motion states):**
- Full hero rebuild in `src/pages/Landing.tsx`: a glass pill navbar (new logo + Reduce-motion +
  Sign in), a 3D "agent world" scene (Sage's glowing violet core + the other 6 agents' hex desks
  arranged in a ring, `AgentDesk` instances, constant data-stream lines from the core to every
  desk with a traveling cube pulse on the currently "active" desk, cycling every ~2.4s, with a
  speech bubble from the active agent), and a frosted-glass hero card (headline/subtext/two CTAs:
  "Enter Ampera HelpDesk" / "Watch agents work", the latter scrolling to `#how-it-works`) —
  replacing the old flat-colored-orb scene + full-screen dark radial scrim.
- "Meet the team" section: the 7 flat colored circles are now real small `AgentMascot` 3D robots
  (each agent's actual shape/color), in glass cards on the new light background.
- "How it works" section: unchanged content, automatically picked up the new light glass-panel
  look via `tokens.css`/`global.css` (no per-card edits needed — confirms the token-level change
  is doing its job).
- `src/three/DataPulse.tsx`: particle changed from a sphere to a small rotated cube ("small cubes
  flowing between desks" per the brief); this is shared by every future page that uses it.
- **One known simplification from the literal brief**, disclosed rather than silently done: "on
  scroll, the camera moves from desk to desk with a short explanation card for each agent" was
  implemented as the hero's fixed agent-world scene + a separate scrolled-to "Meet the team" grid
  of real mini 3D robot cards, not a single continuous canvas with an animated scroll-driven
  camera dolly. A true scroll-rig camera inside one shared Canvas is meaningfully riskier
  (smoothness, reduced-motion interaction, perf) for a live-demo app that must never fail on
  stage — flagged for the operator to confirm is acceptable or to request as a follow-up.
- Verified: `npx tsc -b --noEmit` clean; live Chrome+playwright-core screenshots of the hero (both
  Reduce-motion states), "Meet the team", "How it works"; zero console errors; logged in as Emma
  and loaded Overview + AI Assistant afterward to confirm the `AgentOrb`/`agents.ts` refactor
  didn't break anything downstream (zero console errors there either) — those two pages are
  still the **old dark-panel look**, correctly deferred to Phases 2/3 below, not yet touched.
- **Confirmed live** (not yet fixed, in scope for the Overview phase next): Emma's Overview shows
  "Open tickets: 64" and the same "bonus wrongly calculated" ticket repeated 5+ times
  (`TCK-1259`-`TCK-1263`, identical text) — exactly the test-data bug the operator's brief called
  out. Root cause not yet investigated (likely repeated `poetry run seed`/eval runs without a
  reset) — next phase's job.

**Phase 2 — AI Assistant "Agent Workroom" — DONE, verified live (zero console errors, two real
multi-turn conversations driven end to end through the real backend in mock mode):**
- `src/components/chat/AgentActivityPanel.tsx` fully rewritten: all 7 `AgentDesk`s always visible
  in a small 3D "workroom" (Sage's desk at the front, the other 6 behind in two rows of 3), driven
  by a new `agentStates: Partial<Record<AgentKey, {working, done, bubble}>>` map instead of the
  old flat orb row + single small mascot preview. A real data-stream pulse now travels desk-to-
  desk on every `handoff` event (not just from a fixed "core"), a speech bubble shows the agent's
  real SSE caption only while that agent is actively working (cleared once done — showing every
  agent's last bubble at once made the panel unreadable, caught via a live screenshot and fixed),
  and a green check (`AgentDesk`'s new `done` prop) persists once an agent's step completes. The
  caption log below is now a real timeline: colored initial avatar + agent name + one-line action
  per entry, not just a colored dot.
- `src/pages/dashboard/Assistant.tsx`: tracks `agentStates` from the real `agent_event`/`handoff`/
  `final` SSE events; the chat panel column widened 320px→380px for the workroom to read clearly;
  `MessageBubble` now shows the authoring agent's avatar + name on every assistant answer, sourced
  from the real `final` event's `route` field ("IT"/"HR"/"OTHER" — mapped to Iris/Hana the same
  way `backend/app/agents/events.py`'s own caption builder already does; `AgentEventPayload.route`
  is **not** an agent key, a wrong assumption caught by `grep`-ing the actual backend before
  trusting it, the same lesson HANDOFF.md's Phase 10 entry already warns about).
- `src/api/types.ts`'s `FinalEventPayload.route` got a doc comment clarifying it's a department
  code, not an agent key — the field already existed server-side, no backend schema change needed
  for this part.
- **Real backend bug found and fixed** (not a redesign cosmetic — this blocked the confirm-
  resolution "Yes" reply entirely): `backend/app/routers/chat.py`'s resume path
  (`find_awaiting_reply_run`) reads `agent_runs.id` via raw SQL — Postgres returns it as a
  `uuid.UUID` object, not a `str` like `new_run_id()` produces for a fresh run — and that UUID
  became every subsequent event's `run_id` field, crashing `json.dumps` mid-SSE-stream
  (`TypeError: Object of type UUID is not JSON serializable`) on the very first event after a
  resume. The frontend just hung on "Waiting for a response…" with no console error, because the
  stream died server-side without ever sending a `final` or `error` event. Only reachable via the
  confirm_resolution/offer_ticket resume path (a fresh run always used the already-`str` `new_run_
  id()`), so it never showed up in prior phases' happy-path tests. Fixed with a one-line `str()`
  cast; `poetry run pytest -q` still 25/25 after the fix.
- Verified live: "My laptop won't connect to the VPN, error 619" (IT route) and "What's the
  parental leave policy?" (HR route) both driven end to end through the real confirm-resolution
  gate including clicking "Yes", confirming the previously-broken resume path now completes and
  shows the right agent's avatar on the final answer.

**Phase 3 — Overview — DONE, verified live for both employee (Emma) and staff (Alex/admin)
roles, zero console errors:**
- **New `src/components/dashboard/AgentWorldHero.tsx`**: a compact, reusable "agent world" strip
  (Sage + 4 other agents idling at their `AgentDesk`s, a time-of-day greeting speech bubble from
  Sage that fades after 4s) — now at the top of Overview for every role, satisfying the brief's
  "every page has a robot presence" ask a page early.
- `src/pages/dashboard/Overview.tsx`: added a row of 4 glass quick-action buttons (Ask AI/Apply
  for leave/Reset password/Request access) above both the staff and employee variants — each
  navigates to `/app/assistant?q=<text>` which now prefills (not auto-sends) the chat input.
  Employee variant's ticket list became real cards (number + status badge + a clean extracted
  title instead of the raw multi-paragraph ticket summary) plus a new merged tickets+conversations
  "Recent activity" timeline. Staff variant's `StatCard`s/chart recolored to the new palette
  (`#8b5cf6`/`#5c5775` replacing the old dark-theme `#7c70af`/`#6b6860`/`#131417` hardcoded hex —
  same `tokens.css`-mirroring tradeoff noted in HANDOFF.md's "Known issues", now updated for this
  file; `StatCard.tsx`'s own sparkline color updated too).
- `src/pages/dashboard/Assistant.tsx` gained `?q=` prefill support (`useSearchParams`, strips the
  param after reading it) for the new quick-action buttons.
- **Real data bug fixed, confirmed live before and after** (the operator's explicit complaint):
  Emma's Overview showed 64-66 open tickets with "bonus wrongly calculated" repeated dozens of
  times. Root cause: **not a seed bug** — live/test chat turns against the real backend
  legitimately each create a new ticket for an unanswerable question, and this demo DB had
  accumulated months of that across many sessions. Cleaned up with a one-off SQL pass (not a code
  change) keeping only the most recent ticket per `(user, extracted question)` — 265 → 202 total
  tickets, Emma 66 → 9. **Important for future sessions**: `backend/tests/test_agents_graph.py`'s
  `test_e_unanswerable_question_creates_ticket` (and one other) send a real "I was told my bonus
  was wrongly calculated" question through the live graph against the real demo DB on *every
  `pytest` run* — no test-DB isolation — so this exact duplicate will silently reappear (+1) each
  time someone runs the backend test suite. That's expected, pre-existing test-suite behavior, not
  a regression — re-run the same one-off SQL cleanup if it piles up again, don't chase it as a new
  bug. The query is in this session's shell history; ask the operator before writing it into a
  committed script, since repeatedly wiping real ticket rows is exactly the kind of destructive-
  adjacent action CLAUDE.md asks to flag rather than automate silently.
- Verified live: Emma's Overview (hero, quick actions, 9 realistic deduped ticket cards, recent-
  activity timeline) and Alex/admin's Overview (hero, quick actions, full KPI row with a working
  sparkline, the 30-day runs chart in the new violet palette with a live tooltip) both screenshot-
  verified with zero console errors; the "Apply for leave" quick action verified to correctly
  prefill (not auto-send) the Assistant's input box.

**Phase 4 — every other page, every role — DONE, verified live (zero console errors across all
10 remaining pages, screenshotted as admin/manager/hr):**
- `Tickets/HrInsights/Costs/Evaluation/ReinforcementLab.tsx`'s hardcoded chart hex (axis labels,
  tooltip background, line/bar fills) batch-replaced with the new palette (`#8c87a3`/`#5c5775`
  text, `#ffffff` tooltip bg, `#8b5cf6`/`#38bdf8`/`#fb923c` series colors — `ReinforcementLab`'s 3
  bandit-arm colors and `Costs`' cost-line color picked to stay visually distinct from each other
  and from the 7 agent colors). `Approvals/Team/KnowledgeBase/ControlRoom/AuditLog.tsx` needed no
  color edits — they were already 100% `tokens.css`-driven, so Phase 0's token rewrite alone
  carried them to the new look, confirmed live rather than assumed.
- `Approvals.tsx` already had its own purpose-built header (an `AgentMascot` showing Atlas that
  flashes success/blocked after a decision) — left as-is rather than replaced with the generic
  `DashboardHeader`, since it's a *better* robot-presence than the generic one, not a gap.
- **Found and fixed a real leftover bug this phase, not just a sweep formality**: `tokens.css`'s
  `--accent-primary`/`--accent-secondary` (used everywhere — every button, link, focus ring) were
  still the **old pre-redesign hex** (`#7c70af`/`#5da9c9`) — Phase 0 updated `--agent-supervisor`
  to Sage's new violet `#8b5cf6` but missed that the brand accent variable itself was a separate,
  now-stale value one shade off. Caught by grep, not visually (close enough in hue to not jump
  out in a screenshot) — fixed, now byte-identical to `--agent-supervisor` and
  `src/design/agents.ts`'s `supervisor.color`, as they should be. Also fixed in this same sweep:
  `AgentOrb.tsx`'s/`DataPulse.tsx`'s old-hex fallback defaults, `RoboCompanion.tsx`'s blocked-
  shield red, and `ParticleField.tsx`'s dust-particle color (`#6b6860`, a dark muted gray tuned
  for the old black background, read as dirty specks against the new light one — now a soft
  violet `#a78bfa`).
- Deleted the now-fully-unused `src/assets/ampera-logo.png` (every reference replaced by the new
  `Logo` component back in Phase 0; confirmed zero remaining imports before deleting).
- `npx tsc -b --noEmit` and `npm run build` both clean after the full sweep.

**The operator's full redesign brief is now complete end to end** (colours+logo → landing →
assistant workroom → overview → every other page, in the stated order). Not yet committed — see
"Resuming this project" above; ask the operator before committing this much uncommitted work in
one shot.

## 6-step overhaul (2026-11-04, operator-directed, plan at the time was saved to
`~/.claude/plans/vivid-drifting-boole.md` — not checked into the repo, summarized here instead)
Full plain-English "what changed, how to see it" list is in `docs/07_CHANGELOG.md`'s newest
entry. One-line summary per step:
1. **Animation**: every dashboard page now has page-transition + stagger/fade-in motion and
   hover-lift effects (previously zero animation outside Landing/Login/Assistant); `Scene`'s
   frameloop now also respects `reduceMotion`, not just tab-visibility.
2. **Mascot**: `RoboCompanion` gained a 6-state machine (idle/waving/thinking/working/success/
   blocked) behind a new `AgentMascot` wrapper, used on Landing, Login, Assistant (driven by chat
   lifecycle), the small per-agent panel inside `AgentActivityPanel`, and Approvals (flashes
   success/blocked after a decision).
3. **Chatbot** (highest-risk change): tickets are no longer created automatically. New flow:
   answer → "did this solve your problem?" → only on "no" (or a genuine no-match) → "want a
   ticket?" → only on explicit "yes" → ticket created. Implemented as two new LangGraph nodes
   (`confirm_resolution`, `offer_ticket`) reusing the same `NodeInterrupt`/`MemorySaver` pause-
   resume mechanism `request_access` already used, a new `confirmation_required` SSE event, and
   a new `agent_runs` status. Mock-mode answers are also richer now (numbered steps, multi-chunk
   synthesis) — still zero API keys.
4. **Dashboard redesign**: shared `StatCard` (count-up numbers, optional sparkline) and
   `DashboardHeader` (greeting + mascot) components now used across every page; charts gained
   legends and axis unit labels they were missing.
5. **Approvals safety**: rejecting now requires a reason (enforced client- and server-side); a
   5-second "Undo" toast follows every approve/reject decision (Approvals + HR Insights' leave
   decisions). Undo reverts the decision record, not an already-resumed agent run — see
   `docs/06_DECISIONS.md` for that scope boundary.
6. **Plain English**: every page has a dismissible "what is this page?" banner and KPI/chart
   tooltips; renamed visible jargon (e.g. ReinforcementLab's "arm"/"UCB score" → "strategy"/
   "confidence score") without touching backend field names.
- Blocker/dependency: none. `.env` is filled in and verified working end to end.
  `LLM_MOCK_MODE=true` so everything works without GROQ/GEMINI keys.
- Known pre-existing issue (unfixed, not blocking): `test_agents_graph.py::test_e_unanswerable_
  question_creates_ticket` fails intermittently — confirmed present on the clean Phase 9 tree,
  not yet root-caused. See `docs/phases/PHASE_10.md`.

## Post-Phase-12 work (2026-11-04, operator-directed live feedback, not a numbered phase)
Full detail in `docs/07_CHANGELOG.md`'s 2026-11-04 entries and `docs/06_DECISIONS.md`. Summary:
- **Rebrand**: "Helpdesk AI Agents" → "Ampera Helpdesk" everywhere. Real Ampera brand colors
  (purple `#7C70AF`, steel-blue `#BDCFD6`) and the real logo PNG, both pulled directly from the
  operator's actual company site (amperadei.com — `amperatech.ai` redirects there), replacing an
  initially-invented "robotics orange" palette the operator rejected.
- **New `RoboCompanion` 3D component**: a real animated robot (not an image) on the Landing hero
  and twice on the AI Assistant page.
- **Real bug fixed**: `knowledge_agent.py` was discarding real retrieved article content on
  low-confidence answers, showing only a generic "not confident" message — reported live as
  "agents never solve anything." Also fixed: a plain "hello" got the same confusing non-answer
  as any other vague message; `supervisor.py` was missing "computer" as an IT keyword.
- **New `ConfirmModal`**: Approvals/HR leave decisions now require an explicit confirm step
  (reported live as "we can mistakenly approve with one click").
- **AI Assistant**: suggested-question chips on the empty-chat state.
- **Tickets**: detail panel can expand to show the real conversation that created the ticket.
- All verified: `poetry run pytest -q` 24/24, `poetry run eval` 57/70 (no regression), `tsc`/
  `build` clean, live browser screenshots after each change.

## Phase checklist

| # | Phase | Status | Date | Result |
|---|-------|--------|------|--------|
| 1 | Foundation | done | 2026-11-03 | Repo layout, Poetry project, 22-table SQL migration (24 tables incl. bookkeeping), `/api/health` verified against a real DB with pgvector/HNSW enabled, Vite+React+TS scaffold verified serving and proxying to the backend. |
| 2 | Seed data and RAG | done | 2026-11-03 | 48 users, 100 KB articles (130 chunks), 200 tickets, 80 approvals, 150 leave requests, 300 historical runs, 70 golden questions. Hybrid retrieval verified: exact error codes rank #1, semantic search sensible, dept filter correct. |
| 3 | Agents, graph, mock APIs and events | done | 2026-11-03 | 7 agents + LangGraph flow with real NodeInterrupt pause/resume for manager approval. All 7 master-prompt verification scenarios (a)-(g) pass. SSE streaming confirmed end to end over real HTTP. |
| 4 | Auth, API surface, bandit and analytics | done | 2026-11-03 | JWT login/me/logout for all 4 demo roles; chat/approvals/feedback retrofitted to use the authenticated identity; 10 new routers (conversations, tickets, kb, analytics, agents incl. live SSE, bandit, eval, admin, costs); real golden-set eval runner; live-bandit feedback simulator; `/metrics`; optional Langfuse hook. |
| 5 | Frontend design system and 3D building blocks | done | 2026-11-03 | zustand stores (`uiStore`, `authStore`), API client, `Scene`/`AgentOrb`/`DataPulse`/`ParticleField` 3D primitives, hand-rolled `Button`/`Badge`/`Panel` UI atoms, `ReduceMotionToggle`; showcased in an extended `PlaceholderHome`. |
| 6 | Landing page | done | 2026-11-03 | Cinematic hero (Scene+bloom, 7 AgentOrbs, DataPulse, ParticleField), "Meet the team"/"How it works" sections, Reveal scroll animations, LoginPlaceholder stub. Found and fixed a real Reduce-motion bug via screenshot verification. |
| 7 | Login page | done | 2026-11-03 | Real email/password form + demo-account quick-picker calling `POST /api/auth/login`, RequireAuth route guard, role-aware "lands on" redirect, AppPlaceholder post-login stand-in. Verified end to end live against a running backend with a browser tool. |
| 8 | Dashboard shell and Overview | done | 2026-11-03 | DashboardLayout (responsive sidebar+topbar shell, first CSS module), role-aware navItems with "Soon" placeholders for future phases, Overview page (staff KPIs+chart via recharts; employee own-tickets view). Verified live across all 4 roles, mobile, reduced motion. |
| 9 | AI Assistant page (centerpiece) | done | 2026-11-03 | Real chat UI against POST /api/chat/stream (manual SSE client), 3D AgentOrb/DataPulse wired to live events, live caption log, feedback widget, full request_access pause/resume working end to end through the UI. Found/fixed 3 real bugs via live browser verification. |
| 10 | Remaining dashboard pages | done | 2026-11-03 | Tickets, Approvals, Team, HR Insights, Policy Knowledge Base pages, all wired to real data; two new backend routers (`team`, `hr_insights`) since no endpoint for direct-reports/company-leave-posture existed before. Found/fixed 1 real bug via live verification (Approvals decide used wrong HTTP method). |
| 10B | Demo experience layer (HR showcase) | skipped | 2026-11-03 | Skipped by explicit operator instruction — not needed for this project. |
| 11 | Evaluation and polish | done | 2026-11-03 | Control Room, Reinforcement Lab, Evaluation, Costs, Audit Log — the last 5 admin nav items. 3 new backend endpoints (recent runs, eval run detail, audit log read-back). Found/fixed 1 real bug via live verification (Costs' route-breakdown duplicate React key). |
| 12 | Documentation and final verification | done | 2026-11-04 | Fixed stale doc forward-references (Phase 10B, Phase 10-vs-11 mix-ups), rewrote the Phase-1-stub testing doc with real results, wrote the demo script, extended the runbook. Final full live sweep across all 4 roles: zero errors. No app code changed. |

## Verification output log
(Appended to at the end of each phase.)

### Phase 1 — DONE
- `npm install` in `frontend/`: succeeded, 193 packages. `npm run dev` verified to boot and
  serve `200` on `http://localhost:5173/`, and `GET /api/health` through the Vite proxy returned
  the full healthy payload.
- `poetry install` in `backend/`: succeeded (~16 min first install for torch/sentence-
  transformers). Verified imports of fastapi, sqlalchemy, psycopg, sentence_transformers, groq,
  langgraph.
- `poetry run pytest -q`: `1 passed` (`test_health.py`).
- `poetry run migrate`: succeeded — `[migrate] pgvector extension is enabled`,
  `[migrate] 0001_init OK`, `[migrate] all migrations applied`. 24 tables confirmed present;
  `idx_kb_chunks_embedding` confirmed using the `hnsw` access method (no ivfflat fallback
  needed on this server).
- `GET /api/health` on the real backend: `{"status":"ok", "mock_mode":true,
  "database":{"connected":true}, "pgvector":{"enabled":true}}`.
- Full details, exact commands and problems-fixed in `docs/phases/PHASE_01.md`.

### Phase 2 — DONE
- `poetry run seed`: all row counts match spec exactly (users=48, knowledge_articles=100,
  kb_chunks=130, leave_balances=192, payslips=144, tickets=200, ticket_events=352, approvals=80,
  access_requests=80, leave_requests=150, agent_runs=300, agent_events=1206, feedback=300,
  bandit_arms=3, bandit_state=3, bandit_decisions=249, bandit_rewards=249, golden_questions=70).
  Completed in 11.1s. Re-run confirmed idempotent (no duplication).
- `poetry run search "VPN error 619" --strategy lexical_heavy` and `--strategy hybrid_rerank`
  both rank "VPN Error 619: causes and fix" at #1.
- `poetry run search "my laptop is super slow" --strategy semantic_heavy` returns sensible
  laptop/Wi-Fi results (no exact keyword overlap possible — pure semantic match).
- `poetry run search "parental leave policy" --strategy hybrid_rerank --dept HR` returns only
  HR-dept parental-leave articles, confirming the dept filter.
- `poetry run pytest -q`: `5 passed` (health check + 4 retrieval regression tests).
- Full details, exact commands and problems-fixed in `docs/phases/PHASE_02.md`.

### Phase 3 — DONE
- `poetry run pytest -q`: **12 passed** (1 health + 4 retrieval + 7 agent-graph scenarios).
- Scenario (a) VPN 619 → IT route, cited "VPN Error 619" source, `status=resolved`.
- Scenario (b) sick days → HR route, answer uses the employee's own real leave balance.
- Scenario (c) reset password → `action` tool_call `reset_password`, resolved.
- Scenario (d) "I need access to the Finance system" → `approval_required` event,
  `status=awaiting_approval`; after a manager approves via `approvals_api.decide()` +
  `resume_after_approval()`, run becomes `resolved`.
- Scenario (e) unanswerable question → ticket created, `status=escalated`, ticket summary
  mentions the original question.
- Scenario (f) "Show me Priya's payslip" → Guard blocks it, logs `audit_log` action
  `guard_blocked` for the requester.
- Scenario (g) every run's `agent_events` have strictly increasing, unique `seq` numbers.
- Manual HTTP smoke test: `POST /api/chat/stream` streamed real SSE events (`agent_event`,
  `handoff`, `token`, `final`) end to end through a live `uvicorn` server.
- Two real bugs found and fixed via this scenario testing: a missing `Priya` seed user, and a
  ticket-number sequence that wasn't advanced past the hand-seeded ticket numbers (both in
  `docs/phases/PHASE_03.md` and `docs/06_DECISIONS.md`).
- Full details, exact commands and problems-fixed in `docs/phases/PHASE_03.md`.

### Phase 4 — DONE
- `poetry run pytest -q`: **24 passed** (12 from Phases 1-3 + 12 new in `tests/test_auth_api.py`):
  login works for all 4 demo roles; wrong password and missing token are both rejected;
  `employee` gets `403` on `/api/analytics/kpis` and `POST /api/eval/run`; `hr` gets `200` on
  analytics; `employee` gets `403` reading another user's run events; `POST /api/feedback`
  visibly increments `bandit_state.pulls`; `run_simulation(60)` produces a defined learning
  curve.
- `poetry run simulate-feedback --n 40` against the live seeded DB: all three bandit arms'
  pulls and average reward moved (e.g. `hybrid_rerank: pulls 137 -> 151, avg_reward 0.786 ->
  0.802`).
- `poetry run eval` against the live seeded DB, through the real agent graph: `57/70 passed
  (pass_rate=0.8143, avg_correctness=0.8476)`.
- Live HTTP smoke test on port 8077: all 4 demo logins; conversation create; KB search (VPN 619
  still ranks #1); employee's own-tickets list; `/api/agents/status`; analytics 403 for employee
  / 200 for hr; a full authenticated chat SSE turn end to end; the full `request_access`
  approval flow (employee's chat pauses, the real manager sees it pending, a non-approver gets
  `403` trying to decide it, the real approver's `200` resumes the run to `resolved`).
- Full details in `docs/phases/PHASE_04.md`.

### Phase 5 — DONE
- `npx tsc -b --noEmit`: no type errors.
- `npm run build`: succeeds (only the expected "three.js is a large chunk" bundler note).
- `npm run dev`: boots cleanly on port 5173; Vite's dependency optimizer picked up the new
  `@react-three/fiber`/`three`/`zustand`/`zustand/middleware` usage with no transform errors.
- Live full-stack check: backend on port 8000 + `npm run dev` on 5173 simultaneously; `GET
  http://localhost:5173/api/health` through the Vite proxy returned the real healthy payload.
- Not verified: actual visual rendering / frame rate / the Reduce-motion toggle's visible effect
  in a real browser — no browser/screenshot tool is available in this session. Flagged in
  `docs/phases/PHASE_05.md` for the operator to confirm directly.
- Full details in `docs/phases/PHASE_05.md`.

### Phase 6 — DONE
- `npx tsc -b --noEmit` and `npm run build`: both succeed.
- A browser tool was available this phase (Chrome + playwright-core, installed ad hoc for
  verification, not added to `package.json`): screenshotted the hero, team, steps, and login
  placeholder sections, and toggled Reduce-motion live via the on-page control.
- Caught a real bug this way: the hero's headline/subtext/CTA were fully invisible with
  Reduce-motion on. Root cause and fix in `docs/06_DECISIONS.md`; re-screenshotted after the fix
  to confirm all three affected sections (hero, team grid, steps grid) now render correctly in
  both states.
- Console check: zero app errors; the only logged message is the browser's default
  `/favicon.ico` 404 (pre-existing since Phase 1, no `<link rel="icon">` was ever added).
- Full details in `docs/phases/PHASE_06.md`.

### Phase 7 — DONE
- `npx tsc -b --noEmit` and `npm run build`: both succeed.
- Full end-to-end live test (real backend on port 8000 + `npm run dev` on 5173, driven by Chrome
  + playwright-core, not just static screenshots): `/app` redirects to `/login` when logged out;
  manual login as `emma.employee@acme.test` succeeds against the real API and redirects to
  `/app` showing "AI Assistant" as its landing page; sign-out returns to `/`; the demo quick-
  picker logs in as `alex.admin@acme.test` in one click and correctly shows "Control Room";
  wrong password shows "Invalid email or password" inline; Reduce-motion toggled on the login
  page keeps the form fully visible (no repeat of Phase 6's bug).
- Full details in `docs/phases/PHASE_07.md`.

### Phase 8 — DONE
- `npx tsc -b --noEmit` and `npm run build`: both succeed (one real type error caught and fixed:
  `navItems.ts`'s hand-rolled icon prop type didn't structurally match lucide-react's actual
  `LucideIcon` type — fixed by importing that type directly).
- Full end-to-end live test across all 4 demo roles, mobile viewport, and reduced motion (real
  backend + frontend dev server, Chrome + playwright-core): admin sees the full nav set and real
  KPI/chart data; employee sees only Overview/AI Assistant/Tickets and their own real open-
  ticket list (not another employee's); manager sees Overview/AI Assistant/Tickets/Approvals/
  Team; clicking a disabled "Soon" nav item does nothing (confirmed via unchanged URL); mobile
  (420px) sidebar correctly collapses to a hamburger-triggered drawer; HR dashboard renders
  correctly under Reduce-motion.
- Full details in `docs/phases/PHASE_08.md`.

### Phase 9 — DONE
- `npx tsc -b --noEmit` and `npm run build`: both succeed.
- Live end-to-end tests against a real backend + frontend dev server (Chrome + playwright-core):
  a grounded VPN-619 IT answer with cited sources, full caption sequence, live handoff beam, and
  a submitted 5-star rating; the complete `request_access` approval pause/resume across two
  separate logged-in sessions (employee's chat pauses with a visible banner, a real manager
  decides it via the real API, the employee's still-open connection resolves automatically); an
  HR leave-balance question under Reduce-motion.
- Found and fixed 3 real bugs this way: SSE parsing silently never fired a single event because
  of a `\r\n` vs `\n` mismatch (see `docs/06_DECISIONS.md`); two of seven 3D orbs were clipped
  outside the activity panel's narrow camera frustum; a duplicate-React-key warning on resumed
  runs (backend behavior was correct — Atlas genuinely re-emits on resume — frontend key choice
  was the bug).
- Full details in `docs/phases/PHASE_09.md`.

### Phase 10 — DONE
- `poetry run pytest -q`: 24/25 pass; the one failure
  (`test_e_unanswerable_question_creates_ticket`) reproduced identically with this phase's diff
  `git stash`ed, confirming it's pre-existing on the Phase 9 tree and unrelated to this phase's
  changes.
- `npx tsc -b --noEmit` and `npm run build`: both succeed.
- New `GET /api/team` and `GET /api/hr/overview`/`GET`+`PATCH /api/hr/leave-requests` endpoints
  smoke-tested directly against the live seeded DB before any frontend existed: correct real
  per-manager team data, correct company-wide HR numbers, correct `409` on re-deciding an
  already-decided leave request, correct `403` for an employee token on all three.
- Full live, functional end-to-end tests across all 4 demo roles (Chrome + playwright-core
  driving real clicks, not static screenshots): Tickets (role-scoped lists, detail timeline,
  live status/priority PATCH persisting after reload); Approvals (live decide moving an approval
  from Pending to Approved with a real timestamp — this is where a real POST-vs-PATCH bug was
  caught and fixed, see `docs/phases/PHASE_10.md`); Team (a real manager's 9 direct reports with
  correct per-person ticket/leave counts); HR Insights (real company headcount/leave data, a
  live leave-request approval, correct at 390px mobile); Policy Knowledge Base (search matching
  Phase 2's CLI retrieval results exactly, side-by-side strategy comparison, article reader);
  and confirmed an employee hitting `/app/team` directly gets the backend's real `403`, not a
  silently-broken page — role enforcement is genuinely server-side.
- Full details in `docs/phases/PHASE_10.md`.

### Phase 11 — DONE
- `poetry run pytest -q`: 24/24 pass this run (the pre-existing intermittent flake noted in
  Phase 10's log did not trigger).
- `npx tsc -b --noEmit` and `npm run build`: both succeed.
- New `GET /api/agents/runs`, `GET /api/eval/runs/{id}`, `GET /api/admin/audit-log` (+
  `.../actions`) smoke-tested directly against the live seeded DB before any frontend existed:
  correct real recent-runs/eval-breakdown/audit-log data, correct `403` for a manager token on
  all three.
- Full live, functional end-to-end tests as `alex.admin@acme.test` (Chrome + playwright-core):
  Control Room's live feed genuinely streamed a second, concurrently-logged-in employee
  session's real chat turn in real time with correct attribution (verified across two browser
  tabs); Reinforcement Lab's real bandit stats and reward-over-time chart (confirmed via raw SVG
  path data when a full-page screenshot's downscaling initially made the chart lines hard to
  see — not a bug); Evaluation triggered a real synchronous 70-question run through the live
  agent graph and showed its full per-question breakdown; Costs showed real 30-day totals and
  breakdowns — this is where a real duplicate-React-key bug was caught and fixed (two distinct
  backend route groups both display as "OTHER"); Audit Log showed real entries with working
  action filtering. Confirmed a manager hitting `/app/control-room`, `/app/evaluation`, or
  `/app/audit-log` directly gets the backend's real `403` (genuinely server-side enforcement),
  while `/app/reinforcement-lab`/`/app/costs` correctly show real data for a manager — those two
  backend endpoints have been manager/hr/admin-scoped since Phase 4, nav-hiding them from
  managers is IA, not security.
- Full details in `docs/phases/PHASE_11.md`.

### Phase 12 — DONE
- `poetry run pytest -q`: **24/24 passed** (final run).
- `poetry run eval`: **57/70 passed (81.43%, avg correctness 0.8381)** — IT 26/30, HR 31/40,
  matching every prior run in this project's history; all 13 failures individually diagnosed and
  logged in `docs/08_TESTING_AND_EVAL.md` (route-classification misses under mock mode, 1
  retrieval near-miss, 1 pure eval-harness limitation).
- `npx tsc -b --noEmit` and `npm run build`: both succeed.
- Full live sweep across all 4 demo roles (Chrome + playwright-core): every nav item each role
  can see loads without a role-denied message or fetch error (3 pages for employee, 5 for
  manager, 5 for hr, 9 for admin); sign-out correctly returns to the landing page for every role;
  zero console errors except the pre-existing favicon 404.
- Verified the demo script's numeric claims directly: a live `POST /api/eval/run` timed at
  49.8s ("under a minute" — true).
- Documentation audit: fixed stale forward-references in `docs/01_ARCHITECTURE.md` (a dead link
  to the never-built `PHASE_10B.md`, a Phase-10-vs-11 mix-up on `GET /api/agents/live`, an
  overstated event-mapping summary) and `docs/02_DATABASE.md` (Reinforcement Lab phase number);
  rewrote `docs/08_TESTING_AND_EVAL.md` from its untouched-since-Phase-1 stub; wrote
  `docs/09_DEMO_SCRIPT.md`; extended `docs/05_RUNBOOK.md`; added a decision-log entry recording
  the Phase 10B skip; rewrote `README.md`'s stale "Phase 1 quickstart" pointer.
- `POST /api/admin/reset-demo` was not re-run live this phase — correctly blocked by the
  sandbox's irreversible-local-destruction safeguard; relied on its unchanged code and Phase 4's
  original verification instead.
- Full details in `docs/phases/PHASE_12.md`.

**Every phase on the original checklist is now complete.**

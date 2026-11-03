# Phase 9 — AI Assistant page (centerpiece)

## Scope delivered
1. **`src/api/sse.ts`** — a manual SSE client for `POST /api/chat/stream`. The browser's native
   `EventSource` only supports GET and can't carry an `Authorization` header, so this reads the
   `fetch` response body as a stream and parses the `event:`/`data:` framing by hand.
2. **`src/pages/dashboard/Assistant.tsx`** — the real chat UI at `/app/assistant` (nav item
   flipped to `implemented: true`): a message list, a textarea + send button, and a live
   connection to the real agent graph. Creates one conversation per page visit (`POST
   /api/conversations`) so multi-turn history persists correctly. Drives:
   - **Live token streaming**: the assistant bubble fills in as `token` events arrive, then gets
     replaced by the canonical `final` event's answer (sources, route, resolved, ticket number).
   - **A visible approval pause**: on `approval_required`, a banner shows who needs to approve
     what; input stays disabled (the SSE connection deliberately stays open per
     `docs/01_ARCHITECTURE.md`) until the eventual `final` event arrives after a manager decides
     elsewhere — no fake timeout, no polling, just waiting on the same open connection.
   - **Feedback**: a 5-star `FeedbackWidget` under each resolved answer, posting to `POST
     /api/feedback`.
3. **`src/components/chat/AgentActivityPanel.tsx`** — the first real wiring of Phase 5's 3D
   primitives to a live event stream, exactly per `docs/01_ARCHITECTURE.md`'s frontend↔event
   mapping: all 7 `AgentOrb`s in a row, the currently in-flight agent's orb pulses (`active`),
   and each `handoff` event fires a `DataPulse` beam between the two agents' orbs. A scrolling
   caption log underneath shows every event's plain-English caption as it happens — the
   project's "narrator" for a non-technical audience.
4. **`src/components/chat/FeedbackWidget.tsx`** — star rating + submit, calls `POST
   /api/feedback`, shows a confirmation once Finn has it.
5. **`src/api/types.ts`** — added the full `ChatEvent` discriminated union
   (`AgentEventPayload`/`HandoffEventPayload`/`TokenEventPayload`/
   `ApprovalRequiredEventPayload`/`FinalEventPayload`/`ErrorEventPayload`), `Conversation`,
   `FeedbackResponse`.
6. **`src/routes.tsx`** / **`src/layouts/navItems.ts`** — `/app/assistant` route added, nav item
   flipped to implemented.

## Three real bugs found and fixed via live verification
This phase leaned hard on the live Playwright setup, and it earned its keep — none of these
three would have been caught by `tsc`/`npm run build` alone:

1. **CRLF line endings broke SSE parsing entirely.** `src/api/sse.ts` originally split frames on
   `\n\n`, but sse-starlette terminates lines with `\r\n` (the SSE spec's canonical ending), so
   `buffer.indexOf("\n\n")` never matched — the chat UI silently received and fully drained the
   stream (confirmed via raw `reader.read()` logging) while **zero** events ever reached the
   page: no captions, no streamed text, no final answer, forever. Chrome's network panel reported
   `net::ERR_ABORTED` on the connection closing, which was a red herring — the real bug was the
   parser never finding a single frame boundary. Fixed by normalizing `\r\n` → `\n` on each
   decoded chunk before splitting. Found by adding chunk-level debug logging and bisecting from
   "data arrives" down to "the frame separator never matches."
2. **Two of the seven `AgentOrb`s were clipped outside the camera frustum.** `AgentActivityPanel`
   placed all 7 orbs at a fixed `1.7` spacing, inherited unthought-through from the landing
   page's much wider hero canvas — in this page's narrow (~300px) side panel, `guard` and
   `feedback` (the two outermost) fell outside the visible frustum entirely. A live screenshot
   showed only 5 of 7 orbs; fixed by tightening the spacing (and orb radius) to fit the actual
   panel width, with a comment noting this was verified visually, not computed from a formula.
3. **A duplicate-React-key console warning on resumed (`request_access`) runs**, caught via a
   live end-to-end approval test. Root cause: when a `request_access` run pauses and later
   resumes, `app/agents/graph.py`'s `node_action` genuinely re-executes from its start (LangGraph
   re-runs the interrupted node wholesale, not partially), so it legitimately emits a second
   "Atlas is deciding what action to take" caption — correct backend behavior, not a bug. But
   keying the frontend's caption list by the backend's `seq` field assumed that was a safe unique
   key across that pause/resume boundary; defensively switched to a locally-generated
   `crypto.randomUUID()` per caption entry instead, which is correct regardless of what the
   backend's sequencing guarantees turn out to be.

## Files touched
- New: `src/api/sse.ts`, `src/pages/dashboard/Assistant.tsx`,
  `src/components/chat/{AgentActivityPanel,FeedbackWidget}.tsx`.
- Modified: `src/api/types.ts` (chat event types), `src/routes.tsx`, `src/layouts/navItems.ts`.

## Verification
- `npx tsc -b --noEmit` and `npm run build`: both succeed.
- Full live end-to-end tests (real backend + frontend dev server, Chrome + playwright-core):
  - **Grounded IT answer**: "My laptop won't connect to the VPN, error 619" as
    `emma.employee@acme.test` → real numbered-steps answer, 3 cited source chips, correct
    caption sequence (Gus → Sage → handoff to Iris → Iris retrieves/answers → Finn waits), all 7
    orbs visible with a live beam from Sage to Iris, 5-star feedback submitted successfully
    (`POST /api/feedback` → "Thanks — Finn is learning from that.").
  - **Full approval pause/resume, live, across two browser sessions**: "I need access to the
    Finance System" as `emma.employee@acme.test` → chat pauses with a visible "Waiting for Mark
    Manager's approval..." banner, input disabled; in a second session, logged in as
    `mark.manager@acme.test`, fetched the real pending approval via `GET
    /api/approvals?status=pending` and decided it via `POST /api/approvals/{id}/decide`; back on
    the first session's **same still-open SSE connection**, the run resumed automatically and
    resolved to "Good news — your access to Finance System was approved and is now active,"
    with the caption log showing Atlas's full before/after-approval sequence and a working
    feedback widget.
  - **HR-policy path under reduced motion**: "How many sick days do I have left?" as
    `mark.manager@acme.test` with Reduce-motion on → correct real leave balance from the
    employee's own data, correct Hana/HR routing, fully legible with no animation.
  - Console: zero app-level errors in every case; only the pre-existing favicon 404.

## Known issues / deferred
- The Assistant page doesn't load a prior conversation's message history on mount — each page
  visit starts a fresh conversation. Loading/resuming past conversations is more naturally
  Phase 10's "Tickets"/conversation-list scope.
- `AgentActivityPanel`'s `AGENT_ORDER`/`FRIENDLY_NAMES` duplicate the backend's
  `app/agents/events.py` constants by hand (same tradeoff as `AgentOrb`'s `AGENT_COLORS`).
- No UI exists yet for a manager to decide an approval from inside the app (that's Phase 10's
  "Approvals" nav item) — this phase's approval test decided it via direct API calls, which is
  exactly how a real manager would do it today, just not through a page yet.

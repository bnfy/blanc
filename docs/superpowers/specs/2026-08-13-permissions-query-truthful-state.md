# Truthful `permissions.query` for microphone/camera

**Status:** Implemented (branch `fix/permissions-query-preflight`).
**Relation:** rides the capture-indicator transport
(`2026-08-13-capture-indicator-design.md` §4); reverses none of the
strict-check decisions below.

## Problem

Blanc's `setPermissionCheckHandler` deliberately maps the undecided state to
denied for every PROMPTED permission. Sites that preflight
`navigator.permissions.query({name:'microphone'})` before calling
`getUserMedia` therefore read `denied`, show their own "mic blocked" help,
and never trigger Blanc's prompt. The breakage is masked in any profile that
already carries a stored allow (the dev profile did; the maintainer's real
profile did not — hit live after the 1.2.1 update).

Two constraints are settled and NOT reopened by this shim:

1. **The check handler keeps its strict mapping.** Returning `true` for
   undecided (commit `a260589`) was a reviewed P0 permission bypass and was
   reverted (`21a8525`). `enumerateDevices` label exposure pre-grant is the
   concrete reason it must stay strict.
2. **Electron authorization is untouched.** `getUserMedia` still runs the
   unchanged request handler; nothing here grants, prompts, or persists.

## Design

Display truth only, one direction, fail-closed:

- `permissions.js` — module-level `queryReaders` WeakMap (session →
  `readDecisions`), populated by `setupPermissionPolicy`, consumed by the new
  `mediaQueryState(session, rawUrl, mediaType)`:
  `allow → 'granted'`, `deny → 'denied'`, undecided → `'prompt'`,
  non-http(s) origin → `'denied'` (truthful: those origins are denied
  promptlessly), unknown session/mediaType → `null` (caller must fall back).
- `main.js` — `ipcMain.handle('capture:permission-query')`. Origin is derived
  from the **sender frame**, never the payload: a page can only learn its own
  origin's state. Main frames only, matching where the session preload runs
  (§4.1: subframes are unreachable; iframes keep the strict behavior).
- `capture-preload.js` — the inline main-world source patches
  `navigator.permissions.query` for `microphone`/`camera` only
  (`microphone→audio`, `camera→video`). Bridge over the same CustomEvent
  transport as the capture patch, bounded payloads, request/response matched
  by id (concurrent queries resolve out of order correctly). Any failure —
  invalid state, bridge timeout (1.5 s), missing `navigator.permissions` —
  falls back to the **real strict query**, i.e. exactly today's behavior.
  The returned status object is **live**, per the Permissions contract: a
  bounded main-world registry (cap 64, oldest evicted) keeps every handed-out
  status current, and a decision change fires `change` (both
  `addEventListener('change')` subscribers and `onchange`) with the updated
  `state`. The push originates in `permissions.js`
  (`setPermissionDecisionObserver`, notified from the prompt-answer path and
  from `removeDecision`/Settings-forget via the pure
  `mediaScopesForDecisionKey` parser) and is fanned out by `main.js` to every
  tab and popup surface currently showing the changed origin — each surface
  receives the truthful state for **its own** session via `mediaQueryState`,
  so no session filtering is needed and unaffected sessions dedupe to a
  no-op. The status is a plain object with a working listener registry
  rather than a native `PermissionStatus`/`EventTarget` instance
  (`instanceof` checks fail — accepted; working events beat a spec-shaped
  object whose events never fire).

## Verification

- `test/unit/permissions-query-state.test.js` — three-state mapping, strict
  check unchanged, per-device scoping, per-session isolation (private grants
  never leak), null contract.
- `test/unit/permissions-query-mainworld.test.js` — vm over the shipped
  bytes: media-type mapping, passthrough, fallback on null/timeout,
  out-of-order id resolution.
- Real-Electron e2e harness (scratchpad `shim-e2e.js`): undecided origin
  reads `prompt/prompt`; an origin seeded with an audio allow reads
  `granted/prompt`.

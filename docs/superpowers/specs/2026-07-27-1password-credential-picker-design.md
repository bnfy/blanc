# 1Password fill — credential picker: ranking + Island UI

**Date:** 2026-07-27
**Status:** Approved for planning (rev. 4 — after three security-review rounds)
**Branch:** `feature/1password-fill` (builds on the matching-improvements work)

## What

Replace the multi-match chooser. Today it is `dialog.showMessageBox` with one
button per match, which on a real vault renders as a horizontal row of ~20
identically-labelled `google.com` buttons spilling off the screen — unusable.

Two changes:

1. **Rank matches** so the picker only appears when the choice is genuinely
   ambiguous, instead of every time a registrable-domain match pulls in a
   site's whole item family.
2. **Render the picker in Blanc's Island overlay** — a real list, labelled with
   the one field that actually distinguishes items: the **username**.

**Scope:** the personal dev build, same as the rest of this feature.
Distribution stays shelved pending §4.1(e)
([`1password-legal-inquiry.md`](../../1password-legal-inquiry.md)).

## Why metadata alone cannot solve this

Measured against the real vault (`google.com`, 2026-07-27) — **20 matches**:

| Field | Reality |
|---|---|
| Titles | **4 distinct**: `google.com` ×17, `accounts.google.com`, `Google`, `Login` |
| Vault | all `Personal` |
| Tags | almost all `Imported July 12 2026 19:01:42` — a bulk-import artifact |
| Websites | differ, but as `…/v3/signin/challenge/pwd?TL=AHE…` — meaningless to a human |

`ItemOverview` — the SDK call that decrypts nothing — carries only `id`,
`title`, `category`, `vaultId`, `websites[]`, `tags[]`, `createdAt`,
`updatedAt`. **There is no username on it.** So a picker built purely from
overview data would show twenty visually-identical rows. The username is the
only distinguishing field, and reading it requires `items.get()`, which
decrypts.

Ranking helps, but not enough on its own: on `www.google.com` exactly one item
has host `google.com`, so ranking collapses 20 → 1 and no picker appears. On
`accounts.google.com` — the page you actually sign in on — ~17 items share the
same tier and ranking cannot break the tie.

Hence both changes, and hence the deliberate relaxation below.

## Orchestration order (load-bearing)

The chooser today runs in **phase 1**, before the page is inspected. Dropping
the new picker in place would call `items.get()` on up to ten items *before
knowing whether the page is fillable at all* — decrypting on a search page or a
signup form — and would do so inside the phase-1 catch, which logs
`err.message`. Both are regressions of invariants this feature already holds.
The order is therefore part of the design, not an implementation detail:

1. `findLogins(host)` — **overviews only, nothing decrypted**
2. `rankMatches(...)` — metadata only
3. **inspect** (credential-free, isolated world)
4. reject unsafe pages → `no-fillable-field` (**still nothing decrypted**)
5. **heuristic consent**, if the target was inferred → may end in `user-declined`
   (**still nothing decrypted**)
6. **if `kept.length > 1`:** `revealUsernames(kept)` — **first decryption**,
   ≤ `PICKER_MAX`, only reached on a page already judged fillable and already
   consented to
7. **if `kept.length > 1`:** **picker** → selection or `chooser-cancel`

   With exactly one survivor, steps 6 and 7 are **skipped entirely** — no
   enumeration, no picker, no overlay — and the flow goes straight from consent
   to step 8. Ranking's whole purpose is to reach this branch: on
   `www.google.com` it turns 20 candidates into one and nothing is decrypted
   until step 9.
8. re-validate identity (window / tab / wc / epoch / URL)
9. `revealCredential(chosen)` — the one password that will be typed
10. fill

**Logging boundary moves with step 6.** Everything from the first `items.get()`
onward runs inside the binding-less catch that logs a fixed `fill-error`; only
steps 1–5 may log `setup-error` with a message. A username enumeration that
throws must not surface an SDK error string.

**Consent wording.** The consent gate is about the *form*, and now precedes item
selection. With exactly one **survivor** (post-ranking, i.e. the case where no
picker will follow) it names that item — `title` is overview metadata, so no
decryption is needed to do so. With several survivors it says "a saved
password", and the picker that follows names the item. The count that matters
is the survivor count, never the original candidate count.

## Part 1 — Ranking

`findLogins` grows the metadata ranking needs. New shape:

```js
{ vaultId, vaultName, itemId, title, hosts: string[], updatedAt: Date }
```

`hosts` are the item's website hosts, normalized by the existing
`normalizeHost` (scheme-tolerant, `www.`-stripped, lowercased); malformed
entries are skipped as today.

**`tierOf(itemHost, pageHost) → 1 | 2 | 3 | null`**

| Tier | Rule | Example (page `accounts.google.com`) |
|---|---|---|
| 1 | `itemHost === pageHost` | item `accounts.google.com` |
| 2 | `pageHost` ends with `'.' + itemHost` (item is the parent domain) | item `google.com` |
| 3 | same `registrableKey` but neither of the above | item `mail.google.com` |
| `null` | different registrable domain | — (already excluded by `matchesHost`) |

An item with several websites takes its **best** (lowest) tier.

**`rankMatches(candidates, pageHost) → { tier, kept, truncated }`**

1. Assign each candidate its best tier **and record the host that earned it**;
   drop `null`s. Each kept candidate therefore gains a single `host` — the
   website that matched — which is what the picker row displays. Downstream
   (`revealUsernames`, the picker payload) reads that `host`, never the original
   `hosts` array.
2. Keep **only** the best non-empty tier — lower tiers are discarded entirely,
   not merely sorted below.
3. Sort that tier **deterministically**. `updatedAt` alone is not enough: this
   vault's items were bulk-imported in one operation and share a timestamp to
   the second, so an `updatedAt`-only sort leaves the order — and therefore
   *which ten survive the cap* — at the mercy of unspecified SDK listing order.
   Full comparator, each key breaking the previous tie:
   `updatedAt` **desc** → `title` asc → `host` asc → `itemId` asc.
   `itemId` is unique, so the ordering is total and reproducible.
4. Cap at **10** (`PICKER_MAX`). `truncated` = how many were dropped by the cap.

**Which host earns the tier.** An item may have several websites at its best
tier; take the lexicographically smallest, so the displayed host is stable
across runs rather than dependent on array order.

`kept.length === 1` → fill it, no picker. `> 1` → picker over `kept`.

**`kept.length === 0` is defensive.** `matchesHost` has already established that
every candidate shares a registrable domain with the page, so `tierOf` should
never return `null` for all of them. If it somehow does — a normalization edge
case, a future change to either function — treat it as **no match**: log
`no-match` and stop. Never fall back to the unranked list, which would defeat
the ranking gate entirely.

## Part 2 — Usernames

**`revealUsernames(candidates) → Promise<Array<{vaultId, vaultName, itemId, title, host, updatedAt, username}>>`**

For each candidate (already capped at 10), call `items.get()`, read **only** the
built-in `username` field (`id === 'username'`), and build a **fresh object**.
The decrypted `Item` — including its password — is never attached to the result.
A missing username yields `null`, rendered as `(no username)`.

**Signature carries a test seam:** `revealUsernames(candidates, { client } = {})`.
When `client` is omitted it uses the cached `getClient()` as everything else
does; tests inject a fake that counts concurrent `items.get()` calls and can
throw on the Nth. Without this seam the concurrency and failure contracts below
could only be asserted by reading source, which would not prove behavior.

**Sequential, not parallel.** The calls run in a plain `for … await` loop, and
each `Item` reference is released before the next call. `Promise.all` would hold
ten decrypted items — with their passwords — live simultaneously, which is
precisely what this design is trying not to do. The cost is latency on a list
capped at ten; that is the right trade.

**Any failure aborts the whole picker** as a fixed `fill-error`. Enumeration
runs after the first `items.get()`, so it is inside the binding-less catch: a
partial list is never shown, and no SDK error string is logged.

Two properties this preserves:

- **Passwords are released, not carried.** After the user picks, the existing
  `revealCredential(chosen.vaultId, chosen.itemId)` re-reads that single item.
  This costs one extra decrypt so that **only the selected password is
  deliberately retained or referenced** at fill time. Note the honest limit:
  JavaScript offers no way to guarantee a released string has been collected or
  zeroed, so this is about what the code *holds*, not about what remains in
  process memory. Carrying ten decrypted items across an open picker would be
  strictly worse on exactly that measure.
- **Bounded and conditional.** Decryption happens only when a picker is
  genuinely needed (≥2 survivors after ranking), and never for more than
  `PICKER_MAX` items.

`host` on each row is the item's website host that produced its winning tier —
what the row displays.

## Part 3 — The Island picker

A new overlay mode, `'credential-picker'`, alongside `panel` / `palette` /
`find`.

**Main → overlay** (`overlay:show`):

```js
{ mode: 'credential-picker', prefill: { requestId, host, rows, truncated } }
```

`rows[i]` = `{ username, title, host, vaultName }` — **nothing else**. The
renderer never learns `vaultId` or `itemId`; main maps the returned index back
to the candidate itself. Vault/item identifiers are as unnecessary to the
renderer as the password is.

**Overlay → main** (`chrome:credential-pick`):

```js
{ requestId, index }   // index: number | null (null = cancelled)
```

**Reply validation — two stages, and the first must be inert.** A reply that
fails to prove it belongs to *this* request must change **no state at all**.
Treating it as a cancellation would let a late reply from a closed picker cancel
a different, live one.

**Stage 1 — identity. Failure ⇒ return, zero state change:**

- `event.sender === overlayView.webContents` **exactly** — the shared preload
  serves both chrome renderers, so `isTrustedSender` is passed the overlay
  alone, never the pair; the chrome window is not an acceptable sender here;
- a pick is currently pending and has not already settled;
- `overlayMode === 'credential-picker'`;
- `requestId` **strictly equals** the pending request's — it is
  `crypto.randomUUID()`, not a counter, so a stale or guessed id cannot collide.

**Stage 2 — payload. Failure ⇒ cancel *this* request** (the reply is provably
from the current overlay for the current request, so a malformed `index` means
the picker itself misbehaved and the safe response is to abandon it):

- `index` is `null`, **or** an integer (`Number.isInteger`) within
  `[0, candidates.length)`. Fractional, negative, out-of-range, `NaN`, string
  and coercible values are all rejected.

The first reply that clears both stages wins; every later one fails stage 1 on
"already settled" and is inert.

**Settlement — one owner, exactly once.** Today `hideOverlay()` is called from
six places and `showOverlay(mode)` can overwrite `overlayMode`; none of them
resolve anything, so a picker could be dismissed while the fill still awaits a
promise that never settles — wedging `onePasswordFillInFlight` and every future
⌥⌘P. All of it therefore routes through a single main-process function:

```js
settleCredentialPick(index /* number | null */, reason)
// resolves the pending promise with { index, reason }
```

Idempotent by construction: it returns immediately unless a pending request
exists, and clears that state **before** resolving. On every path it clears the
timeout, the pending resolver, the retained candidate list, `overlayPrefill`,
and asks the overlay to drop its rows — no vault-derived strings linger in the
renderer after the picker closes.

**The `reason` enum is closed and total** — focus policy is derived from it, so
every route must map to exactly one value. There is no default case:

| `reason` | Route | `index` | Restore focus? |
|---|---|---|---|
| `selected` | Valid reply carrying an in-range index | number | **Yes — gated** |
| `dismissed` | Valid reply carrying `index: null` — the picker's own Cancel affordance **and** its scrim click, which the renderer implements as this same reply rather than a separate channel | `null` | Best-effort |
| `escape` | Escape via `before-input-event` while in picker mode | `null` | Best-effort |
| `invalid-reply` | Reply cleared stage 1 but failed stage 2 (malformed `index`) | `null` | No |
| `mode-replaced` | `showOverlay(otherMode)` replaced the picker | `null` | No |
| `hidden` | `hideOverlay()` from any other caller | `null` | No |
| `blur` | Overlay lost focus | `null` | No |
| `tab-changed` | Active tab switched, or the captured tab closed | `null` | No |
| `window-closed` | Window closed, overlay `webContents` destroyed, or `render-process-gone` | `null` | No |
| `timeout` | 60s elapsed | `null` | No |

`selected`, `dismissed` and `escape` are the three routes where the user is
demonstrably still in Blanc and acting on the picker, so restoring focus is
right. Everything else may fire while Blanc is background — restoring there
would pull the window forward unbidden. `hidden` is deliberately in the
no-restore group: `hideOverlay()` has six callers and the reason cannot be
attributed, so it fails safe.

**Focus is the orchestrator's job, and its failure is observable.** Settlement
only resolves; it never restores focus itself. The orchestrator awaits
`{ index, reason }` and then:

- **`index !== null`** (reason `selected`) — `await restoreTabFocus(wc)` and
  **gate on the boolean**: a false result returns `abort-wc-changed`
  **before** `revealCredential`, exactly as the consent gate does. Without
  awaiting the result there is no observable contract at all and the flow would
  proceed to decrypt into an unfocused tab.
- **`index === null`** — log `chooser-cancel`. Focus is then restored only
  **best-effort and only for `escape`**, where the user is demonstrably still in
  Blanc; the result is not gated, since nothing further happens.

The full per-route policy is the `reason` table in the settlement section below;
in short, only `selected` (gated), `dismissed` and `escape` (both best-effort)
restore focus. This requires `restoreTabFocus` to make its `win.focus()` **conditional** on the
window already being focused rather than unconditional — mirroring the existing
precedent at `main.js:734`
(`if (!win.isFocused()) return hideOverlay({ refocusContent: false })`).

## Part 4 — Row content

```
anthony@gmail.com                     ← primary: the distinguishing field
google.com · accounts.google.com      ← title · matched host
                             Personal ← vault, only when >1 vault matched
```

Keyboard: ↑/↓ move, Enter selects, Escape cancels. Styling follows the existing
island row conventions, including the `data-theme="private"` scope.

**Safe rendering is mandatory, not stylistic.** `username`, `title`, `host` and
`vaultName` are **untrusted strings from the vault** — a user can title an item
anything, and imported items frequently carry junk — entering a *privileged*
chrome renderer that holds the `browserAPI` bridge. `overlay.js` uses
`innerHTML` in about ten places today (row scaffolding at lines 389, 402, 454),
so the established local pattern is exactly the dangerous one. The rule for
picker rows:

- build every element with `document.createElement`;
- set every vault-derived value with **`textContent`** only;
- **never** `innerHTML`, `insertAdjacentHTML`, or a template literal containing
  vault data — including for the truncation line and any title attribute.

Covered by an adversarial fixture (below), not left to review.

When `truncated > 0`, a final **non-selectable** line reads
`N more not shown — narrow it in 1Password`. Silent truncation would read as
"these are all your matches", which would be false.

**Deliberately not in v1:** type-to-filter. With the cap at 10 and the username
as the primary label, arrow keys are sufficient; a filter would add an input,
focus management and match logic for a list that fits on screen. Revisit if
ten rows proves tedious in practice.

## Security posture — what changed, what held

**Changed (deliberately):** the picker path decrypts up to 10 items instead of
exactly 1. This is the relaxation that makes the feature usable at all on a
vault like this one; it is bounded by `PICKER_MAX`, conditional on genuine
ambiguity, and the decrypted passwords are discarded before the picker opens.

**Held (stated precisely):**

- **No password reaches the *overlay* renderer.** Picker rows carry usernames
  and metadata only — not even vault or item ids. The *selected* password does
  of course reach the target tab's isolated world and is then written into the
  page, which is inherent to autofill: once written, the page's own scripts can
  read it and may transmit it. The claim is scoped to the picker surface, not to
  the credential's whole life.
- Only the **selected** password is deliberately retained or referenced at fill
  time (the re-read after selection); the enumerated ones are released first.
  As above, this is a statement about what the code holds, not a guarantee that
  released strings have been collected or zeroed.
- The fill itself is unchanged: isolated world, nonce + element-identity
  authorization, single-use stash, confirmation gate for heuristic targets.
- **Blanc** never persists, logs, syncs or transmits it; `[1p-spike]` lines
  still carry no values. (What the *page* does with a filled field is outside
  Blanc's control, as with any autofill.)

## Non-goals

Type-to-filter; remembering a choice per host (that would mean persisting a
host → item mapping, a new store and a new privacy surface); de-duplicating the
vault; showing TOTP or other fields; touching the fill path.

## Testing

**Unit (pure, `node --test`, no SDK/Electron):**

- `tierOf`: exact host → 1; page-is-subdomain-of-item → 2; sibling subdomain →
  3; different registrable domain → `null`; an item with several hosts takes its
  best tier.
- `rankMatches`: keeps only the best tier (a tier-1 item **excludes** all tier-2
  and tier-3 items); sorts by `updatedAt` descending; caps at 10 and reports
  `truncated`; a single survivor is returned as such (the caller skips the
  picker); empty input is safe.
- **Real-vault regression**, as fixtures derived from the probe: 20 `google.com`
  candidates against page `www.google.com` → exactly 1 kept; the same set
  against `accounts.google.com` → only the tier-1 group survives (no tier-2 or
  tier-3 item appears), capped at 10, with `truncated` equal to the remainder.
  Assert the relationship (`kept.length === 10 && truncated === tier1Count - 10`)
  rather than a hard-coded number, so the fixture can be regenerated from the
  vault without the test becoming a lie.
- `tierOf` / `rankMatches` **determinism**: candidates with identical
  `updatedAt` sort by `title` → `host` → `itemId`; shuffling the input array
  yields an identical `kept` list (run the same fixture in several orders and
  assert equality) — this is the property the cap depends on.
- **Host selection**: an item whose best tier is reached by several websites
  reports the lexicographically smallest.
- Picker payload builder: rows contain **only** `username`/`title`/`host`/
  `vaultName` — asserted by exact key-set comparison, so adding a field later
  cannot silently leak `vaultId`, `itemId` or a password into the renderer
  payload.
- **Reply validation** (pure predicate, extracted so it is testable without
  Electron): accepts `null` and in-range integers; rejects `-1`, `len`, `1.5`,
  `'0'`, `NaN`, `undefined`, and a mismatched `requestId`. A second valid reply
  for a settled request is inert.
- **Settlement is exactly-once**: settling twice resolves once and leaves no
  pending state; each route in the settlement table resolves the promise
  (asserted against the main.js source for the wiring, and directly for the
  helper's idempotence).

**Contract tests for the lifecycle rules (each proves a rule that would
otherwise be prose):**

- **A rejected reply leaves the live request pending.** Feed the validator a
  wrong-sender reply and a stale-`requestId` reply; assert the pending request
  is *still pending* after each (no resolution, no state change), then feed a
  valid reply and assert it resolves with the chosen index. This is the
  regression guard for rev.2's contradiction, where a stale reply could cancel a
  different live picker.
- **Selection + failed focus restoration never decrypts.** With
  `restoreTabFocus` stubbed to return `false`, assert the flow returns
  `abort-wc-changed` and that `revealCredential` was **never called** — asserted
  on the call, not on log text, since a log line would pass even if the decrypt
  had happened.
- **Enumeration holds at most one item at a time.** Inject a fake client whose
  `items.get()` increments a counter on entry and decrements on exit; assert the
  observed maximum is **1** across a 10-candidate list. Separately, make the
  3rd call reject and assert: the picker never opens, the outcome is the fixed
  `fill-error`, no partial row list is emitted, and the thrown SDK message does
  not appear in any log line.
- **One survivor bypasses both steps.** With `kept.length === 1`, assert
  `revealUsernames` is not called and no `overlay:show` with mode
  `credential-picker` is sent — the flow goes straight to `revealCredential`.
  This is the test that keeps ranking's payoff from silently regressing into
  "always show a picker".

**Adversarial rendering — two guards, because the unit suite has no DOM.**
`test/unit/` runs under plain `node --test` and this repo deliberately carries
**no DOM library** (jsdom was rejected earlier for visibility fixtures and has
not been added), so a `document`-based assertion cannot live there. Split it:

1. **Source guard (unit, always-on).** Read `src/renderer/overlay.js` and assert
   the picker render path contains **no** `innerHTML`, `insertAdjacentHTML`, or
   `outerHTML`. Cheap, runs on every `npm run test:unit`, and catches the
   realistic regression — an author following the `innerHTML` convention used
   ~10 lines away. Scope the assertion to the picker function's source slice, not
   the whole file, since the existing scaffolding legitimately uses `innerHTML`
   with static strings.
2. **Real-DOM fixture (desktop acceptance).** In the existing Cucumber +
   Playwright-Electron harness (`test/desktop/`, `npm run test:acceptance:desktop`),
   drive a picker whose `title`, `username` and `vaultName` are
   `<img src=x onerror="window.__pwned=1">`, `"><script>alert(1)</script>` and
   `</span><b>x`. Assert the row's `textContent` equals the input verbatim, that
   `querySelector('img, script, b')` inside the row is `null`, and that
   `window.__pwned` is `undefined` — i.e. no element was created and no handler
   ran. Rows are supplied through the harness's existing test-hook surface, so
   the scenario needs no live vault.

If the acceptance harness turns out not to reach the overlay renderer, the
fallback is an explicit `jsdom` devDependency for this one assertion — a
deliberate, recorded decision, not a silent drop of the test.

**Manual:**

- `accounts.google.com` → picker lists usernames, arrow keys move, Enter fills,
  Escape cancels (`chooser-cancel`), and the truncation line is present.
- `www.google.com` → **no picker**; single match fills directly.
- A site with one saved login → unchanged, no picker.
- Cancel, then re-trigger → works (single-flight released).
- Private tab → picker respects the private theme.

## Risks

- **`updatedAt` is edit time, not last-used time** — 1Password exposes no
  last-used on the overview, so "most recently updated first" is a proxy. And
  because the cap is applied *after* sorting, it does more than order the list:
  on a tier larger than `PICKER_MAX` it decides which items remain reachable at
  all. The deterministic tie-breakers keep that selection reproducible rather
  than arbitrary, and the truncation line tells the user it happened — but a
  genuinely-wanted item can still fall outside the ten.
- **Cap of 10 hides matches** on pathological vaults. Surfaced by the truncation
  line rather than hidden, and ranking usually keeps the tier far below the cap.
- **Overlay is a renderer.** Mitigated by sending the minimum viable payload
  (no ids, no secrets) and asserting that shape in a test.
- **Focus round-trip.** The overlay steals focus like the dialog did; reusing
  `restoreTabFocus` keeps one code path. Note the abort point has moved: a
  failure now occurs *after* username enumeration has decrypted up to ten items,
  so it aborts before the **selected credential is re-read**, not "before any
  decrypt". Those enumerated passwords were already discarded at step 6.

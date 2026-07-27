# 1Password fill — credential picker: ranking + Island UI

**Date:** 2026-07-27
**Status:** Approved for planning
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
3. Sort that tier by `updatedAt` **descending**.
4. Cap at **10** (`PICKER_MAX`). `truncated` = how many were dropped by the cap.

`kept.length === 1` → fill it, no picker. `> 1` → picker over `kept`.

## Part 2 — Usernames

**`revealUsernames(candidates) → Promise<Array<{vaultId, vaultName, itemId, title, host, updatedAt, username}>>`**

For each candidate (already capped at 10), call `items.get()`, read **only** the
built-in `username` field (`id === 'username'`), and build a **fresh object**.
The decrypted `Item` — including its password — goes out of scope immediately
and is never attached to the result. A missing username yields `null`, rendered
as `(no username)`.

Two properties this preserves:

- **Passwords are dropped, not held.** After the user picks, the existing
  `revealCredential(chosen.vaultId, chosen.itemId)` re-reads that single item.
  This costs one extra decrypt but keeps the invariant that **exactly one
  password is in memory at fill time**. Holding ten decrypted passwords across
  an open dialog would be strictly worse.
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

Main holds a pending resolver keyed by `requestId` and ignores replies bearing a
stale one, so a late reply from a previous flow cannot select for this one.

**Lifecycle:**

- Escape, scrim click, and overlay blur all mean **cancel** → resolve `null` →
  `chooser-cancel`.
- A **60s timeout** resolves `null`. Without it a renderer crash would leave
  `onePasswordFillInFlight` stuck true, wedging every future ⌥⌘P.
- On any outcome the overlay is hidden and `restoreTabFocus(wc)` runs — the
  overlay takes focus exactly as the native dialog did, and the existing helper
  already handles the bounded re-assert. Its failure is gated as it is
  everywhere else: no focus, no fill.

## Part 4 — Row content

```
anthony@gmail.com                     ← primary: the distinguishing field
google.com · accounts.google.com      ← title · matched host
                             Personal ← vault, only when >1 vault matched
```

Keyboard: ↑/↓ move, Enter selects, Escape cancels. Styling follows the existing
island row conventions, including the `data-theme="private"` scope.

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

**Held:**

- **No password ever reaches the renderer.** Rows carry usernames and metadata
  only — and not even vault/item ids.
- Exactly one password is in memory at fill time (the re-read after selection).
- The fill itself is unchanged: isolated world, nonce + element-identity
  authorization, single-use stash, confirmation gate for heuristic targets.
- Nothing is persisted, logged, synced or transmitted; `[1p-spike]` lines still
  carry no values.

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
- Picker payload builder: rows contain **only** `username`/`title`/`host`/
  `vaultName` — asserted by key comparison, so adding a field later cannot
  silently leak `vaultId`, `itemId` or a password into the renderer payload.

**Manual:**

- `accounts.google.com` → picker lists usernames, arrow keys move, Enter fills,
  Escape cancels (`chooser-cancel`), and the truncation line is present.
- `www.google.com` → **no picker**; single match fills directly.
- A site with one saved login → unchanged, no picker.
- Cancel, then re-trigger → works (single-flight released).
- Private tab → picker respects the private theme.

## Risks

- **`updatedAt` is edit time, not last-used time** — 1Password exposes no
  last-used on the overview, so "most recently updated first" is a proxy. It
  orders the list; it never decides the fill.
- **Cap of 10 hides matches** on pathological vaults. Surfaced by the truncation
  line rather than hidden, and ranking usually keeps the tier far below the cap.
- **Overlay is a renderer.** Mitigated by sending the minimum viable payload
  (no ids, no secrets) and asserting that shape in a test.
- **Focus round-trip.** The overlay steals focus like the dialog did; reusing
  `restoreTabFocus` keeps one code path for the fix, and its failure aborts
  before any decrypt.

# Email aliases — feasibility exploration

**Date:** 2026-08-29
**Status:** Exploration only — no decision, nothing scheduled. Written in response to Brave shipping Email Aliases (desktop 1.94, 2026-08-28) to establish what an equivalent would take in Blanc and where the real costs live.

## What Brave shipped

Brave Email Aliases (announced 2026-08-28, desktop 1.94):

- Clicking an email field on a signup form — or a **New Email Alias** context-menu item —
  offers to generate a random masked address that forwards to the user's real inbox. The
  site never sees the real address; per-site aliases break cross-site identity joins and
  make spam sources attributable (disable one alias, the leak stops).
- Requires a **Brave Account** (new, launched alongside the feature; OPAQUE protocol so the
  password never reaches Brave's servers). The account email is the forwarding destination.
- **Five free aliases**, paid tier planned — Brave explicitly cites "significant
  infrastructure costs." Mail is spam/virus-filtered and deleted from their servers
  "within seconds" of delivery. Aliases are managed (and individually disabled) from
  Autofill settings. Desktop-only at launch; forward-only (no reply-from-alias).

Sources: brave.com/privacy-updates/39-email-aliases/, TechCrunch 2026-08-28
("Brave's browser one-ups Chrome with its new support for email aliases"),
support.brave.app article 45530506862349.

This is the Apple Hide My Email / Firefox Relay / DuckDuckGo Email Protection /
SimpleLogin category, differentiated by being built into the browser's own form surface
instead of an extension.

## Summary of findings

**The client side is very feasible.** Every UI and fill primitive the feature needs
already exists in Blanc with clean precedents, almost all built for the 1Password login
fill (v1.9.0). **The server side is the actual decision**: forwarding email requires
Blanc to operate the first service in its stack that can identify its users (a plaintext
alias → real-address mapping), plus a permanent deliverability/abuse/ops commitment that
Brave itself caps at five free aliases with a whole company behind it.

The recommended shape, if this is ever pursued, is **bring-your-own-provider first**
(SimpleLogin / addy.io / Fastmail masked email, via user-held API keys — the exact
posture of the 1Password integration: explicit-invoke, no Blanc servers, no PII held),
with an optional first-party forwarding service as a later, separately-decided phase
behind the same UI.

## Client-side feasibility (strong precedents)

### Context menu on email fields

- `src/main/context-menu.js:36-56` already has the `params.isEditable` branch
  (spellcheck, undo/redo, cut/copy/paste) where a **Use email alias** item slots in.
- Electron 44's context-menu params carry `params.formControlType`
  (`'input-email'`, `'input-text'`, …) — currently unreferenced anywhere in the repo — a
  free, reliable gate for showing the item only on actual email inputs. A fuller check
  (`autocomplete="email"`, name/placeholder heuristics) would use the injected-inspect
  path below.
- Ownership is already clean: `tab-context-menu.js:116`, `workspace-context-menu.js:51`,
  and `address-menu.js:74` all return early around editables, so `context-menu.js` is the
  single home for a page-side item.

### Filling the field

- The 1Password path (`src/main/credential-fill-controller.js`,
  `src/main/onepassword-policy.js`) fills via `executeJavaScriptInIsolatedWorld`
  (`FILL_WORLD_ID = 1001`) — no keyboard simulation — using the React-safe
  prototype-descriptor value setter plus synthetic `input`/`change` events
  (`onepassword-policy.js:451-470`), with nonce-based anti-TOCTOU re-verification
  (navigation epoch, `performance.timeOrigin`, exact-URL, focus) across every await
  (`main.js:2282-2317`, `credential-fill-controller.js:109-114`).
- That idiom is directly copyable, but there is deliberately **no generic "fill the
  focused input" primitive** — the existing scripts are hard-bound to username+password
  selection and abort on any element-identity change. Aliases need a new, simpler
  injected script; `collectCandidates` (`onepassword-policy.js:282`, records `isFocused`
  and `type`) and `sharedSelectionSource` are the reusable parts.
- Usefully inverted: `loginEvidence` already treats `type="email"` /
  `autocomplete` email as signal (`onepassword-policy.js:139-146`), and
  `isNewsletterLike` / `scopeLooksLikeSignup` (`:131`, `:173`) — which make the
  *password* fill fail closed on signup forms — are precisely the signup-form detection
  an alias feature wants as its success case.

### Picker UI

`src/main/credential-picker.js` pops a native Electron `Menu` anchored to the island
(`main.js:2296-2298`), fully renderer-free. Ideal for "use existing alias / create new
alias / manage…" — alias metadata stays out of renderer IPC, same posture as the
credential broker. Errors/confirmations via `dialog.showMessageBox` with fixed copy,
per `ERROR_COPY` in the fill controller.

### Command surface

A `/alias` command follows the `/1password` precedent exactly:

1. Entry in `copy/slash-commands.json` (substrate S3), with `"platforms"` if not
   universal.
2. Hand-mirrored into the three guarded desktop copies: `src/renderer/overlay.js`
   `COMMANDS` (with an `available:` predicate), `src/renderer/pages/shortcuts.js`
   `SLASH_COMMANDS`, and the Help-menu table in `main.js` (~`:5527`).
3. `npm run copy:build` + `npm run copy:check` (and `substrate:check` in CI).
4. Optional View-menu item + shortcut per the 1Password precedent (`main.js:5670-5674`,
   shortcuts table `:5574`).

### Settings

- Device-local enable/config keys go in `DEFAULTS` beside
  `onePasswordEnabled`/`onePasswordAccount` (`src/main/settings.js:109-113`) **and** into
  `settings-schema/schema.json`'s `internalDefaults` allowlist — `settings:check` fails
  CI on any `DEFAULTS` key in neither list.
- The alias *list* is account state, not device state: it could plausibly ride Profile
  Sync as a fifth E2EE store (`aliases` alongside
  `bookmarks/settings/session/icons` in `sync.js:89-110` and the worker's `STORES`
  set, `cloudflare/sync-worker/src/index.js:7`), so aliases created on one machine are
  usable on another with the server learning nothing.
- Any secret (provider API key) must not live in `settings.json` — use the
  `safeStorage`-wrapping precedent (`protectSyncKey` in `sync.js`).

### Known limitation: iframes

Session preloads reach **main frames only** on Blanc's configuration
(`main.js:6560-6562`; `nodeIntegrationInSubFrames` stays off — see the capture-indicator
spec, 2026-08-13, §4.1 spike). A Brave-style automatic popup on email-field focus would
therefore miss cross-origin iframe signup forms. The 1Password feature already resolved
this tension: **explicit-invoke only, scoped to the focused top-level document**
(spec/features.md F38). The same scoping applies here, and matches Blanc's stated
philosophy — never automatic.

### House-rules checklist for any implementation

- New flow entry in `security/network-data-inventory.json` (the `onepassword-login-fill`
  entry is the template).
- New `F##` in `spec/features.md` (F38 is latest) + acceptance scenario under
  `spec/acceptance/`; divergence entries (`D##`) if mobile ever differs.
- Per `docs/marketing-claims.md`: no marketing of it until it is in a public release
  with evidence.

## Server-side analysis (the actual decision)

Three findings from exploring the existing stack:

1. **Blanc has deliberately avoided exactly this.** No user email is read, stored, or
   transmitted anywhere in the app (the only two `email` hits in `src/` are field
   heuristics in `onepassword-policy.js`). Sync is E2EE behind a passphrase-derived
   opaque `accountId` the server cannot read; telemetry HMACs its install UUID; the
   supporter/patron records hold a license key and activation id, no customer identity.
   An alias service **must** hold a plaintext alias → real-address mapping to forward
   mail — no cryptographic design removes that. It would be the first Blanc service able
   to identify its users, which deserves to be an explicit product decision.

2. **The pieces are half-present but not connected.**
   - `updates.blancbrowser.com` is already a verified Resend *sending* domain
     (newsletter worker, `cloudflare/newsletter-worker/`), and the workers have
     established KV, HMAC-token, rate-limit, and **double-opt-in email-verification**
     patterns, plus the 1Password-backed deploy convention.
   - **Nothing receives email.** No `email_routing` trigger, `EmailMessage`, or
     `forward()` anywhere in the repo. A first-party service means a fourth worker with
     a Cloudflare **Email Routing** trigger on a **dedicated alias domain** (not
     `blancbrowser.com` — deliverability and abuse blast-radius isolation): catch-all →
     KV alias lookup → `message.forward()` to the verified destination. Email Routing is
     free and handles SRS; its forward-to-verified-destination requirement maps neatly
     onto the double-opt-in flow already written once.
   - **No account system is needed** to do this: a device-generated bearer token mapping
     to one verified destination address suffices — no passwords, no OPAQUE, less to
     build and less to hold. (Brave needed accounts for its paid tier; Blanc would not,
     at least initially.)

3. **The dominant cost is operational, not code.** Spam/virus posture, deliverability
   incidents, abuse handling (aliases used to sign up for abusive services trace back to
   *our* domain), and any "deleted after delivery" promise become permanent commitments
   on an indie project. Brave capped free usage at five aliases citing infrastructure
   cost. This term, not engineering effort, decides Phase 2 below.

## Recommended shape (if pursued)

**Phase 1 — provider-backed aliases (client-only).** Build the full client surface —
context-menu item gated on `formControlType === 'input-email'`, native picker, injected
fill, `/alias`, settings, spec/inventory entries — calling the **user's own alias
provider** (SimpleLogin and/or addy.io at launch; both expose alias-creation APIs against
a user-held API key; Fastmail masked email likewise). Zero Blanc servers, zero PII held,
no forwarding liability; works day one for users who already pay for these. Effort is
roughly the scope of the shipped 1Password fill feature. API-key handling follows the
broker/`safeStorage` precedents.

**Phase 2 (optional, separately decided) — first-party "Blanc Alias" service** on
Cloudflare Email Routing, appearing as just another provider behind the unchanged Phase 1
UI: a provider adapter plus the fourth worker. Only worth deciding after Phase 1
demonstrates demand, because it front-loads the one genuinely uncomfortable architectural
break — a Blanc server that knows who its users are — and the open-ended ops commitment.

Skipping straight to Phase 2 is technically feasible (nothing in the stack blocks it) but
buys the liability before the feature has proven itself.

## Open questions

- Which launch providers, and whether provider scope justifies the feature at all for
  Blanc's audience (SimpleLogin/addy.io users are a privacy-enthusiast slice that
  overlaps Blanc's, which cuts both ways: well-matched, but they may already have
  extensions/apps for this).
- Whether the alias list syncs (fifth E2EE store) in Phase 1 or stays device-local.
- Whether `/alias` enters the governed slash-command substrate at launch or starts as a
  menu/context-menu-only surface (the 1Password spike deliberately deferred its command
  for the same reason).
- Phase 2 only: alias domain choice, retention wording we can honestly commit to, abuse
  policy, and whether a cap (Brave's "five free") is needed even without a paid tier.

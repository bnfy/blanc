# Blanc Patron — a recurring supporter tier with a real reason to upgrade

**Date:** 2026-08-18
**Status:** **Locked** 2026-08-18 (after review round 3). Ready for implementation planning.
**Supersedes/extends:** [2026-07-06 Monetization Phase 1](2026-07-06-monetization-phase1-design.md) (the one-time $19 "Blanc Supporter")

## Context

Phase 1 (July 6) laid trust-aligned rails: a Polar Sponsor button, a "Support Blanc"
site link, and **Blanc Supporter** — a **$19 one-time** license unlocking three cosmetic
Dock colorways (`ember`, `plum`, `gold`), macOS-only. Its governing philosophy, encoded
in `src/main/supporter.js`: *activate once online, trust the local record forever — no
revalidation, no lockout, works offline; perks are cosmetics, DRM would betray the brand.*
Phase 1 explicitly deferred "Sync (paid), a Pro subscription, and search partnerships" to
future phases.

This spec is that next phase, chosen through brainstorming with these decisions locked:

- **Goal:** build toward real income (not merely rails, not merely cost-recovery).
- **Engine:** consumer **recurring** revenue — the model that compounds with the audience
  being grown, chosen over B2B/white-label and search-rev-share as the near-term lead.
- **Honest expectation, stated up front:** at Blanc's current scale (~738 cumulative
  downloads, a few hundred active installs) a supporter subscription is **supplementary**
  income, exactly as Orion+ is supplementary to Kagi's search subscription. Competitive
  research confirmed the pattern: no independent browser makes *real* income from the
  browser alone at small scale — the ones that do have either scale (Vivaldi's search
  rev-share, millions of users) or an adjacent paid product (Kagi search, Mullvad VPN).
  Zen — larger than Blanc — still runs on donations alone. Patron is the **rail that is
  ready when scale arrives**; it is not expected to be a salary today. The "real income"
  ambition needs a second leg later (scale → a privacy search rev-share, or an adjacent
  product), noted here and out of scope for this spec.

### Why "Patron"

Named to sidestep the saturated tier ladder (Plus / Pro / Premium / Ultra / Max) entirely.
Blanc rejects the corporate browser playbook everywhere else; the paid tier should too.
"Patron" names the **relationship** — funding independent work — not a power level. It fits
Blanc's quiet, faintly literary register (the same register as `paper`/`ink`/`sage`,
Quiet Tabs, lowercase mono group labels), and it resolves the Supporter question cleanly:

- The **product** is **Blanc Patron**.
- A subscriber **is a Patron**.
- **Existing one-time Supporters become founding Patrons** — grandfathered permanently,
  honoring the "trusted forever" promise already in the code. "Supporter" survives as the
  umbrella word for anyone who has ever chipped in (one-time donors + Patrons).

## The free / paid line (the load-bearing principle)

**Non-negotiable: Patron only ever ADDS. Nothing shipped today ever moves behind it.**
Charging for a currently-free feature is a bait-and-switch a privacy audience punishes
hard. This principle already caught one error in design: open-tab + tab-group sync was
initially proposed as the paid anchor, but a grep of `sync.js` / `tabsync.js` /
`session-snapshot.js` confirmed it is **already shipped and free**, gated only by a free
per-device "share this device's open tabs" toggle. Paywalling it would have violated this
principle. Corrected below.

### Free forever

- **All existing browsing features**: ad/tracker blocking (EasyList/EasyPrivacy, on by
  default, both sessions), the Island, Quiet Tabs, Reopen Closed Tab, private tabs, tab
  groups, local profiles, the Quick Switcher, slash commands, permission policy, WebAuthn.
- **All of today's Profile Sync**: Favorites, settings, **and open-tab / tab-group
  snapshots**. Whatever a user can sync today, they keep syncing, free, forever. (Note:
  Profile Sync and remote-tab presentation are **Personal-profile only** today; this spec
  does not change that.)

**Brand sentence (revised).** The earlier "everything that runs on your machine is free"
was false once the anchor became an on-device paid feature (Named Workspaces, custom
bindings). The honest line is:

> **Core browsing stays free forever. Patron funds Blanc and adds optional organization
> tools — it never gates the browsing you already do.**

### Patron (recurring, strictly additive)

| Benefit | Kind | Cost to run | Status |
|---|---|---|---|
| **Named Workspaces** (the anchor) | On-device | ~zero | New build (this spec) |
| Custom slash commands / keybindings | On-device | ~zero | New build (follow-on) |
| The three cosmetic colorways (`ember`/`plum`/`gold`) | On-device | ~zero | Already ships; re-gate under Patron |
| Patron badge in Settings | On-device | ~zero | New (light) |
| **v2 authenticated sync** (more devices, higher limits, faster) — *future flagship* | Server | real, recurring | Separate project; out of scope here |

Two benefits that would otherwise look "light" are deliberately **not** in this project:
- **v2 sync** — unbuilt, its own reviewed project. Named as the future flagship; it also
  completes a compounding story (Named Workspaces on-device now; v2 sync later lets them
  follow you across devices).
- **Early-access / release-candidate channel** — moved out of scope. It is *not* a light
  perk: the current updater has exactly one signed public-release path, and a Patron-only
  channel needs its own artifact, update metadata, signing, rollback, and access-control
  design. That is its own project (see Out of scope).

## Anchor feature — Named Workspaces

**What it is:** user-facing, savable, nameable sets of tabs + groups that a Patron can
switch between and restore — "Work," "Personal," "Project X." The organizational tier above
tab groups.

**Why it anchors (where generic "workflow" did not):** graspable ("save and switch between
named sets of tabs" needs no explanation), **sticky** (once you've built your workspaces
you're invested in your own setup — a retention driver, which is what makes a subscription
hold), proven (the headline upgrade feature in Arc and Vivaldi), and on-brand (living behind
Patron keeps the free browser minimal — Patron *protects* Blanc's minimalism rather than
fighting it).

**Additive, verified:** "workspace" in Blanc today is **purely internal** — the per-window
session-persistence layer in `src/main/session-workspace.js` (versioned records in
`session.json`), with **zero user-facing surface** (no UI, no copy references). So a Named
Workspaces feature is genuinely new — nothing is taken away.

### Workspaces are profile-scoped (correctness requirement)

`session-workspace.js`'s `EMPTY_ENTRY` carries a `profileId`, and that is load-bearing: a
workspace **cannot move tabs between named local profiles**, because each profile has its
own Electron session — cookies, storage, and remembered permissions differ. A tab restored
into the wrong profile would be logged out or mis-scoped. Therefore:

- **A workspace belongs to exactly one local profile.** Switching workspaces only ever swaps
  tab sets *within* the current profile; there is no cross-profile workspace.
- **Storage: a profile-scoped `workspaces.json`**, one `JsonStore` per profile (Personal at
  the userData root like its other JSON files; named profiles under `profiles/<opaque-id>/`,
  matching where profile Favorites/history/permissions already live). It is **not** folded
  into `session.json` — that file carries the delicate v2 + v0-flat rollback mirror for
  1.0.x downgrades, and piling user-named workspaces into it would put that at risk.
- **Relationship to `session.json`:** `session.json` remains the *live* window state (its
  rollback mirror untouched); `workspaces.json` holds the *saved* named sets. Switching
  writes the current live set into its workspace slot, then loads the target into the live
  window — so nothing is lost on switch.
- **Never exported by sync.** Sync is Personal-only and does not carry workspaces; workspaces
  stay device-local in this project (v2-sync-carries-workspaces is future work).
- **Deleted with the profile.** Because `workspaces.json` lives under the profile directory,
  the existing profile-deletion path (which drops the profile dir and its saved state)
  removes it automatically.
- **Private tabs are never captured** into a workspace (consistent with their exclusion from
  session persistence).

### Workspace runtime (Blanc has many windows)

- **Single-window binding.** A named workspace is bound to **at most one window at a time.**
  Opening a workspace already active in another window **focuses that window** instead of
  double-binding it. This removes concurrent-edit conflict *by construction* — no two windows
  ever write the same slot.
- **Scratch windows.** A window not bound to a named workspace is a **scratch** session — the
  ordinary live `session.json` state that exists today. It persists across restart exactly as
  now, and never writes into a named slot until the user explicitly **"Save as workspace."**
- **Autosave, continuous.** A window bound to a workspace **continuously mirrors** its live
  tab set into that workspace's `workspaces.json` slot (debounced, exactly as session
  persistence already debounces). So the bound workspace is always current — "nothing is lost
  on switch" means *autosave-on-change*, not save-only-at-switch: the outgoing workspace is
  already saved before the incoming one loads.
- **Delete / lapse.** Deleting a workspace unbinds any window showing it (that window becomes
  scratch). On Patron lapse, existing workspaces stay openable/switchable; only *creating new*
  ones is gated — **no free-tier floor** (decided this round).

**Shape (to be detailed at plan time):** a workspace = a named, persisted set of
`{urls, groups, groupIds, pinned, activeIndex, meta}` (the fields `EMPTY_ENTRY` already
models), tagged with its `profileId`. Management UI (create / rename / switch / delete /
save-current-as) reached from the Island's ⌘L panel. Persistence in a versioned
`workspaces.json` with its own migration path.

## Entitlement mapping & legacy cutoff

A single boolean "has a Polar key" is unsafe: it cannot tell a $19 Supporter key from a
Patron key, so a **newly sold $19 key could silently grant permanent (founding-grade)
Patron** for $19. The mapping must be explicit and the legacy product retired at the source.

- **Per-environment `benefit_id` allowlist.** Maintain a constant map (separate sandbox and
  production tables, mirroring the existing `app.isPackaged` API-base switch) from Polar
  `benefit_id` → entitlement kind:

  | Polar benefit | Kind |
  |---|---|
  | the $19 one-time Supporter benefit | `founding` |
  | Patron annual benefit | `subscription` |
  | Patron monthly benefit | `subscription` |
  | Patron lifetime benefit *(reserved; no product sold at launch)* | `lifetime` |

  On activate and on validate, read `benefit_id` from Polar's response and resolve the kind
  from this map. **An unrecognized `benefit_id` grants nothing** (fail closed on mapping —
  the one place we fail closed rather than open).

- **Setup invariant: each product uses a *distinct* license-key benefit.** The allowlist is
  only sound if the $19 Supporter, the monthly, and the annual products each attach a
  **different** license-key benefit (distinct `benefit_id`). Polar itself recommends this —
  *"Offering more than one type of license key? Be sure to validate their unique
  `benefit_id`."* **Verify the distinct `benefit_id`s in sandbox before the production
  cutover** ([Polar guide](https://polar.sh/docs/features/benefits/license-keys)).

- **Retire the $19 checkout at launch.** Close/archive the $19 product's *checkout* so **no
  new $19 keys can be minted** — this is the actual protection against "a newly sold $19 key
  becomes a Patron," because none can be sold.

- **Preserve existing keys, including late first-activations.** Keep the $19 benefit_id in
  the allowlist mapped to `founding` **permanently**. The cutoff is "no new sales," **not an
  activation-date cutoff** — a customer who bought before launch but first activates on a new
  device months later still validates against that benefit_id and resolves to `founding`.
  Since the checkout is retired, this preserves real customers without leaving a path to buy
  founding status cheaply.

- **Already-activated legacy records.** An on-device `supporter` record predates the mapping
  and stores no `benefit_id` (the activate flow only kept `{key, activationId, activatedAt}`).
  These migrate directly to `{kind:'founding', benefitId: null, …}` — trusted as-is, no
  re-validation, consistent with "trust forever." Only *fresh* activations/validations (which
  do return a `benefit_id`) are subject to the allowlist.

## Entitlement model — reconciling a subscription with "no DRM, works offline"

The existing model (`isSupporterActive() === !!settings.supporter` — true forever once set)
was built for a **one-time** purchase and cannot represent a lapsing subscription.

**Guiding rule:** preserve the no-DRM spirit through **graceful degradation, never lockout**,
and **never touch user data**. Validation is minimal, off the critical path, offline-tolerant,
and non-punitive.

### Entitlement record — `patron` is the single canonical record

`patron` (new) is authoritative. The legacy `supporter` key is demoted to a **downgrade
mirror** only (below). Target rule: **no Patron-era entitlement check may read `supporter`** —
`patron` is authoritative, and `supporter` exists only as the compatible downgrade mirror.
(Today's `isSupporterActive()` still reads `supporter`; that read is *replaced* by
`isPatronActive()`, which is part of this work.) Both records are written **only** by the
activation/validation flow (the generic `setSettings()` whitelist must ignore **both**, as it
ignores `supporter` today), and both are **device-local, never synced** (outside
`SYNCED_KEYS`).

```
patron: null
  | { kind: 'founding' | 'lifetime',  key, activationId, benefitId, activatedAt }
  | { kind: 'subscription',           key, activationId, benefitId, activatedAt,
      lastValidatedAt, lastAttemptedAt, lastStatus }
```

`isPatronActive()`: unconditionally true for `founding`/`lifetime`; for `subscription`, true
while the validation model says active (active period **or** offline-grace window).

**Renderer projection — required edit.** Today `getSettings()` strips only `supporter`. It
must strip **both `supporter` and `patron`** and expose only the derived boolean
`patronActive` (a superset of today's `supporterActive`) plus at most a coarse label —
otherwise a raw `patron` record (key, activation id) leaks to the privileged renderer. This
is a mandatory change, not optional.

**Migration (upgrade).** On first run of a Patron build, if `supporter` is non-null and
`patron` is null, create `patron = { kind:'founding', benefitId: null, … }` from it (see the
legacy-record note under Entitlement mapping). Idempotent; runs once.

**Downgrade mirror + the subscription hazard.** For `founding`/`lifetime` only, keep the
legacy `supporter` record populated, so a user who rolls back to a pre-Patron build still has
their permanent grant honored (old code reads `!!supporter`). **A `subscription` is *never*
written to `supporter`** — an old build interprets any non-null `supporter` as a *permanent*
grant, so mirroring a subscription there would hand a lapsing subscriber free cosmetics
forever on the old binary. So on downgrade: founding/lifetime survive; a subscription is
simply not a concept the old build knows, and its cosmetic reverts there — correct.

### Validation model (subscription kind only; founding/lifetime never validate)

Uses Polar's **public customer-portal validate endpoint** — no server secret:
`POST {API_BASE}/v1/customer-portal/license-keys/validate` with
`{ organization_id, key, activation_id }` (the `activation_id` is required because the
activation limit is enabled). Polar **automatically revokes the key when its backing
subscription is cancelled**, so the key's own status is authoritative — we do not track
subscription periods ourselves. (Doc:
[Polar license-key guide](https://polar.sh/docs/features/benefits/license-keys); the former
API-reference deep link 404s and is not cited.)

**Expiration is a field, not a status.** The response carries a `status` **plus a separate
`expires_at`**. Do not treat `expired` as a status value. Handle three status classes
distinctly:
- **`granted`** and (`expires_at` null or in the future) → **active**; set
  `lastValidatedAt = now`.
- **known terminal statuses** (`revoked`; `disabled` if returned), or `granted` with a
  *past* `expires_at` → **confirmed terminal lapse** → graceful degradation immediately (the
  customer had Polar's own renewal window before revocation; confirmed non-payment gets no
  extra grace).
- **any unknown status** → treat as **ambiguous**, exactly like an unreachable network: stay
  active, do **not** advance `lastValidatedAt`, subject to the offline grace. Never revoke on
  a status we do not recognize.

**`benefit_id` location differs by endpoint** — the activate payload nests the key under
`activation.license_key`, while validate returns the key at the response root. Resolve
`benefit_id` **defensively** (check the root, then `license_key.benefit_id`, then
`activation.license_key.benefit_id`) and **pin the exact paths during sandbox setup** (see
the distinct-benefits invariant).

- **Cadence:** at most once per day, guarded by `lastAttemptedAt` (written on every attempt,
  success or failure, so we never hammer Polar); backgrounded on idle after launch; never on
  the critical path; never blocks UI.
- **Offline grace:** the 30-day clock runs from `lastValidatedAt`. **Bootstrap
  `lastValidatedAt` at activation time** — activation is itself an online success — otherwise
  a subscription that goes offline immediately after activating has no valid grace origin. If
  `now − lastValidatedAt > 30 days` **and** the latest outcome is still ambiguous/unreachable,
  degrade (grace exhausted).
- **Only a confirmed terminal status revokes.** Network failure, ambiguity, and unknown
  status never revoke — they ride the 30-day offline grace.

### Graceful degradation on confirmed lapse

A lapsed Patron **never loses access to their own data and is never locked out of the
browser.**

- **Cosmetic colorway** reverts to the free default. This already works exactly:
  `isAppIconAllowed()` returns false for a supporter colorway when supporter is inactive, and
  on the **read** path `getSettings()` sanitizes an unauthorized `appIcon` back to
  `DEFAULTS.appIcon` (which is **`paper`**), while on the **write** path an unauthorized
  `appIcon` is simply **ignored** (not copied into the cleaned partial). The Patron check
  extends this same predicate — no new mechanism.
- **Named Workspaces**: existing workspaces stay fully **openable, switchable, and
  restorable** — saved sets are never lost. Only **creating new** workspaces is Patron-gated;
  **no free-tier floor** (a lapsed Patron keeps everything they built, just can't add more).
- **Custom commands / keybindings**: previously configured ones keep working (or degrade to
  read-only); no new ones while lapsed.
- **Re-activation** restores full capability immediately; nothing was destroyed.

## Pricing

**Decided: launch monthly + annual only; no paid lifetime plan at launch.** This best
matches the recurring-income goal and avoids a lifetime option cannibalizing the subscription
while the audience is small; a limited **$150+ superfan lifetime** stays available to
introduce later. Benchmarked against Orion+ ($5/mo · $50/yr ·
[$150 lifetime](https://europe-west.kagi.com/onboarding?p=orion_plan)); Blanc prices under it,
annual-preferred (annual reduces churn and matches the indie preference for infrequent
billing):

- **Annual — $30/yr** (headline, ~$2.50/mo) — provisional number, tunable at setup, not
  blocking.
- **Monthly — $4/mo** — provisional; offered but de-emphasized (monthly churns).
- **No lifetime product at launch.**
- **Founding Patrons:** existing $19 Supporters → **permanent (lifetime-equivalent) Patron,
  free** — the one lifetime-shaped grant that ships, and it costs nothing to honor.

The `lifetime` entitlement kind stays in the model (founding grants are lifetime-equivalent,
and it reserves the future superfan option), but **no `lifetime` product is sold at launch.**
Framing everywhere: transparent, "this funds an independent developer and the servers,"
never premium pressure.

## Polar integration

- Keep the existing one-time product **but retire its checkout** (see legacy cutoff); its
  keys and benefit_id live on for founding Patrons.
- **Add** Polar **annual + monthly** subscription products (no lifetime product at launch),
  each with its **own distinct license-key benefit** (the setup invariant above), under the
  same org (`bnfy`, `POLAR_ORGANIZATION_ID` already in `supporter.js`).
- Activation reuses the existing customer-portal license-key **activate** path; the
  **validate** path (above) is added for the subscription kind.
- Dev continues to hit `sandbox-api.polar.sh`; packaged hits production — the existing
  `app.isPackaged` switch (and the per-environment benefit_id map) are the only environment
  seams.
- Account/product setup is **user-side** (as in Phase 1); the assistant does not create
  products or handle keys.

## Brand & privacy guardrails (must all hold)

1. Core browsing and **all of today's sync** stay free, forever.
2. **No browsing-data collection and no ad-tech.** (Not "no data collection" — see #6.)
3. No hard lockout and **no user-data loss** on lapse — degrade, never punish.
4. Entitlement is device-local, never synced; renderers see only a boolean.
5. **30-day offline grace, not "fail open."** A network failure, ambiguous response, or
   unknown status keeps Patron active *within* the 30-day grace window (measured from the
   last successful validation); only a **confirmed terminal status** revokes, and prolonged
   unreachability degrades **after** the grace window. The one fail-*closed* path is an
   unrecognized `benefit_id` at activation (grants nothing).
6. **Disclose the validation call plainly.** Activating, and — for subscriptions —
   periodically validating, sends the license key + activation id to Polar, and Polar
   receives normal request metadata (e.g. IP). It is the **only outbound identifier
   introduced by Patron** — Blanc already has opt-out telemetry and opt-in sync; Patron adds
   no browsing data to any path — it runs off the critical path, and it is disclosed in the
   Patron settings copy and the privacy page. Overclaiming absolute privacy would itself be a
   betrayal.

## Implementation phases (decomposition for the plan)

One coherent product, built in dependency order — the plan (writing-plans) details each:

1. **Entitlement layer (foundation).** The `patron` record and the three kinds; the
   per-environment `benefit_id` allowlist; migrate existing `supporter` records to
   `founding`; retire the $19 checkout (user-side) while preserving its mapping; Polar
   activate + the subscription-only validate/grace/degradation model; renderer-facing
   `patronActive` boolean. Re-gate the three colorways under Patron (grandfathered for
   founding). Nothing else gates until this exists.
2. **Named Workspaces (the anchor).** Profile-scoped `workspaces.json` (new `JsonStore` per
   profile); lift `session-workspace.js` entry shape to first-class user-named workspaces;
   management UI in the ⌘L panel; versioned persistence + migration; Patron-gated *creation*
   with graceful lapse behavior; deletion-with-profile.
3. **Supporting bundle.** Custom slash commands / keybindings; Patron badge in Settings.
4. **Site + copy.** A restrained Patron section (voice per `site/CLAUDE.md`) with the plain
   validation disclosure; the app remains free in JSON-LD (`offers` price 0 unchanged) —
   Patron is a separate product, not an app price.

## Out of scope (deliberate)

- **v2 authenticated sync** (Durable Objects) — its own reviewed project; the future flagship.
- **Patron-only early-access / RC update channel** — its own project (artifact, update
  metadata, signing, rollback, and access-control design); not a light perk.
- The "real income at scale" second leg (search rev-share / adjacent product).
- Mobile Patron perks (no mobile app ships yet).
- Windows/Linux cosmetic colorway parity (the Dock swap is macOS-only today — known Phase 1
  limitation, unchanged).
- Any anti-piracy / revalidation-on-launch / lockout mechanism.
- Cross-profile or synced workspaces (single-profile, device-local in this project).
- Polar account and product setup (user-side).

## Decisions resolved this round (your calls)

1. **No paid lifetime at launch** — monthly + annual only; the founding $19 grant stays; a
   $150+ superfan lifetime is reserved for later. Folded into Pricing.
2. **Existing-workspaces-only on lapse** — no one-workspace floor; every saved workspace is
   preserved, only creation is gated. Folded into the runtime and degradation sections.

**No open decisions remain in the design.** The only provisional items are the exact
$30 / $4 numbers, tunable at Polar-setup time; they do not block the plan.

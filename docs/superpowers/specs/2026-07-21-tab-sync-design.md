# Tab Sync — open tabs from your other devices

**Date:** 2026-07-21
**Status:** Approved
**Builds on:** [2026-07-07-profile-sync-design.md](2026-07-07-profile-sync-design.md) — this is the "session" store that spec deferred (§4, v2+) and the worker reserved (`// history/session added in a later phase`).

## 1. What this is

Profile Sync grows a third store: each device publishes a snapshot of its open tabs (with groups and pinned state), and every other synced device can browse that snapshot read-only and open individual tabs locally. This is the Firefox/Safari "tabs from other devices" model — **not** a merged live session. Nothing ever force-opens or closes a tab on another machine; the snapshot is a menu, not a mirror.

Chosen over two alternatives during brainstorming:
- **Workspace hand-off** (explicit push/pull of the whole session) — rejected as less ambient; the passive list covers the hand-off case (open the tabs you want) without a new verb.
- **Continuously mirrored session** — rejected: union-merging live tab state needs close-tombstones, high-frequency sync, and produces surprise tab churn in a one-window browser.

## 2. Experience

- **⌘L panel:** below the local groups' section, one collapsed header per remote device — `blanc on MacBook Air · 5 tabs · 2h ago` — using the same fold/unfold pattern as group headers. Clicking a row opens that URL as a plain new local tab (ungrouped, normal `createTab` path; no group reconstruction in v1). Devices with zero tabs, retracted entries, and the local device itself never render.
- **Quick Switcher:** remote tabs join the match pool (existing loose substring/in-order matching), ranked below local tabs and favorites. Rows carry the device name.
- **Start page:** an "on your other devices" block after the tab-groups section, fed via the `startPage` hooks (`pages:start:data` grows `remoteDevices`). Clicking navigates the current tab, same as favorites there. Renders only when remote snapshots exist — the ledger page stays quiet otherwise.
- **Settings → Sync:** a "Share this device's open tabs with your other devices" checkbox, **off by default for everyone** (fresh setups included). The resting pill is unchanged.

## 3. Consent model

Open tabs are browsing data — a step more sensitive than favorites/settings, and existing sync users only ever consented to those. Therefore:

- The toggle (`syncTabs`) is **per-device** and **off by default**; an app update never silently starts uploading tab URLs. Turning it on is always an explicit act on that device.
- It lives in **`sync.json`, not `settings.json`** — device-local by construction, structurally incapable of crossing settings sync (same posture as `usagePing`'s per-install consent).
- The toggle gates **publishing only.** When off, this device's exports omit (or retract) its entry, but the store still pulls and merges — so enabling tabs on one machine is immediately visible from the others without a second toggle. Reading is not a consent question: the data is the account's own, E2EE end to end.

## 4. Data model

New module `src/main/tabsync.js` owning `JsonStore('tab-sync', { devices: {} })` — the last-merged device map, including our own published entry:

```
devices: {
  <deviceId>: {
    name,        // os.hostname(), read fresh at each publish so renames propagate
    platform,    // process.platform, for row labeling
    updatedAt,   // ms epoch — the LWW clock for this entry
    retracted?,  // true = "forget this device's tabs" (see §5)
    tabs: [{ url, title, groupId, pinned }],
    groups: [{ id, name }],
  }
}
```

- **`deviceId`** is a random UUID minted lazily, stored in `sync.json`. It is deliberately **not** the telemetry `installId` — nothing may attach to that identifier (CLAUDE.md), and browsing data least of all.
- **Snapshot contents** reuse the exact filter `persistSession` already applies, extracted into a shared `snapshotPersistableTabs()` in `main.js`: private tabs and private-only groups never enter, `blanc://error` URLs unwrap to their real destination. Defensive caps: 500 tabs per device, titles truncated to 200 chars.
- Snapshots mirror `session.json`'s persistable data but flow through their own store; `session.json` itself is untouched.

## 5. Merge semantics

Union by `deviceId`, last-writer-wins per entry on `updatedAt`. Each device only ever rewrites its own entry, so merges are commutative and idempotent — the existing pull-merge-push loop and 409 re-pull-merge retry in `sync.js` work unchanged.

- **Retraction:** toggling `syncTabs` off publishes our entry as `{ retracted: true, updatedAt: now }`, which LWW-beats every stale copy of our tabs held by other devices. Retracted entries render nowhere.
- **Pruning:** entries (retracted or not) whose `updatedAt` is older than **30 days** are dropped at merge/export time — a dead device's tabs quietly age out with no server-side TTL needed.
- **Own-entry refresh:** `exportForSync()` rebuilds our entry from live tab state (when `syncTabs` is on) before every push.

## 6. Sync integration

- `sync.js`'s `STORES` gains `{ name: 'session', export: tabsync.exportForSync, merge: tabsync.mergeFromSync }`. Order still doesn't matter.
- **Scheduling:** tab state churns far faster than favorites/settings (~10 broadcasts/s while loading), so tab-driven changes schedule sync through a longer debounce (**15s**) via a `tabsync.onLocalChange` hook fed from the same call sites as `persistSession`. Favorites/settings keep their existing 4s `schedule()`.
- Sync-on-launch (already present) publishes a fresh snapshot after session restore.
- **Quit:** a best-effort fire-and-forget `syncNow()` in `before-quit`. A change made in the final seconds before quitting may not upload until that device next launches — an accepted, documented limitation; no blocking of quit on network.

## 7. Worker (`cloudflare/sync-worker/`)

- `'session'` joins the `STORES` whitelist — the one-line change the code comment reserved. `handleDelete` already iterates `STORES`, so account-wide wipe covers the new blob automatically.
- `MAX_BLOB_BYTES` stays 512 KB (500 tabs ≈ 150 KB even before compression). Rate limits unchanged; one extra GET+PUT per sync cycle is well inside them.

## 8. Privacy & threat model

- Tab URLs and titles ride E2EE exactly like favorites: AES-256-GCM client-side, the worker sees only ciphertext under an opaque `accountId`.
- This payload is a step toward the original spec's "payload grows teeth" note (§ threat model): open tabs ≈ a slice of live browsing history. The stance holds — **confidentiality-only claims; availability and rollback remain explicit non-goals** — and the original spec's hardening path (auth token on PUT/DELETE, AAD-bound counter) remains the trigger if the payload deepens further (full history, credentials — the latter still "never").
- Private tabs never enter the snapshot (inherited from the `persistSession` filter; pinned by a unit test).
- `syncTabs` and `deviceId` are device-local and never synced. The telemetry `installId` is untouched.

## 9. Testing

Unit tests (`test/unit/`, node --test):
- Merge: per-device LWW; retraction beats stale copies and cannot be resurrected by an older entry; 30-day pruning; tab cap and title truncation enforced on export.
- Snapshot builder: private-tab exclusion, private-only group exclusion, error-URL unwrapping.
- Consent gating: `syncTabs` off → export omits/retracts own entry while merge still applies remote entries.

Acceptance: a Gherkin scenario added to `spec/acceptance/` (dry-run-resolvable; desktop step bindings as feasible under `BLANC_TEST`).

## 10. Bookkeeping

- Update the profile-sync spec's §4 table: `session.json` row v2+ → shipped as the other-device tab list (this doc); "Live tabs from my other device" row → superseded by this doc's non-real-time model.
- Add feature entry **F27** to `spec/features.md` (F26 is the current highest) — this is user-facing contract future mobile ports must honor — plus the parity-matrix row.
- No substrate impact: `syncTabs` is not a `settings.json` key (no `settings-schema` change); no token or slash-command copy changes. Settings-page checkbox copy is plain HTML in `pages/settings.html`.

## 11. Out of scope (v1)

- Opening a whole remote group at once ("open all here").
- Real-time presence / push freshness (the 15s debounce + pull-on-launch cadence is the freshness).
- Remote-closing tabs on another device; any write path targeting another device's entry.
- History and downloads sync (unchanged from the original spec's phasing).

# Sync discoverability and setup — design

**Date:** 2026-09-17
**Status:** approved design, awaiting implementation plan
**Trigger:** a Product Hunt reviewer on launch day (2026-09-17) wished Blanc had
cross-device sync. Blanc has shipped end-to-end encrypted sync since v0.12.0 and
open-tab sharing since v0.20.0. Nothing in the app, the site, or the listing
points at it, and the setup card assumes knowledge it never gives.

## 1. Problem

Sync is invisible and, once found, easy to misuse.

- The Product Hunt description and first maker comment never mention sync.
- The homepage mentions sync only in the privacy footnote. The site's sync page
  is framed as *tab* sync; favorites and settings sync are implied at best.
- The app uses three names: "Sync" (Settings nav), "Profile Sync" (profiles
  copy, site), and "Tab Sync" (release notes, site title).
- The six-step welcome tour does not mention it. Settings lists it fourth of
  seven groups.
- The setup card shows two bare inputs, "Sync name" and "Passphrase". It never
  explains what a sync name is, and there is no visible way to connect a second
  device. The design relies on the person typing the same name and passphrase
  again; a typo silently forks a new, empty account, and today the app only
  discovers that *after* it has committed the credentials.

## 2. Goals and non-goals

**Goals**

1. Someone who has used Blanc for a day should know sync exists without reading
   Settings.
2. The Settings flow should make the two real situations explicit: starting
   fresh on a first device, and joining from a second device.
3. A wrong name or passphrase on the join path must never create an account.
4. One name for the feature everywhere.
5. Every public claim stays release-backed per `docs/marketing-claims.md`.

**Non-goals (explicitly out of scope)**

- Pairing codes, QR linking, device lists, or any change to the v1 sync
  protocol or the Cloudflare Worker. The identity is passphrase-derived; a
  linking flow belongs to the separately approved v2 protocol project.
- Expanding what syncs (history, groups, workspaces, downloads, permissions).
- A seventh welcome-tour step. The tour stays at six steps (2026-08-16 spec).
- Sync for Named profiles. Sync remains Personal-only.
- Any change to how tab sharing publishes or renders remote tabs.

## 3. Naming

The feature is **Sync**. That single word is the Settings nav label, the
section heading, the site navigation label, and the listing term. Descriptive
copy qualifies it the same way every time:

> End-to-end encrypted sync of your favorites and settings, and, if you turn it
> on, this device's open tabs.

Retire "Profile Sync" and "Tab Sync" as feature names in user-facing copy
(Settings profiles hint, `site/src/pages/features/sync.astro`,
`site/src/data/navigation.mjs`, `site/src/pages/features.astro`,
`site/src/pages/features/profiles.astro`). Tab sharing is described as a switch
inside Sync, not a sibling feature. Internal identifiers (`sync.js`,
`pages:settings:sync-*`, `syncTabs`, `release-feature-names.json` history
entries) do not change. Historical release notes and the incident records are
not rewritten.

## 4. Settings card

Files: `src/renderer/pages/settings.html`, `src/renderer/pages/settings.js`,
`src/renderer/pages/pages.css`, `src/main/sync.js`, `src/main/pages.js`,
`src/main/tab-preload.js`.

### 4.1 Placement

Sync moves to second in the Settings nav, immediately after General, in both
the `<nav class="settings-nav">` links and the section order in
`settings-content`. The scroll-spy comment block in `settings.js` (the
"Privacy & Security's card is taller than Sync + Patron" note) is re-verified
after the move; the trailing-section special case may no longer apply to Sync
and must be updated or removed, not left describing the old order.

### 4.2 Off state: choose a path

The card opens with the explanation line from §3 followed by the confidentiality
sentence, then two buttons:

- **Start syncing from this device**
- **I already sync on another device**

Choosing either reveals the same two fields plus a submit button and a back
link. The copy differs per path.

**Start path**

- Sync name field. Label: "Sync name". Hint under the field: "A label for your
  sync, like a username. You'll type it again on your other devices."
- Passphrase field. Label: "Passphrase". Hint: "16+ characters, or 10+ mixing
  letters, numbers and symbols. Blanc can't recover it if you forget it." The
  hint is visible before submit. Submit is disabled until both fields satisfy
  the existing `enable()` rules (name ≥ 2 chars, `passphraseStrong`). The
  renderer mirrors the rule for the disabled state; main remains the authority
  and still rejects on submit.
- Submit label: "Turn on sync".
- Result copy on success: "Sync is on. Your favorites and settings will sync
  as you change them." If the preflight (see 4.3) found existing data under
  these credentials, the success copy instead says "Joined your existing sync
  as “{name}”." (a person may pick the start path on a second device; that is
  fine and is not an error).

**Join path**

- Same fields. Hint under the name: "Enter the exact sync name you used on
  your other device." Hint under the passphrase: "Enter the exact passphrase.
  Case matters."
- Submit label: "Connect".
- Before anything is saved, the page calls `preflight` (4.3). Outcomes:
  - **found** → the page calls `enable`, then shows "Connected to “{name}”.
    Pulling your favorites and settings now."
  - **notFound** → the fields stay filled and a choice block appears in place
    of the submit button:
    > Nothing was found under that name and passphrase. Check for typos,
    > including capital letters, then try again.
    Buttons: **Try again** (returns to the fields, primary) and **Start a new
    sync with these** (secondary; calls `enable`, which is now an explicit
    choice rather than a silent fork).
  - **offline** → "Couldn't reach the sync server. Check your connection and
    try again." Nothing is saved.
  - **rateLimited** → "Too many attempts. Wait a minute and try again."
  - any other error → the message main returns.

The join path never calls `enable` on a `notFound` result unless the person
clicks **Start a new sync with these**.

### 4.3 `preflight()` in `sync.js`

New exported function, Personal-only through the same `withLocalProfile`
guard as `enable`:

```
preflight({ handle, passphrase })
  → { ok: true,  outcome: 'found' | 'notFound' }
  | { ok: false, outcome: 'offline' | 'rateLimited' | 'invalid' | 'error', message }
```

Behaviour:

- Applies the same input validation as `enable` and returns `invalid` with the
  existing messages for a short name or weak passphrase.
- Derives `accountId` and `key` with `deriveKeys`, issues one `GET` for the
  `settings` blob (the same probe `enable` performs today), zero-fills the key,
  and maps: 200 → `found`, 404 → `notFound`, 429 → `rateLimited`, network
  failure → `offline`, anything else → `error` with `http-<status>`.
- Writes nothing: no store update, no `protectSyncKey`, no `syncNow`, no
  `syncGen` bump, no tab-icon refresh.
- `enable()` keeps its post-commit probe and `created` return so the start path
  and any existing callers are unchanged; the join path simply calls
  `preflight` first.

Rate-limit note: the Worker throttles per client IP, so a preflight plus an
enable is at most two probes per attempt. That is within the existing budget
and does not change the Worker.

IPC: `pages:settings:sync-preflight` in `pages.js`, guarded to the `settings`
page like its siblings; `tab-preload.js` exposes it as
`settings.syncPreflight(payload)`. The renderer sends the name and passphrase
over the guarded channel exactly as `syncEnable` does today, and receives only
the outcome record. No credential is echoed back.

### 4.4 On state

`syncActiveStatus` becomes a small definition list instead of one sentence:

- **Sync name** — the handle.
- **Favorites and settings** — "Last synced {relative time}" or the last error.
- **This device's open tabs** — "Sharing" or "Not shared" (mirrors the
  existing `syncTabs` switch, which stays directly below).
- **Last error** — shown only when `lastError` is set, using the existing
  distinct messages.

Actions remain: **Sync now**, the tab-sharing switch, **Turn off sync** with
the existing "also delete synced data" checkbox. The confidentiality line stays
on the card in both states and claims confidentiality only ("Blanc can't read
it"), never durability or tamper-evidence, per the 2026-07-07 threat-model
decision.

`status()` already returns `handle`, `lastSyncedAt`, `lastError`, and
`syncTabs`; if per-category last-sync times are not tracked separately today,
the favorites/settings row uses the single `lastSyncedAt` and the spec does not
require splitting it.

## 5. In-app discovery

### 5.1 `/sync` command

Adds `/sync` with hint "Set up or manage sync" to `copy/slash-commands.json`,
the overlay command table (`overlay.js`), the reference list
(`pages/shortcuts.js`), and the Help → Slash Commands list (`SLASH_COMMANDS`
in `main.js`). It runs `window.browserAPI.openPage('settings', 'sync')`. The
allowlisted `sectionMap` in the `tabs:open-page` handler gains
`sync: '#group-sync'`. Run `npm run slash-commands:build` and
`npm run substrate:check`.

### 5.2 Start-page card

Files: `src/renderer/pages/newtab.html`, `newtab.js`, `pages.css`,
`src/main/main.js` (`startPage` hooks), `src/main/settings.js`,
`src/main/pages.js`, `src/main/tab-preload.js`.

A `<section id="syncNudge" class="ledger-section" hidden>` placed after
`groupsSection` and before `remoteSection` on the ledger layout, and the
equivalent slot on Billboard beneath the frequently-visited grid. Mahjong and
the other layouts do not show it. Content:

> **Pick up on another device.**
> Sync your favorites, settings, and open tabs between your Macs and PCs.
> End-to-end encrypted; Blanc can't read it.
> [Set up sync] [Not now]

- **Set up sync** calls a new `start.openSettings('sync')` bridge method →
  `pages:start:open-settings` (guarded to `newtab`), which main routes through
  the same allowlisted section map to `openInternalPage('blanc://settings/#group-sync')`.
  The utility sheet opens over the start page.
- **Not now** calls `start.dismissSyncNudge()` → `pages:start:sync-nudge-dismiss`
  (guarded to `newtab`), which sets the settings key below and hides the card.

**Visibility rule**, computed in main and projected as one boolean
`syncNudge` on `pages:start:data` (and on the later `pages:start:data`
pushes that already refresh groups):

```
syncNudge = firstRunComplete
         && isDefaultLocalProfile()      // Personal only
         && !sync.status().enabled
         && !settings.get().syncNudgeDismissed
         && !tab.private
```

The renderer never decides; it only reflects the boolean. Turning sync on
hides the card on the next data push. Turning sync off later does not re-show
it: the card is one-time.

**Settings key:** `syncNudgeDismissed`, boolean, default `false`, validated as
a strict boolean in `settings.js`, device-local, and deliberately **not** in
`SYNCED_KEYS` (a dismissal on one machine says nothing about another). It is
not part of `settings-schema/schema.json`, which guards enums and their
defaults only; `npm run settings:check` must still pass.

### 5.3 What does not change

- The welcome tour stays six steps. No tour copy mentions sync.
- The island pill and ⌘L panel gain no new chip or row for sync; remote-device
  sections already appear there once tab sharing is on.
- Named profiles see no card and no `/sync` effect beyond opening Settings,
  where the existing Personal-only behaviour applies.

## 6. Site and listing

Files: `site/src/pages/index.astro`, `site/src/pages/features.astro`,
`site/src/pages/features/sync.astro`, `site/src/data/navigation.mjs`,
`site/src/pages/features/profiles.astro`, `docs/press/fact-sheet.md` if it
lists features, and `docs/superpowers/plans/assets/launch-copy.md`.

- **Homepage feature grid** gains a seventh row after "Give each browsing
  identity its own space.": heading "Pick up on your other devices.", body
  "Favorites, settings, and, if you choose, open tabs, end-to-end encrypted
  before they leave your machine.", link to `/features/sync` with the existing
  `data-track="feature_cta_click" data-feature="sync"` attributes.
- **Site sync page** is re-titled around the whole feature: page title
  "Encrypted Sync Across Devices | Blanc Browser", hero "Your favorites,
  settings and open tabs, on your other devices.", and a short "What syncs"
  block (favorites, settings, optional open tabs; never history, downloads,
  permissions, cookies, private tabs). The existing tab-sync sections and the
  "honest part" aside remain beneath it unchanged.
- **Navigation** description becomes "Favorites, settings and open tabs across
  devices."
- **Features hub** row text and the profiles page's "Profile Sync belongs to
  Personal" line adopt the §3 wording.
- **Product Hunt.** Two owner actions. Neither waits on the in-app work,
  because the claims below are already release-backed:
  1. Edit the listing description (260-char limit) to name sync. Proposed:
     > Blanc is a free desktop browser for macOS, Windows and Linux. Its
     > floating Island replaces the tab strip and toolbar, ad and tracker
     > blocking runs at the network layer, and end-to-end encrypted sync links
     > your devices. Optional Patron adds Named Workspaces.
     (verify the character count in the live form before saving).
  2. Reply to the review as the maker, personally written, pointing to
     Settings → Sync and `https://blancbrowser.com/features/sync?ref=ph`.
- **Claims gate.** Sync of favorites and settings shipped in v0.12.0; open-tab
  sharing in v0.20.0; both are in public v1.17.1, so the copy above is
  release-backed today. The redesigned setup flow, `/sync`, and the start-page
  card are **not** shipped and must not appear in any public copy until the
  release that carries them is public. Run the site's changelog check and the
  full site/SEO build before deploy.

## 7. Error handling summary

| Situation | Behaviour |
|---|---|
| Join path, credentials not found | Explicit choice; nothing saved unless "Start a new sync with these" |
| Preflight offline / 429 | Message shown, nothing saved |
| Keychain protection fails in `enable` | Existing `SyncKeyStorageError` messages, unchanged |
| Store flush fails in `enable` | Existing rollback, unchanged |
| Start path on a second device with existing data | Succeeds and says it joined |
| Card shown, then sync enabled elsewhere on this device | Next data push hides it |
| Named profile active | No card; Settings shows the existing Personal-only note |

## 8. Testing

**Unit (`test/unit/`)**

- `sync.preflight`: found / notFound / offline / rateLimited / invalid mapping
  against a stubbed `net.fetch`; asserts the sync store is untouched and
  `protectSyncKey` is never called on every outcome.
- `settings.js`: `syncNudgeDismissed` defaults to `false`, accepts only
  booleans, and is absent from `SYNCED_KEYS` (extend the existing synced-keys
  policy assertions in the same commit, per the repo's policy-test rule).
- Start-page projection: a pure helper `shouldShowSyncNudge({firstRunComplete,
  personal, syncEnabled, dismissed, privateTab})` extracted for the rule in
  §5.2, with one test per clause.
- `tabs:open-page` section map includes `sync` and still refuses unknown
  sections.
- Slash-command substrate: `npm run substrate:check` passes after
  `slash-commands:build`.

**Desktop acceptance (`spec/acceptance/`, `test/desktop/`)**

- New scenario, registered in the `RUNNABLE` list: fresh profile, complete the
  tour, the start page shows the sync card; **Not now** hides it and it stays
  hidden after reload; `/sync` opens Settings at the Sync section.

**Manual, before the release that ships this (recorded in the release notes)**

- Two packaged builds with clean profiles: start on A; join on B with the
  correct credentials (found); join on B with a wrong passphrase (notFound,
  nothing created, Try again works); Start a new sync with these creates a
  distinct account; offline preflight on B saves nothing.

**Site**

- `npm run build` for the site plus its SEO checks; verify the homepage row,
  the sync page hero, and navigation text in the preview before deploy.

## 9. Sequencing

1. `sync.preflight` + IPC + unit tests.
2. Settings card (nav move, two paths, on-state list) + CSS.
3. `/sync` command + section map + substrate rebuild.
4. Settings key + start-page card + projection + acceptance scenario.
5. Site copy + naming sweep + site build.
6. Release; then the two Product Hunt owner actions can reference the new flow.

Items 1–4 ship together in one app release. Item 5 can deploy independently
because its claims are already release-backed, but the naming sweep should land
in the same PR as the app copy so the app and site never disagree about the
feature's name.

## 10. Decisions log

- Start-page card over a seventh tour step (owner, 2026-09-17): reaches
  existing users, avoids re-opening the onboarding spec and packaged first-run
  smoke.
- Plain "Sync" over "Blanc Sync" / "Encrypted Sync" (owner, 2026-09-17).
- Preflight before commit rather than a "started a new account" notice after
  commit: the fork is the failure mode that costs people data, so it becomes a
  choice, not a warning.
- No protocol or Worker change: the v1 identity model is kept exactly; this
  design only reorders when the existing probe runs.

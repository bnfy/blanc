# Blanc on Chromium: desktop replacement product specification

Status: **owner-approved execution contract** at `e884a6564`, with subsequent owner clarifications. Authorized now: F0.1–F0.6 and F0.8 including their incremental builds. D7, F0.7, cold builds, new platform machines, D1–D2, full-replacement D3, D4–D6, D8 and V2 remain separate pending decisions. No merge or release authorization.
Companion: [implementation plan](2026-10-30-desktop-replacement-plan.md).

## 1. Purpose and reference

Blanc's Chromium fork will replace the shipping Electron app on macOS, Windows and Linux. This document defines what "replaced" means. The plan defines how to get there.

**Product reference.** The latest published Blanc release is the source of truth, and it moves:

| Field | Value (checked 2026-10-30 23:25 UTC with `gh release view`) |
| --- | --- |
| Release | **v1.45.1**, published 2026-10-29 22:38 UTC, not a draft or prerelease |
| Source | `85883b1afa11375e1300130914d6f40c5388af21` (tag `v1.45.1`) |
| Runtime | castLabs ECS 44.9.3+wvcus (Chromium 152.0.7977.167) |
| Behavior contract | `spec/parity-matrix.md` at that tag (SHA-256 `1a18650d…`), plus the surfaces in §5.2 that have no matrix row |

**Rebaselining.** At each new Blanc release, Codex records the new tag and SHA here. It diffs `spec/parity-matrix.md`, `copy/messages/en.json`, `src/main/settings.js` DEFAULTS and the release notes against the previous reference. Each changed row is marked *re-check* in the tracker; nothing else is re-audited. One short entry per release.

**Fork state referenced here.** The handoff branch `codex/f12-socket-speculation` is at `d63b6d4c0` ([PR #1028](https://github.com/bnfy/blanc/pull/1028), draft). Its review snapshots (`experiments/chromium-extension-spike/handoff-20261030/`) are drafts: they are not applied, built or integrated. Native checkouts, build outputs, the development browser and most raw evidence live only on the **Mac mini build machine**. The `Chromium Preview` folder synced to other Macs is a partial copy. The `CLAUDE-CODE-MIGRATION-HANDOFF-20261030.md` file the handoff names was not present in that synced folder on 2026-10-30.

## 2. Product goal and boundaries

**Goal.** Ship one Chromium-based Blanc that existing users receive through their normal update. It keeps their data, works on all three desktop platforms, and is at least as capable, private and secure as the release it replaces.

**Non-negotiables**
1. **Identity.** The Island chrome, Sunrise visual language, internal pages, typography (Instrument Sans UI, Inter counts), icons and copy follow the shipping release. Exception: **Settings screens may look like Chrome/Brave Settings**. They keep Blanc's behavior, defaults, safety, accessibility, wording rules and identity: name, mark, Sunrise accents.
2. **Behavior.** Each shipping contract in §5 holds, or its difference is recorded in the divergence register (§9) and accepted by the owner.
3. **Privacy and security** invariants in §6 hold. Chromium defaults that send data Blanc doesn't send today are disabled, for example Google services, Safe Browsing pings, field trials, crash upload and Chrome Sync.
4. **Accessibility and input.** Every surface is keyboard-operable, has a correct accessibility tree, honors reduced motion, and keeps the shipping shortcuts (§5.3).
5. **No data loss.** Existing users' profile data migrates as specified in §7, and the user can go back to Electron (§8.5).
6. **Possible exceptions, not waivers.** uBlock Origin (X1) and Widevine/DRM (X2) need explicit owner decisions (plan §9). Full replacement still requires both until separately decided. Owner D3 accepts a beta-only exception for DRM/Widevine playback: an EME playback request must show a notice that the site needs Electron Blanc and offer an explicit way to open the current page there. The notice/handoff is required for beta; replacement DRM acceptance remains open.

**Out of scope.** iOS/Android. A general Electron extension runtime. Chrome Sync. Google sign-in. WebKit. Latency work (deferred). The separate Google-upgrade baseline (kept apart).

## 3. Status vocabulary (used everywhere)

A requirement row moves through these states, in order. Never skip a state and never collapse two.

| State | Means | Evidence required |
| --- | --- | --- |
| **Not started** | No code, or only notes. | None |
| **Drafted** | Code exists outside the canonical tree (snapshots, `*-draft/` folders, staged overlays). | Path |
| **Implemented** | Code is in the canonical fork tree on the integration branch and compiles. | Commit SHA |
| **Integrated** | It's in the single current candidate build, on by default, reachable through shipping UI. | Candidate build ID |
| **Verified: macOS / Windows / Linux** | Its named acceptance checks pass on that platform's candidate, plus the manual accessibility/visual checklist for that row. | Test run IDs per platform |
| **Release-ready** | Verified on all three platforms, and every cross-cutting gate in §10 passes for the release candidate. | Release-candidate record |

The tracker's existing "0/57 fully verified" means zero rows are *Verified* on all three platforms. It does **not** mean zero implementation; most rows are Drafted or partly Integrated on macOS. The plan (§7) defines the progress display.

## 4. Native-versus-custom decisions

Rule: **use the Chromium model and machinery; draw Blanc's UI.** Write custom native code only where Chromium lacks the behavior or its behavior contradicts a shipping contract. Rationale:
- Chromium's models (tabs, bookmarks, history, downloads, permissions, profiles, sessions, find, zoom, extensions) already have tests, security review and rebase support.
- Blanc's value is in the presentation and the policy layered on those models.
- Every custom native subsystem is a permanent rebase cost.

| Area | Decision | Product tradeoff | Security / maintenance tradeoff | Test approach |
| --- | --- | --- | --- | --- |
| Window frame, tab strip, toolbar, omnibox UI | **Custom (kept):** native strip/toolbar hidden; Island is a WebUI view in `BrowserView` (built today) | Exact shipping look | Hiding native chrome touches ~15 upstream files; keep patches minimal | Interactive UI tests + shipping scenarios |
| Tabs, pins, mute, duplicate, reopen | **Adapt native** `TabStripModel`, `TabRestoreService`; Blanc ordering rules as a thin layer | Reopen tiers (live view parked 30 s) become native restore + snapshot; record any difference | Low | browser_tests |
| Tab groups | **Adapt native** `TabGroupModel`; names, optional preset color, case rules in Blanc layer | Chromium groups require a color; map "no color" to a neutral palette slot | Low | browser_tests |
| Split View (2 panes, as shipped) | **Adapt native** split tabs (Chromium 158 `AddToNewSplit`) | Shipping is 2-pane; 3–4 pane is future work, not parity | Native split UI hidden; corner tab drawn by Blanc | interactive_ui_tests |
| Glance (floating card) | **Custom** view hosting a native WebContents | No Chromium equivalent | Medium: custom view lifetime | interactive_ui_tests |
| Private tabs | **Owner decision D1.** Shipping mixes private tabs into normal windows; Chromium isolates incognito per window | See D1 | In-window mixing is a deep, risky patch | — |
| Address/search, suggestions, Bangs | **Adapt native** `TemplateURLService` (engines incl. custom `%s`), Blanc input heuristic and Bang resolver in Blanc layer; suggestions through native suggest with Blanc's privacy rules | Same engines/defaults (DuckDuckGo default) | Must not touch Google endpoints; private and credential-like input stay local | Unit + browser_tests + outbound-request check |
| Quick Switcher, slash commands, palette | **Custom UI** over native models | Shipping ranking | Low | Shipping scenarios |
| Find in page | **Adapt native** `FindTabHelper`; Island capsule UI | Same | Low | interactive_ui_tests |
| Favorites | **Adapt native** `BookmarkModel` (internal name stays `bookmarks`); Blanc sheet UI | Folders appear only as import preserves them | Low | browser_tests |
| History | **Adapt native** `HistoryService`; Blanc sheet UI | Chromium keeps 90 days, shipping caps at 5,000 entries (divergence V2) | Low | browser_tests |
| Downloads | **Adapt native** `DownloadManager`; Blanc transient sheet; 200-entry list cap in the projection | Same visible behavior | Private download metadata memory-only (native already) | browser_tests |
| Settings | **Adapt native** `chrome://settings`, restyled and re-scoped: Google/Sync/Safety-check sections removed, Blanc sections added | Owner-approved Chrome/Brave look; every shipping setting and default present | Large WebUI, but upstream-maintained | Settings scenarios + a11y tree check |
| Permissions | **Adapt native** permission manager and content settings with Blanc's default-deny policy (§6); prompt UI anchored to the Island | Same policy and copy | Must not regress to Chromium's broader auto-grants | browser_tests per permission type |
| Context menus | **Adapt native** `RenderViewContextMenu` + Blanc items (Open in Glance/Space, Copy clean link) | Same items | Low | browser_tests |
| Profiles | **Adapt native** Chromium profiles; Personal = Default profile | Same isolation | Low | browser_tests |
| Sessions, windows, Spaces | **Adapt native** session service for windows/tabs; Spaces as Blanc data restored through native session APIs | Spaces swap in place | Medium | Shipping workspace scenarios |
| Quiet Tabs, Tab Archive | **Adapt native** tab discarding (`PageDiscardingHelper`) with Blanc eligibility rules | "quiet" wording | Low (built and partly verified on Mac) | browser_tests |
| Blanc Blocker | **Custom (kept):** pinned Ghostery engine in sandboxed V8 utility, URLLoader interception, cosmetic/scriptlets | Same lists and counts | Built; fails closed | Existing blocker suites |
| Sync family (Profile/Tab/Shared Spaces, pairing, recovery) | **Reuse shipping JavaScript** for models and crypto in a sandboxed V8 runner (pattern proven for the blocker and Sync drafts); native code only for keys (OSCrypt), network and storage | Wire-compatible with v1 Worker and iPhone | Smallest new native surface; JS stays shared with Electron until cutover | Shipping sync tests run against the fork runner |
| Reader, Dark websites | **Custom:** reuse shipping extraction/presentation and pinned Dark Reader in isolated worlds | Same | Isolated world + fetch broker required | Shipping suites |
| 1Password fill | **Owner decision D2:** Web Store 1Password extension now works natively; the shipping SDK bridge (F38) may be unnecessary | Different UX: extension instead of key-glyph fill | Removing the broker removes a library-validation exception | — |
| Touch ID passkeys | **Adapt native** Chromium WebAuthn (macOS platform authenticator) | Same user result | Needs keychain-access-groups entitlement + profile | Manual |
| PDF viewer, print, view source, DevTools | **Native** | Same | None | Smoke |
| Extensions | **Native** Chrome Web Store, MV3; extension controls inside the Island (built) | New capability (the reason for the fork) | Extension update path proven on 157 (L4) | Store install/update checks per platform |
| Updates | **Custom thin updater over GitHub Releases** (plan tasks R.1–R.3) | Same "Restart Now" flow | Signed feeds; rollback-capable | Updater rehearsal per platform |

## 5. Requirement matrix

### 5.1 Tracked rows (57)

Columns:
- **Slice:** the plan slice that delivers the row.
- **Approach:** from §4.
- **State:** the furthest state reached on macOS, from the handoff inventory and continuation. Windows and Linux are *Not started* for every row, because no fork build exists on either.
- **Acceptance:** the check that proves the row.

"Scenarios" means shipping `spec/acceptance` scenarios with that feature tag, run against the fork (plan task F0.5).

| ID | Requirement (shipping v1.45.1) | Slice | Approach | macOS state | Acceptance (all platforms unless noted) |
| --- | --- | --- | --- | --- | --- |
| F1 | Island: resting pill, panel/palette/find modes, shield chip, hover-open, auto-hide (float/pin), tooltips, space mark | S1 | Custom | Integrated (partial); Shield hit-region fix drafted | `@F1-*` scenarios; pointer/keyboard/VoiceOver checklist; float views clip correctly |
| F2 | Tabs: create/close/switch/reopen tiers/duplicate/pin/mute/close others/above/below/move to window, tab drag | S1 | Adapt | Integrated (partial) | `@F2-*`; reopen restores back stack and group |
| F3 | Groups: names, case rules, optional color, group menu, ⌘1–9 clusters | S1 | Adapt | Integrated in an isolated candidate | `@F3-*` |
| F4 | Private tabs: never in history/session/sync/reopen; children stay private; theme + quick-exit chip | S1 | D1 | Integrated (partial; primary-incognito model) | `@F4-*`; on-disk scan after quit finds no private markers |
| F5 | Address input, engines (DDG default, custom `%s`), suggestions policy, OS hand-off | S1 | Adapt | Drafted (live build still hardcodes Google) | `@F5-*`; outbound-request check shows only the chosen engine |
| F6 | Command palette and Quick Switcher | S1 | Custom | Integrated (partial) | `@F6-*` |
| F7 | 34 slash commands with shipping names and hints | S1–S5 | Custom | Integrated (partial: some commands) | Each command's scenario; unknown command copy |
| F8 | Find capsule | S1 | Adapt | Built in an isolated candidate | `@F8-*` |
| F9 | Favorites: heart, add all, sheet, Start Page favorites | S1 | Adapt | Integrated (partial) | `@F9-*` |
| F10 | History: per visit, clear, private excluded | S1 | Adapt | Integrated (partial) | `@F10-*` |
| F11 | Downloads sheet, progress, cap 200 | S1 | Adapt | Drafted (prototype opens Chromium Downloads tab) | `@F11-*` |
| F12 | Blocking default-on, per-tab count, per-site allow/re-block, shield popover, global toggle | S1 | Custom (kept) | Integrated (network + cosmetic); site actions drafted | Blocker suites; `@F12-*` |
| F13 | Permissions: explicit prompts, default-deny, same copy | S1 | Adapt | Not assessed | Per-permission browser_tests; `@F13-*` |
| F14 | Settings: every shipping key/default/validation | S1 | Adapt (Chrome look allowed) | Integrated (General only) | Settings key-by-key check vs `settings.js` DEFAULTS |
| F15 | Theming: system/light/dark/private, live | S1 | Custom | Integrated (partial) | `@F15-*` |
| F16 | Internal pages; utility pages as a sheet, never tabs | S1 | Custom | Integrated (Start Page); sheet not built | `@F16-*` |
| F17 | Patron (unlocks nothing), five Mac colorways, platform icons | S2 | Custom | Not assessed | Icon catalog per platform; Patron key migrates |
| F18 | Session restore incl. groups, splits, meta, document-policy stamp | S1 | Adapt | Integrated (partial; recovery suite on 157) | `@F18-*`; crash and clean-quit restore |
| F19 | Context menu incl. Open Link in Glance/Space, Copy clean link | S1 | Adapt | Drafted | `@F19-*` |
| F20 | HTTP auth: no credential dialog, request fails | S1 | Adapt | Not assessed | 401/407 fixture |
| F21 | Telemetry: consent first, fixed events, packaged only | S2 | Custom | Not assessed | Event-capture fixture; no event before consent |
| F22 | Distribution and updates | R | Custom | Not started (manual signed replacement only) | Plan tasks R.1–R.6 |
| F23 | Zoom | S1 | Native | Built in an isolated candidate | `@F23-*` |
| F27 | Tab Sync, pairing, device names | S4 | Reuse JS | Drafted (native exchange pieces) | Shipping sync suites against the Worker |
| F28 | Vertical tabs rail | S3 | Custom | Not assessed | `@F28-*` |
| F30 | Favorites import from Chromium browsers | S2 | Adapt (native importer + Blanc rules) | Not assessed | `@F30-*` |
| F31 | Quiet Tabs | S3 | Adapt | Integrated in an isolated candidate; regular-profile timed test passed | `@F31-*` |
| F32 | Independent windows | S1 | Adapt | Not assessed | `@F32-*` |
| F33 | Local profiles | S2 | Adapt | Not assessed | `@F33-*` |
| F34 | Glance floating card | S3 | Custom | Drafted (many unbuilt generations) | `@F34-*` |
| F35 | Start Page layouts, pins, Customize, blocked counts | S1 | Custom | Integrated (partial) | `@F35-*` |
| F36 | First-run onboarding | S2 | Custom | Not assessed | `@F36-*` |
| F37 | Blank tab shows where to type | S1 | Custom | Built (CSS fix unpromoted) | `@F37-*` incl. IME |
| F38 | 1Password fill | S5 / D2 | D2 | Not assessed | Per D2 |
| F40 | Bring Your Tabs (`/bring-tabs` ships though matrix says PLANNED) | S3 | Custom | Not assessed | `@F40-*` |
| F41 | Spaces: up to 25, swap in place, autosave, mark/menu | S3 | Adapt | Drafted (placeholder list) | `@F41-*` |
| F57 | Shared Spaces sync (v1.45.1 status rules) | S4 | Reuse JS | Drafted | `@F57-*` |
| F42 | Dark websites | S5 | Custom | Not assessed | Shipping suite |
| F44 | Interface language: 6 languages, picker + relaunch | S1 | Custom | Integrated (partial; browser-language approximation) | `test:i18n` equivalent; pseudo-locale run |
| F45 | Arc Spaces import | S3 | Custom | Not assessed | `@F45-*` |
| F46 | Custom tab names | S3 | Custom | Built in an isolated candidate | `@F46-*` |
| F47 | Bangs | S1 | Adapt | Drafted (30-file overlay, unbuilt) | `@F47-*`; no suggestion request for bang text |
| F48 | Pinned homes | S3 | Custom | Not assessed | `@F48-*` |
| F49 | Wallpaper image | S5 | Custom | Integrated (differs: IndexedDB blob vs file) | `@F49-*` |
| F50 | Color wallpaper | S5 | Custom | Built in an isolated candidate | `@F50-*` |
| F51 | What's New page | S2 | Custom | Not assessed | `@F51-*` |
| F52 | Tab Archive | S3 | Adapt | Not assessed | `@F52-*` |
| F53 | Split View (2 panes) | S3 | Adapt | Built (pin/unpin) in an isolated candidate | `@F53-*` |
| F54 | Billboard clock Font & color | S5 | Custom | Integrated (partial) | Clock suite |
| F58 | Reader Mode | S5 | Custom | Drafted | Reader suite |
| F59 | Ctrl+Tab recent order (Linux/Windows; Mac off) | S3 | Custom | Drafted | Real-key browser-shortcuts suite |
| F60 | Link routing incl. background window keeps focus | S3 | Custom | Not assessed | `@F60-*` |
| R1 | Launch Sunrise (opt-in) | S5 | Custom | Built in an isolated candidate | Scenario |
| R2 | Sync without a passphrase + recovery code | S4 | Reuse JS | Drafted | Shipping sync suites |
| R3 | Pair iPhone (QR) | S4 | Reuse JS | Not started | Two-device check |
| X1 | uBO provider | D2 | D2 | Research only | Per D2 |
| X2 | Widevine/DRM playback; beta EME notice and current-page Electron handoff | S5 / D3 | D3 | **Accepted exception for beta playback only.** EME notice/handoff required before beta; replacement decision open | Beta: EME request shows notice and explicit current-page action to Electron, including unavailable-app handling. Replacement: per separate D3 decision |

### 5.2 Shipping surfaces not yet tracked (add as rows N1–N22)

These ship in v1.45.1 (source paths at the tag) but have no tracker row. They are added to the tracker at task F0.4.

| ID | Surface (shipping file) | Slice |
| --- | --- | --- |
| N1 | Recently closed band, `closedSlot`, Forget/Clear all (`closed-tabs.js`, `closed-slot.js`) | S3 |
| N2 | Capture indicator chip/popover, truthful `permissions.query` (`capture-*`) | S5 |
| N3 | Screen sharing broker and picker; Linux PipeWire portal (`display-capture-*`) | S5 |
| N4 | Inherited document policy / inert tabs (`document-policy.js`) | S1 (security) |
| N5 | Certificate error page, session-only local-network continue (`certificate-exceptions.js`, `site-security.js`) | S1 (security) |
| N6 | OS hand-off schemes and blocklist (`external-protocols.js`) | S1 |
| N7 | Touch ID WebAuthn passkeys (`webauthn.js`) | S2 |
| N8 | Network privacy: secure DNS, WebRTC IP policy (`network-privacy.js`) | S1 |
| N9 | Send to device (`sends.js`) | S4 |
| N10 | Default-browser status, reminder, Windows Default Programs (`default-browser-*.js`, `installer.nsh`) | S2 |
| N11 | Moving-in checklist (`migration-checklist.js`) | S2 |
| N12 | Mahjong (`blanc://mahjong`, sound) | S5 |
| N13 | Site mute (`site-mute.js`), page tint (`page-tint-*`) | S3 |
| N14 | Mouse gestures, off by default (`mouse-gestures.js`) | S5 |
| N15 | Local HTML preview in isolated session; macOS `public.html` association (`local-html-*`) | S5 |
| N16 | Trust receipt, diagnostics export, crash ledger (`trust-receipt.js`) | R |
| N17 | Invite a Friend (`/invite`, Help menu) | S5 |
| N18 | Dock menu, app badge, About panel, manual Check for updates | R |
| N19 | Copy link / Copy clean link (`clean-link.js`, address menu) | S1 |
| N20 | Tab import/handoff pages and `blanc-import:` scheme (`tab-import.html`, `tab-handoff.html`) | S3 |
| N21 | Bang icons, search suggestions provider (`bang-icons`, suggestions) | S1 |
| N22 | Startup navigation gate: web requests held until the blocker is ready | S1 (security) |

### 5.3 Keyboard shortcuts (must match)

Shipping's table in `src/main/browser-shortcuts.js` and the menu template in `main.js` (v1.45.1) is the contract. Codex extracts it into `chromium/tests/data/shortcuts-v1.45.1.json` and generates the fork's accelerator table and the shortcut test from it. Notable cases:
- Ctrl+Tab recent-order needs Ctrl release detection.
- ⌘⌥B means Auto-hide on macOS, while Favorites is ⌘⌥B in the Favorites menu; preserve shipping's resolution exactly.
- Fill from 1Password depends on D2.

The menu bar structure follows shipping: Profiles, Tabs, Favorites and Help menus.

## 6. Cross-cutting requirements

### 6.1 Privacy (each is a release gate)
- **Default-off Google traffic.** On a fresh profile, with network capture, a 10-minute idle-plus-browsing session sends no request to Google-owned hosts other than ones a visited page itself makes. This covers the variations seed, Safe Browsing, component updater, spelling, translate, NTP, GCM, metrics, crash reporting and domain reliability. A chosen search engine counts only when chosen.
- **Never-synced list** stays exact: supporter/patron, appIcon, searchSuggestions, usagePing, cookies/storage, history, downloads, permissions, private tabs, document-policy-marked tabs, link routes.
- **Telemetry.** No event before the consent choice is saved. Only the fixed v1.45.1 event set. Same Worker endpoints. Packaged builds only.
- **Private browsing** leaves no on-disk trace after the last private tab or window closes. Checked by scanning the profile.

### 6.2 Security
- Chromium sandbox on for every process. No `--no-sandbox` in shipped builds.
- Every Blanc WebUI host is an exact allowlist with its own CSP. Bridges are typed (Mojo) with sender validation, replacing the current single `chrome.send` dispatcher before release.
- Disk-served development assets (`--blanc-prototype-assets`) are **removed** from release builds: assets compile into the resource pak.
- Permission policy: fullscreen, pointer lock and sanitized clipboard write are allowed. Media (audio and video separately), geolocation and notifications are prompted. Everything else is denied. A prompt that can't be shown is denied unsaved.
- HTTP auth challenges are refused without a dialog. OS hand-off follows the shipping allow/ask/block lists. Page-initiated `chrome-extension:` navigation is refused, except the PDF viewer.
- Inherited sandbox flags. Native Chromium carries opener sandbox flags into children, which closes the Electron 44.9 gap (spec decision 4a). Verify, then retire the inert-tab workaround, recorded as divergence V4.
- Security update SLA, proposed: a Chromium security fix rated High or Critical reaches users within 7 days of Chrome's stable release. Distribution is suspended when this can't be met (the existing owner rule).
- Signed, notarized macOS builds. Authenticode-signed Windows builds with publisher "Bananify Creative". Linux AppImage covered by the signed `SHA256SUMS`. SBOM and Sigstore as shipping does today.

### 6.3 Accessibility and input
- Every Island, sheet and card surface exposes roles, names and states. VoiceOver (macOS), Narrator/NVDA (Windows) and Orca (Linux) can reach and operate each control. That's one manual checklist per surface per platform, run once per release candidate, not per change.
- Focus order and Escape behavior follow shipping. No thick focus rings (shipping style). Reduced motion is honored on the 12 shipping surfaces that check it.
- Contrast: inks at least 4.5:1, as shipping's tests assert.
- IME composition works in the Island input and the blank-tab typing path.

### 6.4 Localization
- en, de, es, fr, it and pt-BR from `copy/messages/*.json`, plus pseudo-locale `en-XA` for testing.
- The fork consumes the same catalog files through a generated resource. It does not copy strings by hand.
- Chromium's own strings that remain visible (Settings, dialogs) use Chromium's translations for the same six languages. The Blanc language pick is honored after relaunch, as in shipping.

## 7. Profile and data migration (Electron → Chromium)

**Principle: read-only import into a new data directory.** The fork never writes Electron's `userData`, so Electron stays a working fallback.

| Electron source (Personal at root; named profiles under `profiles/<id>/`) | Destination in the fork | Rule |
| --- | --- | --- |
| `bookmarks.json` | `BookmarkModel` | Order, tombstones dropped |
| `history.json` (visits, site icons) | `HistoryService` + favicon DB | Bounded to the 5,000 entries |
| `downloads.json` | Download history (metadata only) | Files stay where they are |
| `site-permissions.json` | Content settings | Only shipping-promptable types |
| `start-page-pins.json`, `archive.json`, `workspaces.json`, `shared-spaces.json`, `synced-closed.json`, `reader-appearance.json` | Blanc profile prefs/stores | Schema-for-schema |
| `settings.json` | Profile prefs (synced keys) + Local State (device keys) | `patron.key` re-stored through OSCrypt (it's plaintext today) |
| `session.json` v2 windows, groups, splits, meta | Native session on first launch | Restored quiet; private never present |
| `profiles.json`, `profile-deletions.json` | Chromium profiles | Pending deletions complete before import |
| `sync.json` `protectedKey` | Fork key store via OSCrypt | Decrypt with Electron's safeStorage item, re-wrap; Linux `basic_text` refused (drafts exist) |
| `tab-sync.json`, `tab-icons.json`, `sends.json` | Sync stores | Device identity kept so peers see one device |
| `install.json` | Local State | Same installId (telemetry continuity) |
| `wallpaper.json` + `wallpaper/` | Profile-local file | Same downscaled file |
| Cookies, Local Storage, IndexedDB, service workers (Electron partitions) | **Owner decision D5** | — |
| `managed-ublock/`, `WidevineCdm/`, adblock caches | Not migrated | Rebuilt or per D2/D3 |

**Behavior**
- Migration runs once, on the fork's first launch, only when the Electron app is not running. It shows progress and is all-or-nothing per profile.
- A marker in the fork records the source version. Re-running only fills in profiles not yet imported.
- Failure leaves the fork on a fresh profile, with a notice and a retry button. Electron data is untouched.
- Supported source versions: any v1.40.0 or later (older users update Electron first). Fixture profiles from each minor version since 1.40 drive CI.

## 8. Distribution, update, fallback and rollback

1. **Identity.** Released app is "Blanc", macOS bundle ID `me.bnfy.bowser`, same Developer ID team. The fork data directory is new, for example `~/Library/Application Support/Blanc/Chromium/` or a sibling, and is chosen at task F0.3, so Electron files are never shared.

   Keeping the identifier is **intended** to preserve Gatekeeper identity, macOS privacy grants and update continuity. Matching identifiers does not prove any of those, so each outcome is a test (plan F0.3 spike and R.6), run by installing the release-channel fork over a real Electron install:

   | Platform | Must be shown by test |
   | --- | --- |
   | macOS | Camera, microphone, screen-recording and location grants survive or are re-requested with no stale denial (Chromium helpers differ from Electron's). Keychain items are readable where §7 needs them. Default-browser choice, Dock pin, Login Items and notification permission persist. `electron-updater`/Squirrel accepts the fork bundle (designated requirement match). Gatekeeper and notarization pass on the updated app |
   | Windows | Authenticode publisher unchanged. Default-browser `UserChoice` and pinned taskbar/Start shortcuts still launch Blanc. Uninstall entry is replaced, not duplicated |
   | Linux | Desktop entry and default http/https handler still resolve to Blanc. AppImage update replaces in place |

   Any outcome that fails becomes a migration step with user-facing copy (for example, a one-time "allow camera again" notice) or a blocker. It is never assumed.
2. **Updater.** The fork ships its own updater reading signed metadata from GitHub Releases:
   - macOS: Sparkle 2 (EdDSA-signed appcast, notarized zips).
   - Windows: a signed installer with in-place update from the fork's own service.
   - Linux: AppImage replacement verified against the signed manifest.
   - All three: same "Restart Now" UX and a staged-rollout percentage.
3. **Cutover from Electron.** A final Electron "bridge" release teaches `electron-updater` to install the Chromium build:
   - macOS: Squirrel zip with the same bundle ID and designated requirement.
   - Windows: NSIS that installs the fork and removes Electron files, but not data.
   - Linux: AppImage.
   - Staged by percentage, pausable.
4. **Fallback.** Until replacement is declared complete, Electron releases remain downloadable and supported for security fixes.
5. **Rollback.** The fork's updater can install a designated rollback artifact, including the last Electron build, for every platform. After a rollback, Electron opens its untouched profile. Data created only in the fork returns only through Sync. This is disclosed in the rollback notice.
6. **Withdrawal.** The PR #1028 status-page pattern is replaced by a release-feed flag that stops updates and shows the withdrawal notice in-app.

## 9. Divergence register (each row reviewed individually)

Each row has its own status, decided only by the owner. **Until a row is approved, the fork implements shipping behavior.** Approving the plan does not approve any row.

| ID | Divergence | Reason | Status |
| --- | --- | --- | --- |
| V1 | Settings use Chrome/Brave visual design | Owner direction | Approved (owner direction, October 2026) |
| V2 | History retention follows Chromium (90 days) instead of shipping's 5,000-entry cap | Native model | **Proposed, product change.** Default until decided: a Blanc layer trims `HistoryService` to 5,000 entries |
| V3 | Groups always store a color internally; "no color" maps to a neutral slot that is never shown | Native model; no visible change | Proposed |
| V4 | Inert-tab workaround retired; native inherited sandbox used | Better security | Proposed, after the inherited-sandbox check in S1.6 passes |
| V5 | Extensions available | Fork purpose | Approved (October 15 fork authorization) |
| V6 | Private model | — | Open: decision D1 |
| V7 | macOS minimum version and Intel support follow the fork's Chromium (the preview needs macOS 26; shipping supports older and Intel) | Upstream minimums | **Proposed, product change.** Open: decision D8 |

## 10. Release gates for the replacement

**Beta-specific X2 gate:** DRM/Widevine playback is excepted for the beta only. A page requesting Encrypted Media Extensions playback must show an accessible Electron-build notice and an explicit current-page handoff action. Verify the handoff destination and unavailable-Electron case while preserving the existing privacy/navigation policy. This beta exception does not remove X2 from the full replacement gates below.


A replacement release candidate is release-ready when all of these hold:
1. Every row in §5 is *Verified* on all three platforms, or excepted by an owner decision.
2. Privacy gate (§6.1) passes on all three platforms.
3. Migration passes for fixture profiles from v1.40–current on all three platforms, plus the owner's real profile (backup first).
4. Updater, cutover and rollback rehearsal pass on each platform: Electron → fork → rollback → fork. Every identity outcome in §8.1 is shown by that rehearsal, and Electron's data directory is byte-identical before and after.
5. Accessibility checklist passes per surface per platform.
6. The shipping static guards that still apply pass: copy, adblock, substrate.
7. Signing, SBOM, Sigstore and provenance as in shipping `release.sh`.
8. A beta channel ran at least one fork rebase cycle with no open Severity-1 bugs.

## 11. Known unknowns

- **Chromium version, Mac minimum and Intel.** Whether the fork's target Chromium (158 preview, minimum macOS 26) can serve all current Mac users. Shipping supports older macOS and Intel; no Intel fork build exists.
- **Windows/Linux build feasibility** on available hardware. No fork build has ever run on either.
- **Widevine certification** timeline and requirements (castLabs, under NDA).
- **Real-account behavior** for Sync key re-wrap with the actual Electron "Blanc Safe Storage" Keychain item.
- **Whether every v1.45.1 behavior is captured.** §5.2 found 22 untracked surfaces; more may exist. The scenario run (plan F0.5) is the systematic check.

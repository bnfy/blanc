# Acceptance Checklist & Traceability

Every acceptance scenario, its feature/divergence trace, and its per-platform
status. This is the grid you tick during the per-release **parity audit** — a
feature's row in [`../parity-matrix.md`](../parity-matrix.md) shouldn't reach
`SHIPPED` on a platform until its scenarios pass there.

**Status:** ✅ verified/passing · ⬜ not built / not run · ➖ N/A on this platform.

> Desktop is the shipped reference, so its `@all` cells are ✅ (behaviour verified
> in the shipping app; automated step-defs are a separate track). iOS/Android are
> greenfield → ⬜. The grid below tracks stable scenario IDs across 18 `.feature`
> files.

## Files

| Domain | File | Features |
|--------|------|----------|
| Island / palette / slash | `island-and-commands.feature` | F1, F6, F7 |
| Tabs & groups | `tabs-and-groups.feature` | F2, F3 |
| Private tabs | `private-tabs.feature` | F4 |
| Navigation & context menu | `navigation-and-context-menu.feature` | F5, F19 |
| Find / favorites / history | `find-favorites-history.feature` | F8, F9, F10 |
| Downloads | `downloads.feature` | F11 |
| Ad/tracker blocking | `ad-blocking.feature` | F12 |
| Settings & theming | `settings-and-theming.feature` | F14, F15 |
| Permissions & auth | `permissions-and-auth.feature` | F13, F20 |
| Internal pages | `internal-pages.feature` | F16 |
| Supporter & session | `supporter-and-session.feature` | F17, F18 |
| Platform services | `platform-services.feature` | F21, F22, F23, F24 |
| Tab sync | `sync.feature` | F27 |
| Vertical tabs | `vertical-tabs.feature` | F28 (D19) |
| Browser migration | `browser-migration.feature` | F30 (D22) |
| Quiet Tabs | `quiet-tabs.feature` | F31 (D8, D23) |
| Independent windows | `multi-window.feature` | F32 (D11) |
| Local profiles | `local-profiles.feature` | F33 (D25) |
| Glance | `glance.feature` | F34 (D11) |

## Grid

| ID | Scenario | Diverge | Desktop | iOS | Android |
|----|----------|---------|:-------:|:---:|:-------:|
| F1-1 | Resting pill reflects tab and blocking state | — | ✅ | ⬜ | ⬜ |
| F1-2 | Palette floats command bar + tab switcher | — | ✅ | ⬜ | ⬜ |
| F2-1 | Reopen closed restores URL | — | ✅ | ⬜ | ⬜ |
| F2-2 | Duplicate tab | — | ✅ | ⬜ | ⬜ |
| F2-3 | Pin orders ahead of unpinned | — | ✅ | ⬜ | ⬜ |
| F2-4 | Plain new tab is ungrouped | — | ✅ | ⬜ | ⬜ |
| F2-5 | Reopen-closed history is workspace-local | D11 | ✅ | ➖ | ➖ |
| F3-1 | `/group` creates + moves | — | ✅ | ⬜ | ⬜ |
| F3-2 | Pill's dots render only active group | — | ✅ | ⬜ | ⬜ |
| F3-3 | Collapse tucks tabs away | — | ✅ | ⬜ | ⬜ |
| F3-4 | Last tab prunes group | — | ✅ | ⬜ | ⬜ |
| F3-5 | Grouped pin stays in group | — | ✅ | ⬜ | ⬜ |
| F4-1 | Private not recorded / not reopenable | — | ✅ | ⬜ | ⬜ |
| F4-2 | Private styling + quick exit | — | ✅ | ⬜ | ⬜ |
| F4-3 | Child tabs inherit privacy | — | ✅ | ⬜ | ⬜ |
| F4-4 | Private session isolated from ordinary tabs | — | ✅ | ⬜ | ⬜ |
| F5-1 | Domain navigates | — | ✅ | ⬜ | ⬜ |
| F5-2 | Query searches (4 engines) | — | ✅ | ⬜ | ⬜ |
| F5-3 | `mailto:` hands off to OS | D4 | ✅ | ⬜ | ⬜ |
| F5-4 | Autocomplete follows the current default engine | — | ✅ | ⬜ | ⬜ |
| F5-5 | Autocomplete privacy gates keep text local | — | ✅ | ⬜ | ⬜ |
| F5-6 | Command-bar submit commits a real navigation | — | ✅ | ⬜ | ⬜ |
| F6-1 | Quick Switcher matches tabs + favorites | — | ✅ | ⬜ | ⬜ |
| F6-2 | Quick Switcher matches + focuses group | — | ✅ | ⬜ | ⬜ |
| F7-1 | Slash prefix filters commands | — | ✅ | ⬜ | ⬜ |
| F7-2 | Running a slash command acts | — | ✅ | ⬜ | ⬜ |
| F8-1 | Find count + page stays interactive | — | ✅ | ⬜ | ⬜ |
| F9-1 | Favorite surfaces on newtab + list | — | ✅ | ⬜ | ⬜ |
| F9-2 | Add all open tabs to favorites | — | ✅ | ⬜ | ⬜ |
| F10-1 | Visit recorded with final title | — | ✅ | ⬜ | ⬜ |
| F10-2 | `/clear` empties history | — | ✅ | ⬜ | ⬜ |
| F11-1 | Download shows progress + completes | — | ✅ | ⬜ | ⬜ |
| F11-2 | Completed download is retrievable | D3 | ✅ | ⬜ | ⬜ |
| F12-1 | Blocking increments shield count | D1 | ✅ | ⬜ | ⬜ |
| F12-2 | Allow-ads drops count + persists | D2 | ✅ | ⬜ | ⬜ |
| F12-3 | Global toggle off/on | — | ✅ | ⬜ | ⬜ |
| F12-4 | /block-ads re-blocks an allowed site | D2 | ✅ | ⬜ | ⬜ |
| F12-5 | Slash-command + settings toggle agree | — | ✅ | ⬜ | ⬜ |
| F12-6 | Shield popover toggles site protection | D2, D13 | ✅ | ⬜ | ⬜ |
| F12-7 | HTTP warning badge opens site controls | — | ✅ | ⬜ | ⬜ |
| F12-8 | Site controls report an HTTPS connection | — | ✅ | ⬜ | ⬜ |
| F12-9 | Site controls follow their opening control | — | ✅ | ⬜ | ⬜ |
| F13-1 | Geolocation prompt + deny persists | — | ✅ | ⬜ | ⬜ |
| F14-1 | Invalid search engine rejected | — | ✅ | ⬜ | ⬜ |
| F14-2 | Unlicensed supporter icon → default | D5 | ✅ | ⬜ | ⬜ |
| F14-3 | Exception hostnames normalized | — | ✅ | ⬜ | ⬜ |
| F14-4 | Search-suggestion opt-out stays device-local | — | ✅ | ⬜ | ⬜ |
| F15-1 | Dark recolors chrome + page live | — | ✅ | ⬜ | ⬜ |
| F15-2 | Private theme scope | — | ✅ | ⬜ | ⬜ |
| F16-1 | Newtab ledger contents | — | ✅ | ⬜ | ⬜ |
| F16-2 | Internal nav stays in scheme | — | ✅ | ⬜ | ⬜ |
| F16-3 | Privileged chrome rejects web navigation | D11 | ✅ | ➖ | ➖ |
| F17-1 | Supporter unlock enables colorways | D6 | ✅ | ⬜ | ⬜ |
| F17-2 | Non-supporter locked + fallback | — | ✅ | ⬜ | ⬜ |
| F18-1 | Relaunch restores groups, not private | D8 | ✅ | ⬜ | ⬜ |
| F19-1 | Background tab inherits group | D4, D7 | ✅ | ⬜ | ⬜ |
| F19-2 | Copy Clean Link strips tracking params | D20 | ✅ | ➖ | ➖ |
| F19-3 | Paste and Go navigates + closes island | D20 | ✅ | ➖ | ➖ |
| F20-1 | Basic-auth prompt | — | ✅ | ⬜ | ⬜ |
| F21-1 | Fresh-profile usage-ping choice / single | — | ✅ | ⬜ | ⬜ |
| F22-1 | Desktop in-app updater | D9 | ✅ | ➖ | ➖ |
| F22-2 | Mobile ships no self-updater | D9 | ➖ | ⬜ | ⬜ |
| F23-1 | Page scales + resets | D10 | ✅ | ⬜ | ⬜ |
| F24-1 | AutoFill + passkeys in a tab | D12 | ➖ | ⬜ | ⬜ |
| F27-1 | Sharing open tabs off by default | — | ✅ | ⬜ | ⬜ |
| F27-2 | Remote tab opens locally as new ungrouped tab | — | ✅ | ⬜ | ⬜ |
| F27-3 | Sharing-off retracts this device | — | ✅ | ⬜ | ⬜ |
| F28-1 | Layout default, persistence, and no-sync rule | D19 | ✅ | ➖ | ➖ |
| F28-2 | Layout switching preserves live guest content | D19 | ✅ | ➖ | ➖ |
| F28-3 | Full-height rail and safe-area page-pane geometry | D19 | ✅ | ➖ | ➖ |
| F28-4 | Panel and palette website-pane geometry | D19 | ✅ | ➖ | ➖ |
| F28-5 | Find geometry at 640×480 | D19 | ✅ | ➖ | ➖ |
| F28-6 | Canonical buckets, groups, and remote-tab scope | D19 | ✅ | ➖ | ➖ |
| F28-7 | Identity, private, loading, pin, and audio states | D19 | ✅ | ➖ | ➖ |
| F28-8 | Rail pointer and retained menu actions | D19 | ✅ | ➖ | ➖ |
| F28-9 | Activation dismisses surfaces and focuses content | D19 | ✅ | ➖ | ➖ |
| F28-10 | Same-bucket drag reorder | D19 | ✅ | ➖ | ➖ |
| F28-11 | Cross-bucket drag rejection | D19 | ✅ | ➖ | ➖ |
| F28-12 | Roving keyboard and accessible action flow | D19 | ✅ | ➖ | ➖ |
| F28-13 | Expanded-Island two-way layout toggle | D19 | ✅ | ➖ | ➖ |
| F28-14 | Global vertical-tabs keyboard toggle | D19 | ✅ | ➖ | ➖ |
| F28-15 | Constrained direct rail resize and reset | D19 | ✅ | ➖ | ➖ |
| F28-16 | Non-destructive narrow-window width cap and persistence | D19 | ✅ | ➖ | ➖ |
| F28-17 | Overflow-only tab-title hover scrolling | D19 | ✅ | ➖ | ➖ |
| F30-1 | Direct profile import preserves supported Favorites and folders | D22 | ✅ | ⬜ | ⬜ |
| F30-2 | Repeated browser import is idempotent | D22 | ✅ | ⬜ | ⬜ |
| F30-3 | Fresh first run offers Favorites migration | D22 | ✅ | ⬜ | ⬜ |
| F31-1 | Quiet then wake preserves identity, history, oversized-state fallback, and redirect safety | D8 | ✅ | ⬜ | ⬜ |
| F31-2 | The active tab is never quieted | D8 | ✅ | ⬜ | ⬜ |
| F31-3 | Protected background tabs stay awake and beforeunload remains functional | D8 | ✅ | ⬜ | ⬜ |
| F31-4 | The sleep command shows quieted rows or explains that none can be quieted, without closing the panel | D23 | ✅ | ➖ | ⬜ |
| F31-5 | Quiet is visible and included in accessible names | D8 | ✅ | ⬜ | ⬜ |
| F31-6 | Every delay value persists and Off leaves quiet tabs quiet | D23 | ✅ | ➖ | ⬜ |
| F31-7 | Lazy-restored tabs are viewless until the selected tab wakes | D8 | ✅ | ⬜ | ⬜ |
| F31-8 | A private tab wakes inside the private session | D8 | ✅ | ⬜ | ⬜ |
| F31-9 | Page state never escapes snapshots into persistence, sync, or renderer IPC | D8 | ✅ | ⬜ | ⬜ |
| F31-10 | Quieting a tab releases a real renderer process, and waking brings one back | D8 | ✅ | ⬜ | ⬜ |
| F32-1 | A secondary window owns and discards its own workspace | D11 | ✅ | ➖ | ➖ |
| F32-2 | Independent window workspaces restore separately | D11 | ✅ | ➖ | ➖ |
| F33-1 | Settings creates a profile with isolated records and sessions | D25 | ✅ | ➖ | ➖ |
| F33-2 | Settings renames and permanently deletes a named profile | D25 | ✅ | ➖ | ➖ |
| F33-3 | Named profile workspace restores into its isolated session | D25 | ✅ | ➖ | ➖ |
| F34-1 | Explicit Glance selection, swap, resize, and close | D11 | ✅ | ➖ | ➖ |

> **M0–M1 note (2026-07-08):** F5 (address/search + OS hand-off) and F1 (minimal
> address surface) are implemented and unit-tested on iOS, but the iOS acceptance
> cells remain ⬜ — automated iOS step-def binding (S6) is a separate track.

## Coverage check

- Features `F1–F24`, `F27–F28`, and `F30–F34` have ≥1 Gherkin scenario. F25 (DoH) and F26
  (WebRTC policy) retain manual acceptance contracts in `features.md` but have
  not yet been transcribed into this suite.
- The suite explicitly tags D1–D12, D16, D19, D23, and D25. D11 is exercised
  directly by F32 and implicitly wherever Island scenarios run against platform windowing; D13/D14
  are covered within the F12 contract (F12-1's shield assertion is relaxed on
  iOS per D13 — see
  [`../blocking-backends.md`](../blocking-backends.md)). D15, D17, and D18 do
  not yet have discrete Gherkin assertions.
- Mobile-gained / platform-specific outcomes (F22, F24, F28) correctly carry
  platform tags rather than `@all`.

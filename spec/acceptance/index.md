# Acceptance Checklist & Traceability

Every acceptance scenario, its feature/divergence trace, and its per-platform
status. This is the grid you tick during the per-release **parity audit** — a
feature's row in [`../parity-matrix.md`](../parity-matrix.md) shouldn't reach
`SHIPPED` on a platform until its scenarios pass there.

**Status:** ✅ verified/passing · ⬜ not built / not run · ➖ N/A on this platform.

> Desktop is the shipped reference, so existing shipped `@all` cells are ✅
> (behaviour verified in the shipping app; automated step-defs are a separate
> track). Newly planned contracts remain ⬜ until their acceptance gate passes.
> iOS/Android are greenfield → ⬜. The grid below tracks stable scenario IDs
> across 23 `.feature` files.

## Files

| Domain | File | Features |
|--------|------|----------|
| Island / palette / slash | `island-and-commands.feature` | F1, F6, F7 |
| Tabs & groups | `tabs-and-groups.feature` | F2, F3, F46 |
| Drag to reorder | `tab-drag.feature` | F3, F28 |
| Private tabs | `private-tabs.feature` | F4 |
| Navigation & context menu | `navigation-and-context-menu.feature` | F5, F19 |
| Find / favorites / history | `find-favorites-history.feature` | F8, F9, F10 |
| Downloads | `downloads.feature` | F11 |
| Ad/tracker blocking | `ad-blocking.feature` | F12 |
| Settings & theming | `settings-and-theming.feature` | F14, F15, F42 |
| Permissions & auth | `permissions-and-auth.feature` | F13, F20 |
| Internal pages | `internal-pages.feature` | F16 |
| Supporter & session | `supporter-and-session.feature` | F17, F18 |
| Platform services | `platform-services.feature` | F21, F22, F23, F24, F38 |
| Tab sync | `sync.feature` | F27 |
| Vertical tabs | `vertical-tabs.feature` | F28 (D19) |
| Browser migration | `browser-migration.feature` | F30 (D22) |
| Quiet Tabs | `quiet-tabs.feature` | F31 (D8, D23) |
| Tab Archive | `tab-archive.feature` | F52 |
| Split View | `split-view.feature` | F53 (D11) |
| Independent windows | `multi-window.feature` | F32 (D11) |
| Local profiles | `local-profiles.feature` | F33 (D25) |
| Glance | `glance.feature` | F34 (D11) |
| Start page layouts | `newtab-layouts.feature` | F35 |
| First-run onboarding | `onboarding.feature` | F36 (F30, D22) |
| Blank-tab affordance | `blank-tab-affordance.feature` | F37 |
| Certificate safety | `site-certificate-safety.feature` | F39 |
| Tab migration | `tab-migration.feature` | F40 (D22) |
| Interface language | `interface-language.feature` | F44 (D27) |
| Arc Spaces import | `arc-spaces-import.feature` | F45 |

## Grid

| ID | Scenario | Diverge | Desktop | iOS | Android |
|----|----------|---------|:-------:|:---:|:-------:|
| F1-1 | Resting pill reflects tab and blocking state | — | ✅ | ⬜ | ⬜ |
| F1-2 | Palette floats command bar + tab switcher | — | ✅ | ⬜ | ⬜ |
| F1-3 | Hover-open is off by default | D28 | ✅ | ➖ | ➖ |
| F1-4 | Hover-open waits for its dwell | D28 | ✅ | ➖ | ➖ |
| F1-5 | Crossing the Island does not open it | D28 | ✅ | ➖ | ➖ |
| F1-6 | Motion inside does not postpone hover-open | D28 | ✅ | ➖ | ➖ |
| F1-7 | The proximity band does not trigger hover-open | D28 | ✅ | ➖ | ➖ |
| F1-8 | A resting pointer must exit before reopening | D28 | ✅ | ➖ | ➖ |
| F1-9 | An ordinary open during dwell wins once | D28 | ✅ | ➖ | ➖ |
| F1-10 | Shield popover blocks hover-open | D28 | ✅ | ➖ | ➖ |
| F1-11 | Hover-open works with vertical tabs | D28 | ✅ | ➖ | ➖ |
| F1-12 | Disabling hover-open cancels its dwell | D28 | ✅ | ➖ | ➖ |
| F1-13 | A pending permission prompt blocks hover-open | D28 | ✅ | ➖ | ➖ |
| F1-14 | Only the address area opens the Island on hover | D28 | ✅ | ➖ | ➖ |
| F1-15 | Turning auto-hide on explains the way back, then gives the page the whole window | D29 | ✅ | ➖ | ➖ |
| F1-16 | The top edge reveals the Island and leaving hides it | D29 | ✅ | ➖ | ➖ |
| F1-17 | The palette keeps an auto-hidden Island shown | D29 | ✅ | ➖ | ➖ |
| F1-18 | Auto-hide works with vertical tabs | D29 | ✅ | ➖ | ➖ |
| F1-19 | Resting at the top edge reveals the Island without page movement | D29 | ✅ | ➖ | ➖ |
| F1-20 | A hover-opened panel closes once the pointer leaves it | D28 | ✅ | ➖ | ➖ |
| F1-21 | A hover-opened panel stays open once it is used | D28 | ✅ | ➖ | ➖ |
| F1-22 | Resting just below the top edge reveals the Island after a moment | D29 | ✅ | ➖ | ➖ |
| F1-23 | Passing just below the top edge does not reveal the Island | D29 | ✅ | ➖ | ➖ |
| F1-24 | Without a global pointer position (Wayland) the page's moves reveal and hide the Island | D29 | ✅ | ➖ | ➖ |
| F1-25 | A hidden strip drags the window only through its thin top band | D29 | ✅ | ➖ | ➖ |
| F1-26 | Resting where the hidden address will appear still lets hover open the Island | D29 | ✅ | ➖ | ➖ |
| F1-27 | The vertical rail is never reveal territory | D29 | ✅ | ➖ | ➖ |
| F1-28 | A floating Island keeps a thin top band to drag the window | D29 | ✅ | ➖ | ➖ |
| F1-29 | A floating Island leaves the page where it is | D29 | ✅ | ➖ | ➖ |
| F1-30 | The revealed Island floats over a page that stays still | D29 | ✅ | ➖ | ➖ |
| F1-31 | Find and the shield menu open under the floating pill | D29 | ✅ | ➖ | ➖ |
| F1-32 | Hover-open works on the floating pill | D29 | ✅ | ➖ | ➖ |
| F1-33 | Glance uses the push layout in float mode | D29 | ✅ | ➖ | ➖ |
| F1-34 | The floating pill keeps up with tabs, sheets, styles and windows | D29 | ✅ | ➖ | ➖ |
| F1-35 | The floating pill takes the private theme | D29 | ✅ | ➖ | ➖ |
| F1-36 | Window buttons come and go with the floating pill on Windows and Linux | D29 | ✅ | ➖ | ➖ |
| F1-37 | Switching to push while the pill slides in leaves nothing behind | D29 | ✅ | ➖ | ➖ |
| F1-38 | Turning auto-hide off while the pill floats | D29 | ✅ | ➖ | ➖ |
| F1-39 | Changing the style while Glance is open | D29 | ✅ | ➖ | ➖ |
| F1-40 | Resizing the window while the pill floats | D29 | ✅ | ➖ | ➖ |
| F1-41 | Changing the theme while the pill floats | D29 | ✅ | ➖ | ➖ |
| F1-42 | The floating pill is the strip's pill, in both tab layouts | D29 | ✅ | ➖ | ➖ |
| F1-43 | Resting just below the top edge does not reveal a floating Island | D29 | ✅ | ➖ | ➖ |
| F1-44 | A floating Island hides as soon as the pointer moves below the strip | D29 | ✅ | ➖ | ➖ |
| F2-1 | Reopen closed restores URL | — | ✅ | ⬜ | ⬜ |
| F2-2 | Duplicate tab | — | ✅ | ⬜ | ⬜ |
| F2-3 | Pin orders ahead of unpinned | — | ✅ | ⬜ | ⬜ |
| F2-4 | Plain new tab is ungrouped | — | ✅ | ⬜ | ⬜ |
| F2-5 | Reopen-closed history is workspace-local | D11 | ✅ | ➖ | ➖ |
| F2-6 | Closing a group is one undo step | — | ✅ | ⬜ | ⬜ |
| F3-1 | `/group` creates + moves | — | ✅ | ⬜ | ⬜ |
| F3-2 | Pill shows pins + active section + global remainder | — | ✅ | ⬜ | ⬜ |
| F3-3 | Collapse tucks tabs away | — | ✅ | ⬜ | ⬜ |
| F3-4 | Last tab prunes group | — | ✅ | ⬜ | ⬜ |
| F3-5 | Grouped pin stays in group | — | ✅ | ⬜ | ⬜ |
| F4-1 | Private not recorded / not reopenable | — | ✅ | ⬜ | ⬜ |
| F4-2 | Private styling + quick exit | — | ✅ | ⬜ | ⬜ |
| F4-3 | Child tabs inherit privacy | — | ✅ | ⬜ | ⬜ |
| F4-4 | Private session isolated from ordinary tabs | — | ✅ | ⬜ | ⬜ |
| F5-1 | Domain navigates | — | ✅ | ⬜ | ⬜ |
| F5-2 | Query searches (5 engines) | — | ✅ | ⬜ | ⬜ |
| F5-3 | `mailto:` hands off to OS | D4 | ✅ | ⬜ | ⬜ |
| F5-4 | Autocomplete follows the current default engine | — | ✅ | ⬜ | ⬜ |
| F5-5 | Autocomplete privacy gates keep text local | — | ✅ | ⬜ | ⬜ |
| F5-6 | Command-bar submit commits a real navigation | — | ✅ | ⬜ | ⬜ |
| F5-7 | Reviewed desktop app callback requires confirmation | D4 | ✅ | ➖ | ➖ |
| F5-8 | Colon-prefixed search operator remains a search | — | ✅ | ⬜ | ⬜ |
| F5-9 | Custom search address is used for searches | — | ✅ | ⬜ | ⬜ |
| F5-10 | Custom address refuses internet `http://` | — | ✅ | ⬜ | ⬜ |
| F5-11 | Custom engine gets no live suggestions and searches its own address | — | ✅ | ⬜ | ⬜ |
| F6-1 | Quick Switcher matches tabs + favorites | — | ✅ | ⬜ | ⬜ |
| F6-2 | Quick Switcher matches + focuses group | — | ✅ | ⬜ | ⬜ |
| F7-1 | Slash prefix filters commands | — | ✅ | ⬜ | ⬜ |
| F7-2 | Running a slash command acts | — | ✅ | ⬜ | ⬜ |
| F7-3 | A shortened slash command reads its argument after the typed word | — | ✅ | ➖ | ➖ |
| F7-4 | A group command with no name asks for one | — | ✅ | ➖ | ➖ |
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
| F14-2 | Retired app icon → default | — | ✅ | ⬜ | ⬜ |
| F14-3 | Exception hostnames normalized | — | ✅ | ⬜ | ⬜ |
| F14-4 | Search-suggestion opt-out stays device-local | — | ✅ | ⬜ | ⬜ |
| F15-1 | Dark recolors chrome + page live | — | ✅ | ⬜ | ⬜ |
| F15-2 | Private theme scope | — | ✅ | ⬜ | ⬜ |
| F42-1 | Dark websites darkens a white page while Blanc is dark | — | ⬜ | ⬜ | ⬜ |
| F42-2 | Dark websites leaves pages alone while off or Blanc is light | — | ⬜ | ⬜ | ⬜ |
| F42-3 | /dark-site keeps one site in its own colors | — | ⬜ | ⬜ | ⬜ |
| F42-4 | A private tab's /dark-site choice is not saved | — | ⬜ | ⬜ | ⬜ |
| F16-1 | Newtab ledger contents | — | ✅ | ⬜ | ⬜ |
| F16-2 | Internal nav stays in scheme | — | ✅ | ⬜ | ⬜ |
| F16-3 | Privileged chrome rejects web navigation | D11 | ✅ | ➖ | ➖ |
| F17-1 | Current app icon applies | D6 | ✅ | ⬜ | ⬜ |
| F17-2 | Patron cannot restore retired icon | — | ✅ | ⬜ | ⬜ |
| F18-1 | Relaunch restores groups, not private | D8 | ✅ | ⬜ | ⬜ |
| F19-1 | Background tab opens ungrouped | D4, D7 | ✅ | ⬜ | ⬜ |
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
| F27-4 | Moving-in checklist can be hidden permanently | — | ✅ | ⬜ | ⬜ |
| F27-5 | Moving-in checklist opens Sync and tracks progress | — | ✅ | ⬜ | ⬜ |
| F27-6 | /sync opens Settings at the Sync section | — | ✅ | ⬜ | ⬜ |
| F27-7 | Two completed migration tasks confirm and retire the checklist | — | ✅ | ⬜ | ⬜ |
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
| F30-4 | A signed-in Chrome profile's AccountBookmarks import | D22 | ✅ | ➖ | ➖ |
| F30-5 | Local and account bookmarks import once each | D22 | ✅ | ➖ | ➖ |
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
| F34-2 | A Glance opens as a centered card over the page | D11 | ✅ | ➖ | ➖ |
| F34-3 | The card keeps its header on screen when the window shrinks and grows | D11 | ✅ | ➖ | ➖ |
| F35-1 | The saved start page layout is the one that renders | — | ✅ | ⬜ | ⬜ |
| F35-2 | Choosing a layout from the footer persists it | — | ✅ | ⬜ | ⬜ |
| F35-3 | Footer opens a playable standalone Mahjong tab | — | ✅ | ⬜ | ⬜ |
| F35-4 | All four layout footers preserve their start page when launching Mahjong | — | ✅ | ⬜ | ⬜ |
| F35-5 | Billboard ranks local top sites and keeps dismissals local | — | ✅ | ➖ | ➖ |
| F35-6 | Start-page templates replace mono UI text with Inter | — | ✅ | ➖ | ➖ |
| F35-7 | Moving-in checklist appears on all four start-page layouts | — | ✅ | ➖ | ➖ |
| F35-8 | The moving-in checklist opens from the footer's left | — | ✅ | ➖ | ➖ |
| F35-9 | Private footer opens Mahjong in a private managed tab | — | ✅ | ➖ | ➖ |
| F36-1 | A fresh profile is offered the walkthrough | — | ✅ | ⬜ | ⬜ |
| F36-2 | Skipping still records the privacy choices | — | ✅ | ⬜ | ⬜ |
| F36-3 | A completed profile is not asked again | — | ✅ | ⬜ | ⬜ |
| F36-4 | No browser profile is read before the explicit ask | D22 | ✅ | ➖ | ➖ |
| F36-5 | The island step offers Tab Archive; continuing turns it on | — | ✅ | ➖ | ➖ |
| F36-6 | Turning the offer off leaves Tab Archive off | — | ✅ | ➖ | ➖ |
| F36-7 | Skipping the walkthrough leaves Tab Archive off | — | ✅ | ➖ | ➖ |
| F36-8 | A finished profile is never offered Tab Archive | — | ✅ | ➖ | ➖ |
| F37-1 | The blank-tab island invites typing | — | ✅ | ⬜ | ⬜ |
| F37-2 | Typing on a cold-launched blank tab opens the island | — | ✅ | ⬜ | ⬜ |
| F37-3 | The commands chip opens the command list | — | ✅ | ⬜ | ⬜ |
| F38-1 | Explicit matching macOS 1Password fill stays bounded and transient | D26 | ⬜ | ➖ | ➖ |
| F39-1 | Invalid certificates are rejected without a bypass | — | ✅ | ➖ | ➖ |
| F40-1 | A selected browser profile exposes its verified open-tab session | D22 | ✅ | ⬜ | ⬜ |
| F40-2 | Apply preserves source order, duplicates, pins, and quiet state | — | ✅ | ⬜ | ⬜ |
| F40-3 | Source groups seed editable Named Groups without placeholders | — | ⬜ | ⬜ | ⬜ |
| F40-4 | Source data is not read before explicit selection | D22 | ✅ | ⬜ | ⬜ |
| F40-5 | The utility renderer receives no full URLs or source paths | D22 | ✅ | ➖ | ➖ |
| F40-6 | A failed tab batch leaves tabs, groups, and Favorites unchanged | — | ⬜ | ⬜ | ⬜ |
| F40-7 | A quit prompt appears only after recoverability preflight | D22 | ✅ | ⬜ | ⬜ |
| F40-8 | A reviewed name matching an existing group merges | — | ✅ | ⬜ | ⬜ |
| F40-9 | A stale or differently owned session cannot apply | D22 | ✅ | ➖ | ➖ |
| F40-10 | Post-quit import requires the exact newest complete session | D22 | ✅ | ⬜ | ⬜ |
| F40-11 | Both onboarding paths reach the same migration sheet | D22 | ✅ | ⬜ | ⬜ |
| F40-12 | Encrypted or malformed sessions fail without credential access | D22 | ⬜ | ➖ | ➖ |
| F40-13 | Workspace save stays separate from migration | — | ⬜ | ➖ | ➖ |
| F40-14 | Cancel destroys the ephemeral migration session | — | ✅ | ⬜ | ⬜ |
| F40-15 | A 500-candidate import keeps one live imported tab | — | ✅ | ➖ | ➖ |
| F44-1 | System resolves to a supported OS language | D27 | ⬜ | ⬜ | ⬜ |
| F44-2 | A pinned language wins over the OS | D27 | ⬜ | ⬜ | ⬜ |
| F44-3 | Choosing a language asks to relaunch and applies after it | D27 | ⬜ | ➖ | ➖ |
| F44-4 | A pinned language that is no longer available renders English | D27 | ⬜ | ⬜ | ⬜ |
| F44-5 | Websites are unaffected by the interface language | — | ⬜ | ⬜ | ⬜ |
| F45-1 | Arc's file is read only after the person asks | — | ✅ | ➖ | ➖ |
| F45-2 | Each selected Arc Space becomes a space | — | ✅ | ➖ | ➖ |
| F45-3 | A selection that does not fit creates nothing | — | ✅ | ➖ | ➖ |
| F45-4 | Arc Spaces become spaces without Blanc Patron | — | ✅ | ➖ | ➖ |
| F45-5 | Arc's Favorites join a Favorites folder named Arc | — | ✅ | ➖ | ➖ |
| F45-6 | The page sees names and counts, never URLs or paths | — | ✅ | ➖ | ➖ |
| F45-7 | Linux imports a chosen file | — | ✅ | ➖ | ➖ |
| F45-8 | Closing the sheet drops what Blanc read from Arc | — | ✅ | ➖ | ➖ |
| F46-1 | Rename Tab… names the right-clicked tab | — | ✅ | ➖ | ➖ |
| F46-2 | A name stays through navigation to another site | — | ✅ | ➖ | ➖ |
| F46-3 | `/rename` with no name restores the page title | — | ✅ | ➖ | ➖ |
| F46-4 | Reset Tab Title restores the page title | — | ✅ | ➖ | ➖ |
| F46-5 | A name survives relaunch | — | ✅ | ➖ | ➖ |
| F46-6 | A private tab's name never reaches session.json | — | ✅ | ➖ | ➖ |
| F46-7 | A shortened `/rename` names the tab with the words after it | — | ✅ | ➖ | ➖ |
| F46-8 | Choosing `/rename` without a name asks for one | — | ✅ | ➖ | ➖ |
| F46-9 | Enter on an untouched rename prompt keeps the page title after the page retitles | — | ✅ | ➖ | ➖ |
| F46-10 | A renamed tab keeps its name in the command panel while it loads | — | ✅ | ➖ | ➖ |

> **M0–M1 note (2026-07-08):** F5 (address/search + OS hand-off) and F1 (minimal
> address surface) are implemented and unit-tested on iOS, but the iOS acceptance
> cells remain ⬜ — automated iOS step-def binding (S6) is a separate track.

## Coverage check

- Features `F1–F24`, `F27–F28`, and `F30–F40` have ≥1 Gherkin scenario. F25 (DoH) and F26
  (WebRTC policy) retain manual acceptance contracts in `features.md` but have
  not yet been transcribed into this suite.
- The suite explicitly tags D1–D12, D16, D19, D23, and D25. D11 is exercised
  directly by F32 and implicitly wherever Island scenarios run against platform windowing; D13/D14
  are covered within the F12 contract (F12-1's shield assertion is relaxed on
  iOS per D13 — see
  [`../blocking-backends.md`](../blocking-backends.md)). D15, D17, and D18 do
  not yet have discrete Gherkin assertions.
- Mobile-gained / platform-specific outcomes (F22, F24, F28, F38) correctly carry
  platform tags rather than `@all`.

# Result

Queue 5 is in progress; no acceptance claims yet.

| Classification | Cases | Newly passing |
| --- | ---: | ---: |
| a: missing adapter | 40 | 18 |
| b: missing fork capability / blocked acceptance | 42 | 0 |
| c: inapplicable by platform or approved construction | 20 | 0 |

Current candidate: `macos-e11aaf59419ae9e2`, `q5-glance-3-runtime-config.json`.
Inherited Sync gate: 22/22 on starting bytes; Sync code unchanged; not rerun.
Inventory baseline: 533 pass / 3 fail (subsequently repaired) / 102 undefined / 2 excluded.
Final inventory: owed, once after implementation. Lost passes: not yet measured.
Owner needs: beta/updater hold; signed physical Touch ID acceptance; Billboard TopSites design decision if still required.
Unverified: all new work until candidate-bound focused runs; final full inventory.
No push, release, signing, production/Apple/1Password contact, live-tree changes or toolchain installation authorized.

## Classification of all 102 starting gaps

Initial classification follows the raw inventory and current native source. Update if implementation reveals a missing product capability. Category c is not a pass; approved divergences remain explicit. V12 search and V18 profiles retain useful native acceptance work in category a rather than discarding their user intent.

| Case | Class | Scenario | Reason / work needed |
| --- | :---: | --- | --- |
| `F41-named-workspaces.feature:4:plain` | a | Switching preserves a dirty page in the same process | Space action needs an adapter: metrics |
| `F41-named-workspaces.feature:46:plain` | a | Twenty five workspaces remain reachable in a small viewport | Shipping main-process evaluate needs a native adapter |
| `F41-named-workspaces.feature:57:plain` | b | A partial workspace save stays discoverable without losing the outgoing page | Space action needs an adapter: fail-session-commit |
| `F41-named-workspaces.feature:69:plain` | a | Switching preserves a submitted POST response without repeating it | Shipping main-process evaluate needs a native adapter |
| `F41-named-workspaces.feature:153:plain` | a | The Spaces menu works from the keyboard | pressOverlayKey |
| `F41-named-workspaces.feature:189:plain` | a | Closing the Spaces menu fades it out where it was | pressOverlayKey |
| `F41-named-workspaces.feature:196:plain` | a | With Reduce Motion the closing Spaces menu only fades | pressOverlayKey |
| `F41-named-workspaces.feature:204:plain` | a | Clicking the mark while the Spaces menu fades opens it again | pressOverlayKey, spacesMenuExitState |
| `F41-named-workspaces.feature:246:plain` | a | Switching back to a space while its page is being quieted shows the page | raceSwitchBackDuringQuiet |
| `F41-named-workspaces.feature:396:plain` | b | A link sent to a visible space loads in its other window | step definition missing |
| `F41-named-workspaces.feature:403:plain` | b | A link sent to a set-aside space stays quiet until selected | step definition missing |
| `F41-named-workspaces.feature:413:plain` | b | A link sent to a closed space is saved without loading | step definition missing |
| `F41-named-workspaces.feature:423:plain` | b | A failed link write adds nothing and shows the Spaces error | step definition missing |
| `F41-named-workspaces.feature:431:plain` | b | New Space from a link works when only the current space exists | step definition missing |
| `F41-named-workspaces.feature:439:plain` | b | A failed New Space write retains the chosen link and editor draft | step definition missing |
| `F41-named-workspaces.feature:449:plain` | b | A failed quiet-tab creation rolls back the saved link | step definition missing |
| `F41-named-workspaces.feature:480:plain` | b | A split selection closes and restores as one batch | Batch operation is not built: batch-close |
| `arc-spaces-import.feature:53:plain` | c | Linux imports a chosen file | Windows/Linux-only UI or Linux import; not applicable on macOS. |
| `downloads.feature:13:plain` | a | A completed download is retrievable | step definition missing |
| `glance.feature:24:plain` | a | A visible Glance reference is never quieted | setTabIdleSince |
| `glance.feature:31:plain` | a | Cancelling a Change picker after its reference closed leaves focus on the page | Shipping main-process evaluate needs a native adapter |
| `glance.feature:38:plain` | a | Media started in the reference pane is audible | simulateMediaStarted |
| `glance.feature:45:plain` | a | A tab muted as a background tab is unmuted when it opens in Glance | simulateMediaStarted |
| `glance.feature:178:plain` | a | Zoom and Back follow focus into the reference | zoomLevel |
| `glance.feature:187:plain` | c | The 1Password fill and its hint follow the focused pane | Owner decision 2026-11-02: no 1Password SDK/fill capsule; use the Web Store extension. |
| `glance.feature:197:plain` | c | A reference navigation leaves a 1Password question about the main page alone | Owner decision 2026-11-02: no 1Password SDK/fill capsule; use the Web Store extension. |
| `glance.feature:207:plain` | a | A mouse gesture in the reference acts on the reference | setMouseGestures |
| `glance.feature:234:plain` | a | The Glance header goes back and reloads the reference | zoomLevel |
| `glance.feature:253:plain` | a | Find pressed in the other pane starts a fresh search there | Browser command needs an adapter: find |
| `glance.feature:264:plain` | a | The Island makes room for a new chip and grows back when it goes | Shipping main-process evaluate needs a native adapter |
| `glance.feature:273:plain` | a | A growing blocked count leaves the Island's dots alone | Shipping main-process evaluate needs a native adapter |
| `glance.feature:280:plain` | a | The Island re-fits when the interface font finishes loading | Shipping main-process evaluate needs a native adapter |
| `glance.feature:287:plain` | a | Close Tab from the find bar on the reference hands focus to the main page | Browser command needs an adapter: find |
| `glance.feature:296:plain` | a | A new tab opened with focus in the reference makes the main page the focused pane | Browser command needs an adapter: new-tab |
| `glance.feature:345:plain` | a | A private reference shows the private chip in the header | glanceHeaderMotion needs an adapter |
| `glance.feature:471:plain` | a | At 360 px the header keeps Back, Reload, the three actions as icons and × | tooltipViewState |
| `glance.feature:489:plain` | a | Find for the Glance page sits over the card | Browser command needs an adapter: find |
| `glance.feature:498:plain` | a | The card fades in at its full size and closes at once | closeGlanceAndReadCard, glanceCardMotion |
| `glance.feature:506:example-515` | a | Closing the Glance tab just after moving the card keeps the move and takes the card at once | closeTabAndReadGlance |
| `glance.feature:506:example-516` | a | Closing the main page just after moving the card keeps the move and takes the card at once | closeTabAndReadGlance |
| `glance.feature:519:plain` | a | A window's first Glance shows nothing until its card has drawn | openFirstGlanceAndRead |
| `island-and-commands.feature:320:plain` | c | Window buttons come and go with the floating pill on Windows and Linux | Windows/Linux-only UI or Linux import; not applicable on macOS. |
| `link-routing.feature:8:plain` | b | the group is offered only when there is somewhere to route to | step definition missing |
| `link-routing.feature:16:plain` | b | a rule added in Settings sends a domain's links to its profile | step definition missing |
| `link-routing.feature:28:plain` | b | deleting a profile removes its rules and its links fall through | step definition missing |
| `link-routing.feature:37:plain` | b | the shield popover makes and removes the rule for the site in view | step definition missing |
| `link-routing.feature:50:plain` | b | /route and /route off write and remove the rule; a private tab can't | step definition missing |
| `link-routing.feature:62:plain` | b | with the switch on, a link opened in a new tab follows a rule to another profile | step definition missing |
| `link-routing.feature:79:plain` | b | a link opened in the background into a new window leaves the current window in front | step definition missing |
| `local-profiles.feature:7:plain` | a | Settings creates a profile with isolated records and sessions | step definition missing |
| `local-profiles.feature:17:plain` | a | Settings renames and permanently deletes a named profile | step definition missing |
| `local-profiles.feature:27:plain` | a | a named profile workspace restores into the same isolated session | step definition missing |
| `mini-window.feature:10:plain` | b | a mini window opens small, isn't saved, and closes after an hour unused | step definition missing |
| `mini-window.feature:18:plain` | b | Open in Blanc keeps a mini window as an ordinary window | step definition missing |
| `mini-window.feature:24:plain` | b | a link from another app never opens in a mini window | step definition missing |
| `mini-window.feature:30:plain` | b | closing a mini window's last tab closes the window | step definition missing |
| `mini-window.feature:36:plain` | b | the mini window shortcut is off until chosen | step definition missing |
| `navigation-and-context-menu.feature:12:example-23` | a | Typing a query searches with the selected engine | V12: Kagi is added under chrome://settings → Manage search engines |
| `navigation-and-context-menu.feature:77:plain` | a | A custom search address is used for searches | V12: a custom search address is added under chrome://settings → Manage search engines |
| `navigation-and-context-menu.feature:83:plain` | a | A custom address can't send searches over the internet unencrypted | V12: a custom search address is added under chrome://settings → Manage search engines |
| `navigation-and-context-menu.feature:91:plain` | a | A custom search engine gets no live suggestions and searches its own address | V12: a custom search address is added under chrome://settings → Manage search engines |
| `navigation-and-context-menu.feature:100:plain` | a | Open link in a background tab opens it ungrouped | step definition missing |
| `newtab-layouts.feature:126:plain` | b | Billboard continues past its initial candidate page | seedBillboardOverflowHistory: real history::TopSites caps GetMostVisitedURLs at 10 (kTopSitesNumber); needs an owner-approved native design decision, not a test op |
| `platform-services.feature:25:plain` | b | Desktop updates through the in-app updater | ABSOLUTE OWNER HOLD: dedicated beta build and in-app updater; no work or runs. |
| `platform-services.feature:50:plain` | c | Blanc fills only a matching 1Password login after an explicit ask | Owner decision 2026-11-02: no 1Password SDK/fill capsule; use the Web Store extension. |
| `platform-services.feature:64:plain` | c | The island offers Fill only for a visible, uncontradicted login form | Owner decision 2026-11-02: no 1Password SDK/fill capsule; use the Web Store extension. |
| `platform-services.feature:76:plain` | c | Fill questions open as a dialog capsule with Cancel focused and full keyboard control | Owner decision 2026-11-02: no 1Password SDK/fill capsule; use the Web Store extension. |
| `platform-services.feature:88:plain` | c | Fill errors persist until dismissed and their announcement survives | Owner decision 2026-11-02: no 1Password SDK/fill capsule; use the Web Store extension. |
| `platform-services.feature:98:plain` | c | A successful fill confirms politely and gets out of the way on its own | Owner decision 2026-11-02: no 1Password SDK/fill capsule; use the Web Store extension. |
| `platform-services.feature:105:plain` | c | Switching tabs withdraws a pending fill question | Owner decision 2026-11-02: no 1Password SDK/fill capsule; use the Web Store extension. |
| `platform-services.feature:112:plain` | c | The success confirmation waits while pointed at or focused | Owner decision 2026-11-02: no 1Password SDK/fill capsule; use the Web Store extension. |
| `private-tabs.feature:40:plain` | b | Passkeys created in a private tab are ephemeral | Device-bound Touch ID ceremony requires signed/entitled build and owner interaction; Apple/signing work is outside this queue. Native metadata isolation is checked separately. |
| `quiet-tabs.feature:28:example-45` | c | Protected background tabs stay awake and beforeunload remains functional | This outline row asserts Electron WebContents listener counts, which do not exist in Chromium; native protection rows remain applicable. |
| `reader-mode.feature:7:plain` | c | Extract a readable article into a separate sandbox | Owner decision 2026-11-02: native Chromium Reading Mode replaces the shipping reader sandbox and appearance. |
| `reader-mode.feature:13:plain` | c | Return to the same document and scroll position | Owner decision 2026-11-02: native Chromium Reading Mode replaces the shipping reader sandbox and appearance. |
| `reader-mode.feature:20:plain` | c | Reader appearance is remembered locally | Owner decision 2026-11-02: native Chromium Reading Mode replaces the shipping reader sandbox and appearance. |
| `settings-and-theming.feature:49:plain` | c | Dark websites darkens a white page while Blanc is dark | Owner decision 2026-11-02: no built-in Dark Reader; use the Web Store extension. |
| `settings-and-theming.feature:57:plain` | c | Dark websites leaves pages alone while it is off or Blanc is light | Owner decision 2026-11-02: no built-in Dark Reader; use the Web Store extension. |
| `settings-and-theming.feature:65:plain` | c | /dark-site keeps one site in its own colors | Owner decision 2026-11-02: no built-in Dark Reader; use the Web Store extension. |
| `settings-and-theming.feature:74:plain` | c | A private tab's /dark-site choice is not saved | Owner decision 2026-11-02: no built-in Dark Reader; use the Web Store extension. |
| `split-view.feature:201:plain` | a | A pane view raised above the floating Island goes back under it at the next layout | raiseTabView |
| `supporter-and-session.feature:12:plain` | a | A retired icon cannot be restored by an active Patron | setSupporterActive |
| `supporter-and-session.feature:26:plain` | a | Relaunch restores groups but not private tabs | step definition missing |
| `tab-archive.feature:8:plain` | b | An idle loose tab is archived | step definition missing |
| `tab-archive.feature:15:plain` | b | Pinned and grouped tabs are never archived | step definition missing |
| `tab-archive.feature:22:plain` | b | Nothing is archived during the grace period | step definition missing |
| `tab-archive.feature:29:plain` | b | A tab with unsaved form work is not archived | step definition missing |
| `tab-archive.feature:36:plain` | b | Restoring an archived tab opens it once, with its custom name | step definition missing |
| `tab-archive.feature:43:plain` | b | Clearing history empties the Archive | step definition missing |
| `tab-archive.feature:49:plain` | b | Nothing is archived right after the computer wakes from sleep | step definition missing |
| `tab-archive.feature:56:plain` | b | Restore an archived tab from the History sheet | step definition missing |
| `tab-archive.feature:64:plain` | b | Clear the Archive from the History sheet | step definition missing |
| `tab-archive.feature:71:plain` | b | A tab I switch to while the sweep is checking it stays open | step definition missing |
| `tab-archive.feature:79:plain` | b | Overlapping sweeps archive a tab only once | step definition missing |
| `tab-archive.feature:87:plain` | b | Restoring works while a private tab is active | step definition missing |
| `tab-archive.feature:94:plain` | b | Tabs in a Space set aside are left alone, and start their idle clock again when it comes back | step definition missing |
| `tab-archive.feature:104:plain` | b | The first archive is announced once, and View Archive opens it | step definition missing |
| `tab-archive.feature:113:plain` | b | A dismissed notice never comes back | step definition missing |
| `tab-archive.feature:122:plain` | b | Closing only a blank New Tab announces nothing | step definition missing |
| `tab-drag.feature:136:plain` | b | Escape mid-drag keeps the island open | The fork host discards setOverlayDragState; no overlay drag flag exists to read |
| `tabs-and-groups.feature:292:plain` | b | A local-file home follows the normal file-access policy | N15 isolated local HTML session is not implemented; a raw file navigation would bypass its access policy |
| `vertical-tabs.feature:239:plain` | c | The main-menu button moves into the rail on Windows and Linux | Windows/Linux-only UI or Linux import; not applicable on macOS. |

## 1 — Spaces keyboard and closing animation (four adapter-cohort cases)

F41 :153/:189/:196/:204 pass on first attempts in `q5-spaces-controls-2`
on macos-ebc590b319d6a8cc. `q5-spaces-controls-1` preserves all four failures
and retries on the original candidate. The adapter sends actual CDP keys to
the focused overlay iframe and reads computed closing-menu styles.
The cases exposed missing host behavior: Escape did not return focus to the
Spaces mark; immediate iframe removal prevented the shipping closing fade.
The host now releases input and logical state immediately, retains the drawing
for shipping's 200 ms interval, preserves its position and restores focus.
The existing surface epoch prevents an old close from removing a new open.
Both Reduce Motion and reopen-during-close pass unchanged shipping assertions.

Guarded prototype build: 7 steps / 22.24 s. No Sync change.
Patch budget unchanged: 123 incremental upstream paths / 430 hunks;
reconstruction 162 upstream / 583 canonical files. Required precommit and
progress checks are recorded in `q5-spaces-precommit.tap` and this commit.

## N15 — local HTML pinned home assessment

`tabs-and-groups.feature:292` remains a product gap, not an exclusion.
Shipping's `src/main/local-html-preview.js` grants one bounded (8 MiB),
regular-file snapshot to a random URL, with no general URL-to-file resolver.
It uses a dedicated ephemeral session, disables JavaScript and denies all
network/file/subframe resources independently of its restrictive sandbox CSP;
permissions, downloads, popups, redirects and non-document navigation are
refused. Closing disposes the snapshot, storage, cache and connections.
The fork has none of this document-capability loader or per-preview context
lifecycle. Its pinned-home path supports normal web homes only. Adding a raw
`file:` navigation, data URL, shared incognito tab, or privileged WebUI document
would not provide those boundaries. N15 also needs selected-file/open-file
routing, preview ownership/cleanup, and refusal tests for script, form,
redirect, popup, sibling-file and network attempts. This is a separate native
security surface, not a self-contained missing pinned-home action; no unsafe
substitute was implemented. Exact acceptance remains owed with that surface.

## 2 — Glance controls and further Spaces observations

Fourteen further starting gaps now pass: F41 :4/:46; Glance :31/:178/:234/
:253/:287/:296/:345/:471/:489/:498 and both :506 examples.
`q5-glance-controls-2` passes the ten cases other than F41 :46, Glance :345
and :506; `q5-glance-controls-3` passes those four cases on first attempts.
The final candidate is macos-e11aaf59419ae9e2 / q5-glance-3-runtime-config.json.
Earlier failures, retries and partial progress remain in controls-1/2 and the
separate diagnostic run; diagnostic preload runs are not acceptance receipts.

Adapters use native Find/New Tab/Close commands, real page zoom/media,
DOM motion and tooltip observations, real window size and layout zoom,
and actual native process/resident-Space metrics. The retained shipping
assertions exposed and now verify these product repairs:
- A tooltip is translated from its owning iframe into window coordinates.
- Find for the Glance reference is placed inside that card's page region.
- Reference replacement is one native operation; the host keeps the current
  card while the replacement's layout arrives, preserving identity cross-fade.
- Find reopening restores pointer input released by a previous close.

The diagnostic event trace records the unwanted null layout between the new
reference identity and its later native geometry. Its evidence is
`q5-glance-crossfade-events.json`. The 25-Space check uses native pixel bounds
against the real 125% layout zoom; no CSS emulation or assertions changed.
Closing either tab now observes the stored frame through a fresh native
snapshot before the 250 ms save debounce, converts stored fractions to window
coordinates as shipping does, and verifies the card is already absent.

Builds: glance-1 8 steps / 35.69 s; glance-2 8 / 35.35 s;
glance-3 7 / 20.89 s. Sync code unchanged. Native patch budget unchanged:
123 incremental upstream paths / 430 hunks; reconstruction 162 / 583.
Required precommit: `q5-glance-precommit.tap`; progress/whitespace also checked.

Discovered capability gaps retained for category-b work: Glance audio guard
(:38/:45; no native background-started-audio guard/state), mouse gestures
(:207; no native gesture controller), and the download chip's host event
feed (:264/:273/:280 share the missing feed in setup). These initial a-cohort
rows are not passes; classification will be revised with their implementation.

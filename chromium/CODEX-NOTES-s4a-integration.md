# Result

Final candidate: `macos-4cc571768c5ed8bb` (November 9, 2026). Local commits only; no push.
**S4a local end-to-end gate: 11/11 pass. Requested scenarios: 87 pass, 4 fail, 12 undefined.**

| Gate check or scenario (`.feature` line numbers) | Result |
| --- | --- |
| Settings Turn on Sync with embedded bundle | Pass |
| First upload holds existing Favorites until Continue | Pass |
| Favorites added on either device reach the other | Pass |
| Mac title edit, folder move and folder rename reach peer | Pass |
| Peer title edit and folder move reach Mac | Pass |
| Mac theme and blocking reach peer | Pass |
| Peer theme and blocking reach Mac | Pass |
| Killed runner recovers enabled state and Favorites | Pass |
| Turn off retains local Favorites | Pass |
| First reconcile retains all prior Favorites on both sides; no tombstones or DELETE | Pass |
| Not now keeps Favorites local, including after restart; remote Favorites download | Pass |
| Sync :49, :73, :150 (targeted and full run) | Pass |
| Sync :26, :38, :56, :210 | Fail — inherited checklist/iPhone entry gaps |
| Sync :7, :13, :20, :88, :104, :114, :120, :129, :162, :181, :199 | Undefined |
| Internal pages — all 10 scenarios | Pass |
| Island/commands — all 72 cases other than :320 | Pass |
| Island/commands :320 | Undefined — window-button geometry adapter |
| Vertical tabs :58 | Pass |
| Vertical tabs :217 | Pass |
| Tool tests (241); desktop patch reconstruction; diff whitespace | Pass |

**Lost passes: none (all 78 prior passes retained); 9 gained.** Every case is tabulated below.
Still unverified: production/real devices, real Keychain, private/secondary-profile runtime refusal,
write-fault/stalled-runner stress, all seven setting mappings, Android runtime, and cross-account cache safety.
The full Sync feature is **not** qualified: its four failures and eleven undefined cases remain visible.
No build/test remains active. `live/`, shipping sources/specs/desktop tests, Sync bundle/shims/hash are unchanged.

## Proof, repairs and boundaries

Work resumed from `c1eb2629` on `chromium/s3-into-migration`. The owner-unlocked
display passed the unmodified animation-frame guard. `pmset` was checked first;
a four-hour `caffeinate -d -i` assertion was retained for the session. The guard
also passed after the end-to-end browser restart. Display evidence:
`../evidence/foundation/s4a-unlocked-display.txt`.

The actual product repair is in the hand-authored `chromium/blanc/island/host.js`
(not a generated renderer file). Opening native Settings from Favorites blanks
the old utility iframe. Its load listener was treating that deliberate blank
load as an unauthorized navigation and closing the new Settings sheet. It now
ignores the iframe while native Settings owns the sheet. The end-to-end gate
keeps that Favorites-to-Settings transition and passes it on the rebuilt image.
No generated Island renderer was edited; the asset manifest and source map were
refreshed by the supplied rebuild wrapper.

The remaining corrections are native test observation and runner adapters:

- `desktopSyncSettings` reads `ReadDesktopSyncSettings`, the same native exporter
  used by desktop reconciliation. The old hook read the runner's last downloaded
  settings cache while Sync was off, so `/the dark` could not observe the profile
  change. This new read remains behind the existing preview test gate and default
  profile eligibility. End-to-end account checks still read the real runner.
- Acceptance setup selects Light through the actual Settings control, matching
  the shipping palette precondition regardless of the Mac's evening appearance.
- The page adapter exposes each real window's Island iframes; the two-window
  vertical-text assertion now observes both actual renderers.
- Normal relaunch waits for the restored native tab model, then requires blocker
  readiness for HTTP(S) tabs. Internal-page-only sessions legitimately have no
  network request and no started blocker, as already handled by crash relaunch.
  The tab-layout adapter waits for the real strip to render the persisted native
  layout before returning it. No scenario assertion was removed or weakened.

The end-to-end gate now paces requests below the local Worker's unchanged limits,
limits the independent peer's explicit passes to Favorites/settings, records a
failed check and request statuses on failure, and explicitly checks the first
reconcile's complete before/after URL inventories on both devices, both runner
and peer tombstones, and absence of Worker DELETE. Its first-reconcile fixture
has existing account Favorites and a different preexisting local Favorite.
Not now is then verified before and after a real browser restart. This is
convergence/safety evidence, not a latency measurement or qualification.

All account operations used the real local test Worker on `127.0.0.1` and an
independent bundle peer. No production endpoint/account was exercised. The
fixture uses `--use-mock-keychain`; this is not real Keychain qualification.
The native image includes the unchanged pinned Sync bundle, without a disk
bundle override. The first profile, second profile and restart exited cleanly.
The successful gate recorded 231 Worker responses: 182 HTTP 200, 2 HTTP 201,
2 HTTP 204 and 45 HTTP 404 (missing stores), with **zero HTTP 429**.

## Build and run receipts

Evidence below is under `../evidence/foundation/`:

| Receipt | Outcome |
| --- | --- |
| `s4a-unlocked-fix1-build.txt` | Guarded incremental build, 6 steps; `macos-69b54cbdbad58717` |
| `s4a-unlocked-fix2-build.txt` | Guarded incremental build, 7 steps; final `macos-4cc571768c5ed8bb` |
| `s4a-unlocked-fix2-runtime-config.json` | Final framework/executable hashes; embedded assets |
| `s4a-unlocked-fix3-e2e/result.json` | All 11 end-to-end checks pass on final candidate |
| `s4a-final-targeted/baseline.json` | Sync :49, :73, :150 pass |
| `s4a-final-features/baseline.json` | Complete requested three-feature run: 85 pass, 4 fail, 12 undefined |
| `s4a-final-vertical4/baseline.json` | Vertical :58 and :217 pass, no retry |
| `s4a-final-comparison.json` | All 103 requested cases compared by exact ID to morning baseline |
| `s4a-final-tools.tap` | 241 pass, zero failed/skipped |
| `s4a-final-patches.txt` | Desktop reconstruction passes |

Builds and tests were serial, using only the supplied wrappers for native builds
and scenario runs. No cold build, clean, toolchain/args change or competing build
occurred. The patch budget remains 41 patches, 506 hunks, 149 patched paths;
reconstruction validates 153 desktop outputs and 552 canonical files. No new
Android build or Android acceptance was performed in this run.

The full feature run preceded the last **runner-only** relaunch/layout readiness
corrections; both final vertical scenarios exercise those corrections, including
an internal-only restore and an HTTP fixture restore. The browser image and its
candidate ID did not change. The end-to-end gate uses its own relaunch path.
These are requested feature subsets, not a new whole-desktop foundation baseline.

Reproduction (run serially; `SP` is the supplied scratchpad):

```sh
SP=/private/tmp/claude-502/-Users-anthonyjloria-Projects-BlancChromium158-repo/600bf6e0-4d53-4534-b112-7ab3638fd2e4/scratchpad
/usr/local/bin/node chromium/tests/desktop-sync.mjs \
  ../evidence/foundation/s4a-unlocked-fix2-runtime-config.json \
  ../evidence/foundation/NEW-e2e
bash "$SP/run-cases.sh" s4a-unlocked-fix2 NEW-targeted \
  'sync.feature:49:,sync.feature:73:,sync.feature:150:'
bash "$SP/run-cases.sh" s4a-unlocked-fix2 NEW-features \
  'sync.feature:,internal-pages.feature:,island-and-commands.feature:'
bash "$SP/run-cases.sh" s4a-unlocked-fix2 NEW-vertical \
  'vertical-tabs.feature:58:,vertical-tabs.feature:217:'
```

Earlier attempts are retained, not counted as passes: `s4a-unlocked-e2e` stopped
at the rename convergence assertion while request backoff was present;
`s4a-unlocked-fix1-e2e` was explicitly aborted because its first pacing rule
starved under background traffic (its browser was closed and abort recorded);
`s4a-unlocked-fix2-e2e` exposed the Favorites-to-Settings product bug. Earlier
vertical receipts record an old-binary/new-hook mismatch, the missing second
window adapter, and the relaunch readiness issues fixed above. The old locked-
display handoff remains available in the prior committed version of this file.

## Remaining scope

The four full-Sync failures are inherited: :26 and :56 expect four moving-in
checklist tasks but the current UI has one; :38 cannot choose Set up Sync there;
:210 cannot choose Connect your iPhone there. Undefined cases cover shared-tab
and Other devices flows, pairing-sheet/capture/QR behavior, and the Island's
window-button geometry observation. Those broader flows were not implemented
or qualified by this bounded S4a proof. Their exact case results follow.

Still unverified: real Keychain prompts/protection and locked-Keychain recovery;
private/guest/secondary-profile runtime refusal; stalled-runner and interrupted/
refused-write injection; simultaneous/future-clock merge stress; large,
ambiguous or managed Favorites; the other five of seven native setting mappings;
production service behavior, real-device/iPhone pairing and Android native
compilation/runtime. The core handoff's cross-account runner-cache limitation
is unchanged. Passing the killed-runner test does not qualify those other faults.

## Every requested scenario

Baseline: `s3-full-merged-20261109/baseline.json`. All 78 prior passes survive;
the 9 gains include the three targeted Sync cases, both vertical cases,
internal-pages :7, and Island :295, :359 and :448/example-458.

| Case | Scenario | Morning | Final |
| --- | --- | --- | --- |
| `internal-pages.feature:7:plain` | The new-tab ledger shows the day, favorites, groups, and blocked count | fail | pass |
| `internal-pages.feature:17:plain` | Internal navigation stays within the blanc scheme | pass | pass |
| `internal-pages.feature:24:plain` | Utility pages never occupy tabs | pass | pass |
| `internal-pages.feature:31:plain` | Activating a favorite from the utility sheet opens one real tab | pass | pass |
| `internal-pages.feature:39:plain` | Untrusted web content cannot summon the utility sheet | pass | pass |
| `internal-pages.feature:47:plain` | Re-invoking the shown utility page toggles it closed regardless of URL spelling | pass | pass |
| `internal-pages.feature:53:plain` | A utility sheet whose native contents were destroyed is recreated on next open | pass | pass |
| `internal-pages.feature:61:plain` | Privileged browser chrome cannot navigate to web content | pass | pass |
| `internal-pages.feature:66:plain` | Scrolling Settings moves its section marker | pass | pass |
| `internal-pages.feature:72:plain` | Utility pages wear the Sunrise palette | pass | pass |
| `island-and-commands.feature:11:plain` | The resting pill reflects the active tab and its blocking state | pass | pass |
| `island-and-commands.feature:22:plain` | Opening the palette floats the command bar with the tab switcher | pass | pass |
| `island-and-commands.feature:29:plain` | Hover-open is off by default | pass | pass |
| `island-and-commands.feature:35:plain` | Hover-open waits for its dwell before opening | pass | pass |
| `island-and-commands.feature:43:plain` | Crossing the Island does not open it | pass | pass |
| `island-and-commands.feature:49:plain` | Motion inside the Island does not postpone opening | pass | pass |
| `island-and-commands.feature:55:plain` | The proximity band does not count as hovering the Island | pass | pass |
| `island-and-commands.feature:61:plain` | Closing under a resting pointer requires an exit before reopening | pass | pass |
| `island-and-commands.feature:73:plain` | An ordinary open during the dwell wins once | pass | pass |
| `island-and-commands.feature:79:plain` | An open shield popover blocks hover-open | pass | pass |
| `island-and-commands.feature:87:plain` | Hover-open works with vertical tabs | pass | pass |
| `island-and-commands.feature:93:plain` | Turning hover-open off cancels an active dwell | pass | pass |
| `island-and-commands.feature:99:plain` | Only the address area opens the Island on hover | pass | pass |
| `island-and-commands.feature:107:plain` | A pending permission prompt blocks hover-open | pass | pass |
| `island-and-commands.feature:115:plain` | A panel opened by hover closes once the pointer leaves it | pass | pass |
| `island-and-commands.feature:123:plain` | A hover-opened panel stays open once it is used | pass | pass |
| `island-and-commands.feature:131:plain` | Auto-hide gives the page the whole window | pass | pass |
| `island-and-commands.feature:140:plain` | The top edge reveals the Island and leaving hides it | pass | pass |
| `island-and-commands.feature:149:plain` | Resting the pointer at the top edge reveals the Island without any page movement | pass | pass |
| `island-and-commands.feature:156:plain` | The palette keeps an auto-hidden Island shown | pass | pass |
| `island-and-commands.feature:166:plain` | Resting just below the top edge reveals the Island after a moment | pass | pass |
| `island-and-commands.feature:173:plain` | Passing just below the top edge does not reveal the Island | pass | pass |
| `island-and-commands.feature:180:plain` | Without a global pointer position the page's own moves reveal and hide the Island | pass | pass |
| `island-and-commands.feature:190:plain` | A hidden strip drags the window only through its thin top band | pass | pass |
| `island-and-commands.feature:200:plain` | Resting where the hidden address will appear still lets hover open the Island | pass | pass |
| `island-and-commands.feature:211:plain` | The vertical rail is never reveal territory | pass | pass |
| `island-and-commands.feature:222:plain` | A floating Island keeps a thin top band to drag the window | pass | pass |
| `island-and-commands.feature:234:plain` | A floating Island leaves the page where it is | pass | pass |
| `island-and-commands.feature:241:plain` | The revealed Island floats over a page that stays still | pass | pass |
| `island-and-commands.feature:251:plain` | Resting just below the top edge does not reveal a floating Island | pass | pass |
| `island-and-commands.feature:258:plain` | A floating Island hides as soon as the pointer moves below the strip | pass | pass |
| `island-and-commands.feature:267:plain` | Find and the shield menu open under the floating pill | pass | pass |
| `island-and-commands.feature:276:plain` | Hover-open works on the floating pill | pass | pass |
| `island-and-commands.feature:286:plain` | A Glance floats over the page in float mode | pass | pass |
| `island-and-commands.feature:295:plain` | The floating pill keeps up with tabs, sheets, styles and windows | fail | pass |
| `island-and-commands.feature:312:plain` | The floating pill takes the private theme | pass | pass |
| `island-and-commands.feature:320:plain` | Window buttons come and go with the floating pill on Windows and Linux | undefined | undefined |
| `island-and-commands.feature:339:plain` | Switching to push while the pill slides in leaves nothing behind | pass | pass |
| `island-and-commands.feature:348:plain` | Turning auto-hide off while the pill floats | pass | pass |
| `island-and-commands.feature:359:plain` | Changing the style while Glance is open | fail | pass |
| `island-and-commands.feature:372:plain` | Resizing the window while the pill floats | pass | pass |
| `island-and-commands.feature:383:plain` | Changing the theme while the pill floats | pass | pass |
| `island-and-commands.feature:394:plain` | The floating pill is the strip's pill, in both tab layouts | pass | pass |
| `island-and-commands.feature:403:plain` | Auto-hide works with vertical tabs | pass | pass |
| `island-and-commands.feature:411:plain` | The Quick Switcher matches open tabs and favorites | pass | pass |
| `island-and-commands.feature:420:plain` | The Quick Switcher matches a group name and focuses it | pass | pass |
| `island-and-commands.feature:429:plain` | A slash prefix filters the command list | pass | pass |
| `island-and-commands.feature:436:example-443` | Running a slash command performs its action | pass | pass |
| `island-and-commands.feature:436:example-444` | Running a slash command performs its action | pass | pass |
| `island-and-commands.feature:436:example-445` | Running a slash command performs its action | pass | pass |
| `island-and-commands.feature:448:example-456` | A shortened slash command reads its argument after the typed word | pass | pass |
| `island-and-commands.feature:448:example-457` | A shortened slash command reads its argument after the typed word | pass | pass |
| `island-and-commands.feature:448:example-458` | A shortened slash command reads its argument after the typed word | undefined | pass |
| `island-and-commands.feature:448:example-459` | A shortened slash command reads its argument after the typed word | pass | pass |
| `island-and-commands.feature:462:plain` | A group command with no name asks for one | pass | pass |
| `island-and-commands.feature:469:plain` | A typed bang shows a hint row and Enter lands on the site | pass | pass |
| `island-and-commands.feature:477:plain` | A bare known code opens the site's home | pass | pass |
| `island-and-commands.feature:485:plain` | A bang at the end of the text works the same | pass | pass |
| `island-and-commands.feature:493:plain` | ! alone lists popular bangs, then the ones used recently | pass | pass |
| `island-and-commands.feature:508:plain` | A known prefix shows its hint above the filtered picker, and a picked row fills the input | pass | pass |
| `island-and-commands.feature:517:plain` | A custom bang resolves, and one that shadows a built-in alias wins only for that alias | pass | pass |
| `island-and-commands.feature:532:plain` | Turning bangs off takes effect in the open command bar | pass | pass |
| `island-and-commands.feature:543:plain` | Recently used bangs skip private tabs and go with the history | pass | pass |
| `island-and-commands.feature:558:plain` | No suggestion request leaves while a bang is typed | pass | pass |
| `island-and-commands.feature:565:plain` | Main refuses a direct suggestions request for bang-shaped text | pass | pass |
| `island-and-commands.feature:573:plain` | Your bangs are managed through Settings | pass | pass |
| `island-and-commands.feature:591:plain` | Arrow Down from the hint reaches the local matches under it | pass | pass |
| `island-and-commands.feature:599:plain` | A bare unknown code searches as typed, and ! alone does nothing | pass | pass |
| `island-and-commands.feature:608:plain` | Arrow keys keep the highlighted picker row in view when the list scrolls | pass | pass |
| `island-and-commands.feature:621:plain` | Picker rows show site icons from Blanc's icon server, each site asked once | pass | pass |
| `island-and-commands.feature:632:plain` | A private tab never asks Blanc's icon server | pass | pass |
| `island-and-commands.feature:640:plain` | A custom bang's site is never sent to Blanc's icon server | pass | pass |
| `island-and-commands.feature:651:plain` | Clearing history clears the kept bang icons | pass | pass |
| `sync.feature:7:plain` | Sharing open tabs is off by default | undefined | undefined |
| `sync.feature:13:plain` | A remote device's tab opens locally as a new ungrouped tab | undefined | undefined |
| `sync.feature:20:plain` | Turning sharing off retracts this device's tabs | undefined | undefined |
| `sync.feature:26:plain` | The moving-in checklist can be hidden permanently | fail | fail (retry) |
| `sync.feature:38:plain` | The moving-in checklist opens Settings at Sync and tracks progress | fail | fail (retry) |
| `sync.feature:49:plain` | The sync command opens Settings at the Sync section | fail | pass |
| `sync.feature:56:plain` | Completion waits until the covered start page can show it | fail | fail (retry) |
| `sync.feature:73:plain` | Adding this device with a code stops at an invalid code | fail | pass |
| `sync.feature:88:plain` | Other devices opens above the footer and starts closed | undefined | undefined |
| `sync.feature:104:plain` | Typing steps the Other devices drawer aside | undefined | undefined |
| `sync.feature:114:plain` | Without other devices there is no Other devices button | undefined | undefined |
| `sync.feature:120:plain` | The Other devices drawer leaves the tab list room in a small window | undefined | undefined |
| `sync.feature:129:plain` | Rename Device… names another device wherever it is listed | undefined | undefined |
| `sync.feature:150:plain` | Turning on Sync needs no name or passphrase | fail | pass |
| `sync.feature:162:plain` | The Add device sheet says when the new device joined | fail | undefined |
| `sync.feature:181:plain` | Closing Settings while a code shows lets the window be captured again | fail | undefined |
| `sync.feature:199:plain` | Connect your iPhone with Sync off asks before turning it on | fail | undefined |
| `sync.feature:210:plain` | Connect your iPhone shows the code as a QR the iPhone can scan | fail | fail (retry) |
| `vertical-tabs.feature:58:plain` | A narrow window caps the rail without overwriting its preference | fail | pass |
| `vertical-tabs.feature:217:plain` | Larger vertical tab text applies immediately and survives relaunch | fail | pass |

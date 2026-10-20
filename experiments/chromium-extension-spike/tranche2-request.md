# Tranche 2 request: the Decision 2 package, F12 first

## Shutdown teardown follow-up — 2026-10-19

Reproduced `TypeError: Object has been destroyed` in the official Electron binary: the helper's destroyed callback dereferenced `win.webContents` after BrowserWindow destruction. All three platform brokers now capture the original contents reference and revoke that authority without reading the dead window. The runtime lock hashes explicitly track this reviewed teardown change; this is not renewed screen-sharing/audio acceptance. Failure diagnostics now read the on-disk exception log independently of the dead inspector. The audit inventory was regenerated (only main.js hash changed).

176 focused tests pass. All three new lifetime regression tests failed before the fix; isolated native helper destruction reproduced the exception before and exits zero afterward for all three variants. Scoped ESLint and audit inventory checks pass. Full local unit attempt is retained, not claimed green: absent seed, release refs, dependency/environment issues and the then-stale inventory produced 21 failures. Full desktop attempts still stop with Playwright Target crashed before the shutdown assertion; actual Windows/Linux end-to-end acceptance awaits CI.

Reviewed all nine failed jobs on61d492e7: two shutdown jobs exit1; substrate has stale main.js inventory; both unit jobs and all four desktop jobs fail only the same two inventory assertions (complete provider logs checked after diagnostics truncation). No additional CI failure cause found. No jobs silently rerun.

No Chromium/native compilation, latency run, or diagnostic Electron build; existing official Electron used only for probes. Chromium footprint unchanged. Plan remains in progress, prior gates unchanged. Evidence: `evidence/windows-shutdown-followup-20261019/`.


## Windows CI shutdown candidate — 2026-10-19

Final Windows/Linux helper teardown now destroys the internal capture helper after the last runtime window closes. Added a helper-close veto regression and bounded timeout diagnostics; no deadline relaxation. Historical CI cause unproven: logs only showed process alive after10s. 28 unit tests and scoped ESLint pass; local desktop attempts crash before assertion, so Windows CI remains required. Evidence: `evidence/windows-shutdown-20261019/`. Owner authorized fix on#920; shipping Electron main.js/test changed. No Chromium build/patch-budget change; latency deferred; Electron diagnostic build unapproved.

## Native Store promotion regression — 2026-10-19

Owner-approved restart preserved both original preview tabs. Native CUA checks on82572a12 pass: Extensity permission text and delayed Add button, Cancel without install, successful Add confirmation, and native removal confirmation/cleanup. Test tab closed; original New Tab and Store retained. Promotion wrapper now hidden with zero rectangle. Evidence: `evidence/ui138-store-native-20261019/`. Fresh native installation/permission gap from previous checkpoint closed; no authenticated sign-in, upgrade or post-install restart-persistence claim. No build/source changes; patch footprint unchanged. Latency deferred and Electron diagnostic build unapproved; other gates unchanged.

## Store promotion wrapper repair — 2026-10-19

The exact campaign's empty dialog shell is now suppressed along with its content; mixed controls are excluded. Four unit tests and live 1600px Sign in hit-testing pass; navigation reaches Google Accounts without credentials. Official Extensity Add to Chrome remains enabled. Fresh native permission/install verification remains pending because CUA selects the retained older preview; closing it was rejected by automatic approval review to protect original tab state. No current native install pass is claimed. Original preview remains open on its previously loaded binary. Evidence: `evidence/ui138-store-promotion-wrapper-20261019/`. One guarded incremental build35.51s (six steps), finalguard0/5.86s; prior41files100hunks not re-enumerated, no new upstream paths. Latency deferred; Electron diagnostic build unapproved.

## October 19 encrypted legacy and private crash checks

The current binary writes a closed-group fixture using its configured mock keychain. With the
owned browser stopped, the harness decrypts the encrypted command13 using Chromium's public
mock password/derivation, removes only the appended collapse flag, adjusts the Pickle length,
and re-encrypts the command and updates its outer length. All other ciphertext remains intact.
Plaintext Tabs counterparts are removed from that disposable profile so they cannot supply the
restored group. After restart the native encrypted reader restores both URLs, name, color and
membership and defaults to expanded, as required for the absent field. File hashes and record
sizes are saved. No real keychain access, profile/key upload, older-binary execution or real-key
migration is claimed. This is a synthetic encrypted legacy-shaped fixture.

A fresh disposable browser retains a regular closed group, closes one private group (history
stays empty), and leaves another two-tab private group live when the owned browser is SIGKILLed.
Before killing, the harness verifies its profile command and persisted Crashed marker. After
normal restart no private URL/group is present in exposed tabs or Recently Closed; the regular
closed group still restores both tabs. A newly created private context has no groups/history,
and reopen-most-recent returns false. Context disposal leaves regular restoration intact.
This covers exposed native session behavior, not forensic absence of private bytes on disk,
automatic crash-restore-button interaction, all incognito lifecycles or OS/power-loss recovery.

No production change or compile; zero-action guard, binary hashes unchanged;41files/100hunks
(not re-enumerated). Disposable profiles/server removed, original preview/status preserved.
Native input pending, latency deferred, Electron diagnostic build unapproved/unstarted.
Real-keychain/key rotation, older-binary rollback, malformed encrypted records, multiple private
contexts and wider concurrent/crash/visual scenarios remain gaps. Plan/evidence updated;
F12/Task0 and visualitem4 gates remain open. Routine testing only; cold column unchanged.

Evidence: `evidence/ui138-group-encrypted-private-crash-20261019/`.

## October 19 legacy-record and private-group checks

A disposable regular profile first closes a collapsed blue two-tab group on the current
binary. With the browser stopped, the test removes the appended four-byte boolean from
kCommandCreateGroup(13), adjusting both outer command size and embedded Pickle length.
Only owned disposable encrypted Tabs counterparts are removed to force the plaintext fixture
path. The current binary reloads the legacy-shaped entry and restores both URLs, membership,
name and color, defaulting to expanded as required for an absent collapse bit. A false
collapsedMatches field records that intentional legacy fallback; expected expanded is asserted.
This is a synthetic old-format record test, NOT an older-binary or encrypted legacy migration
acceptance claim. Original and mutated file hashes/length metadata are retained, not profiles.
The first attempt omitted the Pickle length adjustment and was refused; that timeout and
malformed mutation record remain archived rather than being counted as compatibility evidence.

A fresh disposable profile verifies private groups have no Recently Closed history. Closing a
collapsed two-tab private group leaves a usable private window and no closed entry. Reopen-most-
recent returns false; a known regular group entry ID cannot be restored or forgotten through
the private bridge, and private clear returns false. The regular history stays identical before
and after those calls and private-context disposal; restoring its regular group still returns
both URLs. No private tabs appear in the regular window. Expected refusal is the private-mode
contract, not missing restoration functionality. No native mouse/keyboard checks performed.

No production changes/compile; guard0/5.24s, native binary hashes unchanged,41files/100hunks
(not re-enumerated). Test profile/server removed, original preview tabs/status preserved.
Native input pending, latency deferred, Electron diagnostic build unapproved/unstarted.
Older-binary/new-record rollback, encrypted legacy fixtures, malformed optional-field matrix,
multiple private contexts, private crash/restart leakage and wider lifecycle remain gaps.
EarlierF12/Task0 and visualitem4 gates remain open; routine testing only, cold column unchanged.

Evidence: `evidence/ui138-group-legacy-private-20261019/`.

## October 19 closed-group persistence repair

The pinned closed-group writer now appends the collapsed boolean after its existing timestamp.
The reader optionally reads that trailing field, initialized false for legacy records. The
existing record prefix/command ID is unchanged; old readers ignore the extra field. This
compatibility conclusion is source-backed, not a legacy-binary runtime acceptance claim.
Already-written old records have no recoverable collapse bit and still restore expanded.
The transform has exact anchors and independent presence markers for repeat preparation.

All six strict final-binary native bridge cases pass: collapsed blue and expanded pink,
each restored cross-window, from a persisted closed-group entry after SIGKILL, and as a
saved whole window after a second SIGKILL. Exact colors/names/two-tab membership survive;
the same-named decoy stays unchanged. Four kills verify the owned profile and Crashed marker,
with bounded six-second persistence waits. This repairs the previously archived failing
collapsed closed-group case. No native-button, power-loss or mid-write syscall claim.

One guarded incremental build:30.42s Siso/35.98s wrapper,six steps. Final guard0/6.00s.
Fresh footprint **41 upstream files / 100 hunks**, within the narrow October19 amendment
(41/120) applying the owner's earlier allowance to raise the40-file ceiling if needed.
Only new upstream path:components/sessions/core/tab_restore_service_impl.cc. No other budget,
scope, GN/toolchain/cache or acceptance relaxation. Future patch-consolidation audit remains.
Eleven patch-counter tests and two-module scoped ESLint pass; syntax and whitespace pass.
Initial npx ESLint attempt could not resolve the registry; existing local ESLint was used.

Disposable profile/server removed; final preview restarted with original two tabs/empty status.
Native input pending unlock, latency deferred, Electron diagnostic build unapproved/unstarted.
Legacy/malformed trailing field runtime, private/multi-profile/unsaved/multiple concurrent
restores, mid-write/OS reboot and broader lifecycle/visual cases remain gaps. EarlierF12/Task0
and planitem4 remain open. Cold-build column unchanged; this is routine repair/testing.

Evidence: `evidence/ui138-group-persistence-fix-20261019/`.

## October 19 cross-window group and crash persistence checks

Two regular-profile fixtures: blue/collapsed and pink/expanded, each with two URLs. A second
window contains a same-named decoy group. Closing the source group and restoring its entry
from the second window restores both tabs into the caller window with exact membership, name,
color and collapsed state; the decoy's native ID and visual fields remain unchanged.

Two owned-browser SIGKILLs per fixture then test separate persistence paths. The first happens
after closing the group and waiting six seconds; after normal restart the entry is restored
through Recently Closed. The second happens with the restored group moved to its own two-tab
window and its intended collapsed flag explicitly set/recorded before waiting six seconds.
After normal restart that saved window is restored through Recently Closed. Each kill verifies
the owned profile command and persisted Crashed marker. No OS power-loss, interrupted syscall,
automatic crash-restore or native recovery-button acceptance is claimed.

| Initial state | Cross-window group | Closed group after crash | Saved window after crash |
| --- | --- | --- | --- |
| Collapsed blue | pass | **FAIL: expanded** | pass |
| Expanded pink | pass | pass | pass |

The persisted closed-group failure is real, not treated as acceptance. The pinned upstream
`tab_restore_service_impl.cc` writer serializes title/color/saved identity/timestamp but no
collapsed bit; its reader explicitly constructs single closed groups with is_collapsed=false
(lines519-523). The bridge repair retains in-memory metadata but cannot recover an omitted
on-disk field. Whole-window restoration uses different metadata and retains collapse.
No production repair is included in this checkpoint. A compatible closed-group serialization
change is a follow-up; its upstream footprint must be audited before implementation.

The first cross-window assertion selected a group by duplicate name and failed despite the
correct restored state; corrected tests identify it by both tabs' native membership. That
harness failure and the strict persisted-collapse failure are retained. Final proof files use
completed=true for a finished observation and pass=false/outcome=collapsed-state-difference
for the known failure; a zero harness exit does not turn that case into a pass.

No native change or compile. Guard zero actions3.95s; binary hashes unchanged; footprint remains
40files/97hunks (not re-enumerated). Disposable profile/server removed; original preview tabs
and empty status preserved. Native input pending unlock, latency deferred, Electron diagnostic
build unapproved/unstarted. Private/multi-profile/multiple overlapping restores, unsaved groups,
mid-write/OS reboot and broader crash/visual paths remain unqualified. Plan item4 and earlier
F12/Task0 gates remain open.

Evidence: `evidence/ui138-group-cross-crash-20261019/`.

## October 19 closed-group collapsed-state repair

The Recently Closed bridge captures a group entry's collapsed flag before restoration consumes
it, then reapplies the flag to the restored native group. Returned LiveTab session identities
identify the group; the saved-group UUID handles Chromium's saved-group path, which can reopen
a group without returning LiveTabs. The most-recent route now reports success for that path.
Only the collapsed flag is changed; current title/color are retained. Ordinary tab and window
entries are not given a group override. No additional upstream file or hunk is patched.

Final-binary automated native bridge checks pass all six group/window cases:
- Blue collapsed: selected Recently Closed group entry and saved window both retain collapse.
- Pink expanded control: group entry and saved window remain expanded.
- Green collapsed: reopen-most-recent returns true and retains collapse; saved window retains it.
Each case checks two URLs, membership, group name and exact color. Window checks explicitly
record the intended state before clean shutdown and normal restart, independently of group
restoration. These are bounded regular-profile tests, not physical mouse/keyboard acceptance.

The first LiveTabs-only repair compiled but failed collapse preservation. The next repair passed
selected-entry checks but the most-recent success return remained false; both failures are kept.
An owned-browser shutdown/start overlap was refused and retained; cleanup now waits for exit.
A sandboxed prepare failed at icon-tool access, then succeeded with approved tool access.
Three guarded incremental builds: 34.20s, 37.14s and 34.11s Siso; six steps each.
Final guard zero actions. Fresh patch inventory: 40 upstream files / 97 hunks (budget40/120).
No GN/toolchain/cache change, cold build, latency run or Electron diagnostic build.

Disposable profile/server removed; original preview tabs restored on the final binary, empty
host status. Native input remains pending unlock. Cross-window group-entry routing, all colors,
private/mixed-group/crash visual persistence and wider lifecycle remain unqualified. Earlier
F12/Task0 gates and plan item4 remain open. This supersedes the bounded collapsed-state failure
in evidence/ui138-group-visual-20261019, without rewriting that historical result.

Evidence: `evidence/ui138-group-collapse-fix-20261019/`.

## October 19 group visual restoration checks

Two-tab blue/collapsed and pink/expanded groups were closed and reopened through the native
Recently Closed bridge. Then each was moved into a separate window, its expected collapsed
state explicitly set and recorded before shutdown, and the saved window restored after browser
restart. This separates group-entry behavior from the state saved for window restoration.

| Fixture | Restore path | Color retained | Collapsed state retained |
| --- | --- | --- | --- |
| blue-collapsed | group entry | True | False |
| blue-collapsed | saved window | True | True |
| pink-expanded | group entry | True | True |
| pink-expanded | saved window | True | True |

Closed-group restoration expands the blue group: collapsed state is NOT retained on that path.
Saved-window restoration retains it. Names, two URLs and group membership remain intact in all
four cases; blue/pink colors remain exact. The expanded control remains expanded. No repair or
Electron behavior comparison is claimed; whether group expansion is the desired product policy
remains open. Harness pass flags represent completion/structural checks, not all visual parity;
the separate groupVisual/windowVisual fields retain the failed collapsed-state comparison.

Initial named-color rejection and an overlapping shutdown/relaunch timeout are retained;
final runs use hex colors and wait for owned processes to exit. No fatal/dangling diagnostics.
No production change or compile; guard zero5.42s, native hashes unchanged;40files/97hunks not
re-enumerated. Disposable profiles/server removed; preview preserved. Native input pending,
latency deferred, Electron diagnostic build unapproved. All-color/mixed-group/private/crash
visual persistence and physical rendering remain gaps. Plan item4/F12/Task0 gates remain open.

Evidence: `evidence/ui138-group-visual-20261019/`.

## October 19 live persistence crash and group/window restoration

Two-tab named group closes into one entry and reopens with both URLs, group name and membership
preserved. Moving that group into its own window, orderly browser shutdown, normal launch and
Recently Closed window restoration also preserves both URLs and group membership. Native bridge
calls only; no physical menu/button acceptance or arbitrary group/window combinations claimed.

One live run SIGKILLs the exact owned browser PID when fs.watch reports Tabs_* creation/rotation
during repeated tab closure. A second content-change-only attempt observes no qualifying event
after40 closures and its bounded wait; it does not kill the browser and is not an interruption pass. The event,
file size, acknowledged-close count and PID/command are recorded. No offline mutation is used.
Notifications can arrive after a completed write: this is live persistence-adjacent crash recovery,
NOT proof of an interrupted write syscall or a torn record. The actual mid-write/power-loss gate
remains open; prior offline truncation simulations remain separate.

| Trigger | Acknowledged closes at event | Live-close entries exposed after recovery |
| --- | --- | --- |
| rename | 7 | 7 |

The crashed browser and the non-triggering second run remain usable; new closed entries survive a subsequent clean restart
and reopen at the expected URL. No fatal/dangling diagnostics. These counts are exposed entries,
not proof of durable completion of every issued write. No general storage-integrity claim.

No production change/compile; guard zero3.74s and unchanged native hashes.40files/97hunks not
re-enumerated. Disposables removed, original preview preserved. Native input pending unlock,
latency deferred, Electron diagnostic build unapproved. Larger/mixed/private groups, group color
and collapsed-state parity, disk-full/permissions, true syscall interruption and OS restart remain
gaps. Plan item4 and earlier F12/Task0 gates remain open; cold-build column unchanged.

Evidence: `evidence/ui138-live-closed-20261019/`.

## October 19 Recently Closed corruption and torn-record checks

Five isolated cases mutate Tabs_* in both plaintext and encrypted session stores, with the
owned browser stopped: intact control, invalid eight-byte header, final-byte removal,
half-file truncation, and missing files. Original sizes and hashes and changed sizes/hashes
are recorded. Session_* files are not mutated. Truncation models a partial write; no live
write interruption, concurrent writer, fsync/durability, disk-full or power-loss claim.

| Case | Original closed fixture entries visible | Fresh entry persists and reopens |
| --- | --- | --- |
| intact | 1 | pass |
| invalid-header | 0 | pass |
| tail-cut | 0 | pass |
| mid-cut | 0 | pass |
| missing | 0 | pass |

The intact control establishes saved Recently Closed data. Loss of old entries after corruption
is recorded as data loss, not recovered history. In every case the browser remains usable;
clear/new-tab/close creates a fresh native entry, a clean restart preserves it, and reopening
through the native bridge yields the expected URL. The seed private-tab control does not
appear in exposed closed entries. No fatal or dangling-pointer diagnostic across the run.
This does not prove absence of private data from every underlying byte or hidden window entry.

No production changes or compilation: guard zero4.26s, native hashes unchanged; footprint
40files/97hunks not re-enumerated. Disposable profile/copies/server removed and preview original
tabs preserved. Native input pending unlock, latency deferred, Electron diagnostic build
unapproved/unstarted. Larger history/group/window entries, invalid command lengths, disk errors,
concurrent writes and native recovery choices remain gaps. Plan item4 and F12/Task0 gates open.

Evidence: `evidence/ui138-closed-corrupt-20261019/`.

## October 19 corrupt-session checks

Seven bounded cases ran in offline copies of disposable regular/private PDF session seeds.
Mutations were made only after owned browser processes exited: invalid first eight bytes,
half-file truncation (retaining header), or deletion of Session_* files. Before/after sizes and
SHA-256 values are recorded. Intact control restores the regular PDF; private PDF never restores.
The first matrix damages only Default/Sessions while Sessions_Encrypted remains intact;
restoration there does not establish recovery from loss of both stores. A fresh seed supplies
three cases damaging both stores. Tabs_* and other profile data remain untouched.

| Case | Original regular PDF restored | New page/search and next clean restore |
| --- | --- | --- |
| intact | True | pass |
| invalid-header | True | pass |
| truncated | True | pass |
| missing | True | pass |
| both-invalid-header | False | pass |
| both-truncated | False | pass |
| both-missing | False | pass |

A fallback to New Tab is startup resilience with original-session data loss, not successful
restoration. Every case accepts a new authored page, native Find returns one match, and that
new page restores and searches on the next clean launch. No private URL appears. No fatal or
dangling-pointer diagnostic appears across the run. These are CDP/bridge checks; no recovery
button, filesystem permission failure, partial-write concurrency, Tabs_* corruption, encrypted
key loss, OS reboot or general profile-corruption resilience is claimed.

Evidence-only: no production changes or compilation; guard zero3.62s, binary hashes unchanged,
40files/97hunks not re-enumerated. Disposable profile copies/server removed, original preview
preserved. Native input pending unlock, latency deferred, Electron diagnostic build unapproved.
Plan item4 and broader F12/Task0 gates remain open; no cold-build column change.

Evidence: `evidence/ui138-corrupt-session-20261019/`.

## October 19 repeated recovery/lifecycle checks

Two same-profile crash/recovery rounds survive with Chromium's recovery-bubble SHOWN histogram.
Saved windows restored through the existing Recently Closed bridge contain the regular protected
PDF and exclude the private PDF. Both rounds re-prompt with an empty password field and return
two matches after re-entry; no positive pre-unlock matches were observed. These are bridge tests,
not activation of the native recovery button. Owned PID/command and persisted Crashed marker
are checked before subsequent kills. A third crash relaunch also shows the bubble successfully.

Closing the browser while the recovery decision is unresolved and restarting offers the bubble
again. The original assertion expecting no bubble failed and is retained as a harness assumption;
no dismiss/Restore choice was exercised. Three private PDF context creation/disposal cycles pass
without removing existing regular targets. Final orderly shutdown logs no fatal/dangling pointer.
Normal session restoration also passes again. An initial SIGKILL run automatically restored the
PDF and re-prompted, but its prior disk exit marker was not captured: suspected persistence timing
is not proven. Histogram/CDP readiness failures remain in invocation records; subsequent probes
poll readiness explicitly. No general crash policy or password-storage security claim.

Evidence-only: no production changes or compilation. Guard zero actions in5.61s; native hashes
unchanged. Footprint remains40files/97hunks, not re-enumerated. Disposable profile/server removed;
original preview New Tab/Web Store tabs preserved with empty status. Native recovery buttons,
focus/visual placement and physical input remain pending unlock. Latency deferred; Electron
diagnostic build unapproved/unstarted. Wider lifecycle/corrupt-session/OS restart behavior and
prior F12/Task0 gates remain open; plan item4 incomplete.

Evidence: `evidence/ui138-recovery-repeat-20261019/`.

## October 19 crash-recovery anchor repair

The existing BrowserView toolbar-provider integration now delegates through a Blanc-owned
adapter. App-menu bubbles receive the Island View anchor; other toolbar/menu operations
forward to Chromium. The recovery bubble is preserved, not suppressed. No new upstream
file: inventory is 40 files / 97 hunks (one additional BrowserView hunk; below 120).
The first implementation compiled but exposed a shutdown dangling toolbar pointer because
ToolbarView dies before the Island owner. A ViewObserver now clears that pointer at deletion.
The failed attempt and diagnostic are retained; final normal shutdown has no fatal/dangling report.

Two guarded incremental builds: 62.76 seconds (15 executed steps), then 38.61 seconds
(six steps) for the lifetime repair. Final guard: zero actions in 4.06 seconds. No cold
output, toolchain, GN-argument or latency changes. The inventory was measured before the
Blanc-owned lifetime repair, which adds no upstream file/hunk; final source patch is archived.

Actual normal same-profile session restoration passes: regular protected PDF restored without
manual navigation, empty password re-prompt, no observed positive pre-unlock result, two matches
after re-entry, private PDF excluded. The owned browser was then SIGKILLed and relaunched.
It survives, and Session.SessionCrashed.Bubble records SHOWN=1, ERROR=0. The harness initially
expected automatic crash restoration; that assertion correctly failed because the real recovery
bubble waits for user choice. Mac locked, so its native Restore button and visual placement
remain NOT RUN. No automatic crash-restore/password pass is claimed.

Separately, the existing Recently Closed bridge restores the saved window after the crash:
regular PDF password field is empty, re-entry yields two matches, private URL absent. This
is saved-entry restoration, not acceptance of the recovery bubble button. Harness readiness
failures and the corrected asynchronous helper are recorded in outcome.json. Disposable profile
and server removed; original preview New Tab/Web Store tabs restored on final binary with empty
status. Native input pending unlock; latency deferred; Electron diagnostic build unapproved.
Broader recovery/UI/accessibility and prior F12/Task0 gates remain open. Plan item4 incomplete.

Evidence: `evidence/ui138-crash-anchor-20261019/`.

## October 19 PDF session/crash-restore checkpoint — blocked on startup crash

Normal saved-session restoration PASSES using --restore-last-session in the same disposable
profile. The regular protected PDF URL is present without a createTarget/navigation call, prompts
with an empty password field, exposes no positive pre-unlock result during the observation, and
returns two matches after re-entry. A private PDF open at shutdown is absent from restored targets.
The regular/private seed checks and a new private PDF opened after normal restoration also pass.
This is actual session restoration, not the earlier explicit URL reopen test; no native button input.

Crash restoration FAILS before password checks. After unlocking regular/private PDFs and allowing
session saving, the exact owned browser PID is SIGKILLed. All owned browser processes are checked
gone before the same profile is relaunched with --restore-last-session. Startup terminates at
app_menu_button.cc:61 CHECK(element), through AppMenuButton::GetAnchor and
SessionCrashedBubbleView::ShowBubble. The hidden Island-only app menu selects its fallback anchor,
which is unavailable at this point. The fatal stack is archived. The first CDP fetch failure was
initially suspected to be readiness; a second failed read plus the fatal log disproved that. Neither
is a successful crash-restore test. No recovery dialog was suppressed and no pass claimed.

No repair or production change in this checkpoint. A direct edit of the failing app-menu file would
add an upstream file beyond the current40-file inventory; a repair within existing patches or an
explicit budget revision is still required. No compile; guard zero3.59s, binary hashes unchanged,
footprint40files/96hunks not re-enumerated. Disposable profile/server removed; preview preserved.
Crash-restore password behavior remains blocked; normal session restore is separately qualified.

Native input pending unlock, latency deferred, Electron diagnostic build unapproved/unstarted.
Other restore paths, encryption formats, broader PDF/lifecycle/accessibility/fullvisual remain
open. Plan item4 and prior F12/Task0 gates unchanged. This is a failed acceptance checkpoint,
not evidence that Chromium's generic recovery behavior is safe in the Island-only prototype.

Evidence: `evidence/ui138-find-session-20261019/`.

## October 19 PDF password lifecycle checkpoint

Eight actual viewer-dialog observations pass across regular/private windows: initial open,
Page.reload, closing/reopening the same URL, and reopening the same URL after a full browser
restart using the same disposable profile. Every checkpoint presents a visible password dialog
with an empty input. Pre-unlock search observations contain no positive result; correct re-entry
restores two matches. The fixture is unchanged AES-256 with a public, nonsecret test password.

The first browser exits with a private PDF open. Its PID is confirmed absent before relaunch;
the second browser has a different PID and uses the same profile directory. Startup targets
contain only New Tab and host, no prior private PDF. The post-restart regular/private URLs are
opened explicitly: this does not qualify automatic session restore, crash restore or Recently
Closed restoration. These observations establish re-prompt behavior for the tested paths, not
proof that no password bytes ever reach memory/disk or a general persistence/security audit.

No production changes or compilation. Guard zero5.64s; hashes match the PDF reset binary;
footprint remains40files/96hunks (not re-enumerated). No latency run, unit-suite repeat, Electron
comparison or physical input claim. Disposable profile/server deleted; preview original tabs
and empty host status preserved. Before/after results, PIDs, fixture and harness archived.

Remaining: automatic session/crash/RecentlyClosed restore, password-manager integration,
permissions-only encryption/other algorithms, XFA/OCR/form edits, extreme PDFs and wider
lifecycle/accessibility/fullvisual coverage. Native input pending unlock; latency deferred;
Electron diagnostic build unapproved/unstarted. Plan item4 and prior F12/Task0 gates unchanged.

Evidence: `evidence/ui138-find-password-life-20261019/`.

## October 19 protected/large PDF checkpoint

A two-page AES-256 PDF uses an explicitly nonsecret fixture password. Structural checks verify
wrong-password rejection and successful decryption. The actual Chromium viewer password dialog
is observed in its extension target: regular/private runs submit a wrong password through the
real dialog control and observe invalid=true, then submit the correct fixture password and find
two secretprobe matches. A find request before unlock reports no positive matches in its observed
window; this is not an exhaustive security audit or a physical password-entry check.

The authored larger PDF is 250 pages and 15,199,513 bytes, including one high-entropy image and
text on every page. Both profiles return251 substring matches for pageprobe (one per page plus
lastpageprobe), one unique last-page match, zero for absentprobe, and one last-page match after
reload. This is bounded functional acceptance, not throughput/latency/memory qualification.
Protected page1 and large page250 were rendered and visually inspected; not all250 pages.

No production changes or compilation. Guard zero actions3.97s; native hashes match the PDF reset
fix. Footprint remains40files/96hunks (not re-enumerated for evidence-only work). Fixture profiles/
server removed; original preview tabs and empty status preserved. PDF bytes, generators, structure,
sampled renders, runtime results and harness are archived; fixture password is public test data.

Remaining: password persistence/re-prompt after restart, permissions-only encryption/other crypto,
XFA/form edits/OCR, embedded fonts/malformed/extreme PDFs, wider concurrent/lifecycle/cache/
accessibility/fullvisual coverage. No Electron comparison or physical input claim. Native input
pending unlock; latency deferred; Electron diagnostic build unapproved/unstarted. Plan item4 and
prior F12/Task0 gates unchanged.

Evidence: `evidence/ui138-find-password-20261019/`.

## October 19 complex PDF/concurrent crash checkpoint

An authored four-page PDF adds two-column text, 90-degree rotated text, an image-only page and
an interactive AcroForm field. Structure checks confirm four pages, field value and widget; all
four Poppler page renders were visually inspected. Regular/private native Find each returns two
column matches, one rotated match and one form-label match. The actual form-field value and
image-only text both return final zero matches in both profiles: these are observed limitations,
not OCR or full form-content acceptance. No password-protected PDF check is claimed.

With regular and private PDFs open together, exactly two owned --pdf-renderer processes are
selected from the isolated profile and SIGKILL is sent in one host-clock-millisecond batch. Both
processes exit; both outer-page markers survive; each capsule closes. Reopened no-reload search
completes with zero matches, and reload independently restores two column/one rotated matches.
The kill calls share a batch, not a claim of simultaneous OS scheduling or exhaustive concurrent
crash coverage. Private context disposal succeeds. No main-plus-plugin or browser/GPU failure.

No production changes or compilation; guard zero actions (3.53s), binary hashes match the PDF
reset fix. Footprint remains40 files/96 hunks (not re-enumerated for evidence-only work). Disposable
profile/server removed; preview original tabs/empty status verified without restart. No new unit
suite, Electron comparison, physical input or performance claim. The source PDF, structural checks,
rendered pages, runtime observations and harness are archived.

Remaining: encrypted/password documents, XFA and form edits, OCR, embedded fonts/large PDFs,
main-plus-plugin and wider concurrent failure schedules, cache/process sharing/accessibility/full
visual coverage. Native input pending unlock; latency deferred; Electron diagnostic build remains
unapproved/unstarted. Plan item4 and previous F12/Task0 gates unchanged.

Evidence: `evidence/ui138-find-complex-20261019/`.

## October 19 PDF-plugin find reset fix

The active WebContents observer now retires its find session when a PDF renderer frame is deleted,
including independent plugin-process exit. The shared renderer-loss reset invalidates request ID,
query and cached counts, then closes the capsule; late find replies are ignored. Ordinary subframe
deletion does not take this path. Main-frame crash behavior uses the same reset helper.

Final native tests kill a uniquely identified disposable --pdf-renderer in regular and private
windows and prove the outer page's marker survives. The capsule now closes in both cases (prior
checkpoint recorded false). Reopening find WITHOUT reloading returns final zero matches for both
needle and a missing query, without hanging; this does not resurrect the crashed PDF or claim its
text remains searchable. Reload restores three matches. Private cross-site iframe crash, parent
search, missing child search, child recovery/removal, theme and closure regressions also pass.

One guarded incremental build: 38.53s wrapper /34.85s Siso, six steps, from a one-action plan.
Final guard zero (4.68s). Fresh footprint 40 upstream files/96 hunks, within 40/120. No new upstream
file, cold output, GN argument or toolchain change. Native binary hashes and invocation records
are archived. Disposable profile/server removed, original preview relaunched on the final binary
and original tabs/empty status verified. No new unit suite, Electron comparison or physical-input
claim; the actual native regression is the acceptance test.

Remaining: complex/scanned/encrypted/forms PDFs, multi-plugin/concurrent failures, broader cache/
private process-sharing/accessibility/full visual cases. Native input pending unlock; latency
explicitly deferred; Electron diagnostic build unapproved/unstarted. Plan item4 and earlier
F12/Task0 gates remain incomplete/unchanged. Build time is routine, not Task0 cold cost.

Evidence: `evidence/ui138-find-plugin-fix-20261019/`.

## October 19 PDF-plugin/private subframe checkpoint

Regular and private tests separately select exactly one process with both the disposable profile
argument and --pdf-renderer, record its command line, kill that process, verify its exit, and prove
the outer PDF page retains its JavaScript marker. Reload resets Find and restores all three text
matches in both profiles. This closes the bounded independent PDF-renderer recovery case rather
than repeating the earlier outer-page crash. The find capsule remains open immediately after
plugin death in both profiles; fresh-query/no-reload behavior and crash-state UI handling remain
unqualified. The recovery pass does not imply that the capsule automatically clears on plugin exit.

A private cross-site iframe (localhost child inside 127.0.0.1 parent) is independently exposed as
an iframe CDP target. Page.crash times out as recorded; parent marker survives, parent search
returns one match and child search returns zero. Navigating the child again restores two matches;
removing it returns zero. Private theme, closed-tab empty Recently Closed and context disposal
pass. No broader process-sharing or simultaneous-frame failure claim is made.

Evidence-only, no production changes or compilation. Guard zero actions (4.14s); native hashes
match the previous PDF checkpoint. Footprint remains 40 upstream files/96 hunks (not re-enumerated).
Disposable profile/server removed; preview original tabs and empty status verified. No physical
input, Electron comparison or repeat unit suite claimed. The fixture is the previously authored
selectable-text PDF, unchanged; no new rendering/visual comparison is claimed.

Remaining: plugin crash-state capsule handling and no-reload queries, complex/scanned/encrypted/
form PDFs, concurrent renderer failures, cache eviction/ineligible pages, wider private frame
process-sharing, IME/accessibility/full visual parity. Native input pending unlock; latency deferred;
Electron diagnostic build unapproved/unstarted. Plan item4 and prior F12/Task0 gates unchanged.

Evidence: `evidence/ui138-find-plugin-20261019/`.

## October 19 PDF reload/crash checkpoint

Regular and private selectable-text PDF find each return three matches before reload, after
Page.reload, after an actual outer-page renderer crash and recovery navigation, and after switching
away and reselecting the PDF tab. Reload/crash/tab transitions reset the capsule. The crashed target
rejects/times out a Runtime evaluation; crash command responses are retained. Private theme stays
private, closing the searched private PDF resets find, private Recently Closed remains empty and
private context disposal succeeds. Page.crash selected the PDF URL's outer page target: this does
not prove independent PDF plugin-process crash recovery. No physical keyboard/mouse acceptance.

No production changes or compilation. Guard zero actions (3.59s); native hashes match the prior
PDF checkpoint. Footprint remains 40 upstream files/96 hunks (not re-enumerated for evidence-only
work). Setup failures were a sandbox ps denial and immediate CDP-readiness race; both occurred
before test cases and are recorded in attempts.json. Final browser results are in results.json.
Disposable profile/server removed; existing preview tabs and empty host status verified without
relaunching the preview. No new Electron comparison, unit suite or PDF visual comparison claimed.

Remaining: independently selected PDF plugin failure, scanned/encrypted/forms and selection/wrap,
cache eviction/ineligible pages, private subframe crashes/process-sharing, IME/accessibility/full
visual parity. Native input pending unlock, latency deferred, Electron diagnostic build unapproved
and unstarted. Visual item4 and previous F12/Task0 gates remain incomplete/unchanged.

Evidence: `evidence/ui138-find-pdf-recovery-20261019/`.

## October 19 PDF/private lifecycle progress

Simple two-page PDF find passes regular/private counts, regular next/previous, no-match and
PDF→HTML reset. Private forward BFCache restoration, iframe removal and active find-tab closure
pass bounded checks. Evidence: `evidence/ui138-find-pdf-20261019/`. No code change/build; guard
zero, native hashes unchanged, footprint remains 40 files /96 hunks. Broader PDF/cache/private/
accessibility cases remain gaps; native input pending unlock and visual item4 incomplete.
Latency deferred; Electron diagnostic build unapproved/unstarted; prior F12/Task0 unchanged.


## October 18 BFCache/private find progress

Actual regular back/forward and private back-cache restoration now pass document-identity and
persisted-pageshow proofs, find reset and fresh search. Private isolation, navigation/tab reset
and renderer crash/reload pass. Fixed direct-open private find theme in host assets only.
No native build; guard zero; binary hashes unchanged; footprint remains 40 files /96 hunks.
Evidence: `evidence/ui138-find-lifecycle-20261018/`. Native input pending unlock; broader lifecycle
and visual gaps explicit, item4 incomplete. Latency deferred; Electron diagnostic build
unapproved/unstarted; earlier F12/Task0 gates unchanged.


## October 18 expanded find progress

Eight cross-runtime query comparisons, six component style pairs and three result states now
have bounded automated evidence. Fixed stale find UI on an exact active renderer crash; reload
recovery passes. Client/scroll metric differences are recorded; no whole-window pixel claim.
One41.02s incremental build, finalguard0,40files96hunks. Item4 remains incomplete, native input
pending unlock. Evidence: `evidence/ui138-find-expanded-20261018/`. Latency deferred; Electron
diagnostic build unapproved/unstarted; prior F12/Task0 gates unchanged.


## October 18 find-capsule progress update

Find capsule and native bridge are implemented with bounded automated Electron comparison,
private isolation and 1280/800/500px geometry checks. Native input remains pending unlock;
visual item 4 stays in progress, not accepted. Footprint40 files /96 hunks; two incremental
builds, final guard zero. Evidence: `evidence/ui138-find-20261018/`. Prior F12/Task0 gates
unchanged. Latency deferred; Electron diagnostic build unapproved/unstarted.


**Status: the original tranche was approved on October 17, 2026 (§8), and
its audit and recording checkpoints have started. The corpus amendment in
§2.1 was explicitly approved on October 17, 2026 at `68892cc1` (§8.1).
The owner authorized recording approval, merging #916 once CI is green,
and resuming implementation within the amended scope. Further option C
runs remain stopped. Spike A implementation is in progress on draft #920;
the current full-uBO-corpus and update-check checkpoint is mapped below.** Task 0 measured a rebase (`rebase-ledger.md`, row 0: 2h39m47s
cold build, one broken anchor, one API change, 21 upstream files) and its
native acceptance passed except the extension version-upgrade observation,
which stays under daily check through November 3. That open gate blocks 157's
promotion to the verified baseline and the row's `passed` outcome; it does not
block the next work, which needs only the measurement. This request asks the
owner to clear the next tranche of `docs/chromium-migration-implementation-plan-2026-10-16.md`
§5 step 2: the items Decision 2 needs, with F12 blocking first.

## 1. What this tranche produces

The Decision 2 package, as the plan's §2 defines it. Each item ends in a
recorded artifact; none ends in a claim.

| # | Item | Plan reference | Artifact | Needs builds |
| --- | --- | --- | --- | --- |
| 1 | **F12 blocking spike A**: Blanc Blocker on Chromium's network stack | §3 F12 (a), §4 C | `evidence/f12-spike-a/` report with measured block rate, cosmetic coverage, patch count, decision latency | yes, incremental |
| 2 | **F12 blocking spike B**: Manifest V2 audit and uBO runtime spike | §3 F12 (b), §4 C, §7 | `evidence/f12-spike-b/` audit (every MV2 gate in the 157 checkout, with file and line) and a runtime report with patch count and block rate, or a recorded stop | yes, incremental |
| 3 | A1 patch-budget design | §4 A1 | design doc: out-of-tree layout, budget number, the measured 21-file inventory against it, CI reporting | no (the layout move itself is not in this tranche) |
| 4 | Electron-versus-Chromium visual comparison | §2 kill gate | side-by-side captures of resting, panel, palette, find and private states at the same window sizes, with a diff list | no |
| 5 | VoiceOver pass of the Island | §2 kill gate | checklist with pass/fail per control and the rotor/focus order | no |
| 6 | Staffing and CI cost sheet | §2 | one page replacing the evaluation's hypotheses with Task 0's numbers at the two-week cadence | no |

Order: 1 and 2 start first and run in parallel where the single builder
allows (one build at a time; the spikes alternate, they never overlap a build).
3 runs alongside as a document. 4, 5 and 6 fill the gaps. The tranche ends
when every row has its artifact, or when a kill criterion is hit and recorded.


## October 18 rail/restore and visual acceptance follow-up

Native drag/keyboard, tab/group/window restoration and private isolation now have bounded
acceptance evidence. Fixed opaque rail renderer paint, redundant rail header offset, loose-tab
end-of-strip movement and insertion before a group's first tab; interior/pinned targets stay
rejected. Matched 1280x800 rail/panel geometry and private color pass; Billboard's 68px header
reservation matches. Component screenshots are not complete composed visual parity: content,
pill controls, Start Page features, narrow/DPI/palette/find and wider lifecycle cases remain gaps.
Evidence: `evidence/ui138-acceptance-20261018/` (hashed archive, failed attempts retained).
79 renderer tests, three promotion tests and scoped lint pass. Two incremental builds 44.17s
and 43.66s; final guard zero. Budget unchanged at 40 files / 94 hunks; no increase needed.
Disposable profiles removed; original two preview tabs restored. Recently Closed remains
profile-wide; Spaces/Glance unported. Plan item 4 started, incomplete; items 3/5/6 unchanged.
Latency deferred, Electron diagnostic build unapproved/unstarted; F12/Task0 gates unchanged.


## October 18 narrow/palette/find diagnostic checkpoint

Native command entry now selects palette mode, full-window scrim/hit region and copied
repeat-command selection behavior; click/typing/new-tab entries remain panel mode. Five
actual Chromium sizes, 1280x700 through 500x400 pass bounded palette geometry/typed-selection
checks. Crowded 500x400 panel/list/footer and rail scrolling pass. Electron reference uses
renderer viewport emulation and diagnostic palette CSS, not native window/keyboard input.
Electron actual find API returns 1/1 fixture match at five sizes; Chromium Blanc find capsule
and bridge remain unported (/find filtered out), native Find not tested while locked.
Native Cmd-L/Escape/outside-click acceptance awaits unlock; no physical checks claimed.
At <=800px native controls require Chromium panel y48 vs Electron y12; full composed/DPI/
private parity remains open. Evidence: `evidence/ui138-narrow-palette-20261018/`.
One 37.69s incremental build, six steps; final guard zero; 40 files / 94 hunks unchanged. Four regressions
and focused host lint pass. Disposable fixtures removed, original preview two tabs restored.
Plan item4 in progress; previous F12/Task0 gates unchanged. Latency deferred; Electron
diagnostic build unapproved/unstarted. Find migration and unlocked input are next gaps.

### Earlier UI follow-up — October 18, 2026 (EDT)

Vertical rail, native Recently Closed and session-only site mute now have bounded native
input, bridge, private-isolation and restart evidence. The Store popover is suppressed;
normal Google installation, permission prompt, persistence and removal pass. Footprint
40 files / 94 hunks; incremental builds only, final guard zero. Evidence:
`evidence/ui138-rail-store-20261018/`. Matched visuals, broader drag/group/window restore,
profile-wide history semantics, Glance/Spaces and prior F12/Task0 gaps remain explicit.
Latency deferred; Electron diagnostic build unapproved/unstarted. This updates the UI
follow-up, not acceptance of the full tranche or promotion of Chromium157.

### UI migration preview — October 18, 2026 (EDT)

Owner-authorized 1.38 follow-up is partially implemented. Reviewed renderer sources,
Start Page image/color controls and native group/tab-menu bridges are covered by
`evidence/ui138-preview-20261018/`; full inventory is `ui-refresh-20261018.md`.
Vertical rail, Recently Closed, site mute, Glance/Spaces and physical/matched visual
acceptance remain open. The 157 header-reservation preparation bug reported by the
owner is fixed with a specific anchor marker and regression test. This does not
close the tranche visual gate. Spikes A/B and prior F12 gaps remain unchanged;
latency deferred; Electron diagnostic build §8 unapproved/unstarted.

### 1.1 Progress checkpoint — October 18, 2026 (EDT; native crash recovery)

Native execution leases now retire when the exact document is gone **or its
renderer frame is no longer live**. A real renderer crash during paused native
ExecuteScript previously left a valid WeakDocumentPtr and held reload forever;
the bounded repaired schedule drains pending1 to0 and completes reload, then
loads a protected replacement. Inactive live documents are not retired.
Background-document recreation also passes new-realm readiness plus first-inline,
allowed and blocked controls; this is not a background-process crash or an
automatic restart policy. Background process loss, asynchronous effects, original
caller identity and broader lifecycle coverage remain gaps. Prerender activation
remains unsupported, with the prior protected cancellation fallback retained.
Evidence: `evidence/f12-native-recovery-20261018/`. One 35.07-second incremental
build; footprint remains **40 files / 92 hunks**, final guard zero actions.
Latency stays deferred; Electron diagnostic build unapproved/unstarted.

The owner requested migrating recent Electron UI/UX next. The pinned 1.38.0
inventory and verification order are in `ui-refresh-20261018.md`; migration is
pending, not part of this recovery acceptance. Spikes A/B remain in progress.

| Item | Status | Evidence / next gate |
| --- | --- | --- |
| 1. Spike A | **In progress** | Request-path audit, origin-preserving replay, synthetic 2,000/2,000 corpus, browser-process factory proxy, sandboxed Mojo Ghostery engine, regular/private network parity, fail-closed probes, GET redirects, dedicated workers, bounded service-worker identity, two shared-worker clients and one exact-owner teardown are measured. Current evidence is linked from `results.md`, including `evidence/f12-shared-lifecycle-20261017/`. Remaining acceptance work includes the rest of the request-path matrix, CSS/procedural cosmetics/scriptlets, the private real-page sanity sample and qualified quiet-machine latency. The final aggregate `evidence/f12-spike-a/` report is pending. |
| 2. Spike B | **In progress: full synthetic network parity** | `evidence/f12-ubo-reload-20261017/` records sandboxed component readiness, bundled-list local replacement, authored-rule blocking, acknowledged pre-reset cancellation, stale/page/popup rejection, background-target loss and independent private Blanc Blocker. Profile lifetime and empty-body response bugs were caught and repaired incrementally. No extension-core MV2 override. `evidence/f12-ubo-parity-20261017/` adds two fresh runs per runtime over 5,123 candidates plus four controls: 2,113 blocks / 3,014 allows, zero context/decision/fixture differences. `evidence/f12-ubo-cosmetics-20261017/` adds eight matching regular main-frame pages: static CSS, has-text mutations and late fetch scriptlets pass; historical document-start failure is superseded for Chromium main frames by `evidence/f12-document-gate-20261017/`: 12/12 early constant/fetch passes versus Electron 0/12, seven safety probes and 12 native-only update-loader joins. The subframe follow-up `evidence/f12-subframe-trace-20261017/` adds 16/16 early native cases and identifies two late Electron ancestor misses per session. Cross-runtime identity remains open. Broader cosmetics/scriptlets/paths, exhaustive failures/lifecycle, privilege containment and production recovery UX remain open. |
| 3. A1 patch-budget design | **Drafted; review pending** | `a1-patch-budget-design.md` specifies layout, patch/override accounting, strict application and CI reporting. Fresh October 20 inventory is 50 files / 118 hunks within the approved 50/120 ceiling. No reductions or layout move implemented; authoritative CI wiring remains proposed. |
| 4. Visual comparison | **Not started** | Fixed-size Electron/Chromium capture matrix remains required. |
| 5. VoiceOver pass | **Not started** | Island rotor, labels, order and Escape focus-return checklist remains required. |
| 6. Cost sheet | **Not started** | Task 0 clean recovery, fortnightly maintenance and extension-release wait must remain three separate lines. |

Earlier follow-up: `evidence/f12-static-integration-20261017/` integrates
static origin fallback with actual MessageSender identity, browser-owned live
precursor/ancestor context and generation checks around real engine selection.
Two fresh profiles: 36 automatic non-HTTP late deliveries + four HTTP controls,
one body each, 26 identity/generation checks. The prior data/nested-data/nested-blob
receiver gaps were diagnostic `crypto.randomUUID()` failures in insecure contexts;
corrected diagnostic 20/20. Private/non-HTTP and exception regressions retain
explicit boundary gaps; seven gate safety checks pass. 228 tests, 119-file lint,
one 35.12-second incremental build, final zero-action guard; fresh footprint 31/74.
In-flight reload/delivery atomicity, broader CSP/Trusted Types, lifecycle,
scriptlets and containment remain unqualified. Latency deferred; Electron build
§8 unchecked/unstarted. Prior full network parity remains historical, not rerun.

Service lifecycle behavior is now measured in eight fresh regular/private
Electron/Chromium sessions: failed registration, controlled network fetch, cache
response, blocked fetch and different-URL worker replacement. See
`evidence/f12-service-lifecycle-20261017/README.md`. Observer session-loss errors
were traced to failed-startup detach races and are now retained as explicit
incomplete observations when exact-session detach proves the cause. Eight same-URL
changed-byte update runs pass; see `evidence/f12-service-update-20261017/README.md`.
Strict failed-script and controlled-fetch context acceptance remain open, as do
unchanged-byte and HTTP cache/validator variants. Spike B's component follow-up
documents required manifest identity, broader feature privileges, background-page
support and browser-owned payload updates; runtime loading is still unproven.
The follow-up identifies a narrow browser-owned Add/allowlist candidate and an
authenticated fail-closed reload-hold design requirement; neither is implemented.
`evidence/f12-service-context-20261017/README.md` closes 16 unique controlled
worker fetch contexts across eight fresh sessions. Failed-startup, update-script,
cache-only and broader lifecycle attribution remain explicit gaps.
The failed-loader follow-up (`evidence/f12-service-loader-20261017/README.md`)
now resolves eight token-linked HTTP 404 loader identities with execution realm
explicitly unobserved. It also fixes false Electron update correlation when a
repeated hook occurrence could borrow the initial token; all eight update contexts
remain rejected. Other startup failures are gaps. Spike B now records the required
acknowledgement-before-reset reload protocol and its runtime failure probes;
Component admission is now implemented as an explicit offline probe; authenticated
bridge protection remains unimplemented. The update checker creates its request
ID after constructing throttles, independently of the later updated-script loader.
No safe cross-runtime identity join has been established; update contexts stay gaps.

No tranche kill criterion has been observed at this checkpoint. Spike A remains
inside the fixed 40-file / 120-hunk budget. Every native build used the existing
157 output and the guarded incremental procedure; `4eaad3c7` itself needed no
compile because the guarded plan reported zero actions. The 156 checkout,
toolchain, GN arguments, permanent profile and Task 0 upgrade gate remain
unchanged. Formal latency is owner-deferred and is still an open Spike A gate.

## 2. F12 spike A: Blanc Blocker on Chromium's network stack

**Question:** can Blanc Blocker's existing engine and lists block on the
fork at Electron Blanc's rate, with cosmetic filtering, without exceeding
the patch budget, and with acceptable per-request latency?

**Scope, two weeks:**

- Engine placement. Two candidates, measured, not argued: the existing
  `@ghostery/adblocker` engine (JavaScript) running in a Chromium utility
  process reached over Mojo from a browser-side request hook; or the
  Rust `adblock-rust` engine (MPL-2.0; file-level copyleft, compatible with
  Blanc's MIT first-party code, recorded in `THIRD-PARTY-NOTICES.md` if
  adopted) linked into the browser process as Brave does. Spike A builds at
  least the first; it builds the second only if the first's latency fails
  the bound below.
- **Request-path coverage audit, first.** The pinned 157 source routes
  requests through more than one path, and a browser-process
  `URLLoaderThrottle` does not see all of them: renderer-initiated
  subresources, navigations, keepalive (`fetch` with `keepalive`, beacons),
  prefetch and prerender, service-worker-initiated fetches, dedicated and
  shared worker scripts, WebSocket and WebTransport handshakes each have
  their own factory or service. Before any hook is written, the spike
  enumerates every request path in the checkout with file and line, states
  which interception point sees it (`CreateURLLoaderThrottles`,
  `WillCreateURLLoaderFactory` proxying, or neither), and ships a coverage
  fixture that issues one request of each kind and asserts it was
  decided. The audit is a deliverable on its own; a path the hook cannot
  reach is listed, never assumed covered.
- Request hook. Browser-side interception at the points the audit names,
  in regular and incognito profiles; the throttle path is the first
  candidate and factory proxying the second; no network-service patch and
  no extension-system patch. Decisions must fail closed while the engine
  is loading, matching `installStartupNavigationGate` in Electron.
- Cosmetic filtering, three separate mechanisms. **Native CSS** (element
  hiding and selectors a stylesheet can express) is injected per frame as
  a user stylesheet or an isolated-world style injection; the page's CSP
  must not be able to block it, as it cannot block Electron's today.
  **Extended procedural rules** need a DOM evaluator in the renderer agent
  with a mutation observer, since no stylesheet expresses them; its scope,
  debounce and cost on dynamic pages are measured by the dynamic-node
  tests below. **Scriptlets** are different: the
  bundled scriptlets in `adblock/sources/` patch page globals (`fetch`,
  `XMLHttpRequest`, timers, `JSON.parse` and the like) and so must execute
  in the **main world** at document start, where an isolated world cannot
  reach those objects (Chrome's content-script model documents the
  boundary: <https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts>).
  The spike injects them from the renderer agent into the main world
  (`RenderFrameObserver::DidCreateScriptContext` for world 0, or the
  user-script path with main-world execution) as browser-privileged code
  that the page's CSP does not govern, keeping the per-scriptlet isolation
  `adblock-scriptlets.js` enforces in Electron. Each mechanism is measured
  on its own fixtures, not assumed from the other.
- Lists. The pinned, hash-verified EasyList/EasyPrivacy snapshot from
  `adblock/sources/`, nothing fetched at startup; the same inputs as
  Electron so the comparison is like for like.

**Measurements (all recorded, with the harness in the evidence tree):**

| Measure | Method | Bound (from plan §5 criterion 3) |
| --- | --- | --- |
| Block rate | the **replay corpus** defined below, issued at the browser level through the fork and through Electron Blanc on the same lists | every request decided the same way in both, for blocked *and* allowed traffic; any divergence listed by URL, type and rule |
| Cosmetic coverage | the corpus's **outcome pages**, checked in both browsers by DOM assertion and capture | parity with Electron on the same pages, CSS and scriptlet outcomes reported separately |
| Decision latency | see the latency protocol below | **proposed** acceptance bounds, not criterion 3: p99 under 2 ms in-process, under 5 ms over Mojo, on the warm steady-state run; above that, the other engine placement is tried before concluding. The owner may change the bounds at approval |
| Patch count | upstream files and hunks, counted by the §7 rules and counter before and after the spike | within §7's amended tranche budget (52 files, 124 hunks); reported either way |
| Private windows | the same hook active in incognito, verified by the fixture | blocked, as Blanc Blocker protects private tabs today |

**Replay corpus — original approved definition.** This definition remains
the approval record until §8.1 is explicitly approved; §2.1 proposes its
replacement for acceptance provenance and a separate private sanity sample.
The unit tests named in the plan (`adblock-youtube`,
`adblock-exceptions`, `adblock-events`, `adblock-engine-loader`) exercise the
engine against mocks, not a browser; they seed URLs but cannot be the
acceptance fixture. Spike A first builds
`experiments/chromium-extension-spike/fixtures/replay/` (committed under
the experiments tree per §6, reviewed like the list snapshot; it moves out
of `experiments/` only with a later decision):

- A request corpus of at least 2,000 requests the pinned lists block and
  2,000 they allow, each with URL, resource type, initiator origin,
  first-party (top frame) origin and frame context, recorded from real page
  loads in Electron Blanc with the blocker's own decision logged as the
  oracle.
- **Origin-preserving replay.** Serving the corpus from `localhost` would
  change every domain and first-party/third-party relationship the rules
  match on, so replay must present each request to the blocker under its
  **original scheme, host and port**. The transport is a local MITM-style
  proxy or host-resolver override (`--host-resolver-rules` plus a local
  TLS fixture CA installed only in the disposable profiles) that answers
  the recorded responses while the browser still believes it is talking to
  the original origins; both browsers use the same transport. The harness
  additionally **records the request context each blocker actually
  received** (URL, type, initiator, top-frame origin, as the hook or
  `webRequest` details report them) and diffs it against the corpus
  record, so a context mismatch is caught as a harness fault rather than
  counted as a blocking difference.
- Outcome pages: the existing YouTube fixture page plus synthetic pages
  that each exercise one class of cosmetic rule, in three separately
  reported groups: **native CSS** (element hiding, `:has` and other
  selectors the engine can render as a stylesheet), **extended procedural
  rules** (`:has-text`, `:matches-css`, `:upward`, `:xpath` and the rest of
  the procedural set, which a stylesheet cannot express and which need a
  DOM evaluator run by the renderer agent), and **scriptlet-dependent
  behaviour** (a patched `fetch`, a defused timer). Each page has DOM
  assertions for the expected post-filter state. The procedural group
  also has **dynamic-node tests**: nodes inserted, re-attributed or moved
  after load and after a timer, so the evaluator's mutation handling
  (observer scope, debounce and re-evaluation cost) is measured rather
  than assumed; a procedural rule that holds at load and fails after
  mutation is a fail.
- A coverage page issuing one request of every path the audit found.

### 2.1 Corpus amendment — approved at `68892cc1` (§8.1)

**Approved change.** Replace the real-page provenance requirement in the
first replay-corpus bullet with the committed synthetic acceptance corpus
below, and authorize a separate, bounded private real-page sanity sample.
Merging this document does not approve either change. The original approval
in §8 does not extend to this amendment. No replacement-corpus generator,
private recorder, capture, replay run or native implementation starts until
the owner approves §8.1 explicitly.

**Reason and evidence.** Option C and its repeat admitted 0 of 10 initial
documents. At recorder commit `570d9939b83a5fb3a882254107c9a2f5ca34ea87`
([#914](https://github.com/bnfy/blanc/pull/914)), the repeat recorded three
uncontrolled-Vary refusals, four encoded/opaque-body refusals and three
status refusals (one 401, two 403). No script/xhr/image distribution was
measurable because the initial documents were refused. These are feasibility
results, not blocking-parity evidence. The statuses are consistent with bot
protection but do not establish its cause; the body heuristic can reject
ordinary nonces, hashes and inline data without proving that they are private
identifiers. Preserve these failed attempts and their limits. Stop iterating
C; this proposal does not weaken the public scrubber or turn those attempts
into acceptance data.

**A. Committed synthetic acceptance corpus.**

- Generate deterministic candidate URLs and authored fixture pages from the
  pinned EasyList/EasyPrivacy snapshot: blocking rules, exception rules and
  near-miss negative controls. Commit the generator, seed, rule references,
  list hashes, fixture bytes and manifest under `fixtures/replay/`, with
  list-derived URLs, data and generated page content licensed under
  **CC BY-SA 3.0-or-later**, attributed to **The EasyList authors**, as
  specified in `fixtures/replay/NOTICE`. Preserve source hashes, source
  links and transformation descriptions with generated artifacts; the
  first-party generator and independently authored harness code retain
  their existing terms. Do not edit the packaged root
  `THIRD-PARTY-NOTICES.md` from this spike branch; any future integration
  into `main` must align its notices in that separate change. Rules seed
  candidates; they do not supply the expected block/allow answer.
- Keep the minimum **2,000 distinct URLs observed blocked and 2,000 distinct
  URLs observed allowed** by the real Electron provider. Repetitions,
  regular/private reruns and superficial identifier variants cannot pad
  these counts. Report unique rules, rule families and URL/context cases
  separately, with the selection and deduplication algorithm. If the
  threshold cannot be reached without padding, report the shortfall.
- Before capture, commit a coverage matrix mapping rule families and
  block/exception/negative cases to resource types, first- and third-party
  relationships, initiator and top-frame combinations, frame context and
  `profile_kind: regular|private`. Include same-origin and cross-origin
  frames, absent and opaque initiators, no-referrer requests, redirects,
  worker/service-worker and sender-teardown cases, and every request-path
  class in the audit (including keepalive/beacons, prefetch/prerender,
  worker scripts, WebSocket and WebTransport). Each applicable cell needs
  a runtime assertion and evidence; unsupported or unobservable cells stay
  explicit gaps, never implied passes or silently dropped rows. Explain
  genuinely inapplicable combinations. Meeting 4,000 URLs alone is not
  acceptance and does not close an unimplemented coverage path.
  Prioritize renderer subresources by resource type, first- versus
  third-party contexts, regular/private profiles and redirects, so the
  highest-priority criterion 3 evidence is gathered first. This ordering
  does not narrow criterion 3 or waive other cells. Given the unchanged
  two-week box, a partial matrix with explicit gaps is an expected possible
  deadline outcome, not a reason to extend the box or manufacture passes.
  Report each cell as passed, failed, gap or inapplicable with its evidence
  or reason; distinguish untested coverage from observed mismatches. A
  stopped spike with gaps is a valid measurement deliverable, not completed
  acceptance or a claim that criterion 3 passed. Apply the existing stop
  and kill criteria to the evidence actually obtained.
- Use actual browser loads, the real provider and startup gate, and the
  same origin-preserving offline transport with disposable fixture TLS in
  both browsers. No live upstream fallback. Observe each hook's actual
  URL, type, initiator presence/value, top-frame origin, frame context and
  profile kind independently using the reviewed context mapping. Never
  substitute referrer or frame origin for the initiator. Context mismatch
  remains a harness fault; absence and opaque `null` stay distinct.
- Produce the oracle from **two fresh offline Electron replays** of the
  identical manifest and response bytes. Require exact stable request,
  context and decision sets, retaining failed attempts; do not prune to an
  intersection. A source rule's predicted answer or unit-test mock is not
  an oracle. Record browser/build, engine artifact and list hashes,
  configuration, enabled rules and initialization/readiness settings for
  both browsers. Identical engine source alone does not establish identical
  behavior; configuration, initialization and integration can differ.
- Supply complete, safe, authored responses for **every candidate URL,
  including Electron-blocked requests**, and a manifest of their authored
  descendant requests. An incorrectly allowed script must execute that
  fixture behavior rather than receive a synthetic 502 that hides its
  children. Descendants that Electron never issued are reported separately
  as causally attributable fork-only behavior, not fabricated Electron
  decisions or additions to the oracle denominator. Unknown, unmanifested
  requests remain harness faults. Preserve direct block→allow differences
  even if a secondary harness fault occurs; do not discard or disguise
  them. If any missing response still prevents downstream execution, mark
  `downstream_behavior_tested: false` and qualify the false-negative count
  as a lower bound beside every reported rate.
- Preserve the three outcome groups already specified above: native CSS,
  procedural cosmetics with dynamic-node mutation assertions, and
  main-world document-start scriptlets. Counts of network decisions cannot
  substitute for DOM outcomes, scriptlet delivery or audited path coverage.
  Report results as **synthetic fixture parity**, not a measured real-web
  block rate or proof of complete real-world coverage.

**B. Separate private real-page sanity sample.**

- After approval, record at most five public, unauthenticated pages through
  a real browser network session in fresh disposable profiles, with a
  bounded 60-second observation per page. Use a distinct recording path;
  Node's upstream client is not this sample's browser transport. Do not
  bypass bot challenges, authenticate, import user profiles, autofill,
  submit forms, or record personal browsing. Record negotiated protocols
  and refusals; a failed page remains a failed observation.
- Keep response bodies, full-URL observations and any transient identifiers
  only on this Mac, outside the repository and synced folders, under an
  owner-only run directory under
  `~/Library/Caches/me.bnfy.blanc-f12-private-sanity/<run-id>/`
  (directories 0700, files 0600), with the expanded absolute path recorded
  locally. This avoids relying on temporary-directory retention, but a
  cache is not guaranteed storage: record any early eviction as lost
  evidence, never as a completed check. Do not persist Cookie, Set-Cookie,
  Authorization, Proxy-Authorization or credential material in recordings;
  fresh-session cookies needed by the browser remain ephemeral. Do not
  export profiles, HARs, raw stderr, screenshots, keys or individual URLs
  to GitHub, CI, remote artifacts or third-party analysis services.
- Delete disposable profiles and trust keys when each run ends; retain
  private recordings only until the earlier of seven days after capture
  or completion/stopping of spike A. Record the exact local path, expiry
  and cleanup result locally. Longer retention needs a separate owner
  decision. No raw data goes into the public evidence tree, even if a
  recording fails.
- Commit only reviewed, aggregate summaries: attempted/completed pages,
  requests and differences by resource type, first/third-party and profile
  class, refusal counts/reasons, observation bounds, tool/build identifiers
  and hashes of whole recording bundles. No per-URL hashes or identifiers.
  The private sample is excluded from the 2,000/2,000 threshold and all
  synthetic-parity denominators; report it beside those results as a
  limited realism check whose raw evidence is not publicly reproducible.
  If paired comparison is attempted, derive its oracle from two stable
  offline Electron replays, not the live acquisition; otherwise report
  observations only, without a parity claim.

**Unchanged limits.** This proposal does not reset either two-week box,
waive coverage gaps, change latency bounds or kill criteria, enlarge the
40-file/120-hunk budget, authorize a cold output or promote 157. Spike B's
reference to the same fixtures follows the amended definition only after
§8.1 approval. Record any effect on the remaining time box in the ledger;
no automatic extension. Existing §5 build guards and §6 exclusions remain.
The only proposed exception to committing corpus artifacts under §6 is the
bounded local private sample above. Implementation may resume under the explicit approval recorded in §8.1.

**Latency protocol.** The thresholds above are new proposals for this
tranche; plan §5 criterion 3 speaks only to block rate, so these bounds
decide which engine placement is tried, not whether the tranche stops.
Measurement: the timed interval is from the hook receiving the request
(throttle `WillStartRequest` or the factory proxy's entry) to the
block/allow decision being applied, **including** any Mojo round trip to a
utility-process engine; engine-internal time is recorded separately when
the engine exposes it. Runs: the corpus's 4,000+ requests replayed as page
loads with the browser's natural concurrency (not serialized), five
repetitions after one discarded warm-up repetition, on an otherwise idle
machine; p50, p95 and p99 reported per repetition and as the median across
repetitions. A **cold** figure is also recorded for the first 200 decisions
after engine load, reported separately and not held to the warm bound.
Clock: monotonic `base::TimeTicks` at both ends of the interval, logged by
the hook itself, not by the harness. Electron Blanc's own decision latency
is measured the same way where its `webRequest` path exposes it, for
reference, not as a bound.

Both browsers run the same corpus through the prototype's existing
browser-level harness style (CDP plus the origin-preserving transport),
never through unit-test mocks. The corpus and its Electron oracle run are the measured
baseline; "Electron Blanc's rate" means that run.

**Stop conditions for spike A** (each stops spike A only; spike B and items
3–6 continue, and only §7's kill criteria stop the tranche): the two-week
box ends; or neither engine placement meets the proposed latency bound; or
the hook requires patching the
network service or the extension system (plan §4 A, "never fork the
extension system"). A stop is recorded with the measurements taken.

## 3. F12 spike B: Manifest V2 audit and uBO runtime spike

**Question:** what does it cost, in patches and maintenance, to run Blanc's
pinned uBlock Origin 1.75.0 payload (`ublock/pinned.json`, the Electron
provider's reviewed source) as a Manifest V2 extension on the 157 fork, and
does it block at the rate the Electron provider achieves?

**Scope, two weeks, audit before runtime:**

1. **Audit (no build).** Enumerate every place the 157 checkout gates
   Manifest V2: manifest-version validation, the MV2 deprecation experiment
   stages and their kill switches, the enterprise-policy remnants, test-only
   and component-extension exceptions, `webRequestBlocking` availability,
   and the Chrome Web Store/update paths that refuse MV2. Each entry has
   file, line, what it does, and whether a default, a flag or a patch would
   change it. The audit is the deliverable even if the runtime spike stops.
2. **Runtime spike.** The minimum patch set that loads the pinned uBO
   payload as an MV2 extension with blocking `webRequest` in a regular
   profile (not the Store; the Store does not serve MV2 uBO), from Blanc's
   packaged payload as the Electron provider does. Private windows keep
   Blanc Blocker, as today.
3. **The reload gap.** Electron's host (`ublock-host-mainworld.js`) holds
   every decision until `µBlock.loadFilterLists()` settles because uBO on
   Chromium allows everything while it reloads lists. Spike B measures
   whether the fork has the same gap and what a browser-side hold costs in
   patches; a fork cannot ship the gap.

**Measurements:** block rate and cosmetic coverage on the same fixtures as
spike A; patch count by the same inventory; the audit's count of gates that
need a patch versus a default; whether each gate is one upstream is actively
removing (a patch against a removal in progress is maintenance cost that
compounds every two weeks).

**Stop conditions for spike B:** the audit shows `webRequestBlocking` or MV2
loading cannot be restored without patching the extension system's core
(plan §4 A rule 3); or the two-week box ends; or the runtime spike needs
more than §7's fixed tranche budget on its own. A stop is recorded with the audit; like spike A's, it stops spike B only.

**Not in spike B:** uBO Lite (MV3) as a provider. If both spikes stop, uBO
Lite is the third option to scope, as a separate request.

## 4. Items 3 to 6

- **A1 patch-budget design** (document): the `src/blanc/` layout, override
  files versus patches, the `patches/` apply script that fails on fuzz, and
  CI reporting of the count on every PR. The move itself is a build task
  for the tranche after Decision 2. The budget number and counting rules
  are **not** left to this document: §7 fixes them for the tranche so the
  stop condition is enforceable from day one; A1 may propose a different
  number for Decision 2, and may not retroactively relax a stop already
  hit.
- **Visual comparison**: Electron Blanc 1.36.0 and the 157 prototype at
  1200×900 and 600×420, light and dark, states resting / panel / palette /
  find / private, captured the same way, with every difference listed and
  classified as prototype-CSS (fixable), missing service (expected) or
  Chromium rendering (needs a decision).
- **VoiceOver pass**: the resting pill, the expanded panel, the Extensions
  view and the start page, with rotor order, labels and focus return after
  Escape; failures listed per control.
- **Cost sheet**: Task 0's numbers against the evaluation's table, with
  every remaining unknown named, in **three separate lines that are never
  summed into one fortnightly figure**: (a) *clean-build recovery*, the
  2h39m47s cold build, which recurs only on a new checkout, a toolchain
  change or cache loss, not per milestone; (b) *routine per-milestone
  maintenance*, the fetch, prepare anchors, compile fixes, incremental
  builds and re-verification, which is the fortnightly cost and is
  projected at the two-week cadence plus security respins; (c) the
  *extension-release wait*, calendar latency on a third party's release
  schedule that costs attention only at each daily check and is not
  labour per milestone. Owner attention and agent time are reported as
  measured or `not measured`, never inferred from calendar span.

## 5. Builds and the ledger

- All builds are guarded incremental builds in the existing 157 sibling
  output (`BlancChromium157/src/out/BlancPrototype`) through `build.mjs`.
  **No new cold output. No change to `args.gn`, Xcode or depot_tools. The
  156 checkout and output stay untouched.** A spike that needs a GN change
  regenerates with unchanged arguments and goes through the normal
  regeneration and buildflag stops.
- Every build invocation is logged in a new ledger section, "Tranche 2
  incremental builds", as routine builds; none is added to row 0's cold
  column. Agent start/stop intervals are recorded; owner attention is
  recorded when observed.
- Row 0 stays open on the upgrade gate while this tranche runs; the ledger
  notes that development continued on 157 with the gate open. If the gate
  *fails* rather than staying unobserved, promotion stops; the spikes' work
  is kept, since any later major needs the same port.

## 6. What approval covers, and what it does not

Covers: items 1–6 above, on the 157 sibling output with guarded incremental
builds; new files under `experiments/chromium-extension-spike/` (spike code,
evidence, documents); edits to `prepare.mjs` and the native bridge needed
by the spikes, on the prototype branch; draft PRs against
`codex/chromium-extension-spike`, merged on the owner's word.

Does not cover: Phase 3 parity porting beyond the two spikes; the A1 layout
move; Windows or Linux builders or builds; the data migrator; the updater or
cutover spike; any change to shipping Electron Blanc (a shipping bug found
on the way goes to `main` in its own PR, as #904 did); a general extension
runtime in Electron; any public claim about the fork; Decision 2 itself.

## 7. Kill criteria that apply during this tranche

**Patch budget, amended October 20:** **52 upstream files
and 124 hunks**, counted as follows. A *file* is an existing upstream file
that `prepare.mjs` (or, later, the `patches/` set) modifies; Blanc-owned
new files do not count; the two icon assets count as files. A *hunk* is one
`@@` section of a unified diff with zero context lines, produced
deterministically by

```sh
GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1 git diff \
  --unified=0 --inter-hunk-context=0 --diff-algorithm=myers \
  --no-indent-heuristic --no-renames --no-ext-diff --no-textconv --no-color --text \
  <upstream-tag> -- <text inventory paths>
```

run inside the patched checkout (or the same options with `--no-index`
against a pristine copy). Every option that shapes hunk boundaries is pinned
on the command line, which overrides repository, user and system
configuration, and user and system configuration are also excluded: without
the pins, settings such as `diff.interHunkContext` or `diff.algorithm` change
the count (reproduced: two changes separated by two unchanged lines count as
two hunks by default and one with `diff.interHunkContext=5`; the pinned
command counts two under a hostile user or repository configuration). The
counter records the Git version with each count. The count is taken over
the text files in the inventory, as the number of `@@` headers (`--stat` and `--numstat` count changed lines, not hunks, and are
not used; see <https://git-scm.com/docs/git-diff>). Adjacent changes
separated by at least one unchanged line are therefore separate hunks; `prepare.mjs` edits files in place and never renames them, so rename
detection is off; a mode-only change counts as zero hunks and one file. The
counter classifies a file as binary when either side's content has a NUL byte
in its first 8,000 bytes; changed binary content (including the two icon assets)
counts as one hunk and one file. Text diffs force `--text`, and applicable `diff`
and `binary` attributes are recorded rather than used to classify content. The counter is a
script in the experiments tree, run against the same pristine checkout the
inventory used, and its output is committed with each count. The count is produced by the same inventory method
as `evidence/rebase-157-20261016/patched-upstream-files.json`, run before
and after each spike, and recorded in the ledger. Today's count is **21
files**; the hunk count is measured at the start of the tranche and
recorded as the baseline. Each spike reports its own delta.

From plan §5: criterion 2 (the count above exceeds 52 files or 124 hunks and
cannot be moved into overrides within one sprint) and criterion 3 (neither
F12 option blocks at Blanc Blocker's rate on the replay corpus within the
budget). Either is recorded in the ledger and reported to the owner the day
it is hit; the tranche does not continue past it without a new decision.

## 8. Approval

- [x] Approved by the owner on October 17, 2026, in the Claude Code
      session after Codex cleared the request at `416b5ac` with no blocking
      findings: "Approve §8 as written". No change to order or scope: the
      F12 spikes first with no-build items 3–6 between builds, two-week
      boxes per spike, the proposed latency bounds (p99 2 ms in-process,
      5 ms over Mojo) retained, and §7's fixed budget of 40 upstream files
      and 120 hunks. The approval covers exactly §6; anything §6 excludes,
      including a new cold output, needs a new approval.

### 8.1 Corpus amendment approval — granted October 17, 2026

- [x] Approved by the owner on October 17, 2026 in this Codex session at
      reviewed commit `68892cc1b997694483af943de12a297b0f44175d`.
      Owner's exact words: "Approve §8.1 as written at 68892cc1. Record my
      approval, merge #916 once CI is green, and resume implementation."
      No changes to the reviewed scope, including the separate experiment
      cache namespace, were requested.

The original checked §8 approval remains historical. This separate explicit
approval covers §2.1 A's synthetic acceptance definition and B's bounded
local sample, with their reporting, retention and cleanup requirements and
all unchanged limits above; anything beyond them requires another decision.
Merging alone was not approval. The owner separately authorized merging
#916 once CI on its current head is green and resuming the amended work.

Earlier follow-up: browser-side pre-dispatch document constraints pass eleven
runtime checks across same-document, same-URL, cross-path and cross-origin
navigation, plus six helper/four completion regressions. Readiness leases cover
browser snapshots and bounded all-frame fanout; stale IDs are rejected after file
loading. Renderer-boundary navigation and original caller identity before the
snapshot remain gaps, alongside lifecycle/async effects. Evidence:
`evidence/f12-document-target-20261018/`. Footprint: 35 files / 79 hunks; one 317-second
incremental build, final guard zero actions. Spikes A/B in progress; items 3–6 not started.
Latency deferred; Electron diagnostic build §8 unchecked/unstarted. No promotion.

## October 19 narrow patch-budget amendment

The owner previously said “We can raise the 40-limit if we need to” while authorizing
continued UI migration, and now explicitly requested the closed-group persistence repair.
That allowance is applied here to one additional upstream file:
`components/sessions/core/tab_restore_service_impl.cc`. The file ceiling becomes 41;
the hunk ceiling remains 120. No general relaxation of scope, build guards or acceptance
gates is implied. Historical 40-file measurements remain unchanged. The deterministic
counter uses the amended ceiling. Patch consolidation remains a future audit.

## October 19 site-mute lifecycle checkpoint

Ten bounded native bridge checks pass: enabling site mute; per-tab exemption; same-host navigation retaining exemption; different-host navigation clearing site policy; return to the muted host resetting exemption; renderer crash followed by navigation retaining site policy; two fresh private-context mute/disposal cycles each leaving regular policy intact. A new private context starts without the disposed context's mute policy. Tests use local authored HTTP pages and real Chromium WebContents state. `Page.crash` deliberately produces a renderer fatal in the archived log; the outer browser survives and the replacement page is checked. No audible-output, physical-input, cross-window mute or BFCache mute claim.

No source change or compile. Build guard reports zero actions. Footprint remains previously measured41files/100hunks (not re-enumerated). Disposable browser/profile and server removed; retained preview's original tabs verified unchanged. Evidence: `evidence/ui138-mute-lifecycle-20261019/` with hashed archive and readable results. Latency deferred; Electron diagnostic build remains unapproved. Spaces/Glance, wider visuals/native input and broader lifecycle gates remain open; UI migration is not complete.

Prior shutdown follow-up a574ec3d completed CI:27passes, two skipped (linux-native-diagnostics/installed-intel), no new CodeQL alerts. Windows shutdown and primary-close explicitly pass. This evidence checkpoint requires its own CI.

## October 19 Spaces/Glance foundation checkpoint

Migration remains incomplete; user-facing controls remain hidden. Added Island-only native split pair/close probes (not full Glance): reject unknown/self/pinned/grouped/already-split tabs; use native split views with62/38 ratio. Chromium sorts input indices, so a reordered reference initially occupied the larger pane. Corrected explicit ordering; final runtime main718px/reference436px, both visible; close restores full main width and preserves both tabs. Pin/self/unknown rejection passes. Focusing reference changes native active tab, confirming a contract gap: Blanc requires stable main identity and focused-pane command routing. No full Glance focus/header/stacking/resize/lifecycle/persistence acceptance claimed. Grouped tabs deliberately refused in this foundation.

Added a pure Spaces capture adapter mapping native snapshots into saved tab/group columns. Four tests cover private/mixed-private refusal, zipped pin/group/active identity, independent group records, and explicit unsupported-URL omissions. Real native snapshot capture passes. This does not store or switch spaces: durable profile storage, atomic switching/autosave, single-window ownership, recovery, residency, deletion/undo and UI integration remain unimplemented. Unsupported/empty captures are explicitly incomplete; no file grants are inferred. No permanent profile changes.

Two incremental native builds succeeded:36.11s and37.60s Siso, six steps each. Final guard0/4.51s. Fresh inventory41files/100hunks within41/120. Scoped module lint passes; four unit tests pass. Initial test API-name error and native ordering failure retained. Owned test profile/server removed; retained preview tabs unchanged (running preview was not restarted). Evidence: `evidence/ui138-spaces-glance-foundation-20261019/`. Latency deferred; Electron diagnostic build unapproved. Next: stable Glance role/focus routing and native Spaces persistence/transaction boundary, then copied UI exposure and acceptance. No claim of finished feature migration.

## Glance focus and bounded Spaces persistence/switching — October 19, 2026

The hidden native preview now keeps Glance's main tab ID distinct from the focused tab ID. Actual reference focus preserves the main identity; Island Reload and Back route to the focused reference without reloading the main page, and opening Find targets the reference and returns its unique match. Explicit tab-row operations still use their supplied ID. This is not full Glance acceptance: physical keyboard routing, Close/Hard Reload/zoom/Print, main-scoped extension/shield actions, explicit promotion, foreground children, narrow stacking, divider/header and broader lifecycle remain open. Public controls remain hidden.

Spaces has an internal native profile-scoped versioned JSON store, serialized off the UI thread and written with Chromium's atomic file writer. It refuses private access, malformed/corrupt stores, unsafe URLs, incomplete/loading/split/beforeunload-sensitive captures and unsaved source changes. Switching requires an explicitly saved unchanged source, rechecks tab IDs and capture after disk I/O, stages destination tabs, then closes the saved source. It restores URL order, pins, group name/color/collapse and active selection. A live owner prevents another window overwriting the same named space. This is a bounded prototype API, not the complete Spaces UI or a crash-atomic window transaction. No claim of zero state loss for arbitrary pages: history/form/scroll/residency are not captured. Autosave, live-cache residency, focus-existing-owner UX, delete/undo, richer identity metadata, switching crash recovery and arbitrary document races remain open. Controls stay hidden until those policies are implemented.

Ten final runtime checks pass, plus five restart/ownership/corruption checks: bidirectional A/B switching, group/pin restoration, private read/write refusal, restart persistence, second-window ownership refusal, corrupt store read/write refusal without tab mutation, and unsafe stored destination refusal. The first capture failure, unsupported fixture color and collapsed-group switching failure are retained. The collapse repair applies saved visuals after final selection, which otherwise expands the group. Browser automation only; no physical-input or full visual claim. Four capture unit tests and three-module scoped lint pass.

Native build attempts: initial compile failure (9.23s Siso /14.82s wrapper; C++ dictionary chaining and handler placement fixed), then three six-step incremental successes:33.85/33.79/33.88s Siso (37.36/37.60/37.69s wrappers). Final guard zero actions/4.38s. Fresh upstream inventory41files/100hunks within41/120. No cold build, GN/toolchain change, latency run or Electron diagnostic build. All invocation records and53hashed evidence members are preserved under `evidence/ui138-spaces-routing-20261019/`. Owned disposable profiles/server removed, original retained-preview tabs unchanged; retained preview not restarted. Task0/F12 gates remain unchanged, latency deferred, Electron diagnostic build unapproved.

Next: complete Glance's remaining command/role paths and Spaces autosave/ownership/switch recovery before exposing the copied controls. Plan item4 remains incomplete; these checks do not close native-input, VoiceOver, full visual parity or the other tranche acceptance gates.

## Focused commands, Spaces autosave and explicit checkpoint recovery — October 19, 2026

The internal native page-command bridge delegates Hard Reload, Close, zoom in/out/reset and Print to Chromium's focused-WebContents command path. Actual reference Hard Reload preserves the main document marker; reference zoom in/out/reset changes only the distinct-origin reference; reference Close removes that tab, collapses Glance and retains main. Unknown commands are refused, and the internal Close command refuses the last tab. Explicit tab-row close IDs are unchanged. Print is wired but not exercised; physical keyboard/menu parity, same-origin zoom policy, main-scoped extension/shield actions, promotion, children and complete Glance UI remain unqualified. Public Glance controls stay hidden.

Bound Spaces now autosave a complete capture after one second of stability, driven by the existing Island snapshot poll, with writes serialized off the UI thread. The previous validated JSON generation is atomically checkpointed before the current generation is replaced. Corrupt/unreadable/missing primary data with a checkpoint refuses normal writes; errors stop autosave and are exposed in the snapshot. Explicit internal recovery validates the checkpoint, restores it, leaves current tabs unchanged, and clears live ownership/autosave binding so recovered data cannot immediately be overwritten by an old window. Invalid checkpoints refuse without modifying the primary. No automatic loss-hiding fallback or renderer storage.

Eleven final runtime checks and five restart checks pass: focused commands, navigation/group/pin autosave, prior-generation retention, corrupt-store stop, explicit recovery, rebind/resume, acknowledged save surviving an owned browser SIGKILL, explicit reopening after restart, missing-primary refusal/recovery, invalid-checkpoint refusal. The crash happened after an observed successful write, not inside a write. The initial alternate-loopback fixture timeout and stale cached UI snapshot assertion are retained as failed harness attempts; localhost and waiting for fresh snapshot state corrected them. Four capture tests and three-module scoped lint pass.

Limits remain explicit: snapshot-poll autosave has an unacknowledged tail and is not a guaranteed exit flush; background throttling, beforeunload/incomplete captures, interrupted-write/power-loss and switch-mid-transaction recovery remain unqualified. Spaces still lacks full residency, ownership focus UX, delete/undo and public controls. It does not preserve arbitrary page form/scroll/history state. No full feature or native-input acceptance is claimed; plan item4 remains incomplete. Latency stays deferred; Electron diagnostic build remains unapproved; Task0/F12 gates unchanged.

Two six-step incremental builds passed:34.07s and33.31s Siso (38.17s and36.94s wrapper). Final guard0/4.47s. Fresh inventory41files/100hunks within41/120. No cold output, hooks, GN/toolchain changes. Evidence: `evidence/ui138-spaces-autosave-20261019/`,46hashed archived members plus readable results/invocations. Owned disposable profile/server removed; retained preview original tabs unchanged and not restarted.

## Spaces exit flush and interrupted-write investigation — October 19, 2026

Spaces captures a complete bound snapshot during Chromium's WillCloseAllTabs notification, before tab removal, and queues a value-owned save on the existing BLOCK_SHUTDOWN sequenced runner. Private, incomplete, loading, split, beforeunload-sensitive or error-stopped captures remain excluded. This is a bounded normal-close flush, not a guarantee for every shutdown path.

The real normal-exit test passed: the latest navigation was absent from the primary before Browser.close and present after process exit. Normal restart retained that snapshot. A separately authored partial temporary file did not affect the validated primary or list result. Four capture tests pass. The injected write-barrier attempt failed to start a usable browser and timed out before reaching the write; its script, helper source and failed result are retained. No actual mid-write interruption, power-loss durability or interrupted backup replacement is claimed. The synthetic temporary-file probe is not a substitute for those checks. No security settings or signatures were changed to force injection.

One incremental build passed:34.94s Siso,40.92s wrapper; prepare1.81s. Final guard zero actions/3.55s. Footprint recorded in patch-budget.json. Owned test profile/server removed and retained preview tabs preserved. Native input, latency and the Electron diagnostic build remain pending/deferred; plan item4 and broader recovery/ownership/switch-transaction gates remain open. Evidence: evidence/ui138-spaces-exit-20261019/.

## Actual Spaces temporary-write interruption — October 19, 2026

A disposable-process write interposer stopped the actual Chromium Spaces primary temporary-file write after 96 of 192 bytes. The harness verified the owning browser PID, the native hidden temp filename, actual file size, valid checkpoint and unchanged complete primary before SIGKILL. The process was killed while the write remained blocked, before atomic replacement. Restart without injection retained the exact prior JSON generation; explicit Space reopening restored baseline URLs and excluded the unfinished navigation. After pages finished loading, a new save succeeded.

This is a real bounded process-crash/partial-primary-write check, not power-loss durability, backup-write interruption, rename/fsync boundary coverage or arbitrary concurrent recovery. No product patch or native Chromium compilation was needed. Guard: zero actions,5.22s; upstream footprint unchanged from measured41files/100hunks. Native input pending; latency deferred; Electron diagnostic build unapproved. Plan item4 remains incomplete.

The prior helper failure was recursive write interposition (stack overflow), not a signing restriction. The test-only helper now uses direct SYS_write (macOS deprecation warning retained); it does not alter signing/security settings. The first revised run missed Chromium's hidden temporary filename and timed out; corrected matching uses the owned profile directory and exact Spaces basename. Recovery attempts retained an early CDP connection failure and a save refusal while restored tabs were loading. The final resave waits for complete captures. These failures are archived, not counted as passes. Disposable profile/server removed and retained preview tabs unchanged. Evidence: evidence/ui138-spaces-interrupted-write-20261019/.

## Spaces backup and atomic-replacement boundaries — October 19, 2026

Five actual disposable-process interruption cases pass, each followed by restart without injection, native Space listing/reopening and a subsequent successful save:

- Backup temporary write interrupted at94/188bytes: complete primary and previous backup unchanged.
- Immediately before backup rename: complete primary and previous backup unchanged.
- Immediately after successful backup rename: primary unchanged and backup equals the previous primary.
- Immediately before primary rename: primary unchanged and backup equals it.
- Immediately after successful primary rename: new complete primary retained, backup equals old primary; restart restores the new navigation.

The test-only interposer matches the exact owned profile path and backup/primary destination, consumes a one-shot arm and emits a PID/path marker before waiting. The harness verifies the owned PID and on-disk generations before SIGKILL. These are controlled before/after rename boundaries, not a kill inside the kernel rename operation. Partial backup size is checked on disk. All five cases passed on the first attempt in this checkpoint. Helper direct-syscall deprecation warnings remain in the archive; no signing/security settings were changed.

This qualifies bounded process-crash recovery, not power-loss durability, fsync failure, disk-full/I/O errors, concurrent writers or switch-mid-transaction recovery. No product changes or Chromium compilation; final guard zero actions/3.61s. Footprint unchanged from measured41files/100hunks. Five owned profiles/servers cleaned and retained preview tabs preserved. Native input pending, latency deferred, Electron diagnostic build unapproved. Plan item4 and broader acceptance remain open. Evidence: evidence/ui138-spaces-write-boundaries-20261019/.

## Spaces disk-full and write-error recovery — October 19, 2026

Four controlled native write-error cases pass: ENOSPC and EIO at both backup and primary temporary-file writes. The test-only interposer restricts injection to the disposable profile's exact Spaces filenames and records actual browser PID/path/errno. It returns a real syscall-style failure to Chromium's writer; the disk was not physically filled.

Each failed autosave exposes the specific checkpoint or primary-write error, preserves the complete primary, and stops autosave while errored. Backup-write failures preserve the prior backup; primary-write failures leave the validated previous primary in the checkpoint. After removing injection, an explicit save clears the error and persists the previously unsaved navigation; a further navigation then autosaves successfully. All four error/recovery cases passed. No product repair was needed.

The first cleanup verifier failed because retained-preview CDP had no host.html target. Owned fixtures had already been stopped/removed; subsequent cleanup records observed targets rather than assuming the host exists. The retained preview was not modified, but original-tab identity was not reverified this checkpoint. The failed cleanup assertion is retained. All owned disposable profiles/servers were removed.

This tests injected ENOSPC/EIO write handling, not a physically full filesystem, flush/fsync errors, rename failures, permission failures, power-loss or concurrent writers. Test-helper syscall deprecation warning retained; no signing/security changes. No Chromium compile; final guard zero/5.24s; footprint unchanged from measured41files/100hunks. Native input pending, latency deferred, Electron diagnostic build unapproved. Plan item4 and broader gates remain open. Evidence: evidence/ui138-spaces-write-errors-20261019/.

## Spaces flush and rename failure recovery — October 19, 2026

Four controlled native failure cases pass: backup and primary flush failures, plus backup and primary rename failures. On macOS Chromium tries F_BARRIERFSYNC before fsync; archived operation events prove both returned EIO in each flush case. Rename cases return EIO only for the exact owned Spaces destination. Browser PID and file paths are verified. Injection is restricted to disposable profiles; no filesystem or signing settings were changed.

Each case preserves the complete primary, reports the checkpoint or primary-write error, and stops autosave while errored. Backup failures retain the previous checkpoint; primary failures retain the previous primary in the new checkpoint. Removing injection and explicitly saving clears the error and persists the unsaved navigation; a later navigation autosaves successfully. All four passed on their first attempt. No product fix was needed.

These are injected syscall-return failures, not actual hardware flush failure, power-loss, physical media durability, permissions exhaustion or concurrent-writer qualification. Test-helper syscall deprecation warnings retained. Four owned profiles/servers removed; retained preview untouched, host unavailable so original-tab identity not reverified. No Chromium compile; guard zero/3.52s; footprint unchanged from measured41files/100hunks. Native input pending, latency deferred, Electron diagnostic build unapproved. Plan item4 and broader gates remain open. Evidence: evidence/ui138-spaces-flush-errors-20261019/.

## Spaces concurrent windows and switch-read interruption — October 19, 2026

Controlled same-profile, two-window checks pass: a blocked native save keeps the profile busy and refuses the other window's save; after release, retry succeeds and all A/B/C records remain. A foreign window cannot save over the actively owned A name. During a blocked switch read, changing the source navigation causes the switch to reject with tabs unchanged, preserving the changed source instead of installing the destination.

A subsequent switch was stopped during its real stdio disk read, before UI tab staging. The harness verified the exact browser PID/file marker and killed only the disposable browser. Disk records remained unchanged; restart without injection reopened both the saved source and destination and saved again. Four live assertions plus restart/reopen/resave pass. This is same-browser window serialization and pre-dispatch crash recovery, not independent browser processes writing one profile, crash during tab staging/removal, rollback of a partially changed UI, or arbitrary concurrent external writers. Those remain gaps.

Initial helper interposed read but missed stdio's internal path; timed-out attempt retained. Corrected fread interposition reached the real read, and all final checks passed. No product changes/native compile; guard zero/3.60s; footprint unchanged from measured41files/100hunks. Owned profile/server removed; retained preview untouched, host unavailable so original-tab identity not reverified. Native input pending, latency deferred, Electron diagnostic build unapproved. Plan item4 remains incomplete. Evidence: evidence/ui138-spaces-concurrent-20261019/.

## Spaces crashes during actual staging and removal — October 19, 2026

Temporary diagnostic hooks abruptly exited the disposable browser without shutdown cleanup after first destination staging (four live tabs), all destination staging (six), first actual source removal (five), and final source removal (three). Markers record the actual live URLs and expected three-tab source/destination. Each case preserved the complete saved A/B records; restart without the crash flag explicitly reopened both Spaces at their correct three-tab contents and saved again. All four final cases pass.

CloseWebContentsAt queues some removals: the first diagnostic attempt after a close request still had six tabs. The corrected removal checkpoints run from tab-model notifications after actual removal. Completion order differs from request order, so the assertion checks the actual surviving source/destination set, not an assumed first close. Initial UI-thread blocking marker failure, request-only observation, stale-log match and close-order harness assumptions are retained. Markers are read only from the current switch's log interval in final removal runs.

This demonstrates saved-record recoverability after abrupt exit during these four UI stages. It does not demonstrate automatic completion/rollback of the interrupted live window, automatic session restoration, preservation of unsaved page state, or power-loss durability. Public Spaces controls remain hidden; broader transactional/residency acceptance remains open.

All diagnostic source edits were removed byte-for-byte and the normal prototype rebuilt. Normal A/B switching passes even with the now-inert diagnostic flag supplied. Four guarded incremental builds succeeded: wrappers39.60/38.10/38.15/38.83s; Siso35.26/34.19/34.16/34.93s. Final guard zero/3.74s. No cold build or GN/toolchain change. Final upstream footprint unchanged from measured41files/100hunks. Diagnostic patches and invocation logs are archived; no diagnostic hook is in product source. Owned profiles/servers removed; retained preview untouched, host unavailable so original-tab identity not reverified. Native input pending, latency deferred, Electron diagnostic build unapproved. Plan item4 remains incomplete. Evidence: evidence/ui138-spaces-switch-crash-20261019/.

## Automatic interrupted-switch recovery design — October 19, 2026

Source audit and acceptance design are recorded in `spaces-automatic-recovery.md`. Durable switch identity, completion after actual tab removal, session-restore coordination and repeat-crash idempotence are required. Source-versus-destination recovery preference has been requested from the owner; runtime implementation is not yet claimed. No build or native source change; latency/native input/Electron diagnostic-build boundaries unchanged.

## Automatic source-Space recovery — October 19, 2026

Owner decision recorded verbatim: **Restore the source Space (recommended)**. A versioned profile-local `.switch` journal is atomically written before staging, with a random transaction ID, named source and validated source/destination captures. The source must equal its durably saved record. Pending intent blocks other saved-Space mutations. Completion waits for the exact new tab IDs and complete capture before removing the journal; a successful switch API callback alone is insufficient.

Four forced exits after first/all destination staging and first/all actual source removal automatically restore the saved source after restart, without an explicit bridge/API reopen. Saved A/B records remain unchanged, and the completed recovery clears the journal. A second crash during first-tab recovery preserves the same journal; the next restart restores exactly one three-tab source set. Malformed intent and a nonempty unrelated startup page retain the journal and leave live content unchanged. Normal A/B switching and four capture-policy tests pass. Temporary crash hooks are removed; the normal binary is rebuilt and smoke-tested.

This is bounded startup recovery into a sole empty, non-session-restored regular window. It checks SessionRestore::IsRestoring before reading and before applying recovery; it does not identify an original window across macOS restarts. Exact restored-window ownership, in-flight/multiwindow session-restore races and private-runtime recovery still need qualification. Ambiguous startup content fails closed and leaves a recovery error/journal; automatic recovery is not complete for those cases. The UI remains hidden. Intent-write/acknowledgement fault injection, crash around journal deletion, group/pin recovery, power-loss durability and unsaved page state remain gaps. Previous generic Spaces write-error tests do not qualify the new journal. Journal deletion is not claimed as power-loss-durable acknowledgement.

Only guarded incremental builds were used; no cold output, args/toolchain changes, latency tests or Electron diagnostic build. Native input remains pending. The production source contains no diagnostic crash hooks. Owned test profiles/servers are removed; retained preview was untouched (host unavailable, original tabs not reverified). Task 0/F12 gates and plan item 4 remain open.

Evidence: `evidence/ui138-spaces-auto-source-20261019/`. Build wrapper timings: build 39.94 s, build2 38.62 s, diagnostic-build 37.53 s, restore-build 42.17 s. Fresh patch budget: 41 upstream files / 100 hunks. Final zero-action guard is archived. These costs are routine implementation/testing, never the Task 0 cold-build column.

## Spaces journal failures and multiwindow ownership — October 19, 2026

Five native journal fault cases pass: ENOSPC/EIO on the actual intent temporary write, both F_BARRIERFSYNC and fallback fsync EIO, final intent rename EIO, and completion unlinkat EIO. All markers identify the disposable browser PID and exact profile-local path. The four intent failures leave source tab IDs/URLs and saved records unchanged, expose an error, then successfully switch on retry with journal clearance. Completion-clear failure retains the journal and complete saved records, refuses another save, then restores the source and clears intent on a normal uninjected restart. This is injected syscall-failure evidence, not a physically full disk, power-loss or hardware-durability claim.

Four controlled startup ownership cases pass using a synthetic valid journal plus complete saved A/B store, holding the actual journal fread while windows change. A second regular window and an identical empty regular window cause refusal: neither window changes and intent remains. A private window stays unchanged while the sole regular window automatically restores the source. Closing the candidate window before the read completes leaves the other regular window and intent unchanged. Saved A/B store bytes are unchanged in all four cases. This qualifies safe refusal/private isolation, **not successful multiwindow recovery or identification of the original restored window**. Candidate closure currently leaves recovery pending until another startup; no in-process reassignment is claimed.

Initial acknowledgement helper intercepted unlink rather than Chromium's unlinkat and missed the fault; its timeout is retained. The corrected probe observes actual unlinkat EIO. The first restart assertion ran before host initialization; retained failure, readiness wait corrected, subsequent source recovery passed. Initial intent-only ownership probes are also retained, followed by the four stronger complete-store runs. Earlier switch/restore acceptance remains unchanged.

No product code changed and no Chromium compilation ran. Final guard: zero actions / 3.72 s. Existing footprint remains 41 files / 100 hunks (no new source edits; not freshly recounted). Test helper dylibs were scoped to owned profiles and are excluded from the evidence archive; source/build logs remain. Disposables removed; retained preview untouched, host unavailable so original tabs not reverified. Plan, results and routine ledger updated; public Spaces controls remain hidden. Latency deferred; native input and Electron diagnostic build pending. Task 0/F12/visual acceptance gates remain open.

Remaining: exact durable window identity across session rebuild and both restore paths, live multiwindow recovery rather than refusal, repeated startup ordering, failure around deletion/crash/powerloss, recovery group/pin and unsaved state. Source audit below identifies the integration points; this checkpoint does not expand the patch ceiling or claim them implemented.

Evidence: `evidence/ui138-spaces-journal-ownership-20261019/`.

## Durable window identity budget request — October 19

Unapplied hook sketch: three new upstream paths / seven hunks, projected44files/107hunks. Existing41/120 ceiling unchanged; explicit owner budget response pending. Design and acceptance contract: `evidence/ui138-window-identity-design-20261019/README.md`. No product source/build/profile changes or new runtime claims. Identity save acknowledgement remains a prerequisite to prove. Latency deferred; native input/Electron diagnostic build pending.

## October 19 durable identity budget approval

Owner explicitly approved: **Raise to 44 files; keep 120 hunks**. This supersedes the 41-file ceiling only for the three reviewed durable-window identity paths. All other scope and stop conditions remain unchanged. Draft hook footprint44/107; actual implementation must be recounted.

## Durable window identity — October 19, 2026

Owner explicitly approved: **Raise to 44 files; keep 120 hunks**. The counter and §7 now use that ceiling. Actual measured footprint: **44 upstream files / 107 hunks**, with exactly the three reviewed new paths. No further expansion.

Regular prototype windows receive a browser-owned UUID. Session rebuild serializes it, normal session restoration reattaches it, and native Recently Closed exports/imports it. Private windows have no identity. New version-2 switch journals bind their saved source to that UUID; recovery requires one matching same-profile window after session restoration settles. Missing/invalid/duplicate matches are refused instead of choosing by URL, title or window order. Version-1 journals retain their earlier restricted fallback. Current-session tab IDs/capture are still revalidated after disk work. Incremental identity metadata is queued through SessionService; an acknowledgement of durable save is not available from the inspected interface and is not claimed.

Two real two-window runs pass: first distinct content, then identical two-tab URL/layout contents. UUIDs survive normal restart; the owned browser is then SIGKILLed while a diagnostic rename hook holds immediately after the version-2 journal is atomically installed. Restart with Chromium session restore automatically recovers the UUID-matching source, clears intent, preserves both saved records and leaves the other window's content/identity unchanged. This is a before-staging journal-commit crash point, not all prior staging/removal points rerun under version 2. Native Recently Closed window restoration independently preserves the source UUID and two-tab content. Private window identity is empty and saving is refused. A valid but nonmatching UUID in a synthetic version-2 intent leaves both restored windows unchanged and retains the journal.

Five focused tests and three scoped module lint checks pass. First build failed on two diagnostics from one dictionary chaining expression; repaired without changing args or cleaning output. Initial incremental wrapper38.12s failed, continuation56.99s succeeded (50.68s Siso,9steps). Final guard0/4.44s. A package-resolving lint invocation was canceled because this worktree has no node_modules; the existing installed scoped linter passed. Actual runtime proofs and failures are retained. No Electron diagnostic build or latency run. Owned profiles/server removed; retained preview untouched, host unavailable so original tabs not reverified.

Remaining: crash before newly queued identity metadata reaches disk, explicit session-rebuild fault injection, duplicate/malformed persisted UUID runtime tests, version-2 crashes during staging/removal/recovery, late overlapping restore windows, original-session unsaved state, deletion/power-loss durability and public recovery UX. Missing identity intentionally leaves recovery pending; successful full multiwindow/lifecycle acceptance is not claimed. Nonowner windows can retain a recovery-status error until reinitialization. Public Spaces controls remain hidden. Native input pending; latency deferred; Electron diagnostic build unapproved. Task 0/F12 and plan item4 remain open.

Evidence: `evidence/ui138-window-identity-20261019/`. Routine implementation/test time only; Task0 cold column unchanged.

## Window identity and recovery boundaries — October 19, 2026

Four actual abrupt exits pass with version-2 durable identity journals: after the first destination tab, all destination tabs, first actual source removal and all source removals. Temporary profile-scoped native diagnostics record live URLs at each boundary (3,4,3,2 tabs respectively) and exit86. After real Chromium session restoration, only the matching source UUID is recovered automatically, both saved records remain byte-equivalent as parsed JSON, the unrelated window retains its UUID/content, and the journal clears. This extends the prior before-staging journal-write crash proof; it does not prove every interleaving or power-loss durability.

With the owned browser stopped, the duplicate-identity harness replaces the second window UUID with the first in both plaintext and mock-keychain-encrypted Session records. No real keychain/profile is accessed. A synthetic valid v2 intent then targets that duplicated UUID. Both restored windows expose the duplicate, recovery reports no unique match, both window contents and saved records remain unchanged, and the journal remains. Repeated on the restored normal binary. This proves bounded duplicate persisted identity refusal, not late-arriving duplicate ownership or malformed-record handling.

All four crash cases, normal-binary duplicate refusal and normal A→B→A switching with explicit completed saves pass. The initial immediate B→A attempt was refused by the complete-saved-window guard; that failure is retained. A second snapshot sampled one source-removal callback before completion; final verification waits for the journal acknowledgement and exact final tab count. Both attempts are retained. Immediate reverse-switch acceptance is not claimed. Native diagnostics removed byte-for-byte; normal binary rebuilt and tested. Two guarded incremental builds only: diagnostic wrapper 38.65s and normal restore 37.91s. Final zero-action guard 5.16s. Product source unchanged from536e33bd; prior measured44files/107hunks within44/120 remains unchanged, not re-enumerated. Test profiles/server removed; retained preview untouched, host unavailable so original tabs not reverified.

Remaining: metadata save acknowledgement/crash before identity persistence, late or overlapping session restores, malformed persisted identities, crash during v2 recovery itself, groups/pins/unsaved page state across these exact boundaries, arbitrary interleavings and power-loss/deletion durability. Full multiwindow recovery acceptance and public Spaces controls remain open. Native input pending, latency deferred, Electron diagnostic build unapproved. Other Task0/F12 gates unchanged. Routine evidence/testing only; cold-build ledger unchanged.

Evidence: `evidence/ui138-window-recovery-boundaries-20261019/`.

## Interrupted recovery and malformed identity — October 19, 2026

Four version-2 recovery interruption schedules pass. Each starts with two regular windows, persists their distinct UUIDs, crashes after the first destination tab during a switch, then restarts with real session restoration and crashes again during automatic source recovery: first/all source tabs staged, first/all prior tabs removed. The exact recovery marker is recorded and the journal remains byte-identical across the second crash. A third launch without the crash flag restores exactly the saved source content under its original UUID, preserves the decoy and saved records, and clears the journal. This is bounded process-crash coverage, not power-loss or every callback interleaving.

Two synthetic malformed persisted identity cases pass on the restored normal binary: 36 invalid characters and an uppercase UUID. Only owned disposable plaintext/mock-encrypted session records are mutated using Chromium's public mock keychain. Restored source identity is empty, the decoy retains its valid identity/content, both windows and saved records remain unchanged, recovery reports no unique match, and the valid journal remains. No fallback UUID is invented. This does not qualify malformed serialized lengths, missing metadata save acknowledgement, or late-arriving restore windows.

Temporary diagnostics removed byte-for-byte and normal binary rebuilt. Incremental wrappers: diagnostic 39.02s, normal restore 36.82s; final guard0/3.28s. Product source unchanged; prior measured44files/107hunks remains unchanged within44/120, not re-enumerated. Owned profiles and fixture server cleaned; retained preview untouched, host unavailable so its original tabs not reverified.

Remaining: metadata save acknowledgement/crash before initial identity persistence, late or overlapping restores, malformed session serialization and journal variants, groups/pins/unsaved state at these boundaries, arbitrary scheduling and power-loss/deletion durability. Full Spaces acceptance/public controls remain open. Native input pending; latency deferred; Electron diagnostic build unapproved. Task0/F12 gates unchanged. Routine testing evidence only; cold-build accounting unchanged.

Evidence: `evidence/ui138-recovery-interruption-20261019/`.

## Metadata save ordering and delayed session restore — October 19, 2026

**Save acknowledgement remains an observed failure/gap, not a pass.** The disposable browser's first Session-file write (8-byte header) was held before the syscall. UI initialization, distinct window UUID generation, saving A/B and a complete Spaces switch to B all succeeded while that Session file remained zero bytes. The hook was then released and the disposable browser shut down normally. This directly proves that queued identity registration is not a prerequisite completion acknowledgement for switching. The experiment did not simulate power loss or claim a lost-data recovery outcome; it identifies the missing ordering gate. The harness's `pass` means it reproduced this observation, not that the feature meets durability acceptance.

Source audit: `components/sessions/core/command_storage_manager.cc` Save() invalidates its timer, posts AppendCommands to a sequenced backend and provides only an error callback. HasPendingSave() reflects timer state, not completed IO. Clear/encrypted backends have staged selection rules and delayed encryptor availability. `command_storage_backend.cc` AppendCommandsToFile returns write status internally; no success acknowledgement is propagated through the inspected SessionService path. A delay, an empty pending queue, or AddWindowExtraData returning cannot be treated as durable completion.

**One delayed-restore schedule passes.** With two previously saved windows and a valid synthetic v2 intent, a real Session-file read was held on the backend. A third unrelated regular window was opened via CDP while the read remained held. Its snapshot had no recovery mutation/error and the journal remained. After release, the two real session windows restored; the UUID-matching source recovered, both original saved records and the original decoy remained unchanged, the new third window remained, and the journal cleared. Nonowner windows retained the already-known status error after recovery; this is not a full overlapping/late-duplicate restore qualification.

No product source change or native build. A scoped diagnostic dylib intercepted only owned disposable Session paths; public mock keychain, no real profile/keychain access. Zero-action final guard. Prior measured44files/107hunks unchanged, not re-enumerated. Owned profiles/server removed; retained preview untouched, host unavailable so original tabs not reverified. Evidence includes actual syscall paths/PIDs, before/after snapshots and invocation records.

Required next implementation: carry an identity-generation-specific successful save result from the authoritative session backend to the browser owner; define write-vs-flush guarantees explicitly; refuse/defer destructive switching until that generation is acknowledged; keep errors, encryptor delay and owner destruction fail-closed. This needs a concrete upstream patch inventory before changing the44/120 ceiling; no budget increase or acknowledgement implementation is claimed here. Also still open: late duplicate restoration, multiple overlapping restorer lifetimes, save failures, rebuild/rotation ordering and power-loss durability. Native input pending, latency deferred, Electron diagnostic build unapproved. Plan remains in progress; cold-build accounting and other Task0/F12 gates unchanged.

Evidence: `evidence/ui138-session-save-restore-20261019/`.

## Save acknowledgement implementation proposal — October 19, 2026

The owner requested a fix for the reproduced metadata ordering gap. An **unapplied** patch sketch adds a successful flush result from the selected session backend through CommandStorageManager and SessionServiceBase. It measures **five new upstream files and seven added hunks**, projecting **49 files / 114 hunks** from44/107. The existing44/120 ceiling remains unchanged pending explicit owner approval. No Chromium files/output/profile changed and no build started for this sketch.

New paths: `components/sessions/core/command_storage_backend.{h,cc}`, `components/sessions/core/command_storage_manager.{h,cc}`, and `chrome/browser/sessions/session_service_base.h`. The already-patched session_service_base.cc gains the forwarding method. Counts compare pristine/current/drafted text with the pinned diff flags and record Git version. Candidate API text is reviewable in the evidence directory, not a compiled implementation or acceptance result.

Implementation contract: immediately queue the exact owner UUID again, then request SaveAndFlush; wait for the authoritative clear/encrypted backend and delayed encryptor operations in sequence. A matching owner/generation callback, successful append state and file flush are required before switch intent/staging. Reject busy/pending/error/dead-owner or changed-identity completion; never infer success from timer expiry. Use a weak owner lifetime and a bounded fail-closed timeout if callbacks are dropped during shutdown. Inspect rebuild/write-error ordering and add a generation token to the backend result if a later rebuild could mask failure of the requested batch. The sketch shows the transport/flush seam; that generation validation and the Blanc-owned switch gate must be completed before it is considered correct. Flush success is an OS file-flush acknowledgement, not a claim about hardware/power-loss durability.

Required checks: replay the held-first-write reproducer and prove switching cannot stage/delete tabs while blocked; release and prove matching-generation success permits switching. Inject write/flush errors, delayed encryptor readiness, owner close, identity replacement, rebuild/rotation and callback timeout; preserve source on each refused attempt. Rerun late restoration, duplicate/malformed identities and recovery crash boundaries. Keep all builds incremental and recount before/after. Up to120 hunks remains the proposed limit, with no automatic relaxation if final implementation exceeds it.

Awaiting only the specific file-budget decision: raise44→49, retain120hunks. Plan remains in progress; save-acknowledgement runtime gap remains open. Native input pending; latency deferred; Electron diagnostic build unapproved.

Evidence: `evidence/ui138-save-ack-design-20261019/`.

## October 19 save acknowledgement budget approval
Owner explicitly approved: "Raise to 49 files; keep 120 hunks" for the five reviewed acknowledgement paths. Historical counts remain historical. No other scope/build/acceptance limits change.

## Metadata save acknowledgement implemented — October 19, 2026

Owner approval recorded: **"Raise to 49 files; keep 120 hunks"**. Fresh inventory measures **49 upstream files / 114 hunks**, within that limit. Five new upstream session manager/backend/header paths provide a save-and-flush reply through the already-patched SessionServiceBase. The historical 44/107 measurements remain historical.

Before a destructive Spaces switch, the browser queues its exact durable window UUID again, requests a save, and waits for the selected authoritative session backend's valid-file/initial-marker state and OS file-flush result. The requested append is queued before its flush on the same backend sequence; delayed encrypted operations queue append before flush. A failed append closes the backend file, so the immediately following flush refuses rather than acknowledging a later rebuild. No UI task yield occurs between scheduling the batch and its flush. The callback is bound to the owner browser, source capture and a monotonically increasing request generation. Missing/dead/changed owners or sources, errors and stale completions cannot create an intent or stage/remove tabs. This is an OS file-flush acknowledgement, not hardware or power-loss durability.

An initial runtime test exposed a second bug: the native 15-second deadline exceeded the bridge's 10-second deadline, allowing a late completion after the caller timed out. The native deadline is now eight seconds. The failed test is retained. The corrected test receives the native timeout, releases the held write, proves the late callback does not switch, and then completes an explicit retry.

Bounded runtime passes:
- A real first Session write held before its syscall leaves the file at zero bytes, source tabs unchanged and no switch journal; releasing it permits the switch. Repeated with encrypted-only storage selected explicitly, holding the actual Sessions_Encrypted file.
- Injected write EIO and both macOS flush mechanisms failing preserve source tabs and saved records, create no journal, return an error, and allow an explicit retry after injection is removed. Tested under the default configuration, explicit clear-only and explicit encrypted-only storage; default configuration is not assumed to select a particular authoritative backend.
- Source navigation while acknowledgement is pending rejects the stale source capture; the changed page remains and an explicit save/retry succeeds.
- The delayed Session read/third-window restoration schedule passes again. Duplicate persisted UUID, invalid UUID and uppercase UUID regressions safely refuse recovery with records/windows preserved.

Build accounting: one retained compile failure (38.61s wrapper; incomplete SingleThreadTaskRunner type), successful continuation 57.32s, timeout repair 39.36s. All incremental, same output and unchanged GN/toolchain. Final guard schedules zero actions (6.04s). Five focused tests, 11 patch-budget tests and three-module lint pass. Disposable profiles and servers cleaned; retained preview untouched, its host unavailable so original tabs are not reverified.

Remaining qualification gaps: forced delayed-encryptor initialization, explicit owner destruction while waiting, identity replacement during the wait, adversarial rebuild/rotation schedules, late duplicate/overlapping restores, malformed serialization, power-loss/hardware durability and arbitrary lifecycle interleavings. Prior staging/removal crash schedules were not rerun this checkpoint. No full Spaces acceptance or public-controls promotion. Native input pending; latency deferred; Electron diagnostic build unapproved/unstarted. Task 0/F12 gates and cold-build accounting unchanged.

Evidence: `evidence/ui138-save-ack-20261019/` (runtime failures retained alongside final passes).

## Delayed encryptor delivery and owner destruction — October 19, 2026

Four bounded schedules pass: owner destruction while a real first Session write is held, delayed encryptor delivery followed by release, delay through the native acknowledgement timeout followed by release/retry, and source-owner destruction while encryptor delivery is delayed. The normal binary repeats the held-write owner test after diagnostic removal.

The temporary diagnostic pauses the SessionRestore manager's OnEncryptorReady handoff before encrypted-backend construction, only for the exact owned disposable profile. It retains the real encryptor and reschedules through the manager's weak pointer; it does not block the UI thread while waiting. Explicit encrypted-only storage is selected. Three pending operations are observed after requesting the switch, no encrypted Session file exists, source content remains intact, and no switch journal appears. Release permits the queued append/flush acknowledgement and switch. Holding beyond eight seconds returns the native error; release cannot revive the expired switch and an explicit retry succeeds. This qualifies delayed delivery to the session manager, not a real OS keychain/provider failure or cryptographic computation delay.

For owner destruction, CDP closes the source window's actual page targets while an unrelated regular window keeps the profile alive. The source owner disappears before release. After release and the old timeout deadline, no journal or replacement destination appears, the surviving window retains its UUID/content, and that window can save and switch normally. Closing tabs one at a time legitimately changes the saved source through exit flush: an initial overly broad assertion expecting the pre-close store failed and is retained. The final assertion snapshots the store immediately after owner closure and proves the late acknowledgement does not change it. This does not claim whole-window-close preservation of the original tab set or destruction of the entire profile/session manager.

An initial diagnostic launch failed Chromium's blocking-I/O DCHECK before acceptance. The profile-scoped test hook was corrected with a test-only blocking allowance for its local marker checks; the UI delay itself uses asynchronous timers. The failed launch and timeout remain archived. All diagnostic code and its temporary include were removed byte-for-byte afterward; the normal binary was rebuilt and tested. No product-source change from 5c47643a.

The diagnostic inventory measured 49 files/115 hunks initially and 49/116 after its correction, both within the approved 49/120. Restoring the exact source returns to the prior measured 49/114; that final count is source-equality backed, not a new full inventory. Only incremental builds used the existing output; no GN/toolchain changes or cold-build accounting changes.

Remaining: complete profile/session-manager destruction during acknowledgement, provider failure rather than delayed delivery, identity replacement, adversarial session rebuild/rotation, overlapping/late duplicate restoration and arbitrary scheduling/power-loss durability. Full Spaces acceptance remains open. Native input pending; latency deferred; Electron diagnostic build unapproved/unstarted. Retained preview untouched; host unavailable, so original tabs not reverified. Owned profiles/server removed.

Evidence: `evidence/ui138-save-lifetime-20261019/`.

Incremental wrapper times: initial diagnostic 34.75s, repaired diagnostic 36.45s, normal restore 33.55s. Final guard zero actions / 3.94s. 67 archived members verified against SHA-256. No new unit-test pass claimed for this evidence-only checkpoint.

## Profile shutdown and unavailable-provider acknowledgement — October 19, 2026

Two full-browser graceful shutdown schedules pass with an acknowledgement pending. In the first, the SessionRestore manager's real encryptor handoff is delayed and its destructor records three pending encrypted operations. In the second, the first encrypted Session write is held before its syscall; the session-manager destructor is observed before the write is released. Both processes exit with code zero, no switch journal appears, saved Spaces remain unchanged, and a new process using the same disposable profile can save and switch successfully. These tests cover complete application/profile teardown, not hot deletion of one profile while another remains running, or arbitrary forced termination.

The unavailable-provider case supplies a non-null Encryptor with no keys at the SessionRestore manager handoff. The diagnostic confirms IsEncryptionAvailable is false and EncryptString returns nullopt. With encrypted-only session storage selected, two actual switch attempts return the native metadata-save error; source tabs and saved records remain unchanged and no journal is created. No cleartext Session file is observed in this fixture. Clean shutdown exits zero, and restart without the injected unavailable encryptor successfully switches. This is a simulated provider-failure result at the consumer boundary, not a real macOS keychain denial, provider IPC failure, permanent key loss, or in-process provider recovery. The real keychain is untouched; the public mock-keychain mode is used throughout.

A temporary hook scoped to the exact disposable profile records session-manager destruction and holds/replaces encryptor delivery. Its initial two compile failures (private Mojo tag constructor, then missing protected ref-counted destructor) are retained. A first delayed-shutdown run passed teardown but attempted its post-restart save before the page settled; the complete-saved-window guard refused it. That failure is retained; the final harness waits for page readiness before saving. All diagnostic source/include changes are removed byte-for-byte, and the normal binary is rebuilt and passes save/switch, graceful exit and restart/switch checks.

Diagnostic inventory: 49 files / 117 hunks, within the approved 49/120. A pinned-flags recheck confirms the corrected diagnostic manager still has the same four hunks. Normal source equality returns to the prior measured 49/114; no new full normal inventory is claimed. All builds are incremental in the existing output. No product-source changes from 5c47643a; no GN/toolchain or cold-build accounting changes.

Remaining: hot profile deletion/unload, genuine OS/provider failure modes and same-process provider recovery, missing-key decryption of existing records, identity replacement, adversarial session rebuild/rotation and arbitrary lifecycle/power-loss schedules. Full Spaces acceptance remains open. Native input pending; latency deferred; Electron diagnostic build unapproved/unstarted. Owned profiles/server removed; retained preview untouched, host unavailable so original tabs not reverified.

Evidence: `evidence/ui138-save-provider-20261019/`.

Incremental wrapper times: failed diagnostic attempts 7.46s / 10.82s, successful diagnostic 33.24s, normal restore 33.58s. Final guard zero actions / 3.53s. 63 archived members verified against SHA-256. No new unit-test pass claimed for this evidence-only checkpoint.

## Windows uBO Retry recovery asset fix — October 19, 2026

The Windows desktop failure on caddd938 occurred while the browser was still alive: the provider reported failed/ubo-background-crashed with its recovery budget exhausted. Settings view 58 was focused at 1792449081225 and closed at 1792449089228 by discardFailedUtilitySheet, matching the eight-second navigation watchdog. The later process exit zero was test cleanup, not the initiating failure. The log does not identify which pending resource caused the Windows load stall.

The recovery page previously re-entered Electron's network stack through net.fetch(file:) for bundled HTML/scripts/styles. It now reads already-allowlisted local assets asynchronously and returns explicit MIME types with nosniff, including the existing exact branding endpoint. URL resolution, IPC ownership, CSP, external blocking and the eight-second hung-sheet deadline are unchanged. This removes the internal file-fetch dependency during provider loss; it does not claim that a native Windows trace proved the exact blocked resource. The desktop regression deliberately holds file fetches and requires visible Retry with zero such calls. A focused native probe also clicks Retry and requires ready afterward. The audit inventory is refreshed.

No Chromium source/output/profile changes or builds. Upstream footprint remains the prior measured 49 files/114 hunks; no fresh inventory claimed. Latency deferred, native input pending, Electron diagnostic build unapproved/unstarted. Windows acceptance remains dependent on new-head CI; no historical pass is substituted.

Validation: focused native probe passes visible Retry, zero file-fetch dependency and actual Retry click to ready; the old source fails the same injected-stall probe before Settings becomes available. The original Mac full uBO suite and updated full suite both pass (natural Windows timing not reproduced locally). Unit batches pass 24/24 and 36/36, with overlap; scoped lint and audit inventory check pass. Missing-dependency/sandbox setup failures and an initial focused-probe hook typo are retained. No Electron source build was performed; tests use official Electron 44.8.0. New-head Windows CI remains pending.

Evidence: `evidence/ui138-retry-assets-20261019/`.

## Identity replacement and session rebuild/rotation — 2026-10-19

Tests exercise the real native UUID replacement, SessionService reset and current-to-last-session rotation APIs through a temporary control restricted to the exact disposable profile. The write interposer holds the first actual Session header write before its syscall; PID/path and zero-byte file are checked. Both explicit clear-only and encrypted-only session storage use the public mock keychain, never the real keychain.

The established-profile matrix first performs a clean close and restore. Identity replacement while a save acknowledgement is pending rejects the switch before a journal or tab mutation; a fresh save/switch succeeds. Reset and rotation are requested both before acknowledgement starts and while it is pending. The switch stays pending with no journal while the write is held. Successful cases verify the source UUID and untouched decoy contents after an actual owned-browser SIGKILL and session restore. Rotation also requires an observed new Session filename. This does not prove power-loss durability, all rebuild reasons, or arbitrary simultaneous external writes.

A separate fresh-profile first-crash attempt failed to restore the two windows, returning one new blank window instead. That remains an unresolved runtime gap, not a passing matrix cell. The initial cached-identity assertion has a preserved result. A later host-startup timeout and sandbox process-inspection refusal remain in the invocation history; their same-name log files were overwritten by later runs, as explicitly recorded in additional-attempts.txt. The final matrix uses a cleanly primed profile and must not be described as first-ever-session crash coverage.

The first normal-binary smoke attempted to save/switch while restored pages still reported loading and timed out waiting for B; its result/log are preserved. The repeat waits for restored pages before saving. Temporary native diagnostics are removed byte-for-byte and the normal binary rebuilt and checked. Product source is unchanged. Fresh diagnostic inventory is 49 upstream files / 114 hunks; the native diagnostic is in a Blanc-owned file, excluded by the established counting rule. Normal source restoration preserves that footprint within 49/120. All builds use the existing incremental output; no cold-build figures change.

Remaining: first-run crash restoration, arbitrary rebuild/rotation failure schedules, real keychain/provider faults, hot profile deletion and wider lifecycle/power-loss cases. Native input remains pending, latency deferred, and the Electron diagnostic build unapproved/unstarted. Retained preview is untouched; its host is unavailable, so original tabs are not reverified. Owned test profiles/server are removed.

Evidence: `evidence/ui138-save-rotation-20261019/`.

Ten final diagnostic schedules and one normal-binary smoke pass. Incremental wrapper times: diagnostic 41.29s, normal restore 41.27s. Final guard zero actions / 6.2s. 129 archived members verified against SHA-256. No new unit-test pass claimed for this evidence-only checkpoint.

## First-run profile prerequisite for session acknowledgement — 2026-10-19

Reproduced on the prior normal binary: a first-run Spaces switch completes with a 20,992-byte Session file but no Default/Preferences. After SIGKILL, --restore-last-session produces one new blank window. ProfileImpl::IsNewProfile derives new-profile status from preference-store initialization, and StartupBrowserCreator::GetSessionStartupPref ignores forced restoration for new profiles. This is separate from Chromium's intentional crash-loop protection, which normally requires the recovery prompt after a persisted Crashed exit marker.

The existing Blanc integration now waits for PrefService::CommitPendingWrite after successful authoritative Session save/flush, then checks on the disk sequence that Preferences is a readable JSON dictionary. PrefService's callback alone does not report write failure. The original owner/UUID/capture/generation guards and eight-second timeout still gate journal creation; late completion cannot start a switch. No preferences are fabricated or directly written by Blanc. This checks profile initialization readiness, not that every changed preference has persisted when an older valid Preferences file already exists.

Six bounded runtime checks pass: first-ever-profile crash restoration with clear-only and encrypted-only sessions, held Preferences rename/release, rename EIO refusal, held replacement beyond timeout with stale completion ignored, and source navigation while replacement is held. Both first-run cases verify Preferences exists with Crashed exit marker, exact source UUID/URLs, and untouched decoy identity/URLs after restore. Automated restoration uses --hide-crash-restore-bubble only on the disposable restart so the native engine can be tested while native input is pending. Production crash prompting is unchanged; physical Restore-button acceptance is not claimed. This is not general automatic crash recovery or first-run recovery without a Spaces acknowledgement.

The old-source failure and an initial observer failure that assumed Preferences already existed are retained. Injected errors target only the disposable Preferences rename; no real disk, keychain or retained profile is changed. Five capture/window-identity unit tests pass. Prior ten rebuild/rotation schedules are not rerun on this checkpoint; broader lifecycle/provider/power-loss qualification remains open.

One guarded incremental build: 38.38s wrapper / 34.54s Siso, six steps. Final guard: zero actions / 3.59s. Product changes are confined to the Blanc-owned integration file; upstream footprint remains the prior measured 49 files / 114 hunks within 49/120, not newly re-enumerated. No diagnostic native control remains. Latency deferred; native input pending; Electron diagnostic build unapproved/unstarted. Plan remains in progress.

Evidence: `evidence/ui138-first-session-20261019/`.

67 archive members verified against SHA-256. Owned profile/server and stopped raw profile snapshot removed; retained preview untouched, host unavailable so original tabs not reverified.

## Identity/rebuild/rotation rerun on the profile-persistence fix — 2026-10-19

Rerun against 6c1135a1, including its PrefService completion and readable-profile check. The same ten schedules cover clear-only and encrypted-only storage: identity replacement while acknowledgement is pending, and real SessionService reset/rotation before or during pending acknowledgement. A held first Session write proves no early journal. Identity change must refuse without source/store mutation and permit a fresh retry. Reset/rotation must complete after release. Actual process crash/restoration verifies source UUID and exact source URLs, decoy UUID/URLs, and absence of unfinished switch intent; rotation additionally requires a new Session filename.

Profiles are cleanly primed, matching the earlier matrix. Disposable restarts now explicitly use --hide-crash-restore-bubble because the fix correctly persists the Crashed exit marker. This is an automated restoration-engine test, not native Restore-button acceptance or a production prompt-policy change. The separate first-run checks remain at ui138-first-session-20261019.

Temporary test control is restricted to the exact disposable profile, removed byte-for-byte afterward, and the normal fixed binary rebuilt and smoke-tested. No product-source change. Upstream footprint remains the prior measured 49 files / 114 hunks within49/120; Blanc-owned temporary controls do not add upstream paths. No new inventory or unit-test count is claimed. All builds incremental in the existing output.

Remaining: physical recovery UI, arbitrary overlapping/external writers, real provider failures, hot profile deletion, wider lifecycle and power-loss qualification. Latency deferred; native input pending; Electron diagnostic build unapproved/unstarted. Plan remains in progress. Owned test profiles/server removed; retained preview untouched and unavailable, so original tabs not reverified.

Evidence: `evidence/ui138-save-rotation-fixed-20261019/`.

Ten final diagnostic schedules and one normal-binary smoke pass. Incremental wrapper times: diagnostic 38.36s, normal restore 38.86s. Final guard zero actions / 3.58s. 121 archived members verified against SHA-256. No new unit-test pass claimed for this evidence-only checkpoint.

## Malformed Spaces recovery journals — 2026-10-19

Eight bounded native checks pass on the normal f45e4107 binary. Synthetic truncated JSON, unsupported version, missing window identity, non-string identity, out-of-range active tab, unsafe file URL and invalid group index are refused with an error. Each retains the exact journal bytes, preserves both source and decoy UUIDs/URLs and the saved store, and refuses a save while recovery is unresolved. A valid v2 control recovers the source and clears its journal while preserving the decoy and store.

The encrypted-session disposable profile uses the mock keychain and cleanly persisted two-window state. Restarts explicitly use the diagnostic crash-bubble bypass only in this test profile; no native recovery-button acceptance is claimed. Invalid journals are replaced only while the test browser is stopped. These are authored serialization negatives, not physical disk corruption, power loss, or exhaustive parser/lifecycle qualification.

Two initial seed attempts failed in the harness: the shell selected Node20 without global WebSocket, and the helper caught that error as host-not-ready. Both failures are preserved. The complete matrix uses bundled Node24.19.0. No product changes or native compilation; final check-only guard schedules zero actions (4.81s). Prior measured footprint49files/114hunks is unchanged within49/120, not re-enumerated. Owned profile/server removed; retained preview untouched and host unavailable, so original tabs not reverified.

Remaining: actual OS provider faults, hot profile deletion, arbitrary overlapping restore/writers, unsaved state and power-loss qualification; full Spaces acceptance remains open. Native input pending, latency deferred, Electron diagnostic build unapproved/unstarted. Evidence: `evidence/ui138-journal-validation-20261019/`.

66 archived members verified against SHA-256. No new unit-test count claimed.

## Overlapping restore and unsaved page state — October 19, 2026

A held actual Session read overlaps two new regular-window creations and closure of one of those windows. The journal remains while held. After release, the original source UUID/URLs recover, the original and surviving new decoys remain, saved Spaces are unchanged and the journal clears. Two bounded runs pass. This is one delayed session restoration with concurrent window activity, not two independent overlapping SessionRestore operations or arbitrary interleavings.

A live authored form with a beforeunload handler refuses switching before any journal/tab/store mutation and preserves its typed value and 700px scroll. After removing the handler and crashing the owned browser, a synthetic valid v2 intent exercises source rollback. The settled-session repeat restores the saved source structure, but the form value is empty and scroll is zero: **unsaved form and scroll recovery fail**. The harness's procedural pass does not mean those acceptance cells pass. The recovery record carries URLs/group/pin/active structure, not live document state; full Spaces acceptance remains open.

An initial immediate crash attempt timed out waiting for three windows and journal clearance. It is retained as unresolved; adding four seconds of session-settling before the repeat is a narrower test, not a product fix or proof of the cause. Nonowner recovery-status errors also remain visible after successful source recovery. No arbitrary overlap, history/form serialization or power-loss claim.

Only disposable profiles and the public mock keychain were used. The Session read interposer is confined to the disposable launch; the final restart uses the normal binary without injection. Explicit crash-bubble bypass is test-only, not physical Restore acceptance. Test helper compilation is not a Chromium build. No product changes or native compilation; final guard zero actions/4.04s. Prior measured49files/114hunks unchanged within49/120, not re-enumerated. Owned browser/server/profile removed; retained preview untouched/unavailable.

Native input pending, latency deferred, Electron diagnostic build unapproved/unstarted. Remaining: exact concurrent restoration scheduling, immediate post-restore crash behavior, unsaved document state, real provider/hot-profile/power-loss qualification. Evidence: `evidence/ui138-overlap-unsaved-20261019/`.

39 archive members SHA-256 verified. No new unit-test count claimed.

## Preserve session-restored page state during Spaces rollback — October 19, 2026

The old rollback reopened every source URL even when Chromium had already restored the exact source window, destroying its restored page state. After the existing durable UUID, SessionRestore-in-progress, capture and live-tab-ID guards, a complete matching session-restored window is now retained. Its existing tab IDs enter the same completion/journal-clear checks. Mismatching/partially staged windows continue through the existing source reconstruction path. No renderer form extraction or extra plaintext form storage is introduced.

A named authored form populated through CDP Input.insertText and a 700px scroll establish the regression: ordinary settled session restoration retains both; old Spaces rollback loses both; the fixed binary retains both. The earlier fixture used autocomplete=off and direct value assignment, so it was not an adequate guarantee of Chromium form serialization; that limitation is corrected explicitly rather than rewriting historical evidence. beforeunload refusal remains passing. Eight malformed/valid-journal regressions and five focused capture/identity tests pass.

Immediate-crash investigation: cleanly primed two-window and held-read/overlapping three-window repeats recover the expected structural state without the four-second settling pause, but lose very recent form/scroll updates. A no-Spaces immediate control loses those updates too. Source audit records Chromium's delayed page-state synchronization and 2.5-second session-save timer. This explains the unpersisted-state limitation, not the original timeout: **that earlier timeout was not reproduced and its cause remains unresolved**. A separate unprimed control timed out with one new window, retained as a profile-initialization limitation; it must not be substituted as proof of the historical timeout's cause.

This fix preserves state Chromium actually restored. It does not serialize arbitrary DOM state, recover edits lost before session persistence, or retain forms when a partially staged window must be reconstructed from URL/group/pin records. Full unsaved-state and lifecycle acceptance remains open. Password/disabled-autocomplete semantics remain Chromium-owned. Nonowner recovery-status errors remain a separate gap.

One guarded incremental build:42.84s wrapper/36.46s Siso/six steps. Final guard zero/3.49s. Only Blanc-owned source changes; prior measured49files/114hunks unchanged within49/120, not re-enumerated. Test interposer compilation is separate from native build cost. No cold output, GN or toolchain changes. Disposable profiles/servers removed; retained preview untouched/unavailable. Test-only crash-bubble bypass is not native input acceptance. Latency deferred; native input pending; Electron diagnostic build unapproved/unstarted. Evidence: `evidence/ui138-state-preservation-20261019/`.

134 archived members SHA-256 verified; failed/control results remain included.

## Partial Spaces page-state recovery by durable tab identity — October 19, 2026

Version-3 switch journals now carry source tab UUIDs. The existing session metadata acknowledgement includes those UUIDs, and two hooks in already-patched session files preserve them through session rebuild/restoration. Recovery reuses only session-restored tabs whose durable identity and URL both match the source record; missing tabs are reconstructed and staging/imposter tabs removed. The durable window UUID, restore-in-progress, live-tab/capture and completion checks remain. No form contents are extracted into the Spaces store. Versions 1/2 remain supported; only v3 can supply validated tab identities, and malformed/duplicate source identity lists fail closed.

The final binary preserves the authored surviving form and 700px scroll in a partially reconstructed source window containing a missing New Tab, an extra destination tab and a same-URL imposter with different form contents. The imposter is excluded, the missing tab reconstructed, the decoy window unchanged and the journal cleared. The journal is captured from a real switch after acknowledged metadata persistence; the partial session shape is deliberately constructed and cleanly persisted, not a claim of crashing at every staging instruction. Five malformed identity-list cases retain their exact journals/windows/store, and a legacy v2 journal with an unvalidated extra v3 field is handled by the legacy path. The grouped variant also preserves the blue collapsed group and pinned slot. Its follow-on switch exposed an order regression; a native trace showed an old pinned tab still present after asynchronous close, constraining absolute moves. Final staging uses the returned WebContents directly and orders desired tabs at the unpinned end before assigning pins/groups, while completion still waits for the exact final capture. Ordinary and grouped A/B switching pass through journal completion. Five focused capture/identity tests pass.

Three fresh immediate-crash probes on the final normal binary (ordinary restoration plus two legacy-v2 Spaces repeats) restore the expected two-window structure without timeout. All lose the edits made just before the crash, including the no-Spaces control. The original three-window immediate timeout remains unreproduced and unresolved; these observations do not establish its cause. Observed restart completion intervals are diagnostic timestamps, not latency qualification. Recovery still cannot restore document state absent from Chromium's persisted session, including removed source tabs or very recent edits. Nonowner recovery-status errors and wider lifecycle/identity corruption coverage remain open.

Build record: initial incremental compile failed on a missing WebContents forward declaration (13.08s); repaired incremental build63.18s wrapper/59.34s Siso/18steps; validation hardening incremental39.05s/35.15s/sixsteps. Final guard zero actions/4.51s. The complete build invocation table, including the ordering repair and diagnostic iteration, is recorded in the evidence README. Fresh inventory49files/116hunks within approved49/120, two additional hunks in existing paths. Temporary native ordering logs were removed before the final build. No cold output, GN/toolchain changes or native-input/latency runs. The local ESLint invocation was unavailable because this checkout lacks its eslint dependency; module syntax and focused tests passed, with CI pending. Failed fixture API/background-target and stale-marker attempts are retained, not counted as acceptance.

Native input remains pending; latency deferred; Electron diagnostic build unapproved/unstarted. Test-only crash-prompt bypass and mock keychain are confined to disposable profiles. Evidence: `evidence/ui138-partial-state-20261019/`. Plan item4 and broader Spaces acceptance remain in progress.

324 archived members SHA-256 verified. Owned profiles/servers removed; retained preview untouched/unavailable. Normal final incremental40.12s/34.55s Siso/sixsteps; temporary diagnostic38.93s and ordering attempt40.76s are also separately logged.


### October 19 — Missing-tab page state and immediate-crash diagnosis (in progress)

Added durable tab identity to Chromium closed-tab metadata through the existing BrowserLiveTabContext integration. V3 Spaces recovery waits for closed history to load, rejects duplicate matching identities, and can restore a uniquely identified ungrouped top-level closed tab through Chromium's native navigation-state restoration. Identity and committed URL must both match; no URL-only lookup and no form contents added to the Spaces journal. Group/window history entries, grouped tab entries, absent/pruned history and unpersisted edits remain unqualified. Closed history is retained, not consumed by this bounded path; subsequent duplicate identity records deliberately refuse recovery and require further lifecycle coverage.

Two disposable missing-tab runs, including the final bounded binary, recover the closed HTTP source's saved form text and scroll700. A same-URL imposter is excluded, the surviving New Tab and decoy window remain, the journal clears, and A/B/A switching passes. These construct a partial persisted session after authentic journal capture; they are not every possible crash instruction boundary. The focused identity-hook test passes. Evidence: [missing-tab checkpoint](evidence/ui138-missing-state-20261019/README.md).

The original three-window overlap schedule now reproduces the immediate timeout with observations: source and original decoy restore, journal clears and both become idle, but the newly created late-decoy window is absent. The harness times out on its exact-three-window expectation, not on a stuck Spaces transaction. A four-second settled control restores all three and completes. This isolates a persistence-timing boundary but does not prove the precise upstream write that was omitted or fix crash loss of newly created windows. The control's programmatically assigned form value remains absent, while scroll700 restores; this is not a physical typing acceptance test. Earlier typed immediate-edit loss remains open. Nonowner recovery-status errors also remain.

Incremental wrappers only:38.20s (7 Siso steps,34.38s) and39.33s (6 steps,34.47s). Final guard0 actions/3.73s. Fresh footprint49 files/117 hunks within approved49/120; one added hunk in an already patched file. No cold build or Task0 benchmark change. Native input pending, latency deferred, Electron diagnostic build unapproved/unstarted. Broader identity/history lifecycle, nested closed entries, power-loss and original caller/acceptance gates remain open.


### October 19 — Newly created window immediate-crash repair (bounded pass)

The initial-window integration now requests a one-time native Session save/flush after restore finishes and the new regular window's initial navigation settles, instead of relying solely on the ordinary 2.5-second delayed save. It includes all live same-profile window and tab identities in that flush. Callback success is recorded only for the same surviving browser and unchanged captured window; changed captures retry on a later refresh, backend failure remains false/failed. Private windows are excluded. No parallel session format or direct session-file writes were added. The hook runs from the existing host refresh; this is not a guarantee for a crash before the first flush completes or for later unsaved edits.

The original immediate three-window overlap schedule passes with explicit clear and encrypted session storage: source, original decoy and newly created late-decoy all restore with exact UUIDs and URLs, and the recovery journal clears. The new window's save acknowledgement is observed before SIGKILL, without the earlier four-second settled wait. Only disposable restart uses the crash-bubble bypass; native Restore remains pending. Recent programmatically assigned form text and scroll still fail to survive this immediate schedule and are explicitly not claimed fixed.

An initial repair saved the new window but flushed before restored neighbours' UUID metadata was re-enqueued. Both failed clear/encrypted schedules are retained: three windows returned but two identities were absent and recovery safely refused. Including all live identities fixes that observed ordering failure. On the final binary, missing-tab saved form/scroll700 recovery, same-URL imposter exclusion and A/B/A switching also pass. Five focused capture/identity tests pass. Wider overlapping lifecycle, hot profile destruction, initial-window provider/disk fault qualification, grouped/pruned history, duplicate-record lifecycle, first-ever profile persistence and power-loss remain open.

Two incremental wrappers40.19s and38.38s; Siso34.28/34.63s, six steps each. Final guard0 actions/5.51s. All product edits are in the Blanc-owned integration; no new upstream hook/file and no requested budget increase. Existing approved ceiling remains49 files/120 hunks. Evidence: [new-window save](evidence/ui138-new-window-save-20261019/README.md). All owned profiles/servers removed; preview untouched/unavailable, tabs not reverified. Latency deferred, native input pending, Electron diagnostic build unapproved/unstarted. Task0 cold benchmark and other acceptance gates unchanged.

Final inventory confirms49 upstream files/117 hunks, within49/120.


### October 19 — Initial-window save failures and pre-write crash boundary

Six disposable-profile schedules pass their bounded assertions on the unchanged normal binary, in explicit clear and encrypted session modes. Injected EIO at both macOS barrier-flush and fallback fsync sets `initialWindowSaveFailed=true`, while `initialWindowSaved=false`. Removing the fault leaves that failed status during the one-second observation; automatic retry is not implemented or claimed. The new window happened to restore after this flush-error process crash because writes had already reached the OS; that is not durability or power-loss evidence.

Holding the first selected Session write before its syscall keeps both saved/failed flags false. SIGKILL while held loses the new unacknowledged window in both modes, while the previously saved source and decoy return with exact UUIDs/URLs. This is a measured pre-save data-loss boundary, not a recovery pass for that new window. Paired release controls remain unsaved while held, then acknowledge success after release and restore the new window after SIGKILL. Marker PID/path evidence confirms the owned browser and expected clear/encrypted store. The crash helpers match either session store but the recorded selected path is explicitly asserted; release helpers select the exact store. No hardware or power-loss simulation is claimed.

Profiles were primed and cleanly closed before these tests. Restart uses crash-bubble bypass only in disposable profiles; native Restore remains untested. No Chromium source edit or compilation; final guard zero actions/5.16s. Last measured footprint remains49 files/117 hunks within49/120. All six task profiles and servers removed; retained preview untouched (host unavailable, tabs not reverified). Native input pending, latency deferred, Electron diagnostic build unapproved. Remaining gaps include retry after an initial save failure, actual provider/hardware failure, pre-ack recent edits, first-ever profile persistence and broader lifecycle.

Evidence: [initial save boundaries](evidence/ui138-initial-save-boundaries-20261019/README.md).


### October 19 — Automatic retry of initial-window save failures

Failed initial-window Session save/flush attempts now retry from the existing host refresh with exponential delays of1,2,4,8,16 and then30 seconds. The cap bounds retry frequency, not the number of attempts. Only one save may be in flight. Each attempt rechecks regular-profile, restore, settled-navigation and capture eligibility and re-enqueues current same-profile window/tab identities. A weak browser callback and unchanged capture remain required before acknowledgement. The failure flag stays visible until a successful acknowledgement; successful windows stop retrying. Private/restored-window exclusions remain unchanged.

Six normal-binary disposable schedules pass in explicit clear and encrypted modes. Persistent injected flush EIO remains failed/not saved through repeated attempts (three fsync failures observed in each bounded fault window). Removing the fault automatically retries to saved/not failed without an explicit Space command. SIGKILL after that acknowledgement restores the new UUID plus the saved source and decoy UUIDs/URLs. Held-write regressions still report neither success nor failure while pending: killing before the syscall loses the unacknowledged new window, while releasing the write acknowledges and restores it. Pre-flush crash protection is not claimed.

Five focused capture/identity tests pass. One guarded incremental build39.83s wrapper/34.08s Siso, six steps. Fresh footprint49 files/117 hunks within49/120, no new upstream files/hunks. Final guard zero actions/5.11s. No cold build or Task0 benchmark change. All owned profiles/servers removed; preview untouched, host unavailable and tabs not reverified. Profiles were primed; disposable restart alone bypasses the crash bubble. Native input pending, latency deferred, Electron diagnostic build unapproved/unstarted. Long-duration30-second backoff, retry-specific owner destruction or changed-capture schedules, actual provider/hardware failures, first-ever profile persistence and unpersisted recent edits remain unqualified.

Evidence: [initial save boundaries](evidence/ui138-initial-save-retry-20261019/README.md).


### October 20 — Retry backoff and owner/window lifecycle checks

Six disposable clear/encrypted schedules test the unchanged automatic-retry implementation. Long-backoff schedules retain eight failed flush observations with monotonic timestamps, including consecutive30-second intervals, then remove the fault, await successful acknowledgement and crash/restart to verify the new UUID/URL and unchanged source/decoy. These measure retry scheduling, not the deferred performance/latency qualification.

Owner-destruction schedules first cause a save failure, then hold the next retry inside its fallback fsync. Closing that new window before release leaves the two original windows usable; release and later crash/restart do not resurrect the closed owner and preserve source/decoy UUIDs/URLs. Changed-window schedules navigate the retry owner while that flush is held, release it, await successful current capture acknowledgement and verify the changed URL under the same UUID after restart. These are bounded navigation and window-close schedules, not every mutation, entire-profile destruction, or direct observation of every callback rejection branch.

Fault injection is confined to disposable Session paths and validates the owning PID/path. The helper forces the macOS barrier call to fail so fallback fsync can be held; no product controls or native source edits. All task profiles/servers are removed. The first clear long-run cleanup completed owned cleanup but its read-only preview fetch returned ECONNREFUSED; original failure and follow-up are retained. Subsequent cleanup records preview unavailable. Preview untouched; its tabs were not reverified.

No native compilation; guard zero actions/5.32s. Prior measured footprint49 files/117 hunks unchanged within49/120. Native input pending, latency deferred, Electron diagnostic build unapproved/unstarted. Before-ack crashes, first-ever profile persistence, recent unpersisted edits, actual provider/hardware faults, long unattended soak, mutation variants and broader lifecycle remain gaps. Disposable restart alone uses the crash-bubble bypass; no native Restore or power-loss claim.

Evidence: [initial save boundaries](evidence/ui138-retry-lifetime-20261020/README.md).


### October 20 — Retry-specific profile shutdown and tab mutations

Six clear/encrypted disposable schedules exercise the unchanged normal binary. Each first forces initial-window flush failure, then holds the next retry's fallback fsync. Full-browser shutdown is requested while held; releasing the flush allows the process to exit. Restart restores source, decoy and new window UUIDs/URLs. This covers full-browser shutdown and its profile lifetime, not hot deletion of one profile while another remains alive, nor a directly instrumented Profile destructor ordering claim.

Mutation schedules add two tabs and remove the captured original tab during the held retry, or add two tabs and pin the last tab (moving it to the front). After release, a current-state save acknowledgement is observed. An abrupt process crash followed by restart retains exact ordered URLs and pinned flags under the same window UUID, while source/decoy UUIDs and URLs stay unchanged. The pin schedule also requests active-tab selection, but active selection is not asserted across restart and is not qualified here. These are bounded structural changes, not arbitrary grouping, split/move-window, beforeunload, mutation during callback dispatch or every stale-callback branch.

All six task profiles/servers removed; retained preview untouched and unavailable to read-only verification, so its tabs were not reverified. Tests use cleanly primed disposable profiles, explicit clear/encrypted feature flags and disposable restart crash-bubble bypass. No native input claim. No native source change or compilation; final guard zero actions/5.17s. Previous measured footprint49 files/117 hunks unchanged within49/120. Latency deferred; Electron diagnostic build unapproved/unstarted. Hot profile deletion, actual provider/hardware failures, before-ack crash loss, first-ever profile initialization, unpersisted recent edits and broader mutation/lifecycle remain open.

Evidence: [initial save boundaries](evidence/ui138-retry-profile-20261020/README.md).

## October 20 — Primary-window shutdown ordering repair

Windows CI on `35f697d0` passed 39 workspace scenarios and close-to-quit, then failed primary-window Quit with exit `0xC0000005`. The exact native Windows fault site is not established. A new pre-closed-event regression proves the old teardown left both primary pages alive after their native window died; the fixed path drains owned page and utility WebContents while the native window remains alive, resumes close on the next event-loop turn, and preserves the original session checkpoint. Repeated close requests join the same drain. macOS Dock preservation is unchanged.

The old-source ordering regression fails (2 live pages); fixed Windows/Linux routing simulations on this Mac pass, including clean Quit and secondary-only restoration. Close-to-quit simulation and native macOS Dock checks pass. All 88 focused unit tests, full first-party lint and the 55-entry audit inventory check pass. The original sandbox server refusal and initial stale source-wiring assertion are retained in evidence. Actual Windows acceptance remains pending CI; these Mac simulations do not prove the Windows access violation resolved.

Evidence: `evidence/ui138-primary-shutdown-20261020/`. No Chromium compile or upstream patch changes; prior measured footprint remains 49 files/117 hunks. No latency tests, permanent-profile operations or Electron diagnostic build. Native Chromium input remains pending. This Electron shutdown repair is carried on #920 as explicitly requested and requires the hosted platform matrix.

## October 20 — Hot-profile deletion and structural retry mutations

Six bounded schedules pass across explicit clear and encrypted Session modes. Two hot-deletion checks first fail an initial-window save, hold the retry flush, then call Chromium's existing profile-manager deletion path for the disposable Default profile while Profile 1 stays open. After releasing the write, Default disappears from disk and `GetLoadedProfiles`, all its window identities disappear, the same browser process survives and Profile 1 opens another page. A two-second follow-up observes no retry recreation. This is genuine same-process profile deletion through a temporary diagnostic bridge, not the public deletion UI or direct proof of every destructor/callback order.

Four normal-binary mutation/recovery checks pass: create a two-tab named blue collapsed group during the held retry, or move that group into a new window. Save acknowledgement follows the current captures; crash/restart retains the original source/decoy UUIDs and URLs, changed-window tab order, group membership/name/color/collapse, and the moved window's UUID and post-move state. **The move operation expands the group before acknowledgement.** Restart preserves that expanded post-move state; pre-move collapse preservation is not claimed. Active-selection, Glance/splits, arbitrary beforeunload and interleaved move/delete schedules remain unqualified.

The profile-picker attempt did not expose the requested deletion page and was stopped/cleaned; it is not a pass. The group harness initially used the wrong color representation, then retained a pin-specific assertion; both failures are archived. Temporary native instrumentation was restricted to a diagnostic switch and the task's `/private/tmp/blanc-retry-hot-` profile paths. Its first compile failed on an incomplete task-runner type; repair succeeded. Instrumentation was then removed byte-for-byte, the normal binary rebuilt, and all four group/move checks ran on it.

Incremental wrapper times: failed diagnostic compile 19.56s, repaired diagnostic build 45.21s, normal restoration 40.35s. These are routine testing/repair effort, never cold-build cost. Final guard zero actions in 4.89s. No upstream patch changes; prior measured footprint remains 49 files/117 hunks within 49/120. No new runtime fix was required. All task profiles and fixture servers removed; preview untouched/unavailable, tabs not reverified.

Evidence: `evidence/ui138-hot-profile-20261020/`, 300 hash-verified members; archive SHA256 `15791d8fd7cf2afe9583a161aab04e185d6c691a4089491d0b145fb8e06adfb2`. Real encryption-provider/hardware faults, arbitrary lifecycle timing, pre-ack crash durability, and recent unsaved edits remain gaps. Native input pending; latency deferred; Electron diagnostic build unapproved/unstarted. Earlier Task 0 and F12 gates unchanged.


### October 20 — Extensions picker Store discovery

Added an explicit query-encoded Chrome Web Store search action alongside installed-extension filtering. Syntax, scoped lint and automated logic checks pass; assets-only preparation, no native source change. Fresh native search/install walkthrough remains pending. See `evidence/store-search-20261020/README.md`. Latency and Electron diagnostic build remain deferred/unapproved.


### October 20 — Native Store search acceptance

Native picker search → official Extensity listing → permission Cancel and successful install → combined installed/search picker → extension popup → removal all pass in a disposable profile. Safety delay observed. Evidence: `evidence/store-search-native-20261020/README.md`. Inline Store Chrome promotion remains visible but nonblocking; authentication/restart/upgrade not retested. No compile or upstream patch changes; prior 49/117 unchanged. Latency deferred; Electron diagnostic build unapproved.


### October 20 — Inline Store promotion suppressed

Exact English inline Chrome banner removed with sole-control and full-copy guards. Seven tests/scoped lint pass; native picker search, permission Cancel/safety delay/install and removal pass on rebuilt app. Evidence: `evidence/store-inline-banner-20261020/README.md`. One incremental build (35.55s Siso/six steps), final guard zero, prior49/117 unchanged. Other locales/future markup remain fail-visible; no authentication/restart/upgrade claim. Latency deferred; Electron diagnostic build unapproved.


### October 20 — Live Store results inside the Island

The picker now shows up to six live public Chrome Web Store results with names/descriptions alongside installed matches. Cookie-free bounded native fetch, text-only parsing, debounce/stale-reply guards and installed-ID deduplication are in place. Native acceptance passes for inline Extensity results, listing selection, permission text/safety delay/Cancel/install, combined installed + Store results and installed native popup. Five focused tests and scoped lint pass. Evidence: `evidence/store-inline-results-20261020/README.md` (includes isolated test-app identity qualification and initial automation binding issue). One incremental build37.04s/six steps, finalguard0; Blanc-owned changes only, prior49/117 unchanged. Retained preview not restarted. Public English markup compatibility, personalized results, broader responsive/accessibility and restart/update checks remain gaps. Latency deferred; Electron diagnostic build unapproved; prior Task0/F12 gates unchanged.


### October 20 — Store result icons

Official extension icons now accompany inline Store results, fetched anonymously through the browser process with exact-host validation,256KiB/six-second limits and raster-only data URLs. Missing/failed images have a letter fallback. Six focused tests/lint and native Dashlane two-icon rendering, listing selection and permission Cancel pass. Initial remote-img renderer failure retained and replaced by the native fetch path. Evidence: `evidence/store-icons-20261020/README.md`. Incremental builds35.74s/38.21s, finalguard0; prior49/117 unchanged. Retained preview not restarted. Forced CDN-failure runtime, other locales and broader visual gates remain unqualified. Latency deferred; Electron diagnostic build unapproved.

## October 20 — Store install label

Exact top-level Store English Add to Chrome text now becomes Add to Blanc, including aria-label. Existing button/handlers/disabled state retained; installed-state text removes the temporary accessibility override. Eight focused tests pass. Disposable native Extensity 1.14.0 flow passes label/accessible name, original permission text, safety delay, Cancel, successful install and Remove from Chrome state. No account or real profile extension installed. Two incremental builds, final zero-action guard; no upstream footprint change from 49/117. Other locales/future markup remain unchanged. Native UI routing briefly opened a media overlay; dismissed before verification. Retained preview restarted with both New Tab and Dashlane listing restored and Add to Blanc visible. Also includes owner-requested single focus border and Browse app store label. Latency deferred; Electron diagnostic build unapproved.

Evidence: `evidence/store-blanc-label-20261020/`.

## October 20 — Split View baseline correction

Owner directed migration to check Electron PR #993. Pinned review at98ea48fc distinguishes temporary Glance from persistent Split View. `split-view-migration.md` records contract and native gaps. Exact first-party pure model modules imported with hashes; Spaces adapter serializes splits/splitIds and seven unit tests pass. Native snapshot/store/journal/UI integration remains unimplemented; no runtime parity claim. Older promotion draft removed and normal binary restored incrementally. No upstream count change;49/117. Latency deferred, Electron diagnostic build unapproved.

## October 20 — Native Split View persistence and recovery

Implemented a bounded native path based on PR #993 at98ea48fc: one active two-pane columns split, matching string tab IDs, saved widths/focusedIndex, explicit persistent metadata, store v2 and journal v4. Existing unsplit versions remain readable. Native save/reopen, Split/Plain round trip, actual session crash restart, journal-boundary source rollback, equal-pane visibility, 40/60 layout, seven malformed-record refusals and temporary-Glance exclusion across restart pass. Session-rebuild marker loss found during testing was repaired through existing hooks. Eight focused tests and scoped lint pass. Evidence: `evidence/native-split-persistence-20261020/README.md`. Four successful incremental builds plus one retained compile failure; final guard0. Fresh footprint49files/117hunks remains within49/120; no budget increase needed.

Multiple/inactive splits, global split identity, pane headers/rail/public controls, group-policy and whole-split Recently Closed runtime parity, later staging crash boundaries and broader lifecycle/provider faults remain gaps. Native runtime tests use disposable profiles and diagnostic crash-bubble bypass; retained preview untouched. Latency deferred; Electron diagnostic build unapproved.

## October 20 — Multiple and inactive native Split View

Extended PR993-based native persistence to multiple two-pane splits with independent last-focused members, including when a loose tab is active. Focus metadata survives session rebuild/closed-tab capture; native snapshot and restore preserve each membership separately. Two-split Spaces round trips, actual browser crash/session restore, actual journal-boundary source rollback, independent30/70and65/35layouts and repeated clean restart pass. Seven malformed multi-split records are refused unchanged. Initial unequal-width fixture changed the saved source and was correctly refused; final test uses a separate destination. Eight focused tests and scoped lint pass; one56.47s incremental build, idempotentprepare, finalguard0. Fresh49files/117hunks within49/120. Evidence: `evidence/multi-split-persistence-20261020/README.md`.

Runtime qualification is bounded to two splits in a regular disposable profile. Global split identity, historical unknown inactive focus, arbitrary counts, private/multiwindow/group/pin mutations, later staging/partial-history recovery and broader provider/durability cases remain gaps. Public controls/pane headers/rail and full Recently Closed parity remain open. Retained preview untouched; latency deferred; Electron diagnostic build unapproved.

## October 20 — Private and multiwindow Split View recovery

Evidence-only checks on65ecb3a1: two regular UUID-owned windows retain independent split membership/focus across actual browser crash; private Spaces save/open/recover refuse, private fixture URLs are absent from the Spaces store and private tabs do not return after restart. Actual journal-boundary crash rolls back the source UUID and leaves the other split window unchanged. Two bounded runs pass; final normal exit0. Evidence: `evidence/private-multiwindow-split-20261020/README.md`. No compile; final incremental guard0; unchanged prior49/117 within49/120.

Private native pair creation succeeds but snapshot splits are omitted by the persistence-only capture path: private snapshot/UI parity remains a gap. Multiple splits combined with multiwindow, private focus/layout visuals, group/pin mutation and later/partial-history recovery boundaries remain unqualified. Physical recovery input pending; latency deferred; Electron diagnostic build unapproved. Retained preview untouched.

## October 20 — Private Split View live snapshot fix

Separated live split snapshot generation from Spaces persistence admission. Private snapshots now expose exact native member IDs, layout and last-focused pane while private persistence remains refused and marker updates remain memory-only. Seven bounded runtime checks pass: private active/inactive focus metadata, adapter/native persistence refusal, store/private restart exclusion, regular multiwindow crash preservation and journal-boundary source rollback with decoy unchanged. Eight focused tests pass. Evidence: `evidence/private-split-snapshot-20261020/README.md`.

Initial signed-index compile failure retained and repaired; successful guarded incremental build41.46s/sixsteps, finalguard0. No upstream hook changes; prior49/117within49/120 unchanged. Private visuals/native input, multiple private splits, group/pin mutation and broader lifecycle/recovery boundaries remain gaps. Retained preview untouched; latency deferred; Electron diagnostic build unapproved.

## October 20 — Multiple private splits and mutation differences

Evidence-only run on6ac8714e confirms two inactive private splits retain independent focus, privacy flags survive mutations, pinning dissolves the affected two-pane split without losing tabs, private Spaces operations refuse and the regular store remains byte-identical. Private context disposal leaves regular window intact. Eight recorded checkpoints completed, not eight parity passes.

Two confirmed differences against pinned #993: grouping one pane dissolves the split instead of moving all members into its group; unpinning leaves the tab at the front instead of moving it to the end. No repair included. Evidence: `evidence/private-split-mutations-20261020/README.md`. No compile; guard0; prior49/117unchanged. Broader group/move/close/reorder/private-multiwindow and native visual coverage remain open. Latency deferred; native input pending; Electron diagnostic build unapproved; preview untouched.

## October 20 — Split grouping and unpin-order fixes

Repaired the two observed #993 differences: group operations apply to all native split members, and unpinning an ungrouped tab appends it to the end. Nine bounded private runtime checkpoints pass, including new/existing-group moves, ungrouping with membership/focus retained, affected-split-only pin dissolution, append-on-unpin, private capture/native persistence refusal, byte-identical regular Spaces store and context disposal. Eight focused tests pass. Evidence: `evidence/private-split-group-fix-20261020/README.md`.

One35.93s/sixstep guarded incremental build, finalguard0; no upstream hook changes, prior49/117within49/120 unchanged. Grouped persistence/recovery, broader merges/moves/reorders, Recently Closed and physical/visual checks remain unqualified. Preview untouched; latency deferred; native input pending; Electron diagnostic build unapproved.

## October 20 — Grouped Split View recovery failure

Grouped Spaces round trip passes with exact source UUID, membership, right focus, blue collapsed group and loose active tab. Actual crash restart fails the two-window gate: only the source grouped split returns; the second grouped window is absent. Fresh ten-second settled control repeats this missing-window result; cause unresolved. Journal-boundary recovery stage not reached. Green CI cannot close this runtime failure. Evidence: `evidence/grouped-split-recovery-20261020/README.md`.

Initial invalid color-name fixture refusal retained; hexadecimal-color runs used thereafter. No implementation repair/compile; guard0; prior49/117unchanged. Profiles removed, preview untouched. Native input pending; latency deferred; Electron diagnostic build unapproved.

## October 20 — Missing grouped-window save repaired

Before-fix native session streams contained only the source UUID despite both windows reporting initial save success. Initial-window acknowledgement now rebuilds commands from current native browsers before the existing flush. Fixed stream contains both windows. Six grouped runtime checkpoints pass, including Spaces roundtrip, actual two-window crashrestore and journalboundary source rollback preserving blue collapsed group/focus/layout/UUID and decoy. Nine private regressions and eight focused tests pass. Evidence: `evidence/grouped-window-save-fix-20261020/README.md`.

One35.56s/sixstep incremental build; finalguard0; prior49/117 unchanged. Short diagnostic-startup timeout retained; final established-timeout run passes. Broader concurrent/pending-close/provider/write-error rebuild cases and powerloss remain unqualified. Rebuild latency unmeasured/deferred. Native input pending; Electron diagnostic build unapproved; preview untouched.

## October 20 — Concurrent-window recovery failure

Overlapping new-window creation acknowledges all live owners but actual crashrestart returns only a new NewTab window. Combined close/replacement/beforeunload-pending schedule fails; fresh direct-firstrestart repeat confirms1instead4. No-dialog close/replacement control and creation-only control both restore1instead3. Thus overlapping creation is sufficient; close/dialog not necessary. Cause unresolved; no repair included. Evidence: `evidence/concurrent-window-recovery-20261020/README.md`.

Live source split preservation and successful pending-dialog dismissal do not qualify recovery. No compile;guard0;prior49/117unchanged. Profilesremovedpreviewuntouched. NativeinputpendinglatencydeferredElectronbuildunapproved. GreenCI does not close this runtime failure.

## October 20 — Concurrent-window crash restoration repaired

The fresh-profile reproduction contained all three window UUIDs in its native session streams, but no `Preferences` file. Restart therefore treated the profile as new and skipped restoration. Initial-window acknowledgement now orders the profile preference write and requires a readable dictionary before marking the window saved, retaining the existing owner/capture validation and retry handling. PrefService completion does not itself report write errors; this is a restart-prerequisite check, not a power-loss guarantee.

Creation-only crash recovery passes with all three exact UUIDs and normalized contents. The combined overlapping-creation, completed-close/replacement and genuine beforeunload-pending-close schedule passes with all four remaining windows restored; the closed window stays excluded and source grouped split state is preserved. Ten recorded runtime checkpoints across these two runs and eight focused tests pass. Before-fix failure and decoded session evidence are retained in `evidence/concurrent-window-fix-20261020/`.

One 36.09-second/six-step guarded incremental build; final guard zero. No upstream hook changes; prior authoritative footprint 49 files/117 hunks remains within 49/120. Fresh profile directories removed; retained preview untouched. Broader provider/write-error/rebuild interleavings, failed preference writes, power loss and unpersisted recent edits remain unqualified. Native input pending, latency deferred, Electron diagnostic build unapproved/unstarted.

## October 20 — Preference-write and unavailable-provider recovery

Fresh-profile Preferences rename EIO tests pass with clear and encrypted-only session storage. The actual scoped rename hook records EIO, no Preferences file exists, and initial save remains failed through repeated attempts. Removing the fault permits automatic retry; an actual browser crash then restores the exact saved window identity and contents. This covers a missing-file write failure, not an existing stale Preferences dictionary, physically full disk or general preference durability.

A temporary diagnostic supplies an Encryptor with no keys only to the exact disposable profile's SessionRestore consumer. IsEncryptionAvailable is false and EncryptString returns nullopt. Initial-window save stays failed; two Spaces switch attempts refuse while preserving source and stored bytes. No cleartext Session file is produced. Graceful shutdown succeeds; a fresh process with the fault removed acknowledges a save and subsequently crash-restores the exact window. This is not an actual OS keychain/provider failure, same-process provider recovery or loss of decryption keys for existing records.

The diagnostic is removed byte-for-byte and the normal binary rebuilt. Native input remains pending, latency deferred, and the Electron diagnostic build unapproved/unstarted. Broader preference/provider/lifecycle and power-loss gates remain open. Retained preview untouched.

Four schedules (15 recorded checkpoints) and eight focused tests pass. Diagnostic and normal incremental builds: 28.39s and 28.34s, six steps each; final guard zero. No permanent code changes. Prior normal footprint49/117 unchanged; temporary two-hunk addition in an already-patched file gives a conservative49/119 upper bound within49/120, not a new full inventory. Four disposable profiles removed. Evidence: `evidence/preference-provider-recovery-20261020/`.

## October 20 — Stale Preferences and same-process encryption recovery

Clear and encrypted-only stale-file schedules confirm that an existing readable Preferences dictionary permits initial-window acknowledgement even when its replacement fails with injected rename EIO. The old bytes remain unchanged. Actual crash restart nevertheless restores the exact window UUID and contents in both cases. This establishes the existing check's limited contract: restart eligibility, not freshness or successful persistence of all current preferences. A stale readable file can mask the rewrite error; latest-preference durability remains an explicit gap.

The encrypted-session consumer also recovers in the same browser process after a scoped no-key serialization fault is removed. Initial acknowledgement and a switch refuse while the fault is active; source/store are preserved. Fault removal allows automatic initial save and explicit switching with the same PID, no cleartext Session fallback, and subsequent exact-identity crash restoration. The real encryptor is retained throughout; temporary serialization selects a no-key Encryptor to produce actual encryption-unavailable results. This tests recovery of the session consumer after transient encryption errors, not reacquiring keys, OS keychain unlock, provider IPC reconnection or same-process replacement of a permanently unavailable provider. Those remain gaps.

The stale fixture seeds a minimal authored readable dictionary, not an old production profile. Other stale schema/content and current-preference durability remain unqualified. No product code changes; temporary diagnostic removed byte-for-byte and normal binary restored. Native input pending, latency deferred, Electron diagnostic build unapproved/unstarted.

Four schedules (11 checkpoints) and eight focused tests pass, including a normal-binary stale-file repeat. Incremental diagnostic/restore builds30.69s/30.34s, six steps each; final guard zero. Prior normal49files/117hunks unchanged; temporary one-hunk addition in an existing patched file gives conservative49/118 upper bound, within49/120. No new full inventory claimed. Four test profiles removed; retained preview untouched. Evidence: `evidence/stale-provider-recovery-20261020/`.

## October 20 — Preference acknowledgement budget approval

Owner explicitly approved: **"Raise to 50 files; keep 120 hunks"**. This permits one prototype preference registration hunk in `chrome/browser/prefs/browser_prefs.cc` for the stale-file acknowledgement repair. Prior measurements remain historical. Latency, native input and the Electron diagnostic build remain deferred/pending as before.

## October 20 — Stale preference acknowledgement repaired

Owner approval: **"Raise to 50 files; keep 120 hunks"**. A prototype-only preference is registered through Chromium's normal profile registration. Both initial-window and Spaces-switch acknowledgements now write a process-unique epoch plus increasing sequence through PrefService and require that marker (or a later sequence from the same process) in Preferences after completion. An old readable file no longer satisfies a fresh request. Later coalesced writes can satisfy earlier requests; owner/capture/timeout/retry validation remains. No direct writes to Preferences from the prototype.

Clear and encrypted-only tests inject actual Preferences rename EIO. An old-process marker refuses initial acknowledgement and switching with source/store unchanged; removing the fault permits automatic retry. A previous marker from the same process also refuses a later switch under EIO, then explicit retry succeeds and crash restart restores the exact authored-page owner. Twelve checkpoints across these two schedules pass.

The first clear run retained a separate failure: a successful Source switch produced two blank New Tabs and restart restored one. Its five acknowledgement checkpoints passed before the final exact-tab assertion failed. The final clear/encrypted recovery runs remove blank tabs before saving the fixture; they do not close this blank-tab lifecycle discrepancy. First-attempt evidence is retained.

This verifies the ordinary Preferences write marker, not Secure Preferences, all preference freshness under arbitrary concurrent edits, or hardware/power-loss durability. Broader provider/rebuild/lifecycle gates remain open. Native input pending, latency deferred, Electron diagnostic build unapproved/unstarted.

Concurrent creation/replacement/pending-close crash recovery also passes all six checkpoints, restoring four remaining window identities and preserving the source grouped split. Total final schedules:18 checkpoints plus eight focused tests. One42.21s/seven-step guarded incremental build; final guard zero. Fresh authoritative footprint50files/118hunks within owner-approved50/120. All four disposable profiles removed; preview untouched. Evidence: `evidence/preference-ack-fix-20261020/`.

## Island extension removal — October 20, 2026

Right-click installed Island rows now opens the native extension menu with **Remove from Blanc**. Native Store installation, confirmation Cancel preserving the extension, and confirmed removal updating the picker pass in a disposable profile; eight focused tests and scoped lint pass. Existing native policy and active-tab/user-activation guards are retained. Final zero-action guard passes after two successful incremental builds and one retained include failure. No upstream hooks added: prior measured 50 files/118 hunks remains within 50/120. Evidence: [island-extension-removal-20261020](evidence/island-extension-removal-20261020/README.md). Retained preview untouched; private/managed/localized/platform matrices remain open. Latency deferred; Electron diagnostic build unapproved; all unrelated recovery and migration gaps unchanged.

## Island menu lifecycle — October 20, 2026

The Island remains visible until a native context-menu command is selected. Dismissal restores search focus and leaves the panel open. Native command execution and policy remain in ExtensionContextMenuModel; the bridge responds after menu closure instead of timing out while a user is choosing. Root-menu closure is distinguished from submenu closure.

Nine focused tests and scoped lint pass. Native authored-extension checks verify menu-open Island visibility, Escape dismissal preserving the Island, and Pin selection closing the Island. The native removal confirmation was observed and cancelled; the fixture remained listed. No user extension was removed. Initial incomplete-task-runner compile error retained; repaired incremental builds succeeded (38.78s and39.65s). Final zero-action guard passed.

No new upstream hooks; prior measured50files/118hunks remains within50/120. Windows/Linux, managed/private menu lifecycle, developer Inspect Popup and broad destruction races remain unqualified. Latency deferred; Electron diagnostic build unapproved. Retained preview not restarted for this checkpoint.

Evidence: `evidence/island-menu-lifecycle-20261020/`.

## October 20 — Split View / Glance eligibility

Rechecked merged PR993 at unchanged98ea48fc. Native Glance now refuses while any native split is visible, even when supplied two loose tabs. Glance closure synchronously revalidates temporary ownership. Eight bounded regular/private runtime checks pass, including unchanged refusal state, inactive-split allowance, close preserving split, immediate save and Spaces reopen. Seven capture tests pass; two guarded incremental builds and final zero-action guard. Initial fixture failures retained and not mislabeled as product regressions. No new upstream hooks; prior50/118 within50/120. Public controls, headers/dividers/rail, whole-split Recently Closed and broader lifecycle remain open; latency deferred, Electron diagnostic build unapproved, preview untouched. Evidence: `evidence/split-glance-eligibility-20261020/README.md`.

## October 20 — Public Split View controls and pane headers

PR993-based Split with choices are available in the Island tab menu; initiating group wins. Reserved30px persistent-pane headers provide live title/favicon, focus, Back and Remove from Split. Removal retains both tabs and puts the removed pane after its survivor. Final21 automated regular/private checkpoints and seven capture tests pass, including public menu activation, header focus/title, order and Spaces save/reopen. Initial const compile failure retained; incremental repair48.76s/11steps, guardzero. Fresh50files/116zero-context hunks within50/120. Evidence: `evidence/split-public-controls-20261020/README.md`.

Still open: public Glance Keep as split, full pane menu/divider, exact unequal-width alignment, rail clustering/shortcut semantics, whole-split Recently Closed, Back history scenario, physical input/full visual and broader lifecycle. Menu choices are currently a scrollable list rather than nested submenu. Latency deferred; Electron diagnostic build unapproved; retained preview untouched.

## October 20 — Split View divider and pane menus

PR993-based persistent divider drag, keyboard sizing/reset and accessible values now control the native ratio, with ordered visible-pair validation. Pane menus provide reload, per-tab mute, pin, remove and close; Escape returns focus. Final 37 automated regular/private checkpoints and seven capture tests pass, including saved 55/45 ratio recovery and destructive pane actions. Initial compiler shadowing failure and inactive-private-fixture timeout retained; repaired incremental build 35.17s/six steps, final guard zero. Fresh footprint 50 files/118 hunks within approved50/120. Evidence: `evidence/split-divider-menus-20261020/README.md`.

Remaining: full-height/narrow-window alignment, complete group/move/whole-split menu parity, public Glance conversion, rail/shortcut/Recently Closed integration and broader lifecycle/physical-input/accessibility checks. Header handle only; no full visual parity claim. Retained preview untouched; latency deferred and Electron diagnostic build unapproved.

## October 20 — Full-height divider / narrow geometry checks

Thirty actual regular/private window cases captured at1200/900/700/600/500px and20/50/80 percent. Four width500 extreme-ratio header-overflow failures remain; no repair yet. Pinned PR993 pure layout expects stacked rows in12 width600/500 cases, whereas native stays side-by-side. Full-height source audit also finds double-click swap versus #993 reset and50px versus percentage keyboard steps. These native-input behaviors remain unverified: CUA selected retained preview, so no input was sent. Evidence: `evidence/split-narrow-geometry-20261020/README.md`.

No compile/product changes; zero-action guard, prior50/118 unchanged. Next: coordinate narrow fallback/native/header geometry and divider semantics, then test native full-height hit regions. Green CI does not close these runtime parity failures. Latency deferred; Electron diagnostic build unapproved; retained preview untouched.

Owner approved October20: "Raise to 51 files; keep 120 hunks" for the two-hunk native Split View layout integration in multi_contents_view.cc. Prior counts remain historical.

## October 20 — Narrow layout and full-height divider repair

Owner approved51 files/120 hunks. The native layout hook now shares page/header/gutter geometry: minimum300px columns, stacked rows below612px, focused-pane fallback for short windows. Fallback preserves saved column ratios. Full-height Island gutter double-click resets widths without swapping; transient fallback resize is refused. Former500px header overflow is repaired in all four cases.

Final context-matched regular/private matrix:30 geometry cases plus wide-return ratio/full-height CDP reset/short-focus/Spaces observations (71 records including30 pre-resize snapshots). Existing37 pane/menu regression checkpoints, seven capture tests and eleven counter tests pass. Compiler failures and zero-size probe runtime failure retained; probe publication fixed. Incremental successes48.98s and36.01s; final guardzero. Fresh51 files/120 hunks is at the approved ceiling. Evidence: `evidence/split-narrow-fix-20261020/README.md`.

Physical native hit-testing, broad accessibility, rail/fullscreen/drag-drop and display-scale/lifecycle matrices remain open. No full acceptance claim. Retained preview untouched; latency deferred; Electron diagnostic build unapproved.

## October 20 — Archived menu harness CodeQL repair

Four archived menu harnesses now use a static Runtime.callFunctionOn declaration with the tab identity passed as a protocol argument. The four line-26 CodeQL findings on f228ccc1 were source interpolation in test code. All four syntax checks and twelve normal/adversarial identity dispatch checks pass; git diff --check passes. No native build, browser mutation or full runtime rerun was needed. Original runtime results remain historical evidence; modified harness hashes are refreshed. CodeQL clearance awaits pushed-head CI. Upstream patch footprint remains 51 files/120 hunks; latency deferred and Electron diagnostic build pending approval.

## October 20 — Split View shortcut budget approval

Owner approved: **Raise to 122 hunks; keep 51 files**. Two native command-function hooks in the already patched browser_commands.cc route numbered selection from page and Island focus through the same PR993-based slot policy. This supersedes the 120-hunk ceiling; no additional upstream files are authorized. Latency deferred; Electron diagnostic build pending approval.


## 2026-10-20 — Split View rail, numbered commands and Recently Closed

Implemented against PR993 at 98ea48fc01d79759cfef40009b18cf69715eaed8: persistent pairs appear as one rail row with both icons/titles and last-focused-pane activation. Explicit Close Split View uses native batch closure, creating one Recently Closed Split entry. Island reopening restores persistent markers, ratio and last focus, including explicit-entry reopening after restart. Native numbered commands count splits once (and group/pinned/loose clusters in grouped windows); cyclic navigation still visits each pane. Private closure creates no history.

Validation: 31 regular/private acceptance checks, 37 pane regressions, seven capture tests and eleven counter tests pass. Initial missing restore metadata was repaired. A later most-recent restart timeout was a fixture assumption: shutdown added a newer Window entry; known-latest split and explicit-entry restart semantics are now tested separately. Pane drag fixture failures were overlay interception and pass after dismissal. Failed attempts retained in [evidence](evidence/split-rail-shortcuts-20261020/README.md).

Five guarded incremental builds (37.83/61.85/37.77/37.56/37.95 seconds), final guard zero. Fresh upstream inventory: 51 files/122 hunks, exactly the owner-approved ceiling. No latency measurements or Electron diagnostic build. Retained preview untouched. Physical shortcuts, browser-menu/accelerator Restore Tab metadata, whole-split drag/reorder, group/window-contained history, partial beforeunload cancellation and wider platform/accessibility parity remain open; this is bounded migration acceptance, not full PR993 parity.


## October 20 — Native Restore Tab budget approval

Owner approved: **Raise to 123 hunks; keep 51 files**. One additional native command-controller hook shares split metadata restoration with the Island. This supersedes the 122-hunk ceiling. Latency deferred; Electron diagnostic build unapproved.


## October 20 — Shared Restore Tab entry-point approval

Owner approved **52 files/124 hunks** after runtime proved the command-switch hook is bypassed by Chromium actions. Remove that hook and add the include plus shared entry-point hook in browser_tab_restorer.cc. This supersedes 51/123.


## 2026-10-20 — Native Restore Tab and whole-split reorder

Based on PR993 at 98ea48fc01d79759cfef40009b18cf69715eaed8. Rail pointer and Alt+Shift+Arrow reordering now move persistent pairs as one native collection, including group changes and destination-split boundary normalization. The shared chrome::RestoreTab entry point restores loaded persistent-split history with metadata, ratio and focused pane. Ordinary tab restoration retains native behavior; private restoration remains inert.

Final 48 regular/private runtime checkpoints pass, plus seven capture and eleven counter tests. Earlier 47-check drag control passed. Initial synthetic click-sequence failure and real action-path bypass are archived; the command-switch hook was replaced with the shared entry-point hook. [Evidence](evidence/split-native-restore-drag-20261020/README.md) includes failed attempts and final results.

Owner approved 52 files/124 hunks after runtime proved the initial 51/123 hook was bypassed. Fresh inventory is exactly52/124. Three incremental builds38.93/70.23/41.68s; final guard zero. Disposable profiles removed, retained preview untouched. Latency deferred; Electron diagnostic build unapproved. Physical native input, unloaded-history async restoration, group/window-contained history, cross-window dragging, partial beforeunload cancellation and broader accessibility/platform/lifecycle acceptance remain pending.


## 2026-10-20 — Unloaded history and cross-window split boundaries

Seven isolated fixture checkpoints pass: Restore Tab is accepted while an actual Tabs_* read is held; release restores the persistent pair, 35/65 ratio and right focus. Open-session records were removed from both disposable clear/encrypted Session_* stores to isolate closed history, with Tabs_* retained. Combined-session attempts selected newer recovered Window entries; these are retained and not claimed as split restoration passes.

Cross-window move intents reject foreign source/destination identities and preserve both windows. Actual cross-window dragging remains unsupported: the rail API lacks a destination-window field. Negative boundary tests are not transfer acceptance. [Evidence](evidence/split-unloaded-crosswindow-20261020/README.md) records all attempts and the corrected fixture.

No product changes/native compile; guard zero, prior52/124 unchanged. Only the small diagnostic read-hold helper was compiled. Profiles removed; retained preview untouched. Latency deferred; native input and Electron diagnostic build pending. Combined-session ordering, async owner destruction/repeated requests and physical cross-window transfer remain open.


## Replacement-owner correction and recovery rerun — October 20

The previously reported replacement-owner product gap was a fixture false positive. Closing the requesting window creates a newer Window history entry. The replacement request restores that entry into a separate window, not the requesting window. The old assertion observed only the requester and incorrectly concluded nothing restored. This supersedes the open-runtime-failure claims in the preceding replacement/combined checkpoint.

Corrected all-window checks pass twice on the original implementation: three pending replacement requests restore exactly one newer blank owner window; the subsequent request restores the older split into the replacement window with 35/65 ratio and right focus, retaining its survivor tab. Two ten-checkpoint runs plus six coalescing, seven owner-cancellation and eleven combined-session checkpoints pass (44 total). The combined test retains both clear/encrypted open-session records and restores each fixture URL once. Seven capture tests and eleven patch-counter tests also pass.

A speculative pending-owner class did not change the faulty assertion's outcome. Temporary lifecycle tracing showed completion dispatch, prompting the all-window inspection. Both the proposal and diagnostics were removed byte-for-byte before final tests; the native product file matches the prior committed source. Discarded proposal and failed assertions retained as diagnostic history, not shipping code. Browser/pointer/guard logs stay local. No current replacement-owner failure is established by these tests.

Three guarded incremental builds:40.27s proposal,38.30s diagnostics,38.61s original normal build restored. Final zero-action guard; no new upstream hooks, prior52/124 unchanged. Disposable profiles removed after exit verification, retained preview untouched. Physical native input, arbitrary multi-owner concurrent requests, encrypted-only closed history and wider lifecycle remain unqualified. Latency deferred; Electron diagnostic build pending approval.

Evidence: `evidence/split-replacement-correction-20261020/README.md`.

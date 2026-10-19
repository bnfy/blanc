# Electron 1.38 UI migration follow-up

## Shutdown teardown follow-up — 2026-10-19

Reproduced `TypeError: Object has been destroyed` in the official Electron binary: the helper's destroyed callback dereferenced `win.webContents` after BrowserWindow destruction. All three platform brokers now capture the original contents reference and revoke that authority without reading the dead window. The runtime lock hashes explicitly track this reviewed teardown change; this is not renewed screen-sharing/audio acceptance. Failure diagnostics now read the on-disk exception log independently of the dead inspector. The audit inventory was regenerated (only main.js hash changed).

176 focused tests pass. All three new lifetime regression tests failed before the fix; isolated native helper destruction reproduced the exception before and exits zero afterward for all three variants. Scoped ESLint and audit inventory checks pass. Full local unit attempt is retained, not claimed green: absent seed, release refs, dependency/environment issues and the then-stale inventory produced 21 failures. Full desktop attempts still stop with Playwright Target crashed before the shutdown assertion; actual Windows/Linux end-to-end acceptance awaits CI.

Reviewed all nine failed jobs on61d492e7: two shutdown jobs exit1; substrate has stale main.js inventory; both unit jobs and all four desktop jobs fail only the same two inventory assertions (complete provider logs checked after diagnostics truncation). No additional CI failure cause found. No jobs silently rerun.

No Chromium/native compilation, latency run, or diagnostic Electron build; existing official Electron used only for probes. Chromium footprint unchanged. Plan remains in progress, prior gates unchanged. Evidence: `evidence/windows-shutdown-followup-20261019/`.


Owner requested this next on October 18, after the native recovery checkpoint.
Source inventory: `origin/main` at `7f57544b` (package version 1.38.0), compared
with the fork's last reconciled main `01cf07d7`. A partial preview is implemented; see `evidence/ui138-preview-20261018/`.
The inventory below remains the full target, not a claim of complete parity.

## Port and verify

1. Shared Island presentation: address-only hover opening, larger row icons,
   Glance icon, custom tooltips, matching reload/favorite/close geometry,
   quieter private chip and borders. Reference commits `379bb5fb`, `7422c94e`,
   `6e37b112`, `559e3aa3`. Check native Extensions slot alignment and preserve
   focus return and keyboard shortcuts.
2. Side-list ordering and groups: interleaved loose runs, Recently Closed,
   group colors/tinted blocks, rename/menu actions, new-tab-in-group and move
   group to a new window. Native Chromium contiguous groups and prohibition
   on grouped pins remain constraints, not silently emulated guarantees.
   Port the actual tab-sections helper and test every exposed bridge method.
3. Tab context menu: New Tab Below, Close Above/Below and site mute. Native
   model actions must preserve tab IDs, pin/group boundaries and private scope.
4. Start Page: wallpaper-blended footer, owner-selected image (F49) and Spaces
   color (F50). Image selection/storage requires an actual native implementation;
   do not show a working picker backed only by an Electron IPC stub.
5. Fixed-size before/after screenshots in regular/private, Island collapsed/open,
   grouped/ungrouped and Start Page states; actual pointer/keyboard checks where
   available. Record any unsupported feature alongside the UI diff.

Work stays in the isolated prototype. Prefer copying reviewed shared sources
from the pinned release commit over duplicate hand edits. Do not wholesale merge
shipping main into the active F12 checkpoint without reviewing its broader diff.
Use asset preparation for renderer-only changes and the existing guarded warm
157 output for necessary native changes. The upstream patch budget is already
40 files / 92 hunks; no new upstream file without consolidation or owner decision.
Latency remains deferred, Electron diagnostic build remains unapproved, and
neither this work nor its visual comparison promotes 157 past the upgrade gate.

## October 18 preview checkpoint

Reviewed renderer/assets, group colors and menus, rename/new-tab/ungroup/move-to-window,
bounded tab context actions, custom wallpaper and fixed color presets are ported.
79 reviewed pure-module tests, scoped lint, native bridge and browser automation
checks pass. Physical interaction and matched visual comparison remain pending.
Vertical rail, Recently Closed, site-wide mute, Glance and Spaces remain gaps.
The image adapter stores a bounded re-encoded JPEG in profile-local WebUI storage;
see evidence for limits and unsupported format/sync coverage.

Owner-reported Start Page overlap exposed a separate 157 preparation bug: a broad
`present` marker matched the separator patch and skipped the native 68px header
reservation. The marker is now unique, with an idempotence/regression test. This
fix touches an already-inventoried file; final build/geometry evidence is recorded
in the preview archive. No CSS spacer was added to web content.

## October 18 rail, Recently Closed, site mute and Store follow-up

Implemented native page-width reservation and hit testing for the reviewed vertical rail,
profile-local layout/width preferences, native TabRestoreService entries/restore/forget/clear,
and exact-host session-only site mute with independent private policies and per-tab unmute.
No new upstream path: 40 files / 94 hunks. Native rail switching, page click-through,
keyboard width change, menu site mute and Recently Closed row restore were exercised.
Bridge tests cover new/existing same-host tabs, host transitions, private isolation,
restore/forget and native viewport resize. Restart preserved rail width and closed entries,
cleared site mute, and showed an empty error status. Forget All passes on the final binary.

The owner-requested Chrome Web Store promotion rule is exact-origin and download-campaign
scoped, runs in Chromium's internal isolated world, and hides only the promotional container.
Normal Google installation of Extensity 1.14.0 passed through the native permission sheet
and success bubble; persistence and native removal passed. Test profile removed; original
preview New Tab and Store tabs restored. This is not a UA spoof or permission bypass.

Evidence: `evidence/ui138-rail-store-20261018/` (31 hashed archive members).
Four focused tests and scoped lint pass. Incremental successful wrapper times:
39.57, 57.36 and 41.97 seconds; failed 14.66/35.98-second attempts retained. Final guard zero.
Remaining: full matched visuals, broader rail drag/group/window restoration qualification,
and reconciliation of Chromium's profile-wide Recently Closed list with Electron's window-local
semantics. Glance/Spaces remain unported. The promotion may briefly paint before load callbacks;
its empty wrapper remains labelled in AX, and the separate inline Chrome-install banner is
outside the popover rule. Latency stays deferred; Electron diagnostic build remains unapproved.
Task 0 promotion/upgrade gate and F12 acceptance gaps are unchanged.

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

## October 18 find-capsule checkpoint

The copied Electron 1.38 find capsule now uses Chromium WebContents Find/StopFinding and
window-local result events. Native Find and Find Next/Previous route through the capsule;
/find is restored. Stale request IDs, inactive/foreign tabs and navigation resets are guarded.
The query limit is 4096 UTF-8 bytes; case-insensitive search uses Chromium's engine.

Automated final-binary checks match installed Electron 1.38 on four matches including a
same-origin iframe, next/previous/wrap, Unicode and zero results. Rapid query replacement,
cross-document reset, tab switch/closure, same-document preservation, private isolation,
foreign/inactive rejection, slash listing and empty host status pass. Command helper calls
exercise the Cmd-G destination, not physical shortcuts. Capsule bounds pass at actual native
1280/800/500px widths. Component screenshots are not full composed visual parity.

Two incremental builds: 62.04s and 60.37s wrapper (58.06s and 55.07s Siso), 15 steps each.
Final guard zero actions; footprint 40 upstream files / 96 hunks, within 40/120. Four focused
regressions, syntax and focused host lint pass. No cold build, GN/toolchain change or latency run.

Failed harness attempts retained: private context requested on page endpoint instead of browser
endpoint; immediate post-restart connection before browser readiness; Node 20 invocation without
experimental WebSocket support. Final matrix and commands pass. Diagnostic background flags
were used only in disposable instances because the Mac is locked. Profiles removed and fixture
server stopped; original preview New Tab and Store restored on final binary with empty status.

Native Cmd-F/Cmd-G/Enter/Shift-Enter/Escape/button clicks, focus/passthrough, IME, VoiceOver,
DPI/full composed visual comparisons, PDF/cross-origin frames and crash/BFCache remain untested.
Native input stays pending unlock. Plan visual item 4 remains incomplete; prior F12/Task0 gates
unchanged. Latency deferred; Electron diagnostic build remains unapproved/unstarted.

Evidence: `evidence/ui138-find-20261018/`. Build times are routine incremental work, not Task 0 cold-build cost.

## October 18 expanded find and visual checkpoint

An actual crash of the exact active disposable tab left its find capsule visible. The native
owner now retires the request ID and query/count state and resets the capsule when the primary
renderer exits, without sending StopFinding to a dead renderer. The before-fix regression fails;
the final binary closes the capsule and searches successfully after navigation reload. This is
bounded regular-tab recovery, not every crash/BFCache/private lifecycle combination.

Eight queries agree with installed Electron 1.38: cross-origin iframe (different local port),
open shadow DOM, hidden text exclusion, input/textarea text, Japanese, accented text and no match.
Six component style comparisons (1280/500px, light/dark/private diagnostic theme attributes)
match rendered dimensions, colors, borders, radii, fonts and shadows for the six capsule controls.
Empty, no-match and 300-character no-match states agree on count and outer bounds. Input client/
scroll metrics differ between Chromium152 and157 (24px client difference); recorded, not hidden
or presented as full pixel equivalence. Native CSS sizing and Electron viewport emulation are
explicitly distinct. Matching-DPR clipped component captures supplement the numeric checks;
these are diagnostic theme renders, not physical private-window/input or whole-window parity.

One guarded incremental build: 41.02s wrapper /37.23s Siso, six steps from a one-action plan.
Final guard zero; budget unchanged40 upstream files /96 hunks. Four focused tests pass. No cold
output, GN/toolchain change, latency test, or Electron diagnostic build. Binary hashes recorded.
Failed window-target harness attempt and overstrict client-metric comparison retained. The
first broad crash probe did not establish exact active-target identity; only crash-before/after
with unique URLs qualify that regression. CDP crash and dead-runtime timeouts are recorded.

Disposable profiles and fixture servers removed; original two preview tabs preserved and
reopened on the final binary. Native input stays pending unlock. PDF, BFCache/back-forward,
private crash, IME, VoiceOver, physical display-scale, hover/focus and complete composed visual
parity remain gaps. Plan visual item4 remains incomplete; prior F12/Task0 gates unchanged.
Latency deferred; Electron diagnostic build remains unapproved/unstarted.

Evidence: `evidence/ui138-find-expanded-20261018/`. Build time is routine incremental work, not Task0 cold cost.

## October 18 BFCache/private find checkpoint

Regular A→B→back A→forward B restores the same document instance markers and records
pageshow.persisted=true in both documents. Find closes at each cross-document transition,
then finds the expected two/three matches after each actual BFCache restore. Private A→B→back A
also restores the same document with persisted pageshow and successful find. No forced BFCache
flags, Playwright browser defaults or assumed reload-as-cache pass were used.

A fresh private window exposed a theme gap: direct-open Find skipped the copied panel renderer's
private-theme application. The prototype host now applies or clears that scope from its active
native tab snapshot before opening Find. This is an assets-only integration fix; copied Electron
source is unchanged. The first failing theme assertion is retained, not counted as a pass.

Private search, cross-window and inactive-tab rejection, tab-switch/navigation resets, reopen,
BFCache restore and exact active private renderer crash/reload pass. Regular listeners receive
no private search results; private Recently Closed stays empty. Disposing the private context
removes its targets, regular find still works and the regular theme remains non-private. Crash
transport/dead-runtime timeouts are retained. This tests one bounded private context, not every
multi-window/subframe/process-sharing schedule or durable profile-forensics guarantee.

No native compilation. Assets-only prepare 0.05s; final guard zero actions (3.39s); native binary
hashes identical to the prior expanded-find checkpoint. Native patch footprint remains 40 files /
96 hunks because no native/preparation source changed. Four focused regressions, host syntax and
focused lint pass. Disposable profile/server removed; original preview's two tabs restored.

Native input remains pending unlock. PDF, IME/VoiceOver, physical focus/hover/display-scale,
BFCache eviction/ineligible pages, private forward restoration, private subframe crashes and full
composed visual parity remain gaps. No Electron comparison is claimed for these lifecycle runs;
installed Electron was not launched. Visual plan item4 remains incomplete. Latency deferred;
Electron diagnostic build unapproved/unstarted; prior F12/Task0 gates unchanged.

Evidence: `evidence/ui138-find-lifecycle-20261018/`. No change to the Task0 cold-build column.

## October 19 PDF and private lifecycle find checkpoint

An authored two-page text PDF contains three occurrences of needle. Chromium's real PDF viewer
loads it and native Find reports all three matches in regular and private windows. Regular next/
previous returns 1→2→1; no-match returns zero in both windows. PDF→HTML navigation resets the
capsule and HTML search succeeds. Private theme and cross-window rejection pass; private search
produces no regular-window result events. PDF fixture pages and the actual viewer capture were
visually inspected. This is a simple selectable-text PDF, not OCR, encrypted or form-document coverage.

Private A→B→back A→forward B preserves each document instance and reports persisted pageshow;
find resets at transitions and returns the expected three matches after forward restoration.
Removing a cross-origin iframe during an open find session leaves zero child matches on a fresh
query while parent text remains searchable. Closing the active searched tab resets the capsule;
private Recently Closed remains empty. Context disposal removes its targets and regular host
status remains empty. These are real bridge/engine checks, not physical key or pointer events.

No production code changes, preparation or compilation were needed. Build guard zero actions
(5.38s); native hashes unchanged from the expanded-find checkpoint, footprint remains 40 files /
96 hunks. Focused host lint passes. No repeat unit suite is claimed for this evidence-only change.
Disposable profile/server removed; original two preview tabs restored. Initial Poppler rendering
emitted Fontconfig configuration/cache warnings; a fixture-local config/cache rerender completed
and both pages were inspected. No system font configuration changed.

Remaining: PDF wrap/end-page selection, PDF reload/crash/plugin lifecycle, scanned/encrypted/forms,
cache eviction/ineligible pages, private subframe crashes/process sharing, IME/VoiceOver/physical
focus/display scale and full composed visual parity. No new Electron comparison was run. Native
input remains pending unlock; latency deferred; Electron diagnostic build unapproved/unstarted.
Visual plan item4 remains incomplete; previous F12/Task0 gates unchanged.

Evidence: `evidence/ui138-find-pdf-20261019/`. No change to Task0 cold-build costs.

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

Evidence: `evidence/ui138-find-pdf-recovery-20261019/`. No Task0 cold-cost change.

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

Evidence: `evidence/ui138-find-plugin-20261019/`. No Task0 cold-cost change.

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

Evidence: `evidence/ui138-find-plugin-fix-20261019/`. No Task0 cold-cost change.

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

Evidence: `evidence/ui138-find-complex-20261019/`. No Task0 cold-cost change.

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

Evidence: `evidence/ui138-find-password-20261019/`. No Task0 cold-cost change.

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

Evidence: `evidence/ui138-find-password-life-20261019/`. No Task0 cold-cost change.

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

Evidence: `evidence/ui138-find-session-20261019/`. No Task0 cold-cost change.

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

Evidence: `evidence/ui138-crash-anchor-20261019/`. Routine incremental cost only; Task0 cold column unchanged.

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

Evidence: `evidence/ui138-recovery-repeat-20261019/`. No cold-build cost change.

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

Evidence: `evidence/ui138-closed-corrupt-20261019/`. Cold-build costs unchanged.

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

Evidence: `evidence/ui138-group-visual-20261019/`. Cold-build costs unchanged.

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

Evidence: `evidence/ui138-group-collapse-fix-20261019/`. Routine repair only; cold column unchanged.

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

Evidence: `evidence/ui138-group-cross-crash-20261019/`. Routine testing only; cold column unchanged.

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

## Store promotion wrapper repair — 2026-10-19

The exact campaign's empty dialog shell is now suppressed along with its content; mixed controls are excluded. Four unit tests and live 1600px Sign in hit-testing pass; navigation reaches Google Accounts without credentials. Official Extensity Add to Chrome remains enabled. Fresh native permission/install verification remains pending because CUA selects the retained older preview; closing it was rejected by automatic approval review to protect original tab state. No current native install pass is claimed. Original preview remains open on its previously loaded binary. Evidence: `evidence/ui138-store-promotion-wrapper-20261019/`. One guarded incremental build35.51s (six steps), finalguard0/5.86s; prior41files100hunks not re-enumerated, no new upstream paths. Latency deferred; Electron diagnostic build unapproved.

## Native Store promotion regression — 2026-10-19

Owner-approved restart preserved both original preview tabs. Native CUA checks on82572a12 pass: Extensity permission text and delayed Add button, Cancel without install, successful Add confirmation, and native removal confirmation/cleanup. Test tab closed; original New Tab and Store retained. Promotion wrapper now hidden with zero rectangle. Evidence: `evidence/ui138-store-native-20261019/`. Fresh native installation/permission gap from previous checkpoint closed; no authenticated sign-in, upgrade or post-install restart-persistence claim. No build/source changes; patch footprint unchanged. Latency deferred and Electron diagnostic build unapproved; other gates unchanged.

## Windows CI shutdown candidate — 2026-10-19

Final Windows/Linux helper teardown now destroys the internal capture helper after the last runtime window closes. Added a helper-close veto regression and bounded timeout diagnostics; no deadline relaxation. Historical CI cause unproven: logs only showed process alive after10s. 28 unit tests and scoped ESLint pass; local desktop attempts crash before assertion, so Windows CI remains required. Evidence: `evidence/windows-shutdown-20261019/`. Owner authorized fix on#920; shipping Electron main.js/test changed. No Chromium build/patch-budget change; latency deferred; Electron diagnostic build unapproved.

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

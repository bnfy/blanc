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

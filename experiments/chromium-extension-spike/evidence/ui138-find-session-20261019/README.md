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

23 archive members hash verified; profiles/raw browser logs excluded.

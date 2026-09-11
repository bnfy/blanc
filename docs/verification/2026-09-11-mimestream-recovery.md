# Mimestream handoff and session recovery — September 11, 2026

## Installed v1.16.0 findings

The owner's installed `/Applications/Blanc.app` matches the repository's
main-process external-link handlers. Clicking the plain Apple homepage link
in Mimestream initially foregrounded Blanc without adding or selecting a tab.

Three related failures were identified:

1. The shared startup/recovery card was nested inside `layoutLedger`. Billboard,
   Shelf, Tally, and Mahjong hide that entire element. Session recovery remained
   pending, so external links stayed queued while ordinary manual browsing
   could make the application look ready.
2. Closing/reopening the recovery window can create an already-loaded primary
   window before the restore choice. `createStartupRuntime` reused that window
   but unconditionally awaited its next `did-finish-load`. No new load occurs,
   so Restore dismissed the question without completing restoration or releasing
   external URLs. Closing the initial recovery host before its first load could
   also leave an unresolved readiness promise.
3. The saved active tab was a Chrome Web Store detail page. Actual restoration
   of that page crashed the installed main process with a native null-pointer
   access. This is separate from the JavaScript readiness deadlock.

## Native crash evidence

The owner's supplied report is for Blanc 1.16.0, macOS 27.0 (26A428), arm64,
September 11 at 14:12:09 ET. Reports at 14:12:49 and 12:49:28 have the same
top frame offsets. No crash reports or session content were uploaded.

Official `electron-v44.2.0-darwin-arm64-symbols.zip` was used locally. Its
Electron Framework module UUID `4c4c44a4-5555-3144-a179-5c2625687460` matches
the crash image. The top image offset `0x59ea344` resolves to
`extensions::WebstorePrivateGetReferrerChainFunction::Run()` in
`extensions/browser/api/webstore_private/webstore_private_api.cc:1440`.
The following frames are extension-function dispatch and Mojo handling.
The exported-symbol label `ares_dns_rr_get_ttl` in the unsymbolicated Apple
report is not evidence of a DNS failure.

Electron acknowledges this exact missing-delegate crash in
[PR #53752](https://releases.electronjs.org/pr/53752). At investigation time,
the 44.x backport #53776 was still listed as in flight. These local recovery
changes do not fix the native Web Store API crash.

## Owner-session recovery

The owner explicitly authorized a restart to recover the saved tabs. The
session and crash ledger were backed up before changes. After reproducing the
native crash, Blanc was confirmed stopped. All original saved URLs, groups,
metadata, and pins were preserved, a blank tab was appended and selected, and
the flat rollback mirror was updated consistently. The original Web Store tab
remains quiet; selecting it in the affected runtime can still crash Blanc.

After relaunch and Restore, all original saved URLs were verified present and
the original groups appeared in the live UI. Clicking the plain Apple homepage
link in Mimestream then created and selected a new tab, and the live Blanc UI
showed the loaded Apple page. This verifies the owner's ordinary Mimestream
handoff after recovery; it does not certify every email link or native Space.

## Local changes and checks

- The shared startup card is outside the optional layouts and occupies the
  page while a recovery/blocker decision is pending. It remains scrollable at
  small sizes and the saved layout returns after startup completes.
- Startup readiness accepts an already-loaded window and settles/cleans up
  when its captured window closes before loading.
- Review found that reusing a Dock-reopened Personal primary for a saved
  named profile changed the window identity while retaining Personal-session
  tabs. Recovery now creates a separate window for the saved identity and
  associates its saved state/focus with the replacement runtime. The existing
  Personal window keeps its tabs and sessions.
- Review also reproduced orphan saved tabs when a secondary startup window
  closed before chrome loaded. Restoration now rechecks registered runtimes
  after readiness and skips discarded windows. A Dock-closed primary remains
  registered, restores quiet tab records, and wakes its selection on reopening.
- `npm run test:startup-layout` checks recovery visibility/clickability in all
  five layouts at two sizes, blocker initialization/failure visibility, saved
  tab restoration, exactly-once queued URL selection, and the ordinary layout
  after completion. The original markup failed the Billboard visibility check.
- `npm run test:recovery-reopen` adds the macOS recovery-window close/reopen
  path. Before the readiness fix, it timed out waiting for the queued URL after
  Restore. Both lifecycle commands pass with the local changes.
- `npm run test:recovery-lifecycle` adds isolated Electron regressions for
  named-profile recovery after Dock reopening (including session isolation,
  window title, persisted profile ownership, and saved focus), secondary-window
  closure before chrome readiness (no orphan tabs or persisted closed window),
  and primary-window closure during restoration (quiet preservation and wake
  on Dock reopening). The profile assertion reproduced the review failure
  before the fix. All three scenarios pass after the fixes, and both existing
  startup-layout/recovery-reopen commands were rerun successfully.
- Full unit suite after the final changes: 1,770 passed, zero failed.
- The existing external-link lifecycle smoke passed hidden and minimized
  cases, then stopped because it could not establish native minimization for
  the combined hidden/minimized precondition. It is not counted as a complete
  passing run; the owner's actual Mimestream link was separately verified in
  the installed app as described above.

No release, merge, tag, or installed application modification was performed.
The installed-session recovery is a workaround, not delivery of the local code
fixes or an upstream native fix. The native crash remains unresolved in public
v1.16.0 and must be accounted for before claiming a launch candidate is verified.

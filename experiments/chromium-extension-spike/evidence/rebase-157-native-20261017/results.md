# Chromium 157 native acceptance — October 17, 2026

**Status: native checks below pass after one prototype asset repair. Task 0 remains in progress because a real extension version upgrade has not been run.** The owner unlocked the Mac and authorized these checks. The 156 baseline is not promoted or modified. No native rebuild was started.

## Native input and visible checks

Input used CGEvent keyboard/mouse events directed at the exact PID of the 157 app, with frontmost-application assertions. CDP inspected state and seeded fixtures; it did not substitute for the listed physical input paths. Harness sources and logs distinguish setup from input. This is synthetic native input, not a claim of human keyboard/mouse operation.

- Cmd-L/T/A/D/R/[ and Escape; Cmd-D with Island address input focused; Escape → Cmd-L; Escape returns typing to the page; Enter navigates selected Favorites/history results. Cmd-R was invoked and verified to retain the expected URL; the harness did not independently count network reload requests.
- Both hearts clicked; typed `/save`, `/favorites`, `/history`; folder reuse case-insensitively, duplicate prevention, moving an existing Favorite, overlong-name rejection; search ranking and dedup; late favicon saved initially absent, then updated in native Favorite data.
- Private HTTP page: Cmd-D and `/save` no-op, both hearts hidden, `/clear` refused, regular history unchanged.
- Native pin/unpin, audible WebAudio mute/unmute, slash mute, tab close; loose and pinned drag order; pinned-boundary refusal; group creation/name reuse, collapse without moving active tab, search/Enter focus, group/tab drag, Option-Shift arrows, ungroup and close-group. Full group gestures rerun after the asset correction. Accepted existing differences remain: grouping a pinned tab unpins it; Cmd-1/2 select global tab order.
- Native customization selects Ledger, Shelf, Tally and Billboard. The first three visibly refresh native bookmark insert/remove events. Billboard visibly loses seeded recent sites after typed `/clear`, in the same document with a `topSites` event and Favorites unchanged. Some layout screenshots show the expanded Island because Escape also participates in start-page focus handling; they are not pixel-parity comparisons.
- Type-to-open preserves the first character and subsequent typing. The helper's single multi-character Unicode event was not a valid physical-key-sequence test; first-character-then-focused-input passed.
- History-only clear retained cookies/localStorage and Favorites. With fixture web tabs closed, a second native `/clear` remained empty across relaunch. Restoring open web tabs generates new visits: an earlier empty-history assertion with those tabs restored was an invalid test expectation, retained in the logs.
- Native window captures show seamless header tint after changing the page background, no divider, Island-only controls at 1200 and 800 px widths, and traffic lights inset 20 px. The narrower capture is inactive (gray traffic lights), not a placement failure. The actual Dock item was identified by its 157 app URL and captured: dark gold Sunrise icon.

## Extension acceptance and remaining gate

Bitwarden **2026.10.0** installed through the normal Web Store Add to Chrome button and a CGEvent click on the native Add extension dialog. Its service worker started. Native Extensions-button → picker → Bitwarden opens Chromium's actual popup with focus. Native Skip/Log in, Tab, typing a synthetic `.invalid` address, selecting/clearing it, Escape and Cmd-L passed. No login or account creation was performed. The extension survived relaunch enabled.

`chrome.developerPrivate.autoUpdate` completed with Bitwarden enabled at 2026.10.0 before and after. **This is only an update check, not a version-upgrade pass or proof of a downloaded update.** The older signed 2026.9.3 CRX previously used on 156 is absent. Google's public CRX endpoint supplied 2026.10.0; compatible-version probes did not produce an older package; the public archive download returned HTTP 403. No repackaged/unpacked substitute or version-editing shortcut was used. A valid older Google-signed CRX is required to finish the actual upgrade and post-upgrade restart/popup check.

## Product repair discovered by native testing

Dragging a loose tab to the first loose gap failed when the pinned section was empty: two drop slots shared the same Y coordinate and the first (forbidden) pinned slot won. `drag-assets.mjs` patches only the prototype's copied `tab-drag.js`, preferring the compatible pinned/loose bucket only for coincident slots. A nearer forbidden bucket still rejects the drag. Shared Electron source remains unchanged. Preparation refuses a changed/duplicate anchor.

Four focused drag tests plus ten build-guard tests pass (14/14). `prepare.mjs SRC --assets-only` refreshed disk assets; no C++ rebuild or cold build. Native first-gap/pinned-boundary tests and all group gestures passed afterward. This is a pre-existing copied-renderer edge case discovered during 157 acceptance, not additional upstream anchor breakage. Carry the asset correction forward and consider upstreaming separately.

## Evidence and qualifications

- [Runtime assertions and observations](runtime-evidence.json), [native/harness logs](logs/), [harness sources](harness/), [focused tests](native-fix-tests-final.txt).
- [Narrow tinted window](native-narrow-tint.png), [final start page](native-final-window.png), [visible cleared Billboard](visible-cleared.png), [actual Dock crop](native-dock-icon.png).
- [156 baseline hashes](baseline156-after-native.json) still match the recorded source HEAD, args, build-environment record and compiler revision. No 156 app/profile/tab interaction was performed.
- [Timing](attention.jsonl) brackets 16:15:37.096954–16:32:22.007618 UTC (16m44.911s), including waits, tools and harness repairs. It is not exclusive active-agent time. Earlier owner/agent attention remains unmeasured; no new owner hands-on action was requested after the unlock message.

Harness corrections retained: observed page focus before typing; `createTab('chrome://newtab/')` incorrectly treated the internal URL as search (native Cmd-T used instead); first-character Unicode input; stale native extension-button accessible label after install; immutable read-only SQLite audit; reload/startup timing; restoring web tabs creates fresh history. Failed harness runs are not counted as passes.

Fixture tabs/groups, additional Favorites/folders, and sentinel cookie/storage were cleaned. One original disposable Favorite and the isolated profile/Bitwarden remain for the pending upgrade; the fixture server and 157 output remain available. The final 157 window is left on its start page. Full disposable-profile removal follows upgrade acceptance. Monitor remains paused because repeating checks cannot supply the missing signed fixture. README pin and CLAUDE/AGENTS gate outcome remain unchanged.

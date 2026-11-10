# Result

Queue 2 in progress; local commits only. No live-tree or production access.

| Item | State |
| --- | --- |
| A shared Spaces | Implemented: two-window native gate 3/3; full regression owed |
| B native icons | Owed |
| C Android safety | Owed |
| D regression | Owed; comparison baseline finish-final-features-2 |
| E Sparkle | Owed; existing 2.8.0 pin is not security-cleared |
| F dedicated beta | Owed; initial disk check 1.1 TiB available |
| G local beta proof | Owed |
| H operator handoff | Owed |

Prototype: macos-fbb479dfc8d99cdb, beta-spaces-native-8-runtime-config.json.
Beta candidate/app: not built.
Gate: beta-spaces-native-8-gate 3/3; bridge unit tests 6/6.
Scenario: sync.feature:162 passes on candidate 8 (beta-spaces-pairing-8).
Precommit tools: 280/280; patch reconstruction: 158 upstream / 567 canonical.
Lost native passes: not measured yet.
Android checks: not run yet; 156 compile availability not established.
Owner next: no input needed at this checkpoint.
Unverified: wider Spaces regression, icons, Android, final regressions, beta build,
Sparkle linkage/handoff, signed distribution, production real-device Sync.

## A — desktop bridge checkpoint

Added distinct `desktop.spaces.*` methods beside the unchanged phone facade.
The desktop inventory represents all windows, holds switching/restoring windows,
protects every open Space against reconciliation replacement/removal, stores
independent per-window receipts, routes row/binding/layout events by window and
Space, validates acknowledgements, and retains full desktop capture metadata.
Shipping Shared Spaces service/runtime/model remain the pinned bundle source.
The phone `spaces.js` is byte-unchanged. Bundle regenerated with lane tooling.
Four local-Worker unit checks cover independent receipts, open/held protection,
Undo retaining a local copy, and invalid/stale inventory refusal. This is not
native integration or native acceptance evidence.

Precommit checkpoint: `beta-bridge-tools-1.tap` 278/278 pass; patch
reconstruction 158 upstream outputs / 566 canonical files; whitespace clean.

### Native integration in progress

`beta-spaces-pairing-1` passes unchanged `sync.feature:162` on
`macos-c17384cecb432f8d`. Subsequent native work adds a distinct durable desktop
receipt IPC; Android's original WriteStore remains asynchronous and unchanged.
The first focused two-window gate on `macos-4451fa2da0d4fa34` passed setup and
pairing, then stopped at the harness's conservative request-headroom wait
(19 recent GETs; no Worker quota changed). Its requests contain no 429s.
The focused Spaces poll now requests only Spaces stores, reserving seven GETs
of headroom, and leaves native routine polling in control. That is not a pass.
Inspection also found a real bridge bug: an inventory omitting `holding` after
a switch retained its earlier true value. Push now resets transient flags;
the new hold/resume unit test passes (5/5 desktop bridge tests).
Native builds 1 and 2 failed on C++ API/style errors, corrected without any
build-guard override. Builds 3–5 succeeded using the guarded incremental path.
Native navigation waits for a successful committed load, and row acknowledgements
are being tied to native disk checkpoints. Multi-window gate and regression
remain owed on the final candidate.

### Native gate checkpoint

Candidate `macos-fbb479dfc8d99cdb` (`beta-spaces-native-8`) passes all three
focused native checks in `beta-spaces-native-8-gate/result.json`: Settings Sync,
QR/cancel/join, and two windows sharing distinct Spaces with a peer edit and
native delete/Undo. Both windows retain their exact tab URL lists; both local
Space entries and the peer's unaffected Space survive. Real local Worker,
mock Keychain, isolated profiles, rendering guard passed; no production contact.

Gate 7 exposed a real Undo race: a stale inventory reply could acknowledge away
a pending restore and remove its menu entry, although all tabs survived. Native
now retains the restore until a durable accepted inventory echoes it; stale
reconciliation/deletion cannot remove a pending restored Space. Gate 8 passes.
The shared runtime receipt is durably written through a desktop-only Mojo call;
failed writes cannot return a durable inventory receipt. Remote row changes
checkpoint native disk before acknowledging. No Android caller changed.

Precommit `beta-spaces-tools-4.tap`: 280/280; patch reconstruction passes at
158 upstream / 567 canonical files. Full regression and broader remote row,
group, navigation, split and lifecycle coverage are still owed; the focused
gate is not evidence for every Shared Spaces case.

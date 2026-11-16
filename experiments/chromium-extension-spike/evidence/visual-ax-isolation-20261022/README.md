# Native visual, AX and local identity checks — October 22

Source checkpoint a29da325, native Chromium157; existing Electron v1.42.0 reference. No compilation or Electron diagnostic build. Latency deferred. This is a bounded partial acceptance record, not Decision 2 or candidate signoff.

## Observed checks

- Native settled Cmd+L opens Island address input with URL selected; pointer activation opens the same panel. An initial shortcut during new-window initialization reached upstream omnibox before settling; not qualified as a reproducible defect.
- Native and Electron Cmd+F focus a labeled Find in page field. Entering domain reports 1/2 on Example Domain. Escape returns AX focus to page content in both.
- Native Cmd+Shift+N opens an incognito window; settled Cmd+L exposes Private and the explicit private-history notice, with address input focused. Disposable private window closed afterward.
- Native address panel has labeled Back/Forward/Reload/Favorite/Collapse/Pin/Close and footer controls. Compared with Electron, secure-connection control, Private, Spaces and Settings shortcuts are absent from this native panel. These are specific parity items requiring implementation or explicit preview disposition.
- Reference private shortcut produced no observed tree transition; no reference private pass claimed.

## Visual comparison limitation

Raw captures are retained as JPEG (initial local filenames incorrectly used png). Native window captures are2596x1992, Electron2560x1600. Full-screen attempt produced native4096x2304 vs Electron2560x1600 because apps occupy different displays. These are diagnostic captures, NOT matched-dimension visual acceptance. Required resting/panel/palette/find/private matched set remains incomplete. No screenshot resizing used to manufacture a match. The native screenshot was inspected: Island readable, no top highlight; no pixel-equivalence claim.

## Local identity and preservation

APFS clone of existing built app staged at /private/tmp/blanc-visual-isolation-20261022/Blanc Chromium Preview.app. Outer bundle ID me.bnfy.blanc.chromium.preview, name Blanc Chromium Preview; URL/document registrations removed from test clone. Deep ad-hoc signing and strict verification succeeded. This solved native CUA targeting ambiguity with Google baseline. It is NOT Developer ID signed/notarized, not a self-contained release artifact; helper identities and shared asset paths remain candidate work.

Only dev profile was cleanly reopened, on CDP9248, under the clone. Original two New Tabs and selected second tab verified after comparison cleanup; IDs changed naturally on restart. Google baseline CDP9225 remained separate and its one New Tab remained present. No baseline restart or upgrade operation. Temporary native comparison/private windows closed. Reference comparison tab closed via visible Close tab control; original reference window remains. Full personal tab/history snapshots retained only locally, not published.

## Acceptance disposition

L1 remains accepted. L2 local coexistence/targeting evidence improves, but fresh-profile final install/uninstall, helper identity and signed candidate isolation remain open. L5 native keyboard/AX evidence improves; actual VoiceOver speech/navigation and complete focus traversal remain open. AX is not a VoiceOver pass. L8 signing/notarization remains open. Progress1/12(8.3%), delta0 gates.

Next finite work: establish identical window geometry on one display; capture all five states; resolve/disposition the four missing panel affordances; run VoiceOver navigation; then test a self-contained signed candidate with fresh profile through install/coexist/restart/uninstall. No additional stress matrix substituted for these requirements.

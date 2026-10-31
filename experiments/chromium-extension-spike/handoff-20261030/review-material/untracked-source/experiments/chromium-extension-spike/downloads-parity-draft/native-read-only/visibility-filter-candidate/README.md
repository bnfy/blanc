# Native Downloads visibility candidate

The current released reference was checked again for this work: GitHub latest
is v1.45.0, tag commit `6f1bc523d2f0d432d5c4119b9f7ec22a324dbd2d`.
This is an **unregistered, unbuilt draft**, not a product fix or parity claim.
It retains the original `../projection.cc`; the candidate is a separate copy.

Independent review observed that the original projects items without the native
Downloads visibility rules. A temporary or transient entry with an empty name
or GUID can invalidate the entire list, and hidden items can be exposed. The
candidate consults a shared predicate before validating GUIDs or copying rows:
temporary/transient, empty filename/target/URL, trusted-extension and
`ShouldShowInUi` items are filtered consistently with the current Chromium 158
`DownloadsListTracker::ShouldShow`. It also filters `SILENT_BLOCK` as an extra
conservative rule. A mismatching attached browser context still denies the
whole projection before the filter. A null pointer, malformed visible filename,
or duplicate/empty GUID among visible rows still fails the whole snapshot; it
is not silently dropped as a successful empty result.

The predicate executes directly against the live item and uses the same native
trusted-extension helper and `DownloadItemModel::ShouldShowInUi`. Neither
establishes object lifetime: manager creation can reenter, constructing the
model registers an observer, and no proven manager/item generation, trusted
document or private-delivery fence exists. **Do not expose this candidate**
until these lifecycle and authorization problems are solved. The helper itself
is a plain template, allowing a fake item to exercise its control flow without
pretending to test Chromium's live manager.

The target/name gate matches native Downloads page behavior but can omit an
early in-flight or blocked item that shipping Blanc presents. `SILENT_BLOCK`
is not an exact transcription of the native Downloads page's predicate and
its correct row/notification behavior needs review. Chromium's bubble may show
some policy blocks even before a target exists. Do not use this candidate to
hide warning/recovery access; resolve a shipping-compatible surface and safe
warning route before integration. Exact trusted extension behavior and
regular/private family scoping also need a real browser test.

The candidate `projection.cc` SHA-256 is
`55c83953a8ad2709c1109429bd86a30eceaaed681334af30cad1c20a8a54b579`;
`visibility-policy.h` is
`807d12346098cfc728d67517d293a182bd0bfb93ff5fd91da6ea4722c6ee4a3c`.
With the existing Chromium 158 flags, `projection-syntax` exited 0; this is a
syntax check only. The new `visibility-test` built with Apple clang and exited
0 on fake items, checking each gate and that hidden cases short-circuit before
the expensive callbacks. Command/hash receipts and logs are alongside this
file. These do not exercise actual DownloadItems, downloads, observer
reentrancy, native warning UI, private profiles, or linked product behavior.
The compiler environment and transitive inputs were not fully pinned. Preserve
the original and all previous evidence; no browser, GN or Chromium build ran.

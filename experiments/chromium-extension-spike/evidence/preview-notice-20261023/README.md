# L9 acceptance: visible version/security notice and withdrawal route

Accepted October 23, 2026 for the bounded manual preview contract. This closes **L9**, not public release or the other launch gates.

## Artifact and source

- UI source: `9a1b4fa9b3ad6ebdb1ae7eebf10bea5d74533468`. Chromium remains `157.0.8103.15`; no Chromium compilation, upstream patch or toolchain change. Packaging compiled only the existing small launcher and reused the native output.
- Final stapled archive: `f177e0b5100db9a3fc83c7d5522cc343b86582add4d209d49696cef4f3729a55`.
- Apple submission `dbe289ff-82fd-4ddf-87ea-d2a3023677f6`: **Accepted**. Developer ID Anthony Loria / `XYGUCY4498`, strict deep verification, stapled ticket and Gatekeeper pass. Seventeen Mach-O code hashes and all seven notice resource hashes match the tested copy after stapling.
- macOS 27.2 / Apple Silicon. Original signed A/B candidates, existing native output, dev instance and separate Google baseline were not changed by this work.

## Visible notice and live route

The Start Page footer opens an offline, keyboard-accessible **Version & security** dialog. It displays the package's Chromium version, exact source revision, UTC package timestamp, supported platform and explicit **Not released — evaluation only** status. The version comes from the input app, not from shipping Electron's version or the reduced browser user agent. The packager rejects invalid revisions/versions, missing/duplicate metadata anchors, unsupported release-status claims and unreviewed link destinations.

The dialog contains manual update, matching-backup rollback, fresh-profile retreat and app-only removal instructions. It warns that the packaged status is a snapshot and that a manual-only preview cannot be remotely disabled. The Island footer opens the same live status URL. Links are explicit gestures: there is no background status fetch and no automatic update/migration.

**Live status/withdrawal route:** https://github.com/bnfy/blanc/pull/1028, at the top of the PR description. It is anonymously accessible (HTTP200) and matches the source-controlled `preview/status-notice.md`, including the final evaluation artifact's checksum. The numeric PR URL remains available after closure; the sole maintainer must keep this section current while supported previews reference it. Its current status explicitly withholds public distribution. On withdrawal it must name affected versions and direct users to quit, use shipping Blanc and preserve data. Private reports use the existing `support@blanc.day` mail link; link destination verified, no email sent or delivery guarantee claimed.

## Acceptance

- **16 signed notice checks:** exact metadata; visible Start Page control; no automatic status request observed; offline status/instructions; reviewed link destinations; wide/light and minimum-window/dark dialog geometry; Escape and focus return; Close without navigation; visible Island control; actual navigation to the status page; clean exits and post-restart tabs/notice persistence.
- **Two additional signed layout checks:** footer control visible and non-overlapping with Customize at 1000px and the native 500px minimum width. Screenshots include the opaque light/dark dialog and footer.
- **16 focused source checks:** four Python metadata tests, three JS notice behavior/destination/withdrawal tests, and nine existing theme/Trusted Types/layout guards. Scoped lint passes.
- The preceding [43-check signed update/rollback acceptance](../signed-update-rollback-20261023/README.md) proves replacement, matching closed-backup rollback, preserved newer profile, fresh-profile retreat and app removal. Native persistence code and the manual-update mechanism did not change here.

## Retained failures and repairs

The first notice used a translucent theme surface; screenshots exposed the page clock through it. It now uses the same theme color with opaque alpha and retains the existing page readability overlays. Explicit modal state also integrates with the start-page typing guard.

The first Escape assertion ran before the queued close/focus event settled; the focused event probe verifies cancel → close → focus return. A close-button assertion confused Chromium's virtual new-tab URL with the underlying WebUI URL; the corrected assertion compares the document URL before/after closing. A restart assertion polled before DOM initialization; the final check waits for the visible control. These fixture failures are retained separately, not counted as passing runs. A supplemental color assertion expected `rgb(...)`, while CSS relative colors serialize as `color(srgb ...)`; both final backgrounds have implicit alpha one, verified visually and from the computed values.

Headless SSH signing hit `errSecInternalComponent`. A temporary launchd job in the existing logged-in GUI session successfully used the retained Developer ID; both temporary jobs were removed. No key exported or keychain protection changed. The first remote fetch used an unescaped space-containing path; directory transfer corrected it. The superseded pre-opacity package's Apple receipt is retained but is not the accepted artifact.

## Scope and cleanup

No new physical-input/VoiceOver approval, complete security review, new public-download quarantine/fresh-machine acceptance, performance claim or release approval is asserted. Existing L1/L2 acceptance remains; total is **3/12 (25%), delta +1 L9**. Remaining gates keep their own requirements.

All acceptance profiles/apps are disposable. Credentials, private keys and profile databases are excluded. The owner's retained SSH key remains as requested; the Google ledger/baseline is excluded from commits. Latency and the Electron diagnostic build remain pending.

Cleanup verified no owned app process remained. Six local disposable paths and the two remote signing staging directories were removed; final signed master, receipts and archived evidence remain. The retained SSH key and original Google/dev profiles were not modified.

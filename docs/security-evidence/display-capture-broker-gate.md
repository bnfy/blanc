# Display-capture broker release disposition — 2026-09-10

This is the current release record for the display-capture broker. Earlier
candidate files remain historical evidence; their FAIL and NOT RUN results are
not promoted to PASS here.

## Selected source

The release source is the current `main` integration plus the platform lock
introduced by `419c7294efe8076948c4f883647c508106e94d0e`:

| Platform | Selected capture runtime | Acceptance basis |
| --- | --- | --- |
| macOS | Exact Playout capture trio from `fda425eb`, selected through the platform lock | Notarized private `419c7294` package; owner accepted moving video, clean system audio, no loop, background Stop, independent share, and mic/camera continuity |
| Windows | Original `c26127eb` capture trio | Authenticated private installer; owner accepted the recorded completed cells and explicitly waived the remaining Parallels-blocked cells |
| Linux | Byte-identical `c26127eb` capture trio in Linux-only files | Authenticated arm64 AppImage; receiver, controls, coexistence, independent-share, and denial matrix passed; owner waived the remaining live transport replay |

`src/main/capture-runtime-lock.json` pins the nine platform runtime files and
the shared capture boundary. The packaged `afterPack` check must reject drift.
Do not reunify the platform files or update their hashes merely to make a check
pass. Any change to a pinned file requires a new impact decision naming the
affected platform.

## Artifact-bound evidence

| Platform | Artifact | Completed evidence | Deliberately incomplete |
| --- | --- | --- | --- |
| macOS | `Blanc-1.15.0-arm64.dmg`, SHA-256 `80979771102d758a7a0f0f0be49376b70b4e754b1a42539710e3533e4a63fc53`, source `419c7294` | Developer ID, notarization, Gatekeeper, stapler, hardened fuses, cold launch, Meet receiver video and system audio, clean/no-loop observation, background Stop, independent second share, mic/camera during sharing and after Stop | Cancel and the Personal/named/private negative matrix were not rerun on this exact package |
| Windows | `Blanc-Setup-1.15.0.exe`, SHA-256 `20837e7b7c606c978c679ce722ef2aa9e83a728088dc502191fd0e35909e43cd`, source `c26127eb` | Authenticode identity/timestamp, install/launch, receiver system audio with muted mic, Cancel, background Stop | Mic/camera after Stop was blocked by Parallels media; live SDP/ICE tampering and bare-metal conference coverage were not run |
| Linux | `Blanc-1.15.0-arm64.AppImage`, SHA-256 `b35616f0c3b6ac631f9e6bd10c11e626a0a70668605a08f517ec917834dc31dd`, source `c26127eb` | Authenticated manifest, receiver video/audio, Cancel, background Stop, mic/camera coexistence, independent second share, Personal/named/private denial matrix | Live-share SDP/ICE tampering was not rerun on this AppImage |

The Mac details are in
`display-capture-broker-candidate-419c7294-2026-09-10.md`. The source lock and
packaging checks are in `display-capture-platform-lock-2026-09-10.md`.

## Owner disposition

On 2026-09-10 the owner directed that Windows and Linux ship as-is and that
post-release user reports be triaged. The accepted risk is:

- Windows microphone/camera continuity is not proven on `c26127eb` because the
  Parallels guest media devices failed; live transport tampering and bare-metal
  conference coverage were not run.
- Linux live-share transport confinement was not repeated on the final arm64
  AppImage. The same boundary has prior Mac transport evidence, but that is not
  same-artifact proof.

These rows remain incomplete rather than being labeled PASS. The Mac owner
acceptance likewise does not relabel its unperformed Cancel or negative-matrix
rows.

## Release handoff

The private conference packages used Electron 44.1.1. Current `main` uses
Electron 44.2.0 for the CVE-2026-85046 Chromium fix and must not be downgraded.
No exact-44.2.0 conference rerun is claimed by this record. Before publication,
the owner must explicitly accept carrying the artifact-bound conference evidence
forward to the security-updated runtime or request a final-package conference
smoke. That is the only remaining display-capture evidence decision.

Otherwise, capture acceptance is closed unless a pinned runtime or shared
capture-boundary file changes. The remaining work is ordinary release
integration and publication:

1. Review and merge the clean current-`main` integration.
2. Build versioned release artifacts through `scripts/release.sh`; public
   `v1.15.0` is immutable, so private `1.15.0` candidates are evidence inputs,
   not publishable release assets.
3. Require the normal macOS signing/notarization, Windows Authenticode, Linux
   authenticated manifest, hardened-fuse, packaged-payload, SBOM, provenance,
   and logged-out download checks.
4. Complete the adjacent public updater handoffs and the release/site incident
   record. A directly launched installer is not an updater-handoff test.

No additional Meet campaign is scheduled by this record. A release artifact
that fails the platform-lock or ordinary packaged checks stops the release.

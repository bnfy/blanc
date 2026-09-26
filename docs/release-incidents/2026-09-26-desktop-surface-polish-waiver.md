# Desktop surface polish manual-machine waiver — September 26, 2026

PR [#431](https://github.com/bnfy/blanc/pull/431) polishes Blanc's app-owned desktop surfaces. This is a merge gate record, not a public release record.

The private [Windows/Linux candidate run](https://github.com/bnfy/blanc/actions/runs/36271158883) passed at commit `b34481a048ad0adbaa7ad82f86bb199839822e19`. Its Windows job verified packaged payloads, fuses, camera/microphone behavior, timestamped Authenticode identity, and installed protocol/registration cleanup. Its Linux job verified the packaged AppImage and runtime checks. All required PR checks passed.

**Unperformed evidence:** no owner confirmation of installing and using the private candidates on affected physical Windows or Linux machines was provided. Hosted CI cannot rule out device-specific launch, layout, focus, or interaction defects in the changed UI.

After this missing evidence and risk were stated in the task, the owner replied **“waive”** on September 26, 2026. That written response waives the manual affected-machine confirmation for both Windows and Linux for merging PR #431. It does not waive future release verification, updater handoffs, or any public release gate.

# Rail, native history/mute and Store promotion evidence

October 18, 2026 EDT. See `native-install-proof.md` inside the archive for actual native computer-use steps and limits. JSON reports cover native-bridge integration, private isolation, restart and restored preview. All archive members are SHA-256 checked against `sha256.json`.

The Store test used normal Google installation of Extensity 1.14.0, its actual native permission and success dialogs, restart, and native removal. The disposable profile was deleted; no profile/cookies/private keys are archived. Original preview tabs were restored.

Builds were incremental: failures 14.66/35.98 s retained; successful wrapper durations 39.57/57.36/41.97 s. Final guard zero actions; footprint 40 files/94 hunks. Four focused tests and scoped lint pass. Initial harness made an unsupported getExtensions call; corrected harness and restarted host pass. The first harness revision was not separately snapshotted; its limitation is recorded, not presented as a clean first pass.

Remaining: matched visuals, broader rail drag/group/window restoration qualification, profile-wide vs per-window Recently Closed semantics, page-load promotion flash and empty AX wrapper. Latency deferred; Electron diagnostic build unapproved.

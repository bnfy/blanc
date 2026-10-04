# uBlock Origin support matrix — v1.27.0 candidate

**Prepared for owner release confirmation; not a published release.** The
public baseline remains v1.26.0. The proposed rollout enables full uBlock Origin
1.75.0 on official Electron 44.5.1 / Chromium 152.0.7977.130 for the verified
combinations below. No Lite substitution or general extension installation is
provided.

| Desktop combination | Proposed uBO availability | Installed evidence |
| --- | --- | --- |
| macOS Apple Silicon (`darwin-arm64`) | Enabled | Signed/notarized DMG-installed build 1272: blocking, tools, persistence, three provider restarts, native close/reopen/Quit, no-scripting; authenticated v1.26.0 → candidate through the actual Restart Now prompt. |
| Windows x64 (`win32-x64`) | Enabled | Timestamp-signed NSIS installed on native hosted Windows x64: blocking, tools, persistence, provider restarts, last-window exit, no-scripting. Existing Windows 11 ARM64 VM complements this with x64 emulation and actual v1.26.0 → candidate Restart Now. The owner confirmed post-update close, Start-menu relaunch at v1.27.0, and second close; no process remained. |
| macOS Intel (`darwin-x64`, native) | Enabled | Exact signed/notarized DMG-installed build 1273 on native hosted Intel: publisher/ticket/hashes/fuses, controls, persistence, three provider restarts, close/reopen/Quit and no-scripting all pass. Rosetta is unavailable and uses Blanc Blocker; both translated startup failures are retained. |
| Linux x64 (`linux-x64`) | Enabled | Native outer AppImage: blocking/tools, three provider restarts, post-restart renderer sandbox, saved filters, normal last-window exit/relaunch and no-scripting pass. Ubuntu 22.04/24.04 uBO-selected direct/menu/nested/extracted sandbox and refusal suites pass. |

Sanitized observations and exact source/artifact bindings are in the
[installed acceptance record](evidence/ublock-installed-acceptance-2026-10-03/README.md).
The Mac arm64 and Windows candidates were produced from `92e27667916b2f556b148268f5a7ee3ce53000fd`; exact signed Intel build 1273 is bound to `0872ed7225d3561e98fdee2f80cee1d12a72af09`.
Linux installed/normal relaunch acceptance is bound to `de6c00170639381a80e0fbcf786bc200e57b32b0`.
The final release is reserved as bundle build 1274 or later and requires
final exact-head CI and normal release signature/payload verification. Internal
build 1272 bypasses platform enablement only; no runtime fuse or sandbox was
relaxed. This is not a claim that the final release binary has already shipped.

The existing Linux VM is Ubuntu 26.04 ARM64. The x86-64 AppImage cannot execute
there, and the ordinary user namespace probe is denied. No second VM, emulator,
AppArmor change or sandbox bypass was introduced. Native Intel and native Linux x64 installed acceptance now pass. Linux observations
come from hosted native x64 desktops; they do not certify the incompatible
ARM64 VM. Windows ARM64 emulation
is supplemental evidence, not a new distributed architecture or a replacement
for the native x64 suite. The VM's first installed attempt timed out at Dashboard
Apply; the unchanged second attempt passed. Intel CI's first attempt hit the
required two-second decision deadline; the unchanged rerun passed. Both failures
remain recorded.

## User behavior and integration limits

- Blanc Blocker is the default. Click the Island shield, choose a blocker, then
  use **Restart Blanc** when required. Selecting uBO changes regular tabs on
  this device; private tabs continue to use Blanc Blocker and never enter uBO's
  tab registry, requests, counts or logger.
- Each regular profile keeps its own uBO configuration. Provider selection and
  uBO settings are outside Profile Sync. The providers keep separate site
  exceptions; uBO's popup and Trusted sites panel manage its own exceptions.
- The adapted original popup, Dashboard panels, Logger, picker/zapper, custom
  filters, dynamic rules, subscriptions and backup/restore remain available.
  Blanc supplies browser APIs and presentation; the upstream filtering engine
  stays pinned. Executable resources ship with reviewed Blanc releases. Filter
  data may update automatically and cached filters remain available offline.
- Remote executable resource updates and custom resource URLs are blocked,
  including imported advanced settings. Unsupported cloud/privacy controls
  describe their availability. Blanc's DNS, WebRTC and permission policy remain
  authoritative.
- The global blocking switch stops new filtering and removes provider-owned
  cosmetic CSS. Existing scriptlet effects require a page reload. Blanc does
  not automatically replay POST pages.
- An unavailable provider in a later build activates Blanc Blocker with a
  notice and preserves uBO settings. A running available uBO that fails or
  exceeds a two-second blocking decision deadline fails closed for its profile
  and offers recovery. Queue overflow cancels excess requests individually.
  This preserves the owner's requested security behavior and can interrupt
  browsing until Retry or an explicit recovery choice.
- The GPL-covered extension, preferred-source inputs, adaptation patches,
  build instructions and notices are packaged and checked. The owner-directed
  distribution decision is recorded without claiming outside legal sign-off.
  The reserved Sunrise mark is served from Blanc's first-party interface, not
  copied into the GPL extension payload.
- Diagnostics remain local and bounded. No new telemetry records browsing
  URLs, headers, bodies, filters or logger content.

The final release still follows protected merge, per-alert approved CodeQL
dispositions after draft, signing/notarization, authenticated manifest,
provenance, logged-out download and post-publication checks. The public feed is
unchanged during candidate testing.

# v1.27.0 uBO candidate evidence — October 3, 2026

These are internal validation artifacts: full uBO 1.75.0 on official Electron
44.5.1, Blanc 1.27.0, macOS bundle build 1270. They are not the public v1.26.0
baseline or permission to enable a platform. No public tag, release or updater
entry was created. The owner directed distribution without outside legal
sign-off; see [that decision](../../ublock-origin-owner-distribution-2026-10-03.md).

## Candidate results

| Candidate | Observation | Remaining acceptance |
| --- | --- | --- |
| macOS arm64 | Signed and notarized DMG; actual packaged no-scripting probe passed | Owner installation, tools/persistence, normal exit/relaunch and staged Restart Now |
| macOS x64 | Signed and notarized DMG; two Rosetta launches failed with uBO startup timeout | Failure investigation and Intel installed acceptance; keep platform off |
| Windows x64 | Signed NSIS installer; real installed no-scripting probe and native workflow passed | Owner tools/persistence, close-last-window/relaunch and staged Restart Now |
| Linux x64 | AppImage/native workflow, extracted-package no-scripting probe and Ubuntu 22.04/24.04 sandbox jobs passed | Owner direct/integrated-menu launch, tools/persistence and close/relaunch |

Mac/Linux candidates were built from `2bbcbc844116b4de3e6599f1828ad3fa0986dc74`.
The Windows retry was built from `586cb47d60002fe2a7bc979b116e62fb7ca1c87c`;
that change only normalized the test harness's ASAR paths for Windows. The later
`c9be17ea` verifier follow-up normalizes the same lookup in the public packaging
gate. Neither changes the packaged browser/uBO implementation.

- [Exact candidate-source desktop CI](https://github.com/bnfy/blanc/actions/runs/37152584781): all four desktop jobs and ordinary packaging passed.
- [First native candidate run](https://github.com/bnfy/blanc/actions/runs/37152590931): Linux and both sandbox jobs passed; Windows failed in the probe's ASAR lookup before launch. This remains a failed attempt.
- [Windows retry](https://github.com/bnfy/blanc/actions/runs/37153103797): passed, including the probe against the NSIS-installed application.

## Durable files and byte correspondence

[Candidate manifest](candidate-manifest.json) records each installer/ZIP SHA-256,
size, source commit and hosted run. All update metadata SHA-512 values and the
copied isolated staging-feed asset bytes were checked. This is not a
Sigstore-authenticated public release manifest. Hosted artifacts expire after
three days; these sanitized records remain committed.

[Mac installer checks](macos-installer-signing.json) were performed against the
apps inside read-only mounted DMGs: strict deep signature, pinned Developer ID
certificate, Gatekeeper, stapled ticket and actual packaged uBO sources/notices.
Both contained executable/ASAR pairs match the probe digests. The normal build
also completed its signing/provisioning-profile/entitlement and packaged-payload
hooks. A mounted DMG check is not an installation or owner acceptance.

[Windows signature record](windows-signature.json) has `Valid` Authenticode,
the exact expected publisher and a timestamp authority. Its installer SHA-256
matches the downloaded candidate. This records the hosted Windows checks; it
does not claim native Authenticode verification on the local Mac.

[Mac arm64](macos-arm64-noscript.json), [Windows installed](windows-installed-noscript.json)
and [Linux extracted-package](linux-extracted-noscript.json) probes passed.
Active controls executed inline, inserted, external, image-handler and
JavaScript-link scripts. uBO's actual no-scripting popup switch prevented every
tested execution marker and external-script request, while reconstructing the
visible fallback. Chromium reported an enforced `script-src http: https:`
violation and turning the switch off restored original script execution.
DevTools returned a null CSP response-header value; no header is inferred from
that null. Meta refresh has no executing positive control. The probe is bounded
to its listed payloads and is not a general proof that arbitrary HTML is safe.

## Retained Intel/Rosetta failures

[First attempt](macos-x64-rosetta-first.json) failed at provider startup while
other build work was running. [Idle retry](macos-x64-rosetta-idle.json) failed at
the same stage with `ubo-startup-timeout`. No protected-page execution test ran.
The app reports x64; the Node harness and physical Mac are arm64. This is a
Rosetta result, not a physical Intel result, and the idle repeat prevents
attributing the failure solely to concurrent signing/compression.

The probe now records architecture from the running app's existing Settings
API, distinguishing it from harness architecture, and retains only a bounded
provider error code. No URLs, headers, filter content, user profile or raw
process output is saved. The 15-second startup policy, two-second request
deadline, sandboxing and official runtime are unchanged. Intel remains gated.

## Owner checks and security state

Use the [installed-candidate checklist](INSTALLED-CANDIDATE-CHECKS.md). The owner
confirmed Apple Silicon, Windows and Linux availability, not completed tests.
Linux extracted-package coverage is distinct from actual direct/integrated-menu
AppImage acceptance. Automated process termination is not a normal window-close
or user relaunch test. Updater discovery/download/install is distinct from a
user clicking the real Restart Now prompt.

A read-only PR merge-ref comparison still returned the same 39 open vendored
CodeQL alerts, zero new/first-party findings. None was dismissed. All 39 owner
dispositions remain deferred until PR #490 leaves draft. Platform flags remain
disabled pending their installed acceptance.

## Isolated public N-1 Mac updater rehearsal

[The Mac rehearsal](macos-updater-rehearsal.json) passed from the actual public
v1.26.0 Apple Silicon ZIP to this v1.27.0 candidate. The old ZIP was checked
against its Sigstore-authenticated manifest with the pinned operator identity
and issuer before extraction. The harness copied it to an isolated location,
served only the private staged metadata/assets on loopback, observed discovery
and download, invoked Squirrel's update path, verified the stabilized deep
signature/new version and relaunched v1.27.0. The replacement executable/ASAR
match the signed candidate probe and DMG bytes.

This uses the maintained auto-install seam rather than clicking the ordinary
Restart Now prompt. It does not satisfy that separate owner interaction or
prove preservation of a real user's settings. The personal installation and
public feed were unchanged. Squirrel left its root-owned temporary replacement
for normal administrator-authenticated inspection/disposal; the harness removed
its isolated profile and status files. No privileged cleanup bypass was used.

# Linux ECS CDM sandbox diagnosis and isolated experiment

Production remains unchanged. This work is confined to
`codex/ecs-native-qualification` and disposable native Linux candidates.
Nothing here authorizes publishing a modified runtime.

## Native cause

The exact ECS 44.9.3+wvcus Linux x64 vendor archive has SHA-256
`80cb5218ab814597282ebe41d16fb5a98abb0c75370e9195914e40e097359fad`.
Its executable SHA-256 is
`ea41e23f4833628bc18948a4cf9f5597040226c128b01c6531dfe86a41edc2b4`.
Matching vendor Breakpad symbols identify `GetZygote` at virtual address
`0x8635800`, source `content/browser/service_host/utility_sandbox_delegate.cc`.

At `0x8635812` (ELF file offset `0x8634812`), the native selection mask is
`0xb0`: sandbox enum values 4, 5 and 7 return no zygote. In this Linux build
those are CDM, network and no-sandbox. Chromium's normal CDM selection uses the
generic sandboxed zygote instead. This explains why JavaScript
`app.enableSandbox()` and a native `--enable-sandbox` argument did not fix it.

Primary-source comparison:

- [Chromium 152 utility sandbox selection](https://chromium.googlesource.com/chromium/src/+/152.0.7977.167/content/browser/service_host/utility_sandbox_delegate.cc)
- [Chromium 152 sandbox enum](https://chromium.googlesource.com/chromium/src/+/152.0.7977.167/sandbox/policy/mojom/sandbox.mojom)
- [Chromium 152 pre-sandbox CDM loading](https://chromium.googlesource.com/chromium/src/+/152.0.7977.167/content/app/content_main_runner_impl.cc)
- [ECS vendor release and matching symbols](https://github.com/castlabs/electron-releases/releases/tag/v44.9.3%2Bwvcus)

## Experiments and safeguards

The first exact-hash experiment clears only mask bit 4, preserving network and
no-sandbox behavior. [Run 39896487117](https://github.com/bnfy/blanc/actions/runs/39896487117)
then reached the sandboxed loading path but failed CDM creation: opening the
installed CDM returned `Operation not permitted`. This occurred with both
separate and shared session profiles. Local-HTML security, normal startup,
restart, cleanup and staging metadata checks still passed.

The second experiment additionally preloads the installed CDM into the generic
zygote before sandbox lockdown, without initializing its DRM interface. This
matches the ordering in Chromium's `PreloadLibraryCdms()`; loading a new native
library after lockdown is intentionally forbidden. The helper does nothing in
the browser, renderer, ordinary utility or explicitly unsandboxed zygote.

The experimental code:

- Refuses every vendor executable except the exact reviewed hash and checks the
  exact instruction bytes. It changes one mask byte, not the CDM or DRM checks.
- Records original/patched runtime hashes and compiled helper/source hashes in
  candidate evidence. No Widevine binary is redistributed or bundled.
- Selects only a numeric-version CDM directory inside an explicitly marked
  isolated profile, validates its manifest version, and refuses redirected
  library paths. A fresh profile keeps the ordinary first-install restart.
- Uses a small compiled preload-only helper with no exported interposition API;
  failed preloading terminates the generic zygote rather than removing its
  sandbox. It never disables seccomp, namespaces or no-new-privileges.
- Is restricted by the builder to Linux x64 native validation. It cannot run
  through the production qualification-signing path. No production fuse,
  entitlement, runtime pin or updater feed is changed.

## Verified second native result

[Run 39896827396](https://github.com/bnfy/blanc/actions/runs/39896827396),
source `1997ff542`, passed every Linux validation step. The actual AppImage in
extract-and-run mode loaded Widevine 4.10.3112.0 and advanced CENC H.264 video
from 0.083333 to 5.013175 seconds in 5.002 wall-clock seconds, at rate 1,
without seeks or media errors. Linux returned `PLATFORM_UNVERIFIED`, not a
claim of VMP certification.

The owned CDM process mapped Widevine and had all required kernel protections:

| Check | Result |
| --- | --- |
| Seccomp | 2 (filtering) |
| NoNewPrivs | 1 |
| Separate user namespace | Yes |
| Separate PID namespace | Yes |
| Sandbox type | `cdm` |
| `--no-sandbox` | Absent |

The first installation still reported `restart-required`; the next process
reported `ready`. The independent local-HTML/frame/worker/WebRTC matrix passed
initial load, reload and restart, with zero HTTP requests and zero STUN packets.
All temporary profiles were removed after shutdown. Native startup/restart,
fuses and staging-only metadata discovery also passed. Only sanitized JSON was
uploaded; no installers, CDMs or profiles were published.

The full local unit suite passed 4,249 tests and lint passed. The subsequent
launcher-only change uses the same profile/preload selection, retaining the
macOS signature check and refusing an unmarked candidate.

## Reproduction and release boundary

Use the isolated launcher with the built Linux `dist/linux-unpacked` directory:
`node scripts/run-full-ecs-candidate.cjs /absolute/candidate/dist/linux-unpacked`.
The launcher retains its own marked profile, passes native `--user-data-dir`,
and supplies the preload helper only when the candidate contains it. Launching
the AppImage directly without this setup is not the qualified experiment.

This is an experimental native workaround, not an upstream source-built ECS
fix or a release-ready Linux package. Before shipping, replace it with a
reviewed source-level runtime integration (or explicitly qualify this exact
mechanism), reproduce the full native matrix, test CDM updates/rollbacks and
offline starts, and preserve the normal release/signing/supply-chain gates.
Every ECS upgrade requires renewed review: the hash guard intentionally fails
closed on a different runtime. Spotify/Netflix account playback and audible
hardware output are not inferred from the hosted encrypted-video sample.

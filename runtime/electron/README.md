# Blanc Electron capture runtime

This candidate uses Electron 44.2.0 with one reviewed source patch. Stock
Electron does not distinguish standard `getDisplayMedia` from legacy
`chromeMediaSource` permission requests. Blanc rejects the legacy category and
accepts the standard category only through fresh, source-bound consent.

`source.json` pins Electron, Chromium, depot_tools, build arguments, and patch
hashes. Chromium's commit resolves its upstream
[152.0.7977.76 tag](https://chromium.googlesource.com/chromium/src/+/refs/tags/152.0.7977.76).
The patch adds browser-derived API kind, native requesting frame identifiers,
and requested audio/video kinds. These fields are not supplied by page code.

## Native build

Use a separate directory without spaces. Install the platform's Electron build
prerequisites, including Git LFS, Python 3, Git and its native compiler/toolchain.
On Windows, build in a native Windows environment with the required Visual Studio
C++ and Windows SDK components. On Linux, use the supported distro dependencies.
The driver uses the pinned upstream gclient toolchains and release arguments.

```sh
python3 runtime/electron/build.py --root /absolute/build/root --stage sync
python3 runtime/electron/build.py --root /absolute/build/root --stage package --jobs 4
node runtime/electron/stage.mjs /absolute/build/root/src/out/BlancRelease
```

Fresh sync requires 80 GiB free. This is a starting guard, not a promise that a
complete Chromium build fits in that space. Every stage stops with 20 GiB free;
provide additional storage before continuing if that guard is reached. The
default four compile jobs are deliberately conservative. Each platform needs
its own native archive. A macOS archive cannot package Windows or Linux.

The archive and `blanc-runtime-build.json` are staged under ignored `.runtime/`.
`beforePack` verifies their target, exact source and patch metadata, and archive
hash before electron-builder runs. `electronDist` points directly to the staged
archive so a missing hook result cannot fall back to stock Electron. Framework
license records also come from that archive. The manifest ships in resources;
the patch and source lock ship in app.asar.

For Linux, install `libpulse-dev` and `pkg-config`, then run
`npm run build:linux-audio` on the target architecture. Packaging checks the ELF
architecture, source hash, binary hash, and copies the matching build record.
The helper dynamically uses the system's LGPL-licensed libpulse. PulseAudio
and PipeWire's PulseAudio service are supported targets; bare PipeWire is not.

## Validation and maintenance

Run the deny-only routing fixture against each newly built runtime:

```sh
BLANC_PROBE_EXECUTABLE=/absolute/path/to/patched/electron npm run test:display-capture:routing
```

A passing routing probe alone does **not** establish successful capture. Native
source selection, actual video and computer-audio samples, cancellation,
permission recovery, frame/window teardown, microphone/camera preservation,
long-running capture, packaged signing/fuses, and real meeting sites remain
separate gates. See the dated screen-sharing incident for current evidence.

For every Electron update, rebase and review the patch, update every pin and
hash, rebuild all target archives, and repeat the routing and capture gates.
Never reuse another platform's archive, alter immutable public releases, or
claim stock Electron provides this custom API. Native CI artifact transport,
three-platform build capacity, and the release handoff must be completed before
this candidate can replace the public launch release.

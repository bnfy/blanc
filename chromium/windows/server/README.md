# Windows cross-build on the Linux server

The desktop fork's Windows build is compiled on the x86-64 Linux server rented
for the Android lane, using Chromium's own Linux-to-Windows cross build
(`docs/win_cross.md` in the Chromium tree). Owner decision D4, 2026-11-17;
design in `docs/superpowers/specs/2026-11-17-windows-fork-design.md`.

Windows is not a lane of its own. It builds the **desktop lane**
(`chromium/lanes/desktop.json`): the same patches, the same `chromium/blanc/`
source and the same Chromium pin as the Mac.

## Layout on the server

| Path | What |
| --- | --- |
| `~/depot_tools-desktop` | depot_tools pinned to the Mac Studio's commit. The Android lane's `~/depot_tools` is separate and never touched. |
| `~/chromium-desktop/src` | Chromium at the desktop pin, `target_os = ['win']`, no history. |
| `~/chromium-desktop/src/out/BlancWinPrototype` | The Windows x64 preview output (`chromium/windows/args/prototype-x64.gn`). |
| `~/chromium-desktop/.blanc-applied-source-map.json` | What `apply.py` last placed, passed back as `--previous-map`. |
| `~/blanc-assets/win-toolchain/` | The packaged Visual Studio and Windows SDK (`<name>.zip`) and the key that decrypts it. Never in Git. |
| `~/blanc-evidence/windows/` | Logs, apply backups and other raw evidence. Never in Git. |

## Rules

- Build only through the guard: `node chromium/tools/build.mjs ~/chromium-desktop/src --check --out=BlancWinPrototype`,
  then `--build`. The guard refuses a changed environment, a second `siso ninja`
  on the machine (the Android lane builds here too) and a plan over 1000
  actions without `--allow-large-build`.
- A cold build, a new output folder, a toolchain change or a new Chromium pin
  needs the owner's scoped approval first.
- Never run hooks, clean an output or change `args.gn` as a routine step.
- The server holds no signing key and no GitHub credential. A built candidate
  is copied off by the operator's Mac (`chromium/windows/ship-candidate.sh`).
- The desktop checkout (`~/chromium-desktop`) is shared with the Linux lane
  and the Windows nightly, which take turns through
  `~/chromium-desktop/.blanc-checkout.lock`. A lock the guard or the nightly
  takes holds an `owner` token; the guard's refusal names its first 8 hex
  digits. If a crash left the lock behind: confirm no process holds it (no
  `siso ninja`, no `nightly-build.mjs`, no setup script), then
  `rm -f ~/chromium-desktop/.blanc-checkout.lock/owner` and
  `rmdir ~/chromium-desktop/.blanc-checkout.lock`.
- Crash capture works in this cross build (W1 Part B): Chromium's docs say the
  assembly Crashpad needs is stubbed, but this tree assembles it with llvm-ml.
  Dumps are written locally; there is no crash server to upload to.

## The Visual Studio package

The pinned tree names what it needs in `build/vs_toolchain.py`
(`TOOLCHAIN_HASH`, `SDK_VERSION`, the first entry of `MSVS_VERSIONS`). The
package is made once per Chromium pin on a GitHub-hosted Windows runner by
`.github/workflows/chromium-windows-toolchain.yml`, which runs depot_tools'
`win_toolchain/package_from_installed.py` and encrypts the zip with `age` to
the public key in `chromium/windows/toolchain-recipient.txt`. The private key
exists only on this server (`~/blanc-assets/win-toolchain/key.txt`), so the
package is never redistributed and GitHub holds no secret for it.

To stage a new package:

1. Run the workflow (`gh workflow run chromium-windows-toolchain.yml --ref chromium/next`)
   and download its artifact on the operator's Mac.
2. Copy the `.age` file to `~/blanc-assets/win-toolchain/` on the server.
3. Decrypt it there: `age -d -i key.txt -o <name>.zip <name>.zip.age`, check
   the SHA-256 against the workflow's summary, and remove the `.age` file.
4. Keep exactly one `.zip` in the folder; `bootstrap.sh` stops otherwise.

## First setup and rebuilds

```
bash chromium/windows/server/bootstrap.sh --dry-run
bash chromium/windows/server/bootstrap.sh
node chromium/tools/build.mjs ~/chromium-desktop/src --record-environment --out=BlancWinPrototype
node chromium/tools/build.mjs ~/chromium-desktop/src --check --out=BlancWinPrototype
```

After a reboot, run `bash chromium/windows/server/mount-toolchain.sh` before
building. The Windows SDK is served through a case-insensitive FUSE mount
(ciopfs) that a reboot removes, and the script also gives that process a
build-sized open-file limit; with the default 1024 a parallel build fails with
"Too many open files" on SDK headers (the first cold build did, 2026-11-17).
The build guard refuses to start while the mount is missing.

Node on the server is Chromium's own
(`~/chromium-desktop/src/third_party/node/linux/node-linux-x64/bin`); it is not
on `PATH` by default. Run long commands inside `tmux`.

After a change to `chromium/` in Git, pull the repo clone and run
`bootstrap.sh` again: it applies only what changed and keeps the output.

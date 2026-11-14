# Android build server

The Android lane builds only on x86-64 Linux. Its machine is a rented Hetzner
EX63-1 (Intel Core Ultra 7 265, 20 cores, 64 GB RAM, 2 × 1 TB NVMe, Ubuntu
24.04 LTS, Helsinki), used by a non-root build user over SSH. The server never
holds the Play upload key or the Play API credential: signing and upload run
from the owner's Mac through `op run` (A7).

## What lives where

| Path | What |
| --- | --- |
| `~/depot_tools` | depot_tools at the commit pinned in `bootstrap.sh` (`DEPOT_TOOLS_UPDATE=0`). |
| `~/chromium-android/src` | Chromium for Android at `chromium/lanes/android.json`'s `upstream`, without history (`gclient sync --no-history`), with the lane's Blanc source applied. A new pin is fetched the same way. |
| `~/chromium-android/src/out/AndroidDebug` | arm64 debug build (`args/debug-arm64.gn`), for the Pixel. |
| `~/chromium-android/src/out/AndroidDebugX64` | x86_64 debug build (`args/debug-x64.gn`), for the emulators. |
| `~/blanc-evidence/android/` | Raw evidence (gate reports, screenshots, NetLogs) and `apply.py` backups. Never in Git. |

## Setting up

`bash chromium/android/server/bootstrap.sh --dry-run` prints every action it
would take and changes nothing. Without `--dry-run` it runs them; the first
real run downloads the whole Android checkout and is part of the owner's
approval for A0's cold build. Re-running it is safe: it skips what is already
in place, never deletes an output folder, and stops if an `args.gn` differs
from the tree's.

## The blocker's bundle

ZXing core 3.5.3 (`blanc/android/zxing/core-3.5.3.jar`, sha256 in `blanc/android/BUILD.gn`) isn't in git either: keep it in `~/blanc-assets/zxing/` and copy it into the checkout after `apply.py`.

`blanc/android/blocker_assets/engine.js` isn't in git. Keep the bundle in `~/blanc-assets/blocker/`
and copy it into the checkout after `apply.py` (`mkdir -p blanc/android/blocker_assets`); a missing
file fails the build. It comes from
`experiments/chromium-extension-spike/native/blocker/bundle.mjs`, and Blanc refuses any bytes but
`kBlancBlockerBundleSha256` (`blanc/services/blocker/bundle_hash.h`).

## Two emulators

The server runs two emulators of the same AVD (`android_36_google_apis_x64`, 4 cores and 4 GB each),
so two checks can run at once. `bash chromium/android/server/emulators.sh` starts any that aren't
running, each in its own tmux session:

| Emulator | tmux session | Data |
| --- | --- | --- |
| `emulator-5554` | `emulator` | Kept across runs (`--no-read-only`). |
| `emulator-5556` | `emulator2` | Read-only: what a run changes is gone when the emulator stops. |

With both running, plain `adb` refuses to guess ("more than one device"), so every check names
its emulator with `ANDROID_SERIAL`, which adb and every script here follow:

```
ANDROID_SERIAL=emulator-5554 BLANC_EVIDENCE=~/blanc-evidence/android/run-a bash chromium/tests/android/a4-gate.sh
ANDROID_SERIAL=emulator-5556 BLANC_EVIDENCE=~/blanc-evidence/android/run-b bash chromium/tests/android/a5a-gate.sh
```

Give each run its own evidence folder. Ports on this server follow the emulator
(`chromium/tests/android/support/host-ports.mjs`): `emulator-5556`'s runs use every host port plus
100 (DevTools 9433, the acceptance fixtures 8865), because adb forward and adb reverse silently take
over a host port another run is using. A check that adds a host port takes it through `hostPort()`.
The outbound check runs on its run's emulator, not merely the first of that AVD. Both emulators run
the APK from the same `out/AndroidDebugX64`, so don't rebuild while either is running a check.

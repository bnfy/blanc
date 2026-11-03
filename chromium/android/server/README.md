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
| `~/chromium-android/src` | Chromium for Android at `chromium/lanes/android.json`'s `upstream`, with the lane's Blanc source applied. |
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

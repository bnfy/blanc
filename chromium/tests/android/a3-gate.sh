#!/usr/bin/env bash
# The A3 gate on the emulator (docs/superpowers/plans/2026-11-04-android-a3-blocking.md, Task 9):
# the A2 gate (A1's checks, every A2 check and the shared scenarios) and the blocking check, with
# evidence in ~/blanc-evidence/android/a3/. Run on the build server from ~/chromium-android/src.
set -uo pipefail
TREE="${BLANC_TREE:-$HOME/blanc}"
EVIDENCE="${BLANC_EVIDENCE:-$HOME/blanc-evidence/android/a3}"
APK=out/AndroidDebugX64/apks/ChromePublic.apk
export PATH="$PWD/third_party/android_sdk/public/platform-tools:$PWD/third_party/node/linux/node-linux-x64/bin:$HOME/depot_tools:$PATH"
mkdir -p "$EVIDENCE"
failed=()
run() { local name=$1; shift; echo "== $name"; if "$@" > "$EVIDENCE/$name.log" 2>&1; then echo pass; else echo FAIL; failed+=("$name"); fi; grep -E "^(pass|FAIL) |gate: |scenarios \(" "$EVIDENCE/$name.log" | tail -16 || true; }
run blocking node "$TREE/chromium/tests/android/blocking.mjs" --apk "$APK" --evidence "$EVIDENCE/blocking"
run a2-gate env BLANC_EVIDENCE="$EVIDENCE/a2" bash "$TREE/chromium/tests/android/a2-gate.sh"
sha256sum "$APK" > "$EVIDENCE/apk.sha256"
if ((${#failed[@]})); then echo "A3 gate: FAIL (${failed[*]})"; exit 1; fi
echo "A3 gate: pass"

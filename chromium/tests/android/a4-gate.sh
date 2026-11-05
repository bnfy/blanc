#!/usr/bin/env bash
# The A4 gate on the emulator (docs/superpowers/plans/2026-11-05-android-a4-sync.md): the A3 gate
# and the sync checks, with evidence in ~/blanc-evidence/android/a4/. Run on the build server from
# ~/chromium-android/src, with test/ and cloudflare/sync-worker/src beside chromium/ in the tree.
set -uo pipefail
TREE="${BLANC_TREE:-$HOME/blanc}"
EVIDENCE="${BLANC_EVIDENCE:-$HOME/blanc-evidence/android/a4}"
APK=out/AndroidDebugX64/apks/ChromePublic.apk
export PATH="$PWD/third_party/android_sdk/public/platform-tools:$PWD/third_party/node/linux/node-linux-x64/bin:$HOME/depot_tools:$PATH"
mkdir -p "$EVIDENCE"
failed=()
run() { local name=$1; shift; echo "== $name"; if "$@" > "$EVIDENCE/$name.log" 2>&1; then echo pass; else echo FAIL; failed+=("$name"); fi; tail -2 "$EVIDENCE/$name.log"; }
run sync node "$TREE/chromium/tests/android/sync.mjs" --apk "$APK" --evidence "$EVIDENCE/sync"
run a3-gate env BLANC_EVIDENCE="$EVIDENCE/a3" bash "$TREE/chromium/tests/android/a3-gate.sh"
sha256sum "$APK" > "$EVIDENCE/apk.sha256"
if ((${#failed[@]})); then echo "A4 gate: FAIL (${failed[*]})"; exit 1; fi
echo "A4 gate: pass"

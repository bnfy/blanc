#!/usr/bin/env bash
# The A5a gate on the emulator (docs/superpowers/plans/2026-11-07-android-a5a-settings.md): the Settings
# checks, then the whole A4 gate (which runs A1 to A3 and sync), with evidence in
# ~/blanc-evidence/android/a5a-gate/ (the tools tests run on the Mac). Run on the build server from ~/chromium-android/src, with test/ and
# cloudflare/sync-worker/src beside chromium/ in the tree.
set -uo pipefail
TREE="${BLANC_TREE:-$HOME/blanc}"
EVIDENCE="${BLANC_EVIDENCE:-$HOME/blanc-evidence/android/a5a-gate}"
APK=out/AndroidDebugX64/apks/ChromePublic.apk
export PATH="$PWD/third_party/android_sdk/public/platform-tools:$PWD/third_party/node/linux/node-linux-x64/bin:$HOME/depot_tools:$PATH"
# These checks start on the Start Page, not the first-minute walkthrough (FirstMinute.SKIP_FILE; walkthrough.mjs
# tests the card and puts the file back).
adb shell touch /data/local/tmp/blanc-walkthrough-off && adb shell chmod 644 /data/local/tmp/blanc-walkthrough-off
mkdir -p "$EVIDENCE"
failed=()
run() { local name=$1; shift; echo "== $name"; if "$@" > "$EVIDENCE/$name.log" 2>&1; then echo pass; else echo FAIL; failed+=("$name"); fi; tail -2 "$EVIDENCE/$name.log"; }
run settings node "$TREE/chromium/tests/android/settings.mjs" --apk "$APK" --evidence "$EVIDENCE/settings"
run patches-android python3 "$TREE/chromium/tools/check-patches.py" --lane android
run patches-desktop python3 "$TREE/chromium/tools/check-patches.py" --lane desktop
run robolectric out/AndroidDebugX64/bin/run_blanc_android_junit_tests
# The tools tests read iOS fixtures the server does not carry; they run on the Mac: node --test chromium/tools/*.test.mjs
run a4-gate env BLANC_EVIDENCE="$EVIDENCE/a4" bash "$TREE/chromium/tests/android/a4-gate.sh"
sha256sum "$APK" > "$EVIDENCE/apk.sha256"
if ((${#failed[@]})); then echo "A5a gate: FAIL (${failed[*]})"; exit 1; fi
echo "A5a gate: pass"

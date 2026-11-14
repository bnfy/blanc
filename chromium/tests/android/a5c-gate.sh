#!/usr/bin/env bash
# The A5c gate on the emulator: the first-minute walkthrough and the rest of Settings, A5b's Start Page
# checks, then the A5a
# gate (Settings, patches, Robolectric and the A4 gate, which runs A1 to A3), with evidence in
# ~/blanc-evidence/android/a5c-gate/. Run on the build server from ~/chromium-android/src, with
# test/ and cloudflare/sync-worker/src beside chromium/ in the tree.
set -uo pipefail
TREE="${BLANC_TREE:-$HOME/blanc}"
EVIDENCE="${BLANC_EVIDENCE:-$HOME/blanc-evidence/android/a5c-gate}"
APK=out/AndroidDebugX64/apks/ChromePublic.apk
export PATH="$PWD/third_party/android_sdk/public/platform-tools:$PWD/third_party/node/linux/node-linux-x64/bin:$HOME/depot_tools:$PATH"
mkdir -p "$EVIDENCE"
failed=()
run() { local name=$1; shift; echo "== $name"; if "$@" > "$EVIDENCE/$name.log" 2>&1; then echo pass; else echo FAIL; failed+=("$name"); fi; tail -2 "$EVIDENCE/$name.log"; }
adb shell touch /data/local/tmp/blanc-walkthrough-off && adb shell chmod 644 /data/local/tmp/blanc-walkthrough-off
run walkthrough node "$TREE/chromium/tests/android/walkthrough.mjs" --apk "$APK" --evidence "$EVIDENCE/walkthrough"
# A5b's Start Page checks, which the A5a gate predates.
run pages-phone node "$TREE/chromium/tests/android/pages-phone.mjs" --apk "$APK" --evidence "$EVIDENCE/pages-phone"
run start-shortcuts node "$TREE/chromium/tests/android/start-shortcuts.mjs" --apk "$APK" --evidence "$EVIDENCE/start-shortcuts"
# Takes Blanc as installed (start-shortcuts left this APK on the emulator).
run start-page-ways node "$TREE/chromium/tests/android/start-page-ways.mjs" "$EVIDENCE/start-page-ways"
run a5a-gate env BLANC_EVIDENCE="$EVIDENCE/a5a" bash "$TREE/chromium/tests/android/a5a-gate.sh"
sha256sum "$APK" > "$EVIDENCE/apk.sha256"
if ((${#failed[@]})); then echo "A5c gate: FAIL (${failed[*]})"; exit 1; fi
echo "A5c gate: pass"

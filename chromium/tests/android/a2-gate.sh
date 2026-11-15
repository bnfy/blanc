#!/usr/bin/env bash
# The A2 gate on the emulator (docs/superpowers/plans/2026-11-04-android-a2-tabs.md, Task 9):
# the A1 gate (which must stay green, with the Robolectric tests and the outbound gate), each A2
# check (tabs, palette, tab grid, find, session restore, Quiet Tabs, the store over Chromium's model) and the shared acceptance
# scenarios, with evidence in ~/blanc-evidence/android/a2/.
# Run on the build server from ~/chromium-android/src with the emulator up.
set -uo pipefail
TREE="${BLANC_TREE:-$HOME/blanc}"
EVIDENCE="${BLANC_EVIDENCE:-$HOME/blanc-evidence/android/a2}"
APK=out/AndroidDebugX64/apks/ChromePublic.apk
export PATH="$PWD/third_party/android_sdk/public/platform-tools:$PWD/third_party/node/linux/node-linux-x64/bin:$HOME/depot_tools:$PATH"
# These checks start on the Start Page, not the first-minute walkthrough (FirstMinute.SKIP_FILE; walkthrough.mjs
# tests the card and puts the file back).
adb shell touch /data/local/tmp/blanc-walkthrough-off && adb shell chmod 644 /data/local/tmp/blanc-walkthrough-off
mkdir -p "$EVIDENCE"
failed=()
run() { local name=$1; shift; echo "== $name"; if "$@" > "$EVIDENCE/$name.log" 2>&1; then echo pass; else echo FAIL; failed+=("$name"); fi; tail -12 "$EVIDENCE/$name.log" | grep -E "^(pass|FAIL)|PASSED|FAILED|verdict|scenarios \(" || true; }
run a1-gate env BLANC_EVIDENCE="$EVIDENCE/a1" bash "$TREE/chromium/tests/android/a1-gate.sh"
for check in tabs palette tab-grid find session-restore quiet-tabs tab-store; do
  run "$check" node "$TREE/chromium/tests/android/$check.mjs" --apk "$APK" --evidence "$EVIDENCE/$check"
done
run acceptance bash "$TREE/chromium/tests/android/acceptance/run.sh" "$APK" "$EVIDENCE/acceptance"
sha256sum "$APK" > "$EVIDENCE/apk.sha256"
if ((${#failed[@]})); then echo "A2 gate: FAIL (${failed[*]})"; exit 1; fi
echo "A2 gate: pass"

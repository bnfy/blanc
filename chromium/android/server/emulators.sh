#!/usr/bin/env bash
# Starts the build server's emulators (README.md, "Two emulators"), each in its own tmux session,
# from ~/chromium-android/src with Chromium's own avd.py. The first (emulator-5554, session
# `emulator`) keeps its data across runs; the second (emulator-5556, session `emulator2`) runs the
# same AVD read-only, so whatever a run changes there is gone when it stops. One already running is
# left alone.
#
#   bash chromium/android/server/emulators.sh [first|second|both]   (default: both)
set -euo pipefail
SRC="${BLANC_ANDROID_SRC:-$HOME/chromium-android/src}"
CONFIG=tools/android/avd/proto/android_36_google_apis_x64.textpb
LOG="${BLANC_EVIDENCE_ROOT:-$HOME/blanc-evidence/android}"
which="${1:-both}"
mkdir -p "$LOG"

start() {
  local session=$1 serial=$2 mode=$3
  if tmux has-session -t "$session" 2>/dev/null; then echo "$session: already running"; return; fi
  # avd.py takes the next free console port: start the first before the second, so each gets its serial.
  tmux new-session -d -s "$session" bash -lc "cd $SRC && export PATH=~/depot_tools:\$PATH DEPOT_TOOLS_UPDATE=0 DEPOT_TOOLS_METRICS=0 && sg kvm -c \"vpython3 tools/android/avd/avd.py start --avd-config $CONFIG $mode --wipe-data\" 2>&1 | tee $LOG/$session.log; sleep infinity"
  local adb="$SRC/third_party/android_sdk/public/platform-tools/adb"
  for _ in $(seq 1 120); do
    [ "$("$adb" -s "$serial" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = 1 ] && { echo "$session: $serial booted"; return; }
    sleep 5
  done
  echo "$session: $serial did not boot in 10 minutes (log: $LOG/$session.log)" >&2
  return 1
}

case "$which" in
  first) start emulator emulator-5554 --no-read-only ;;
  second) start emulator2 emulator-5556 --read-only ;;
  both) start emulator emulator-5554 --no-read-only; start emulator2 emulator-5556 --read-only ;;
  *) echo "Usage: emulators.sh [first|second|both]" >&2; exit 2 ;;
esac

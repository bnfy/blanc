#!/usr/bin/env bash
# Copyright 2026 Bananify Creative. MIT; see LICENSE.
# Runs a gate across the build server's two emulators at once (chromium/android/server/README.md),
# in about half the time. Lane 2 (emulator-5556) takes the steps in LANE2; lane 1 (emulator-5554)
# takes every other step, so a step added to any gate later runs in lane 1 without a change here.
# The gate scripts choose their steps through gate-lib.sh. Run on the build server from
# ~/chromium-android/src, both emulators up, with BLANC_TREE as the gates expect.
#
#   bash chromium/tests/android/split-gate.sh <gate script> [evidence dir]
#   e.g. split-gate.sh a5a-gate.sh ~/blanc-evidence/android/a5a-split
set -uo pipefail
HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
GATE=${1:?usage: split-gate.sh <gate script> [evidence dir]}
EVIDENCE=${2:-$HOME/blanc-evidence/android/${GATE%.sh}-split}
# About half the full gate's time on the emulators (sync, Spaces and shared Spaces pair with the
# test sync service and are the slowest). Names are the gates' run() step names.
LANE2=${BLANC_LANE2_STEPS:-"sync spaces shared-spaces blocking"}
# The gates run their lower gates from BLANC_TREE: this script's own tree unless told otherwise.
export BLANC_TREE="${BLANC_TREE:-$(cd "$HERE/../../.." && pwd)}"
export PATH="$PWD/third_party/android_sdk/public/platform-tools:$PATH"
for serial in emulator-5554 emulator-5556; do
  [ "$(adb -s "$serial" get-state 2>/dev/null)" = device ] || { echo "$serial isn't running (chromium/android/server/emulators.sh)"; exit 1; }
done
mkdir -p "$EVIDENCE/lane1" "$EVIDENCE/lane2"
start=$(date +%s)
# Each lane in its own process group, so stopping this script (Ctrl-C, a timeout, a closed session)
# stops both lanes and every check they started, rather than leaving them driving the emulators.
ANDROID_SERIAL=emulator-5554 BLANC_GATE_SKIP="$LANE2" BLANC_EVIDENCE="$EVIDENCE/lane1" \
  setsid bash "$HERE/$GATE" > "$EVIDENCE/lane1.log" 2>&1 &
lane1=$!
ANDROID_SERIAL=emulator-5556 BLANC_GATE_ONLY="$LANE2" BLANC_EVIDENCE="$EVIDENCE/lane2" \
  setsid bash "$HERE/$GATE" > "$EVIDENCE/lane2.log" 2>&1 &
lane2=$!
trap 'kill -TERM -- -"$lane1" -"$lane2" 2>/dev/null; exit 130' INT TERM HUP
wait "$lane1"; one=$?
wait "$lane2"; two=$?
minutes=$(( ($(date +%s) - start + 59) / 60 ))
for lane in 1 2; do echo "-- lane $lane"; grep -E '^== |^pass$|^FAIL$|gate: ' "$EVIDENCE/lane$lane.log" | grep -v '^== .*-gate$'; done
if ((one || two)); then echo "Split ${GATE%.sh}: FAIL (lane 1 exit $one, lane 2 exit $two; $minutes min)"; exit 1; fi
echo "Split ${GATE%.sh}: pass ($minutes min)"

#!/bin/sh
# Outbound-isolation check, the part that runs as the test user, in the
# blanc-test session (Chromium only draws on the visible session). Run it
# after `sudo root.sh start` and before `sudo root.sh stop`. Controls first and
# last; between them the F5 address/search scenarios, the 18 F47 bang
# scenarios and the leak probe, every request recorded by the proxy.
set -u
DIR=/Users/Shared/blanc-outbound
R=$DIR/repo/chromium
OUT=$DIR/results
CFG=$DIR/runtime-config.json
NODE=/usr/local/bin/node
[ "$(id -un)" = blanc-test ] || { echo "Run this in the blanc-test session." >&2; exit 1; }
[ -s "$OUT/pflog.txt" ] || [ -e "$OUT/pflog.txt" ] || { echo "Start the pf log first: sudo root.sh start" >&2; exit 1; }
export BLANC_EGRESS_LOG=$OUT/egress.jsonl
cd "$R"
stamp() { date -u '+%Y-%m-%dT%H:%M:%SZ'; }
# Each step's UTC start, and Done, go to user.log: analyze.mjs reads the
# run's start and end from it.
: > "$OUT/user.log"
say() { echo "$(stamp) $1" | tee -a "$OUT/user.log"; }
run() { say "$1"; shift; caffeinate -d -i "$@"; }
run "controls (before)" $NODE tests/outbound/controls.mjs "$CFG" "$OUT/controls-before.json"
run "F5 scenarios" $NODE tests/runner.mjs "$CFG" "$OUT/navigation" --only=navigation-and-context-menu > "$OUT/navigation.log" 2>&1
for L in 469 477 485 493 508 517 532 543 558 565 573 591 599 608 621 632 640 651; do
  run "F47 line $L" $NODE tests/runner.mjs "$CFG" "$OUT/bangs-$L" --only=island-and-commands.feature:$L: > "$OUT/bangs-$L.log" 2>&1
done
run "leak probe" $NODE tests/outbound/leak-probe.mjs "$CFG" "$OUT/leak.json"
run "controls (after)" $NODE tests/outbound/controls.mjs "$CFG" "$OUT/controls-after.json"
say "Done. Switch back and run: sudo $R/tests/outbound/root.sh stop"

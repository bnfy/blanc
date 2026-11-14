#!/bin/sh
# Outbound isolation of the packaged beta, the part that runs as the test
# user, in the blanc-test session (Chromium only draws on the visible
# session). Run it after `sudo root.sh start` and before `sudo root.sh stop`.
# Controls first and last (they prove the pf block works); between them the
# beta, exactly as a person runs it, for about six minutes
# (beta-scenarios.mjs). Then: sudo root.sh stop, and analyze-beta.mjs.
set -u
DIR=/Users/Shared/blanc-outbound
R=$DIR/repo/chromium
# results/ is the one folder the test user can write in (mode 1777).
OUT=$DIR/results/beta-$(date -u +%Y%m%dT%H%M%SZ)
CFG=$DIR/runtime-config.json
APP="$DIR/beta/Blanc Beta.app"
NODE=/usr/local/bin/node
[ "$(id -un)" = blanc-test ] || { echo "Run this in the blanc-test session." >&2; exit 1; }
[ -e "$DIR/results/pflog.txt" ] || { echo "Start the pf log first: sudo root.sh start" >&2; exit 1; }
[ -x "$APP/Contents/MacOS/Blanc Beta" ] || { echo "No beta at $APP; run setup.sh --refresh --beta APP first." >&2; exit 1; }
mkdir "$OUT" || { echo "Could not create $OUT." >&2; exit 1; }
export GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=safe.directory GIT_CONFIG_VALUE_0=$DIR/repo
cd "$R"
stamp() { date -u '+%Y-%m-%dT%H:%M:%SZ'; }
: > "$OUT/user.log"
nettop -L 0 -s 1 -n -x > "$OUT/nettop.csv" 2>/dev/null &
NETTOP=$!
trap 'kill $NETTOP 2>/dev/null' EXIT
say() { echo "$(stamp) $1" | tee -a "$OUT/user.log"; }
run() { say "$1"; shift; caffeinate -d -i "$@"; }
run "controls (before)" $NODE tests/outbound/controls.mjs "$CFG" "$OUT/controls-before.json"
run "beta scenarios" $NODE tests/outbound/beta-scenarios.mjs "$APP" "$OUT" > "$OUT/beta-scenarios.log" 2>&1
run "controls (after)" $NODE tests/outbound/controls.mjs "$CFG" "$OUT/controls-after.json"
say "Done ($OUT). Switch back and run: sudo $R/tests/outbound/root.sh stop"

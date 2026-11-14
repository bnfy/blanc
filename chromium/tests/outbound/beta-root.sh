#!/bin/sh
# The owner's half of the beta outbound check in one command:
#   sudo sh beta-root.sh
# Starts the pf anchor (root.sh start), waits while the owner runs
# "Run beta outbound check.command" in the blanc-test session, and stops the
# anchor (root.sh stop) as soon as that run says Done, after 30 minutes
# without one, or if this is interrupted. The anchor is never left loaded.
set -u
DIR=/Users/Shared/blanc-outbound
HERE=$DIR/repo/chromium/tests/outbound
[ "$(id -u)" = 0 ] || { echo "Run with sudo." >&2; exit 1; }
START=$(date +%s)
sh "$HERE/root.sh" start || exit 1
trap 'echo; sh "$HERE/root.sh" stop; exit 1' INT TERM
cat <<'EOF'

The firewall rule is on, for the blanc-test user only. Now:
  1. Switch to the blanc-test user (menu bar: Control Center > your name > blanc-test).
  2. Open /Users/Shared/blanc-outbound and double-click "Run beta outbound check".
  3. Leave it alone until its window says Done (about 10 minutes), then switch back here.
This window turns the rule off by itself when the run finishes.
EOF
while :; do
  for log in "$DIR"/results/beta-*/user.log; do
    [ -f "$log" ] && [ "$(stat -f %m "$log")" -ge "$START" ] && grep -q ' Done' "$log" && { echo; echo "Run finished: $(dirname "$log")"; sh "$HERE/root.sh" stop; exit 0; }
  done
  [ $(( $(date +%s) - START )) -lt 1800 ] || { echo; echo "No finished run after 30 minutes; turning the rule off."; sh "$HERE/root.sh" stop; exit 1; }
  sleep 10
done

#!/bin/sh
# Outbound-isolation check, the part that needs root (owner-approved
# 2026-10-31: a pf anchor scoped to the test user). Run from the owner's
# session:  sudo root.sh start  ...  sudo root.sh stop
# start loads the anchor, enables pf with a reference token and logs every
# blocked packet; stop removes the anchor, releases the token and stops the
# log. The Mac's own pf rules are never edited.
set -eu
DIR=/Users/Shared/blanc-outbound
ANCHOR=com.apple/blanc-outbound
STATE=$DIR/state
OUT=$DIR/results
[ "$(id -u)" = 0 ] || { echo "Run with sudo." >&2; exit 1; }
TEST_UID=$(id -u blanc-test)
case "${1:-}" in
start)
  if [ -f "$STATE/token" ]; then echo "Already started; run stop first." >&2; exit 1; fi
  # The anchor is only evaluated if the main ruleset includes com.apple/*.
  if ! pfctl -s rules 2>/dev/null | grep -q 'anchor "com.apple/\*"'; then
    echo 'The main pf ruleset has no anchor "com.apple/*"; refusing to edit it.' >&2; exit 1
  fi
  mkdir -p "$STATE"
  sed "s/@UID@/$TEST_UID/" "$DIR/repo/chromium/tests/outbound/pf-anchor.conf" > "$STATE/anchor.conf"
  pfctl -a "$ANCHOR" -f "$STATE/anchor.conf"
  pfctl -E 2>&1 | sed -n 's/.*Token : \([0-9]*\).*/\1/p' > "$STATE/token"
  [ -s "$STATE/token" ] || { echo "pf did not return an enable token." >&2; pfctl -a "$ANCHOR" -F all; exit 1; }
  ifconfig pflog0 create 2>/dev/null || true
  tcpdump -n -e -tttt -l -i pflog0 > "$OUT/pflog.txt" 2> "$OUT/pflog.err" &
  echo $! > "$STATE/tcpdump.pid"
  sleep 1
  echo "Loaded for uid $TEST_UID:"; pfctl -a "$ANCHOR" -s rules
  echo "Now switch to the blanc-test session and run $DIR/repo/chromium/tests/outbound/user.sh"
  ;;
stop)
  [ -f "$STATE/tcpdump.pid" ] && kill "$(cat "$STATE/tcpdump.pid")" 2>/dev/null || true
  pfctl -a "$ANCHOR" -F all 2>/dev/null || true
  [ -f "$STATE/token" ] && pfctl -X "$(cat "$STATE/token")" 2>/dev/null || true
  rm -f "$STATE/token" "$STATE/tcpdump.pid"
  chown -R blanc-test "$OUT" 2>/dev/null || true
  chmod -R a+rX "$OUT"
  echo "Removed. Anchor now:"; pfctl -a "$ANCHOR" -s rules 2>/dev/null || true
  ;;
*) echo "Usage: sudo $0 start|stop" >&2; exit 2 ;;
esac

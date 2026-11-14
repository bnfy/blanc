#!/bin/sh
# The whole beta outbound check from another Mac, over SSH (owner, 2026-11-14:
# the beta release runs from the MacBook Pro, without touching the Mac Studio):
#   ssh -t mac-studio sudo sh /Users/Shared/blanc-outbound/repo/chromium/tests/outbound/beta-root-remote.sh
# Like beta-root.sh, but instead of waiting for the owner to switch users, it
# starts "Run beta outbound check" in the blanc-test user's existing login
# session (launchctl asuser), which must already be logged in on this Mac.
# The pf anchor is on only for the run and is turned off when it says Done,
# after 30 minutes without that, or if this is interrupted. Then the owner's
# analysis: analyze-beta.mjs on the run's folder.
set -u
DIR=/Users/Shared/blanc-outbound
HERE=$DIR/repo/chromium/tests/outbound
[ "$(id -u)" = 0 ] || { echo "Run with sudo." >&2; exit 1; }
TEST_UID=$(id -u blanc-test 2>/dev/null) || { echo "No blanc-test user on this Mac." >&2; exit 1; }
# A GUI session of the test user, or Chromium has nowhere to run.
ps -axo user=,comm= | awk '$1 == "blanc-test" && $2 ~ /loginwindow$/ {found=1} END {exit !found}' ||
  { echo "blanc-test isn't logged in on this Mac. Log it in once (Screen Sharing works), then run this again." >&2; exit 1; }

# Adobe Creative Cloud in the test session is built on Chromium too: it
# resolves names itself through the same DNS server as the beta and updates
# from Google, so its blocked packets can't be told apart from the beta's
# (beta.3's first clean run, 2026-11-14). Owner, 2026-11-14: run without it.
# Its launch agents stop for this session only (until blanc-test logs in again).
ADOBE='/Applications/Utilities/Adobe Creative Cloud|/Library/Application Support/Adobe|Adobe Desktop Service|CCXProcess|Core Sync'
quiet_adobe() { pkill -u blanc-test -f "$ADOBE" 2>/dev/null; }
for plist in /Library/LaunchAgents/com.adobe.*.plist; do
  [ -e "$plist" ] && launchctl bootout "gui/$TEST_UID" "$plist" 2>/dev/null
done
for _ in 1 2 3 4 5 6; do quiet_adobe; sleep 5; pgrep -u blanc-test -f "$ADOBE" >/dev/null || break; done
if pgrep -u blanc-test -f "$ADOBE" >/dev/null; then
  echo "Creative Cloud keeps running in the blanc-test session. Nothing started." >&2; exit 1
fi
echo "Creative Cloud is quit in the blanc-test session."
START=$(date +%s)
sh "$HERE/root.sh" start || exit 1
stop() { sh "$HERE/root.sh" stop; }
trap 'echo; stop; exit 1' INT TERM HUP
echo "The firewall rule is on, for the blanc-test user only. Starting the run in its session."
launchctl asuser "$TEST_UID" sudo -u blanc-test -H /bin/sh "$DIR/Run beta outbound check.command" > /dev/null 2>&1 &
echo "It takes about 10 minutes. This window turns the rule off when the run finishes."
while :; do
  # Only a run folder made after this started counts.
  for log in "$DIR"/results/beta-*/user.log; do
    [ -f "$log" ] && [ "$(stat -f %B "$(dirname "$log")")" -ge "$START" ] || continue
    printf '\r%s' "$(tail -n 1 "$log" | cut -c1-70)"
    grep -q ' Done' "$log" && { echo; echo "Run finished: $(dirname "$log")"; stop; exit 0; }
  done
  [ $(( $(date +%s) - START )) -lt 1800 ] || { echo; echo "No finished run after 30 minutes; turning the rule off."; stop; exit 1; }
  # A Creative Cloud that comes back would muddy the run: say so, and quit it.
  if pgrep -u blanc-test -f "$ADOBE" >/dev/null; then
    echo; echo "Creative Cloud came back during the run (quit again; tell Claude)."; quiet_adobe
  fi
  sleep 10
done

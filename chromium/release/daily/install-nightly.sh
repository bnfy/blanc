#!/bin/bash
# Installs (or with --remove, removes) the nightly Blanc Beta job on the Mac Studio:
# a LaunchAgent in the owner's login session, every day at 02:00 local time,
# running this checkout's nightly.mjs. Run from the Mac Studio's repo checkout,
# over SSH or locally; never while a build runs. docs/chromium-beta-release.md, "Daily betas".
set -euo pipefail
BASE="${BLANC_STUDIO_BASE:-$HOME/Projects/Blanc}"
LABEL=me.bnfy.blanc.beta-nightly
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
DOMAIN="gui/$(id -u)"
AWAKE=me.bnfy.blanc.display-awake
AWAKE_PLIST="$HOME/Library/LaunchAgents/$AWAKE.plist"
launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
launchctl bootout "$DOMAIN/$AWAKE" 2>/dev/null || true
if [ "${1:-}" = --remove ]; then rm -f "$PLIST" "$AWAKE_PLIST"; echo "Removed $LABEL and $AWAKE."; exit 0; fi
mkdir -p "$BASE/records/nightly" "$HOME/Library/LaunchAgents" "$BASE/scripts"
# The job's entry point lives outside the checkout, so it can bring nightly.mjs in
# the first time: if the checkout predates it, and only when nothing is in the way
# (the same rules nightly.mjs applies), it moves the checkout to chromium/next's tip.
cat > "$BASE/scripts/beta-nightly.sh" <<'BOOT'
#!/bin/bash
set -uo pipefail
BASE="${BLANC_STUDIO_BASE:-$HOME/Projects/Blanc}"
cd "$BASE/repo" || exit 1
echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) start"
if [ ! -f chromium/release/daily/nightly.mjs ]; then
  why=""
  [ -e "$BASE/records/RELEASE-IN-PROGRESS" ] && why="a release is prepared"
  [ -z "$why" ] && pgrep -f 'siso ninja|chromium/tests/runner.mjs' >/dev/null && why="a build or the runner is going"
  [ -z "$why" ] && [ -n "$(git status --porcelain)" ] && why="uncommitted changes"
  [ -z "$why" ] && { git fetch -q origin chromium/next || why="could not fetch"; }
  [ -z "$why" ] && ! git merge-base --is-ancestor HEAD origin/chromium/next && why="commits chromium/next does not have"
  if [ -n "$why" ]; then echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) bootstrap skipped: $why" >> "$BASE/records/nightly/skipped.log"; exit 0; fi
  git checkout -q --detach origin/chromium/next || exit 1
fi
exec /usr/local/bin/node chromium/release/daily/nightly.mjs "$@"
BOOT
chmod 755 "$BASE/scripts/beta-nightly.sh"
cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/caffeinate</string><string>-i</string>
    <string>/bin/bash</string>
    <string>$BASE/scripts/beta-nightly.sh</string>
  </array>
  <key>WorkingDirectory</key><string>$BASE/repo</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    <key>BLANC_STUDIO_BASE</key><string>$BASE</string>
  </dict>
  <key>StartCalendarInterval</key>
  <dict><key>Hour</key><integer>2</integer><key>Minute</key><integer>0</integer></dict>
  <key>StandardOutPath</key><string>$BASE/records/nightly/launchd.log</string>
  <key>StandardErrorPath</key><string>$BASE/records/nightly/launchd.log</string>
  <key>ProcessType</key><string>Standard</string>
</dict>
</plist>
PLIST
# Owner, 2026-11-14: the suite can't draw on a locked screen, so the display is kept
# awake and never sleeps into the lock. Unlock the Mac Studio once (Screen Sharing)
# after installing and after every restart; no security setting changes.
cat > "$AWAKE_PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$AWAKE</string>
  <key>ProgramArguments</key>
  <array><string>/usr/bin/caffeinate</string><string>-d</string><string>-i</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
</dict>
</plist>
PLIST
plutil -lint "$PLIST" >/dev/null
plutil -lint "$AWAKE_PLIST" >/dev/null
launchctl bootstrap "$DOMAIN" "$PLIST"
launchctl bootstrap "$DOMAIN" "$AWAKE_PLIST"
echo "Installed $LABEL (every day at 02:00, logging to $BASE/records/nightly/) and $AWAKE (keeps the display awake)."

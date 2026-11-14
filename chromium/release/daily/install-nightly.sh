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
launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
if [ "${1:-}" = --remove ]; then rm -f "$PLIST"; echo "Removed $LABEL."; exit 0; fi
mkdir -p "$BASE/records/nightly" "$HOME/Library/LaunchAgents"
cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/caffeinate</string><string>-i</string>
    <string>/usr/local/bin/node</string>
    <string>$BASE/repo/chromium/release/daily/nightly.mjs</string>
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
plutil -lint "$PLIST" >/dev/null
launchctl bootstrap "$DOMAIN" "$PLIST"
echo "Installed $LABEL: every day at 02:00, logging to $BASE/records/nightly/."

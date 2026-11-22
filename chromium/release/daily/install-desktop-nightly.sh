#!/bin/bash
# Installs (or with --remove, removes) the Windows nightly on the Mac Studio
# (docs/superpowers/plans/2026-11-21-windows-nightly.md, Task 7): a LaunchAgent
# in the owner's login session, every day at 04:00 local time, after the Mac
# nightly's 02:00 start. Its entry script lives outside any checkout; it takes
# the night lock, moves its own worktree (BASE/desktop-nightly) to
# chromium/next's tip, and runs desktop-nightly.mjs there. Run from the Mac
# Studio's repo checkout. docs/chromium-beta-release.md, "Windows nightly".
#
# The build server is reached as blanc@blanc-android-build: an alias in
# ~/.ssh/config (its address stays out of this repository) and the key
# ~/.ssh/id_ed25519_blanc_android. The installer refuses without both.
set -euo pipefail
BASE="${BLANC_STUDIO_BASE:-$HOME/Projects/Blanc}"
LABEL=me.bnfy.blanc.desktop-nightly
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
DOMAIN="gui/$(id -u)"
launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
if [ "${1:-}" = --remove ]; then rm -f "$PLIST"; echo "Removed $LABEL (the worktree, scripts and records stay)."; exit 0; fi

[ -f "$HOME/.ssh/id_ed25519_blanc_android" ] || { echo "No ~/.ssh/id_ed25519_blanc_android: this Mac cannot reach the build server." >&2; exit 1; }
host="$(ssh -G blanc-android-build 2>/dev/null | awk '$1 == "hostname" {print $2}')"
[ -n "$host" ] && [ "$host" != blanc-android-build ] || { echo "No blanc-android-build alias in ~/.ssh/config." >&2; exit 1; }
[ -x /usr/local/bin/node ] && [ -x /opt/homebrew/bin/gh ] || { echo "Node (/usr/local/bin) and gh (/opt/homebrew/bin) are required." >&2; exit 1; }

mkdir -p "$BASE/records/nightly/windows" "$HOME/Library/LaunchAgents" "$BASE/scripts"
if [ ! -d "$BASE/desktop-nightly" ]; then
  git -C "$BASE/repo" fetch -q origin chromium/next
  git -C "$BASE/repo" worktree add -q --detach "$BASE/desktop-nightly" origin/chromium/next
fi

cat > "$BASE/scripts/desktop-nightly.sh" <<'BOOT'
#!/bin/bash
# The Windows nightly's entry point (install-desktop-nightly.sh writes it).
#   desktop-nightly.sh [--records DIR] [--draft TAG] [--reservations-ref REF] [--server USER@HOST]
# Arguments pass to desktop-nightly.mjs; --records also names the lock's folder.
set -uo pipefail
export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"
BASE="${BLANC_STUDIO_BASE:-$HOME/Projects/Blanc}"
TREE="$BASE/desktop-nightly"
RECORDS="$BASE/records/nightly/windows"
args=("$@")
for ((i = 0; i < ${#args[@]}; i++)); do [ "${args[$i]}" = --records ] && RECORDS="${args[$((i + 1))]:-}"; done
[ -n "$RECORDS" ] || { echo "--records needs a folder" >&2; exit 1; }
mkdir -p "$RECORDS"
log() { echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $*" >> "$RECORDS/launcher.log"; }
LOCK="$RECORDS/RUNNING"
# One night at a time. A lock whose process is gone stays until a person looks
# (draft-hold.mjs break clears it with that night's hold).
if ! mkdir "$LOCK" 2>/dev/null; then
  pid="$(/usr/bin/sed -n 's/.*"pid":[[:space:]]*\([0-9][0-9]*\).*/\1/p' "$LOCK/owner" 2>/dev/null)"
  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then log "skipped: a night is running"; else log "stopped: a night's lock is left from a process that ended; see the runbook"; fi
  exit 0
fi
token="$(head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n')"
stamp="$(date +%Y%m%d-%H%M)"
printf '{"pid": %d, "token": "%s", "stamp": "%s"}\n' "$$" "$token" "$stamp" > "$LOCK/owner"
chmod 600 "$LOCK/owner"
child=""
release() { if grep -q "\"$token\"" "$LOCK/owner" 2>/dev/null; then rm -f "$LOCK/owner"; rmdir "$LOCK"; fi; }
forward() { if [ -n "$child" ]; then kill -"$1" "$child" 2>/dev/null; wait "$child" 2>/dev/null; fi; release; trap - EXIT; exit 1; }
trap release EXIT
trap 'forward TERM' TERM
trap 'forward INT' INT
trap 'forward HUP' HUP
log "start $stamp"
cd "$TREE" || { log "stopped: no worktree at $TREE"; exit 1; }
status="$(git status --porcelain)" || { log "stopped: git status failed"; exit 1; }
[ -z "$status" ] || { log "stopped: the worktree has local changes"; exit 1; }
git fetch -q origin chromium/next || { log "stopped: could not fetch chromium/next"; exit 1; }
git checkout -q --detach origin/chromium/next || { log "stopped: could not check out chromium/next"; exit 1; }
BLANC_NIGHT_TOKEN="$token" node chromium/release/daily/desktop-nightly.mjs "$@" >> "$RECORDS/launcher.log" 2>&1 &
child=$!
wait "$child"
code=$?
log "end $stamp exit $code"
exit "$code"
BOOT
chmod 755 "$BASE/scripts/desktop-nightly.sh"

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
    <string>$BASE/scripts/desktop-nightly.sh</string>
  </array>
  <key>WorkingDirectory</key><string>$BASE/desktop-nightly</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    <key>BLANC_STUDIO_BASE</key><string>$BASE</string>
  </dict>
  <key>StartCalendarInterval</key>
  <dict><key>Hour</key><integer>4</integer><key>Minute</key><integer>0</integer></dict>
  <key>StandardOutPath</key><string>$BASE/records/nightly/windows/launchd.log</string>
  <key>StandardErrorPath</key><string>$BASE/records/nightly/windows/launchd.log</string>
  <key>ProcessType</key><string>Standard</string>
</dict>
</plist>
PLIST
plutil -lint "$PLIST" >/dev/null
launchctl bootstrap "$DOMAIN" "$PLIST"
echo "Installed $LABEL (every day at 04:00, logging to $BASE/records/nightly/windows/)."

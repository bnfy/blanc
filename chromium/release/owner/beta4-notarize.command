#!/bin/bash
# Blanc Beta 2.0.0-beta.4: release stages notarize-app, dmg and notarize-dmg
# (docs/chromium-beta-release.md §10.4–10.5). Run by the owner in Terminal.
# Instead of `op run`, this asks for the two Apple values with hidden input
# (paste them from 1Password on another Mac). They live only in this window's
# memory for these three stages: never on disk, in a log or on screen.
set -uo pipefail
cd "$HOME/Projects/Blanc/repo" || exit 1
WORK="$HOME/Projects/Blanc/records/beta4-work"
STATUS="$HOME/Projects/Blanc/records/beta4-notarize-status.txt"
NODE=/usr/local/bin/node
note() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" >> "$STATUS"; }
: > "$STATUS"; chmod 600 "$STATUS"

echo "Blanc Beta 2.0.0-beta.4: notarization"
echo
echo "From 1Password on your MacBook Pro, open \"Apple Notarization\" (vault Dev)."
echo "Copy each value there, then paste it here and press Return. Nothing shows as you paste."
echo
# From the MacBook Pro wrapper (owner, 2026-11-14): 1Password there sends the two
# values as SSH environment (LC_*, accepted by macOS sshd), so this stage keeps a
# real terminal. They are cleared from the environment at once.
if [ -n "${LC_BLANC_APPLE_ID:-}" ] && [ -n "${LC_BLANC_APPLE_PW:-}" ]; then
  APPLE_ID=$LC_BLANC_APPLE_ID; APPLE_APP_SPECIFIC_PASSWORD=$LC_BLANC_APPLE_PW
  echo "Using the Apple values from 1Password on the MacBook Pro."
else
read -r -s -p "1. Apple ID (the item's username): " APPLE_ID; echo
read -r -s -p "2. App-specific password (the item's password): " APPLE_APP_SPECIFIC_PASSWORD; echo
fi
unset LC_BLANC_APPLE_ID LC_BLANC_APPLE_PW
if [ -z "$APPLE_ID" ] || [ -z "$APPLE_APP_SPECIFIC_PASSWORD" ]; then
  note "stopped: a value was empty"; echo "A value was empty. Nothing was sent. Run this again."; exit 1
fi
export APPLE_ID APPLE_APP_SPECIFIC_PASSWORD APPLE_TEAM_ID=XYGUCY4498
note "values entered (not recorded)"
echo
echo "Sending to Apple's notary service. Each notarization usually takes 2 to 10 minutes."
DONE=" $("$NODE" chromium/release/release.mjs status "$WORK" | /usr/bin/python3 -c "import json,sys; print(' '.join(json.load(sys.stdin)['done']))") "
for stage in notarize-app dmg notarize-dmg; do
  # A stage that already passed isn't sent to Apple again.
  case "$DONE" in *" $stage "*) echo "== $stage (already done)"; continue;; esac
  echo "== $stage"
  note "$stage started"
  if "$NODE" chromium/release/release.mjs "$stage" "$WORK"; then
    note "$stage passed"
  else
    note "$stage FAILED (exit $?)"
    unset APPLE_ID APPLE_APP_SPECIFIC_PASSWORD
    echo
    echo "STOPPED at: $stage. Nothing was published. Tell Claude."
    exit 1
  fi
done
unset APPLE_ID APPLE_APP_SPECIFIC_PASSWORD
"$NODE" chromium/release/release.mjs status "$WORK"
note "done"
echo
echo "Done: the app and the DMG are notarized and stapled. You can close this window and tell Claude."

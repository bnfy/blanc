#!/bin/bash
# The daily Blanc Beta release, from the MacBook Pro (owner, 2026-11-14: one
# command per release; docs/chromium-beta-release.md, "Daily betas"). The same
# file for every beta: the Mac Studio knows which release Claude prepared.
# Approve 1Password with Touch ID once; then the Mac Studio's window asks for
# its password, "tag and draft", the Sigstore sign-in and "publish".
# If it stops, run it again: it picks up where it stopped.
set -uo pipefail
STUDIO=(ssh -i "$HOME/.ssh/id_ed25519_macmini" -o IdentitiesOnly=yes anthonyjloria@Mac-Studio.local)
# Terminal may close a window when its script ends; keep it so the outcome stays readable.
trap 'echo; read -r -p "Press Return to close this window. " _' EXIT
echo "Blanc Beta: the daily release"
echo "Approve 1Password with Touch ID when it asks."
echo
OP_BIOMETRIC_UNLOCK_ENABLED=true op signin >/dev/null || { echo "1Password didn't sign in. Nothing was sent. Tell Claude."; exit 1; }
# Read every value here first; nothing reaches the Mac Studio unless all are present.
# Only an error message ever reaches the screen.
APPLE_ID=$(op read "op://Dev/Apple Notarization/username") || APPLE_ID=
APPLE_PW=$(op read "op://Dev/Apple Notarization/credential") || APPLE_PW=
KEY=$(op document get "Blanc Chromium Beta Sparkle Signing" --vault Dev) || KEY=
if [ -z "$APPLE_ID" ] || [ -z "$APPLE_PW" ] || [ -z "$KEY" ]; then
  unset APPLE_ID APPLE_PW KEY
  echo "1Password didn't give every value (it may need you to allow Terminal or unlock). Nothing was sent. Tell Claude what it said above."
  exit 1
fi
# The values travel as SSH environment (LC_*), never on a command line or disk;
# port 49197 carries the Sigstore sign-in back to the Mac Studio.
LC_BLANC_APPLE_ID=$APPLE_ID LC_BLANC_APPLE_PW=$APPLE_PW LC_BLANC_SPARKLE_KEY=$KEY "${STUDIO[@]}" \
  -o SendEnv=LC_BLANC_APPLE_ID -o SendEnv=LC_BLANC_APPLE_PW -o SendEnv=LC_BLANC_SPARKLE_KEY \
  -t -L 49197:127.0.0.1:49197 'bash "$HOME/Projects/Blanc/repo/chromium/release/owner/beta-release-remote.sh"'
code=$?
unset APPLE_ID APPLE_PW KEY
exit $code

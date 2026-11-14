#!/bin/bash
# Blanc Beta 2.0.0-beta.4 from the MacBook Pro: notarization (Apple values from 1Password here)
# Owner, 2026-11-14: the beta release runs from the MacBook Pro over SSH, never
# at the Mac Studio. The stage scripts stay on the Mac Studio in
# ~/Projects/Blanc/scripts; this window only connects to them. Nothing secret is
# printed, logged or put on a command line.
set -uo pipefail
STUDIO=(ssh -i "$HOME/.ssh/id_ed25519_macmini" -o IdentitiesOnly=yes anthonyjloria@Mac-Studio.local)
# Terminal may close a window when its script ends; keep it so the outcome stays readable.
trap 'echo; read -r -p "Press Return to close this window. " _' EXIT
echo "Blanc Beta 2.0.0-beta.4: notarization (usually 5 to 20 minutes)"
echo "Approve 1Password with Touch ID when it asks, then type your Mac Studio password"
echo "once (it opens the keychain that signs the DMG)."
echo
echo "Signing in to 1Password (Touch ID)..."
OP_BIOMETRIC_UNLOCK_ENABLED=true op signin >/dev/null || { echo "1Password didn't sign in. Nothing was sent. Tell Claude."; exit 1; }
# Read both values here first (1Password may ask to allow Terminal and to
# unlock): nothing reaches the Mac Studio unless both are present. They stay
# in this window's memory and travel only inside the SSH connection.
APPLE_ID=$(op read "op://Dev/Apple Notarization/username") || APPLE_ID=  # only an error message reaches the screen
APPLE_PW=$(op read "op://Dev/Apple Notarization/credential") || APPLE_PW=  # only an error message reaches the screen
if [ -z "$APPLE_ID" ] || [ -z "$APPLE_PW" ]; then
  unset APPLE_ID APPLE_PW
  echo "1Password didn't give both values (it may need you to allow Terminal or unlock). Nothing was sent. Tell Claude what it said above, then run this again."
  exit 1
fi
# The values travel as SSH environment (LC_*), not on stdin: the release stages
# need a real terminal (ssh -t). Not on any command line, never on disk.
LC_BLANC_APPLE_ID=$APPLE_ID LC_BLANC_APPLE_PW=$APPLE_PW "${STUDIO[@]}" \
  -o SendEnv=LC_BLANC_APPLE_ID -o SendEnv=LC_BLANC_APPLE_PW -t \
  'security unlock-keychain "$HOME/Library/Keychains/login.keychain-db" || { echo "The keychain did not unlock. Nothing ran."; exit 1; }; bash "$HOME/Projects/Blanc/scripts/beta4-notarize.command"'
unset APPLE_ID APPLE_PW

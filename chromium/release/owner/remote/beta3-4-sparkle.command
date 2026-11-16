#!/bin/bash
# Blanc Beta 2.0.0-beta.3 from the MacBook Pro: the update feed signature (update key from 1Password here)
# Owner, 2026-11-14: the beta release runs from the MacBook Pro over SSH, never
# at the Mac Studio. The stage scripts stay on the Mac Studio in
# ~/Projects/Blanc/scripts; this window only connects to them. Nothing secret is
# printed, logged or put on a command line.
set -uo pipefail
STUDIO=(ssh -i "$HOME/.ssh/id_ed25519_macmini" -o IdentitiesOnly=yes anthonyjloria@Mac-Studio.local)
# Terminal may close a window when its script ends; keep it so the outcome stays readable.
trap 'echo; read -r -p "Press Return to close this window. " _' EXIT
echo "Blanc Beta 2.0.0-beta.3: signing the update feed"
echo "Approve 1Password with Touch ID when it asks."
echo
echo "Signing in to 1Password (Touch ID)..."
OP_BIOMETRIC_UNLOCK_ENABLED=true op signin >/dev/null || { echo "1Password didn't sign in. Nothing was sent. Tell Claude."; exit 1; }
# The key travels only inside this SSH connection, as SSH environment (LC_*): the
# release stage needs a real terminal (ssh -t). Never on a command line or disk.
KEY=$(op document get "Blanc Chromium Beta Sparkle Signing" --vault Dev) || KEY=
if [ -z "$KEY" ]; then
  echo "1Password didn't give the update key. Nothing was sent. Tell Claude what it said above."; exit 1
fi
LC_BLANC_SPARKLE_KEY=$KEY "${STUDIO[@]}" -o SendEnv=LC_BLANC_SPARKLE_KEY -t 'bash "$HOME/Projects/Blanc/scripts/beta3-sparkle.command"'
unset KEY

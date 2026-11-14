#!/bin/bash
# Blanc Beta 2.0.0-beta.3 from the MacBook Pro: the update feed signature (update key from 1Password here)
# Owner, 2026-11-14: the beta release runs from the MacBook Pro over SSH, never
# at the Mac Studio. The stage scripts stay on the Mac Studio in
# ~/Projects/Blanc/scripts; this window only connects to them. Nothing secret is
# printed, logged or put on a command line.
set -uo pipefail
STUDIO=(ssh -i "$HOME/.ssh/id_ed25519_macmini" -o IdentitiesOnly=yes anthonyjloria@Mac-Studio.local)
echo "Blanc Beta 2.0.0-beta.3: signing the update feed"
echo "Approve 1Password with Touch ID when it asks."
echo
# The key travels only inside this SSH connection, to sign_update's stdin.
op document get "Blanc Chromium Beta Sparkle Signing" --vault Dev |
  "${STUDIO[@]}" 'BLANC_SPARKLE_KEY_STDIN=1 bash "$HOME/Projects/Blanc/scripts/beta3-sparkle.command"'

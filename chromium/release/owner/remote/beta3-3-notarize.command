#!/bin/bash
# Blanc Beta 2.0.0-beta.3 from the MacBook Pro: notarization (Apple values from 1Password here)
# Owner, 2026-11-14: the beta release runs from the MacBook Pro over SSH, never
# at the Mac Studio. The stage scripts stay on the Mac Studio in
# ~/Projects/Blanc/scripts; this window only connects to them. Nothing secret is
# printed, logged or put on a command line.
set -uo pipefail
STUDIO=(ssh -i "$HOME/.ssh/id_ed25519_macmini" -o IdentitiesOnly=yes anthonyjloria@Mac-Studio.local)
echo "Blanc Beta 2.0.0-beta.3: notarization (usually 5 to 20 minutes)"
echo "Approve 1Password with Touch ID when it asks."
echo
{ op read "op://Dev/Apple Notarization/username" && op read "op://Dev/Apple Notarization/credential"; } |
  "${STUDIO[@]}" 'bash "$HOME/Projects/Blanc/scripts/beta3-notarize.command"'

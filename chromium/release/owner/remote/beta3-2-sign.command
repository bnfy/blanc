#!/bin/bash
# Blanc Beta 2.0.0-beta.3 from the MacBook Pro: preflight and Developer ID signing
# Owner, 2026-11-14: the beta release runs from the MacBook Pro over SSH, never
# at the Mac Studio. The stage scripts stay on the Mac Studio in
# ~/Projects/Blanc/scripts; this window only connects to them. Nothing secret is
# printed, logged or put on a command line.
set -uo pipefail
STUDIO=(ssh -i "$HOME/.ssh/id_ed25519_macmini" -o IdentitiesOnly=yes anthonyjloria@Mac-Studio.local)
echo "Blanc Beta 2.0.0-beta.3: preflight and signing"
echo "Type your Mac Studio password once, to open its keychain for this run."
echo
"${STUDIO[@]}" -t "security unlock-keychain \"\$HOME/Library/Keychains/login.keychain-db\" || { echo \"The keychain did not unlock. Nothing ran.\"; exit 1; }; bash \"\$HOME/Projects/Blanc/scripts/beta3-sign.command\""

#!/bin/bash
# Blanc Beta 2.0.0-beta.3 from the MacBook Pro: manifest, then the tag and private draft (typed confirmation)
# Owner, 2026-11-14: the beta release runs from the MacBook Pro over SSH, never
# at the Mac Studio. The stage scripts stay on the Mac Studio in
# ~/Projects/Blanc/scripts; this window only connects to them. Nothing secret is
# printed, logged or put on a command line.
set -uo pipefail
STUDIO=(ssh -i "$HOME/.ssh/id_ed25519_macmini" -o IdentitiesOnly=yes anthonyjloria@Mac-Studio.local)
# Terminal may close a window when its script ends; keep it so the outcome stays readable.
trap 'echo; read -r -p "Press Return to close this window. " _' EXIT
echo "Blanc Beta 2.0.0-beta.3: manifest, then tag and draft"
echo "Type your Mac Studio password once, to open its keychain for GitHub."
echo
"${STUDIO[@]}" -t "security unlock-keychain \"\$HOME/Library/Keychains/login.keychain-db\" || { echo \"The keychain did not unlock. Nothing ran.\"; exit 1; }; bash \"\$HOME/Projects/Blanc/scripts/beta3-draft.command\""

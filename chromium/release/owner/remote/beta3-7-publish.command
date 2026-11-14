#!/bin/bash
# Blanc Beta 2.0.0-beta.3 from the MacBook Pro: Sigstore, publish and the public check
# Owner, 2026-11-14: the beta release runs from the MacBook Pro over SSH, never
# at the Mac Studio. The stage scripts stay on the Mac Studio in
# ~/Projects/Blanc/scripts; this window only connects to them. Nothing secret is
# printed, logged or put on a command line.
set -uo pipefail
STUDIO=(ssh -i "$HOME/.ssh/id_ed25519_macmini" -o IdentitiesOnly=yes anthonyjloria@Mac-Studio.local)
echo "Blanc Beta 2.0.0-beta.3: Sigstore, publish, public check"
echo "Type your Mac Studio password once, to open its keychain for GitHub."
echo "For Sigstore: open the sign-in address it prints, here on this Mac. Its"
echo "reply comes back through this connection (port 49197 is forwarded)."
echo
"${STUDIO[@]}" -t -L 49197:127.0.0.1:49197 "security unlock-keychain \"\$HOME/Library/Keychains/login.keychain-db\" || { echo \"The keychain did not unlock. Nothing ran.\"; exit 1; }; bash \"\$HOME/Projects/Blanc/scripts/beta3-publish.command\""

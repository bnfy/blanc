#!/bin/bash
# Blanc Beta 2.0.0-beta.3 from the MacBook Pro: the outbound isolation check (sudo on the Mac Studio)
# Owner, 2026-11-14: the beta release runs from the MacBook Pro over SSH, never
# at the Mac Studio. The stage scripts stay on the Mac Studio in
# ~/Projects/Blanc/scripts; this window only connects to them. Nothing secret is
# printed, logged or put on a command line.
set -uo pipefail
STUDIO=(ssh -i "$HOME/.ssh/id_ed25519_macmini" -o IdentitiesOnly=yes anthonyjloria@Mac-Studio.local)
# Terminal may close a window when its script ends; keep it so the outcome stays readable.
trap 'echo; read -r -p "Press Return to close this window. " _' EXIT
echo "Blanc Beta 2.0.0-beta.3: outbound check (about 12 minutes)"
echo "When asked, type your Mac Studio password (for sudo)."
echo
"${STUDIO[@]}" -t 'sudo sh /Users/Shared/blanc-outbound/repo/chromium/tests/outbound/beta-root-remote.sh'
code=$?
echo; [ $code = 0 ] && echo "Done. You can close this window and tell Claude." || echo "STOPPED (exit $code). The firewall rule is off. Tell Claude."

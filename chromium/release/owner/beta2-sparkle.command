#!/bin/bash
# Blanc Beta 2.0.0-beta.2: release stage "sparkle" (docs/chromium-beta-release.md §10.6).
# Signs the update feed with the beta update key in this Mac's Keychain; prints only
# the public signature. Nothing goes online. If macOS asks whether sign_update may
# use the key, choose Allow.
set -uo pipefail
cd "$HOME/Projects/Blanc/repo" || exit 1
WORK="$HOME/Projects/Blanc/records/beta2-work"
STATUS="$HOME/Projects/Blanc/records/beta2-sparkle-status.txt"
note() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" >> "$STATUS"; }
: > "$STATUS"
echo "Blanc Beta 2.0.0-beta.2: signing the update feed"
note "sparkle started"
if /usr/local/bin/node chromium/release/release.mjs sparkle "$WORK"; then
  note "sparkle passed"; note "done"
  echo; echo "Done: the update feed is signed. You can close this window and tell Claude."
else
  note "sparkle FAILED (exit $?)"
  echo; echo "STOPPED at: sparkle. Nothing was published. Tell Claude."; exit 1
fi

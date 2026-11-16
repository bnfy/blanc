#!/bin/bash
# Blanc Beta 2.0.0-beta.3: release stage "sparkle" (docs/chromium-beta-release.md §10.6).
# Signs the update feed with the beta update key in this Mac's Keychain; prints only
# the public signature. Nothing goes online. If macOS asks whether sign_update may
# use the key, choose Allow.
set -uo pipefail
cd "$HOME/Projects/Blanc/repo" || exit 1
WORK="$HOME/Projects/Blanc/records/beta3-work"
STATUS="$HOME/Projects/Blanc/records/beta3-sparkle-status.txt"
note() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" >> "$STATUS"; }
: > "$STATUS"
echo "Blanc Beta 2.0.0-beta.3: signing the update feed"
note "sparkle started"
# From the MacBook Pro wrapper (owner, 2026-11-14): the 1Password copy of the update
# key arrives as SSH environment; release.mjs drops it from its environment on load.
[ -n "${LC_BLANC_SPARKLE_KEY:-}" ] && export BLANC_SPARKLE_KEY=$LC_BLANC_SPARKLE_KEY
unset LC_BLANC_SPARKLE_KEY
if /usr/local/bin/node chromium/release/release.mjs sparkle "$WORK"; then
  note "sparkle passed"; note "done"
  unset BLANC_SPARKLE_KEY; echo; echo "Done: the update feed is signed. You can close this window and tell Claude."
else
  note "sparkle FAILED (exit $?)"
  unset BLANC_SPARKLE_KEY; echo; echo "STOPPED at: sparkle. Nothing was published. Tell Claude."; exit 1
fi

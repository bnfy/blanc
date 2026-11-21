#!/bin/bash
# Blanc Beta update key, part 2 of 2: copy the Keychain key (account
# me.bnfy.blanc.beta) into 1Password (Dev: "Blanc Chromium Beta Sparkle
# Signing"), read it back, compare, and delete the temporary copy. Removes the
# BACKUP-PENDING marker that blocks publishing. Nothing secret is printed or kept.
set -euo pipefail
umask 077
GEN="$HOME/Projects/Blanc/records/sparkle-2.10.1/bin/generate_keys"
KEYS="$HOME/Projects/Blanc/records/sparkle-production"
ACCOUNT=me.bnfy.blanc.beta
TITLE='Blanc Chromium Beta Sparkle Signing'
OPACCT=my.1password.com
STATUS="$HOME/Projects/Blanc/records/sparkle-ceremony-status.txt"
note() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" >> "$STATUS"; }
WORK=$(mktemp -d /private/tmp/blanc-beta-key.XXXXXX)
trap 'code=$?; rm -rf "$WORK"; if [ $code -ne 0 ]; then note "part 2 stopped (exit $code)"; echo; echo "STOPPED. The temporary copy was deleted. Tell Claude."; fi' EXIT
echo "Blanc Beta update key, part 2 of 2: back it up to 1Password"
echo
security find-generic-password -s "https://sparkle-project.org" -a "$ACCOUNT" >/dev/null 2>&1 || { echo "No key for $ACCOUNT in your Keychain. Stopping."; exit 1; }
[ "$("$GEN" --account "$ACCOUNT" -p | tr -d '[:space:]')" = "$(tr -d '[:space:]' < "$KEYS/public-key.txt")" ] || { echo "The Keychain key isn't the one the build uses. Stopping."; exit 1; }
note "part 2: signing in to 1Password"
echo "1. Sign in to 1Password (Touch ID)."
OP_BIOMETRIC_UNLOCK_ENABLED=true op signin --account "$OPACCT"
op whoami --account "$OPACCT" >/dev/null 2>&1 || { echo "1Password didn't sign in. Stopping."; exit 1; }
if op item get "$TITLE" --vault Dev --account "$OPACCT" >/dev/null 2>&1; then
  echo "1Password already has '$TITLE'. Checking it matches instead of adding another."
  "$GEN" --account "$ACCOUNT" -x "$WORK/private-seed.txt" > /dev/null 2>&1
  op document get "$TITLE" --vault Dev --account "$OPACCT" --output "$WORK/recovered-seed.txt" > /dev/null
else
  echo "2. Storing the key in 1Password and reading it back."
  "$GEN" --account "$ACCOUNT" -x "$WORK/private-seed.txt" > /dev/null 2>&1
  op document create "$WORK/private-seed.txt" --vault Dev --title "$TITLE" --account "$OPACCT" > /dev/null
  op document get "$TITLE" --vault Dev --account "$OPACCT" --output "$WORK/recovered-seed.txt" > /dev/null
fi
cmp -s "$WORK/private-seed.txt" "$WORK/recovered-seed.txt" || { echo "The 1Password copy does NOT match the Keychain key. Stopping."; exit 1; }
rm -f "$WORK/private-seed.txt" "$WORK/recovered-seed.txt" "$KEYS/BACKUP-PENDING"
note "part 2: 1Password copy verified; backup done"
echo
echo "Done: 1Password has a verified copy, no copy is left on disk, and publishing is unblocked."

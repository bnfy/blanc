#!/bin/bash
# Blanc Beta update key, part 1 of 2 (runbook §10.1, split because 1Password
# was unusable on 2026-11-14): make the key in the macOS Keychain (account
# me.bnfy.blanc.beta) and save the public key for the build. The private key
# is never exported here. Publishing stays blocked until part 2,
# sparkle-key-backup.command, has stored and verified a copy in 1Password.
set -euo pipefail
umask 077
GEN="$HOME/Projects/Blanc/records/sparkle-2.10.1/bin/generate_keys"
KEYS="$HOME/Projects/Blanc/records/sparkle-production"
ACCOUNT=me.bnfy.blanc.beta
STATUS="$HOME/Projects/Blanc/records/sparkle-ceremony-status.txt"
note() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" >> "$STATUS"; }
trap 'code=$?; if [ $code -ne 0 ]; then note "part 1 stopped (exit $code)"; echo; echo "STOPPED. Nothing secret was written to disk. Tell Claude."; fi' EXIT
echo "Blanc Beta update key, part 1 of 2: make the key in your Keychain"
echo
[ -x "$GEN" ] || { echo "The Sparkle tools are missing. Stopping."; exit 1; }
if security find-generic-password -s "https://sparkle-project.org" -a "$ACCOUNT" >/dev/null 2>&1; then
  echo "Your Keychain already has a Sparkle key for $ACCOUNT. Stopping: nothing to make."
  exit 1
fi
note "part 1: making the key"
echo "Making the key (macOS may ask to allow Keychain access: choose Allow)."
"$GEN" --account "$ACCOUNT" > /dev/null 2>&1
PUB=$("$GEN" --account "$ACCOUNT" -p | tr -d '[:space:]')
[ "$(printf '%s' "$PUB" | base64 -d 2>/dev/null | wc -c | tr -d ' ')" = 32 ] || { echo "The public key doesn't look right. Stopping."; exit 1; }
mkdir -p "$KEYS"; chmod 700 "$KEYS"
printf '%s\n' "$PUB" > "$KEYS/public-key.txt"
printf 'The Blanc Beta update key is only in this Mac'"'"'s Keychain. Run sparkle-key-backup.command before publishing.\n' > "$KEYS/BACKUP-PENDING"
note "part 1: key in Keychain, public key saved; 1Password backup pending"
echo
echo "Done: the key is in your Keychain and the public key is saved."
echo "Before any publishing, run part 2 (sparkle-key-backup.command) once 1Password works."

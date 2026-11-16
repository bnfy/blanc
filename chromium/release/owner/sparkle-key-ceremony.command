#!/bin/bash
# Blanc Beta: production Sparkle update-key ceremony (docs/chromium-beta-release.md §10.1).
# Run by the owner in Terminal. The private key goes only into the macOS
# Keychain (account me.bnfy.blanc.beta) and the 1Password Dev vault; nothing
# here prints, logs or keeps it. The public key (not secret) is saved to
# ~/Projects/Blanc/records/sparkle-production/public-key.txt for the build.
set -euo pipefail
umask 077
SPARKLE="$HOME/Projects/Blanc/records/sparkle-2.10.1"
KEYS="$HOME/Projects/Blanc/records/sparkle-production"
ACCOUNT=me.bnfy.blanc.beta
TITLE='Blanc Chromium Beta Sparkle Signing'
GEN="$SPARKLE/bin/generate_keys"

echo "Blanc Beta: production update-key ceremony"
echo
[ -x "$GEN" ] || { echo "The Sparkle tools are missing at $SPARKLE. Stopping."; exit 1; }
if security find-generic-password -s "https://sparkle-project.org" -a "$ACCOUNT" >/dev/null 2>&1; then
  echo "Your Keychain already has a Sparkle key for $ACCOUNT. Stopping: recover that key instead of making another."
  exit 1
fi

WORK=$(mktemp -d /private/tmp/blanc-beta-key.XXXXXX)
# A status note Claude can read: step names and results only, nothing secret.
STATUS="$HOME/Projects/Blanc/records/sparkle-ceremony-status.txt"
STEP=start
note() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" >> "$STATUS"; }
: > "$STATUS"; chmod 600 "$STATUS"
trap 'code=$?; rm -rf "$WORK"; if [ $code -ne 0 ]; then note "stopped at $STEP (exit $code)"; echo; echo "STOPPED at: $STEP. Nothing secret was kept. Tell Claude."; fi' EXIT

echo "1. Sign in to 1Password (Touch ID or your 1Password password)."
# Sign-in goes through the 1Password app; never add an account by hand here.
STEP="1Password sign-in"; note "$STEP"
# Your account by name, through the 1Password app (Touch ID): never a manual account.
OP_BIOMETRIC_UNLOCK_ENABLED=true op signin --account my.1password.com
if ! op whoami --account my.1password.com >/dev/null 2>&1; then
  note "not signed in"
  echo "1Password didn't sign in. Unlock the 1Password app, check Settings > Developer >"
  echo "'Integrate with 1Password CLI' is on, then run this again."
  exit 1
fi
note "signed in"
STEP="checking 1Password for an existing key"
if op item get "$TITLE" --vault Dev --account my.1password.com >/dev/null 2>&1; then
  note "1Password already has the item"
  echo "1Password already has '$TITLE' in Dev. Stopping: recover that key instead of making another."
  exit 1
fi

STEP="making the key"; note "$STEP"
echo "2. Making the key in your Keychain (macOS may ask to allow Keychain access: choose Allow)."
"$GEN" --account "$ACCOUNT" > "$WORK/generate.txt" 2>&1
"$GEN" --account "$ACCOUNT" -p > "$WORK/public-key.txt"
PUB=$(tr -d '[:space:]' < "$WORK/public-key.txt")
[ "$(printf '%s' "$PUB" | base64 -d 2>/dev/null | wc -c | tr -d ' ')" = 32 ] || { echo "The public key doesn't look right. Stopping."; exit 1; }
mkdir -p "$KEYS"; chmod 700 "$KEYS"
printf '%s\n' "$PUB" > "$KEYS/public-key.txt"
echo "   Public key saved to $KEYS/public-key.txt"

note "public key saved"
STEP="storing the key in 1Password"; note "$STEP"
echo "3. Storing the private key in 1Password (Dev: '$TITLE') and reading it back."
"$GEN" --account "$ACCOUNT" -x "$WORK/private-seed.txt" > "$WORK/export.txt" 2>&1
op document create "$WORK/private-seed.txt" --vault Dev --title "$TITLE" --account my.1password.com > /dev/null
op document get "$TITLE" --vault Dev --output "$WORK/recovered-seed.txt" --account my.1password.com > /dev/null
if cmp -s "$WORK/private-seed.txt" "$WORK/recovered-seed.txt"; then
  echo "   The 1Password copy matches the Keychain key."
else
  echo "   The 1Password copy does NOT match. The key is in your Keychain; tell Claude before doing anything else."
  exit 1
fi
rm -f "$WORK/private-seed.txt" "$WORK/recovered-seed.txt"
note "1Password copy verified; done"

echo
echo "Done: the key is in your Keychain and in 1Password, and no copy is left on disk."
echo "You can close this window and tell Claude it's done."

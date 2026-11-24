#!/bin/bash
# Blanc Beta for Windows, update keys (W3 Task B3). Makes the two private keys
# Blanc's updater trusts, stores each in 1Password (Dev), reads each back and
# compares, and keeps only the public halves on disk. Nothing secret is printed.
#
#   CUP (update-check answers): ML-DSA-44, 1Password "Blanc Windows Beta CUP Key".
#     Its private half later goes to the update Worker's secret (Task C1).
#   CRX (update packages): RSA 4096, 1Password "Blanc Windows Beta CRX Publisher Key".
#     Used only by the owner's signing step (Task D1).
#
# Public halves: ~/Projects/Blanc/records/windows-update-keys/{cup,crx}-public.der
# (BLANC_KEYS_OUT overrides the folder; BLANC_OP overrides the op command and
# BLANC_WORK_TMP the folder that holds the working folder, for tests).
set -euo pipefail
umask 077
OPENSSL=/opt/homebrew/opt/openssl@3/bin/openssl
OUT="${BLANC_KEYS_OUT:-$HOME/Projects/Blanc/records/windows-update-keys}"
OP="${BLANC_OP:-op}"
# Every op call goes through the 1Password app (Touch ID), not just the first.
export OP_BIOMETRIC_UNLOCK_ENABLED=true
OPACCT=my.1password.com
CUP_TITLE='Blanc Windows Beta CUP Key'
CRX_TITLE='Blanc Windows Beta CRX Publisher Key'
WORK=$(mktemp -d "${BLANC_WORK_TMP:-/private/tmp}/blanc-win-keys.XXXXXX")
trap 'code=$?; rm -rf "$WORK"; if [ $code -ne 0 ]; then echo; echo "STOPPED. Nothing was left on disk. Tell Claude."; fi' EXIT
echo "Blanc Beta for Windows: make the update keys"
echo
"$OPENSSL" list -signature-algorithms 2>/dev/null | grep -q 'ML-DSA-44' || { echo "$OPENSSL can't make ML-DSA-44 keys. Stopping."; exit 1; }
mkdir -p "$OUT"
if [ -e "$OUT/cup-public.der" ] || [ -e "$OUT/crx-public.der" ]; then echo "$OUT already has public keys. Stopping, so no key is replaced."; exit 1; fi
echo "1. Open 1Password's Dev vault (Touch ID)."
# `op whoami` reports "not signed in" under the desktop app's integration even
# when every vault call works, so the check is opening the vault itself.
"$OP" vault get Dev --account "$OPACCT" >/dev/null 2>&1 || { echo "1Password's Dev vault didn't open. Stopping."; exit 1; }
# Read the vault's item titles: an error here stops the ceremony instead of
# reading as "no such key".
"$OP" item list --vault Dev --account "$OPACCT" --format json > "$WORK/items.json" || { echo "Couldn't list the Dev vault. Stopping."; exit 1; }
for title in "$CUP_TITLE" "$CRX_TITLE"; do
  if python3 -c 'import json,sys; sys.exit(0 if sys.argv[2] in [i.get("title") for i in json.load(open(sys.argv[1]))] else 1)' "$WORK/items.json" "$title"; then
    echo "1Password already has '$title'. Stopping, so no key is replaced."; exit 1
  fi
done
echo "2. Making the keys."
"$OPENSSL" genpkey -algorithm ML-DSA-44 -out "$WORK/cup.pem" 2>/dev/null
"$OPENSSL" genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:4096 -out "$WORK/crx.pem" 2>/dev/null
echo "3. Storing each in 1Password and reading it back."
for pair in "cup:$CUP_TITLE" "crx:$CRX_TITLE"; do
  name=${pair%%:*}; title=${pair#*:}
  "$OP" document create "$WORK/$name.pem" --vault Dev --title "$title" --file-name "$name.pem" --account "$OPACCT" > /dev/null
  "$OP" document get "$title" --vault Dev --account "$OPACCT" --output "$WORK/$name-back.pem" > /dev/null
  cmp -s "$WORK/$name.pem" "$WORK/$name-back.pem" || { echo "The 1Password copy of '$title' does NOT match. Stopping."; exit 1; }
done
echo "4. Keeping the public halves."
"$OPENSSL" pkey -in "$WORK/cup.pem" -pubout -outform DER -out "$OUT/cup-public.der"
"$OPENSSL" pkey -in "$WORK/crx.pem" -pubout -outform DER -out "$OUT/crx-public.der"
rm -rf "$WORK"
echo
echo "Done. 1Password has verified copies of both private keys; no private key is left on disk."
echo "Public keys, for Claude:"
for name in cup crx; do echo "  $name-public.der sha256 $(shasum -a 256 "$OUT/$name-public.der" | cut -d' ' -f1)"; done

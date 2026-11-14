#!/bin/bash
# Blanc Beta: back up the production update key to 1Password through another Mac
# (owner, 2026-11-14: 1Password won't stay unlocked on this Mac Studio).
# Exports the key from this Mac's Keychain to one Desktop file, proves it is the
# production key, waits while you AirDrop it to the MacBook Pro and save it in
# 1Password there, then deletes this Mac's copy and clears the BACKUP-PENDING
# marker. The key is never printed or logged.
set -uo pipefail
umask 077
SPARKLE="$HOME/Projects/Blanc/records/sparkle-2.10.1"
KEYS="$HOME/Projects/Blanc/records/sparkle-production"
STATUS="$HOME/Projects/Blanc/records/sparkle-ceremony-status.txt"
FILE="$HOME/Desktop/Blanc-Beta-update-key.txt"
TITLE='Blanc Chromium Beta Sparkle Signing'
note() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" >> "$STATUS"; }
TMP=$(mktemp -d /private/tmp/blanc-key-check.XXXXXX)
trap 'rm -f "$FILE"; rm -rf "$TMP"' EXIT

echo "Blanc Beta: back up the update key to 1Password (through your MacBook Pro)"
echo
[ -f "$KEYS/BACKUP-PENDING" ] || { echo "The backup is already recorded as done. Nothing to do."; exit 0; }
[ -e "$FILE" ] && { echo "$FILE already exists. Move it away and run this again."; exit 1; }
note "airdrop backup: exporting"
echo "1. Exporting the key from your Keychain (choose Allow if macOS asks)."
"$SPARKLE/bin/generate_keys" --account me.bnfy.blanc.beta -x "$FILE" > /dev/null 2>&1 || { note "airdrop backup: export failed"; echo "The export failed. Tell Claude."; exit 1; }
# Prove the file is the production key: sign a test file with it and check the
# signature against the production public key.
head -c 64 /dev/urandom > "$TMP/probe"
SIG=$("$SPARKLE/bin/sign_update" --ed-key-file "$FILE" -p "$TMP/probe" 2>/dev/null)
if ! /usr/local/bin/node -e '
  const fs=require("fs"),c=require("crypto");
  const pub=Buffer.from(fs.readFileSync(process.argv[1],"utf8").trim(),"base64");
  const key=c.createPublicKey({key:Buffer.concat([Buffer.from("302a300506032b6570032100","hex"),pub]),format:"der",type:"spki"});
  process.exit(c.verify(null,fs.readFileSync(process.argv[2]),key,Buffer.from(process.argv[3],"base64"))?0:1);
' "$KEYS/public-key.txt" "$TMP/probe" "$SIG"; then
  note "airdrop backup: exported file is not the production key"; echo "The exported file doesn't match the production key. Nothing was kept. Tell Claude."; exit 1
fi
note "airdrop backup: exported and matched the production key"
echo "   It's on your Desktop as Blanc-Beta-update-key.txt and matches the production key."
echo
echo "2. AirDrop it to your MacBook Pro: in Finder, right-click the file on the Desktop,"
echo "   Share, AirDrop, choose the MacBook Pro."
echo "3. On the MacBook Pro, in 1Password: vault Dev, New Item, Document. Choose the file"
echo "   (in Downloads), name the item exactly:"
echo "      $TITLE"
echo "   and save."
echo "4. On the MacBook Pro, delete the file from Downloads and empty the Trash."
echo
read -r -p "Is it saved in 1Password with that title, and deleted from the MacBook Pro? [y/n] " a
rm -f "$FILE"
if [ "$a" = y ] || [ "$a" = Y ]; then
  rm -f "$KEYS/BACKUP-PENDING"
  note "airdrop backup: saved in 1Password on the MacBook Pro (owner confirmed); Mac Studio copy deleted; backup done"
  echo; echo "Done: the key is in your Keychain and in 1Password, and this Mac's copy is deleted."
  echo "You can close this window and tell Claude."
else
  note "airdrop backup: not confirmed; Mac Studio copy deleted; still pending"
  echo; echo "Not recorded as done. This Mac's copy is deleted. Run this again when ready."
fi

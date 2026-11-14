#!/bin/bash
# Blanc Beta 2.0.0-beta.3: the owner's hands-on gates on the notarized build
# (docs/chromium-beta-release.md §6–7): Touch ID passkeys (webauthn) and
# production Sync with a real iPhone (production-sync-real-device).
# Installs the notarized app from the release DMG into /Applications, then asks
# one yes/no question per check. Records only your answers: no codes, tokens,
# addresses or page contents.
set -uo pipefail
WORK="$HOME/Projects/Blanc/records/beta3-work"
DMG="$WORK/assets/Blanc-Beta-2.0.0-beta.3-mac-arm64.dmg"
OUT="$HOME/Projects/Blanc/evidence/foundation/beta3-signed"
APP="/Applications/Blanc Beta.app"
mkdir -p "$OUT"
DMG_SHA=$(shasum -a 256 "$DMG" | cut -c1-64)

ask() { # ask "question" -> sets REPLY_OK to pass|fail|skip
  local a
  while true; do
    read -r -p "   $1  [y = yes / n = no / s = skip] " a
    case "$a" in y|Y) REPLY_OK=pass; return;; n|N) REPLY_OK=fail; return;; s|S) REPLY_OK=skip; return;; esac
  done
}
record() { # record GATE FILE "name|result" ...
  local gate=$1 file=$2; shift 2
  local status=pass checks="" first=1
  for item in "$@"; do
    local name=${item%|*} result=${item##*|}
    [ "$result" = pass ] || status=fail
    [ $first = 1 ] && first=0 || checks+=","
    checks+=$'\n'"    {\"name\": \"${name//\"/\\\"}\", \"result\": \"$result\"}"
  done
  cat > "$file" <<JSON
{
  "schema": 1,
  "gate": "$gate",
  "method": "owner at the keyboard on the notarized build installed from the release DMG; answers recorded by beta3-owner-checks.command",
  "release": {"version": "2.0.0-beta.3", "build": 3, "dmgSHA256": "$DMG_SHA"},
  "at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "checks": [$checks
  ],
  "status": "$status"
}
JSON
  echo "   Recorded $gate: $status"
}

MODE=${1:-all}
echo "Blanc Beta 2.0.0-beta.3: your hands-on checks"
echo
if [ "$MODE" = all ]; then
if [ -e "$APP" ]; then
  echo "There is already a Blanc Beta in Applications. Quit it if it's open, then press Return to replace it."
  read -r _
  rm -rf "$APP"
fi
MNT=$(mktemp -d /private/tmp/beta3-install.XXXXXX)
hdiutil attach -readonly -nobrowse -mountpoint "$MNT" "$DMG" >/dev/null || { echo "The DMG didn't open. Tell Claude."; exit 1; }
ditto "$MNT/Blanc Beta.app" "$APP"; hdiutil detach "$MNT" >/dev/null
echo "Installed the notarized Blanc Beta in Applications. Opening it."
open "$APP"
echo

echo "== Part 1 of 2: Touch ID passkeys (about 3 minutes)"
echo "   In Blanc Beta, go to webauthn.io."
ask "1. Type a username (e.g. blanc-beta-test), click Register, approve with Touch ID. Did it say you registered?"; P1=$REPLY_OK
ask "2. Click Authenticate and approve with Touch ID. Did it say you're signed in?"; P2=$REPLY_OK
echo "   Quit Blanc Beta (Cmd-Q), open it again from Applications, go back to webauthn.io."
ask "3. Click Authenticate again with Touch ID. Did it still work?"; P3=$REPLY_OK
echo "   Open a private window (Shift-Cmd-N) and go to webauthn.io there."
ask "4. Register a different username with Touch ID in the private window. Did it work?"; P4=$REPLY_OK
ask "5. Is your regular Blanc still fine (opens normally, your tabs and passkeys untouched)?"; P5=$REPLY_OK
record webauthn "$OUT/webauthn.json" \
  "registers a passkey with Touch ID|$P1" "signs in with that passkey|$P2" \
  "the passkey still works after quitting and reopening|$P3" "a private window registers a passkey with Touch ID|$P4" \
  "the Electron Blanc app and its passkeys are untouched|$P5"
echo
fi

echo "== Sync with your iPhone (about 10 minutes)"
echo "   Your iPhone already syncs, so Blanc Beta joins that same Sync."
echo "   a) In your REGULAR Blanc: Settings, Sync, Add another device. It shows a code."
echo "   b) In BLANC BETA: Settings, Sync, Add this device with a code. Enter that code."
echo "      (Ignore Turn on Sync and Connect your iPhone: those start a new Sync.)"
ask "1. While joining, did Blanc Beta tell you what it would sync and let you confirm (or cancel) first?"; S1=$REPLY_OK
ask "2. Does Blanc Beta now show Sync on, and does your iPhone list it as a device?"; S2=$REPLY_OK
ask "2b. In Blanc Beta, open Settings, Sync. Does it say Sync is on, with no \"Could not check sync\"?"; S2B=$REPLY_OK
ask "3. Add a Favorite in Blanc Beta. Does it appear on the iPhone (allow a minute)?"; S3=$REPLY_OK
ask "4. Add a Favorite on the iPhone. Does it appear in Blanc Beta?"; S4=$REPLY_OK
ask "5. Change a synced setting in Blanc Beta (e.g. the search engine). Does the iPhone follow?"; S5=$REPLY_OK
ask "6. Quit and reopen Blanc Beta. Is Sync still on, without entering a code again?"; S6=$REPLY_OK
ask "7. Turn the Mac's Wi-Fi off, add a Favorite in Blanc Beta, turn Wi-Fi back on. Does it reach the iPhone?"; S7=$REPLY_OK
ask "8. Open a page in a private window in Blanc Beta. Does it stay off the iPhone (not in its list of the Mac's tabs)?"; S8=$REPLY_OK
ask "9. In Blanc Beta: Settings, Sync, turn Sync off. Do its changes stop reaching the iPhone?"; S9=$REPLY_OK
record production-sync-real-device "$OUT/production-sync-real-device.json" \
  "shows what it will sync and asks before joining|$S1" "joins the real iPhone's Sync through the normal UI|$S2" \
  "Settings shows Sync on after joining (the beta.2 lockout is gone)|$S2B" \
  "a Mac Favorite reaches the iPhone|$S3" "an iPhone Favorite reaches the Mac|$S4" "a synced setting follows|$S5" \
  "Sync survives quitting and reopening (Keychain)|$S6" "an offline change merges when back online|$S7" \
  "private windows are not synced|$S8" "turning Sync off disconnects|$S9"
echo
echo "Done. You can close this window and tell Claude."

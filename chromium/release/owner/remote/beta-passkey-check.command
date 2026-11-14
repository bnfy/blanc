#!/bin/bash
# The Touch ID passkey check (gate webauthn) for a daily Blanc Beta, from the
# MacBook Pro. Due only when the passkey code changed since the last beta where
# it passed (standing.json; owner, 2026-11-14); the release command stops and
# says so. The same file for every beta: the Mac Studio knows which release is
# prepared. Installs the notarized app from that release's DMG into
# Applications (replacing this Mac's Blanc Beta; its data folder stays), asks
# five yes/no questions and sends only the answers to the Mac Studio. Then run
# beta-release.command again to finish the release.
set -uo pipefail
STUDIO=(ssh -i "$HOME/.ssh/id_ed25519_macmini" -o IdentitiesOnly=yes anthonyjloria@Mac-Studio.local)
LOCAL=$(mktemp -d /private/tmp/beta-passkey.XXXXXX)
trap 'rm -rf "$LOCAL"; echo; read -r -p "Press Return to close this window. " _' EXIT
MARKER=$("${STUDIO[@]}" 'cat "$HOME/Projects/Blanc/records/RELEASE-IN-PROGRESS"') || { echo "No release is prepared on the Mac Studio. Tell Claude."; exit 1; }
VERSION=$(/usr/bin/python3 -c 'import json,sys; print(json.loads(sys.argv[1])["version"])' "$MARKER")
WORK=$(/usr/bin/python3 -c 'import json,sys; print(json.loads(sys.argv[1])["work"])' "$MARKER")
[[ "$VERSION" =~ ^2\.0\.0-beta\.([1-9][0-9]*)$ ]] || { echo "The prepared release has no beta version. Tell Claude."; exit 1; }
N=${BASH_REMATCH[1]}
NAME="Blanc-Beta-$VERSION-mac-arm64.dmg"
DMG="$LOCAL/$NAME"
APP="/Applications/Blanc Beta.app"
echo "Blanc Beta $VERSION: the Touch ID passkey check"
echo "Copying the notarized DMG from the Mac Studio..."
scp -q -i "$HOME/.ssh/id_ed25519_macmini" -o IdentitiesOnly=yes "anthonyjloria@Mac-Studio.local:$WORK/signed/arm64/$NAME" "$DMG" || { echo "Couldn't copy the DMG. Tell Claude."; exit 1; }
DMG_SHA=$(shasum -a 256 "$DMG" | cut -c1-64)
SIGNED_SHA=$("${STUDIO[@]}" "/usr/bin/python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))[\"done\"][\"notarize-dmg\"][\"arm64\"][\"dmgSHA256\"])' '$WORK/state.json'")
[ -n "$SIGNED_SHA" ] && [ "$DMG_SHA" = "$SIGNED_SHA" ] || { echo "The copied DMG isn't the notarized one. Nothing was installed. Tell Claude."; exit 1; }

ask() { local a; while true; do read -r -p "   $1  [y = yes / n = no] " a
  case "$a" in y|Y) REPLY_OK=pass; return;; n|N) REPLY_OK=fail; return;; esac; done; }
if [ -e "$APP" ]; then
  echo "There is already a Blanc Beta in Applications. Quit it if it's open, then press Return to replace it."
  read -r _
  rm -rf "$APP"
fi
MNT=$(mktemp -d /private/tmp/beta-install.XXXXXX)
hdiutil attach -readonly -nobrowse -mountpoint "$MNT" "$DMG" >/dev/null || { echo "The DMG didn't open. Tell Claude."; exit 1; }
ditto "$MNT/Blanc Beta.app" "$APP"; hdiutil detach "$MNT" >/dev/null
echo "Installed the notarized Blanc Beta in Applications. Opening it."
open "$APP"
echo
echo "   In Blanc Beta, go to webauthn.io."
ask "1. Type a username (e.g. blanc-beta-test), click Register, approve with Touch ID. Did it say you registered?"; P1=$REPLY_OK
ask "2. Click Authenticate and approve with Touch ID. Did it say you're signed in?"; P2=$REPLY_OK
echo "   Quit Blanc Beta (Cmd-Q), open it again from Applications, go back to webauthn.io."
ask "3. Click Authenticate again with Touch ID. Did it still work?"; P3=$REPLY_OK
echo "   Open a private window (Shift-Cmd-N) and go to webauthn.io there."
ask "4. Register a different username with Touch ID in the private window. Did it work?"; P4=$REPLY_OK
ask "5. Is your regular Blanc still fine (opens normally, your tabs and passkeys untouched)?"; P5=$REPLY_OK
STATUS=pass
for r in "$P1" "$P2" "$P3" "$P4" "$P5"; do [ "$r" = pass ] || STATUS=fail; done
cat > "$LOCAL/webauthn.json" <<JSON
{
  "schema": 1,
  "gate": "webauthn",
  "method": "owner at the keyboard on the notarized build installed from the release DMG on the owner's MacBook Pro; answers recorded by remote/beta-passkey-check.command",
  "release": {"version": "$VERSION", "build": $N, "dmgSHA256": "$DMG_SHA"},
  "at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "checks": [
    {"name": "registers a passkey with Touch ID", "result": "$P1"},
    {"name": "signs in with that passkey", "result": "$P2"},
    {"name": "the passkey still works after quitting and reopening", "result": "$P3"},
    {"name": "a private window registers a passkey with Touch ID", "result": "$P4"},
    {"name": "the Electron Blanc app and its passkeys are untouched", "result": "$P5"}
  ],
  "status": "$STATUS"
}
JSON
echo "   Recorded: $STATUS"
"${STUDIO[@]}" "mkdir -p \"\$HOME/Projects/Blanc/evidence/foundation/beta$N\"" &&
  scp -q -i "$HOME/.ssh/id_ed25519_macmini" -o IdentitiesOnly=yes "$LOCAL/webauthn.json" "anthonyjloria@Mac-Studio.local:Projects/Blanc/evidence/foundation/beta$N/webauthn.json" ||
  { echo "Couldn't send your answers to the Mac Studio. Tell Claude before closing this window."; exit 1; }
if [ "$STATUS" = pass ]; then
  echo "Done. Now run beta-release.command again to finish the release."
else
  echo "A check failed, so the release stays stopped. Tell Claude."
fi

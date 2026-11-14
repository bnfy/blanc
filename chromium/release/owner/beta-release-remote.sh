#!/bin/bash
# The daily Blanc Beta release, on the Mac Studio, in one SSH session from the
# owner's MacBook Pro (owner/remote/beta-release.command starts it; owner,
# 2026-11-14: one command per release). It runs every step of the release
# prepared by daily/beta-prep.mjs, in order, from where a stopped run left off
# (daily/release-steps.mjs), and never runs a step that already ran.
#
# Owner-only steps stay the owner's: the Mac Studio password (sudo for the
# outbound check, then the login keychain), the typed "tag and draft" and
# "publish" confirmations in release.mjs, and the Sigstore sign-in. Secrets
# arrive as SSH environment (LC_*) from 1Password on the MacBook Pro, are moved
# into shell variables and cleared from the environment at once, and reach only
# the stage that needs them. Nothing secret is printed, logged or put on argv.
set -uo pipefail
BASE="${BLANC_STUDIO_BASE:-$HOME/Projects/Blanc}"
cd "$BASE/repo" || exit 1
NODE=${BLANC_NODE:-/usr/local/bin/node}
# The checksum-verified cosign the release stages use (runbook, lessons from beta.2, item 3).
export PATH="$BASE/repo/scripts/release-bin:$PATH"
MARKER="$BASE/records/RELEASE-IN-PROGRESS"

APPLE_ID_VALUE=${LC_BLANC_APPLE_ID:-}; APPLE_PW_VALUE=${LC_BLANC_APPLE_PW:-}; SPARKLE_KEY_VALUE=${LC_BLANC_SPARKLE_KEY:-}
unset LC_BLANC_APPLE_ID LC_BLANC_APPLE_PW LC_BLANC_SPARKLE_KEY
forget() { unset APPLE_ID_VALUE APPLE_PW_VALUE SPARKLE_KEY_VALUE APPLE_ID APPLE_APP_SPECIFIC_PASSWORD BLANC_SPARKLE_KEY; }
trap forget EXIT

[ -f "$MARKER" ] || { echo "No release is prepared on the Mac Studio. Nothing ran. Tell Claude."; exit 1; }
WORK=$("$NODE" -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1])).work)' "$MARKER")
VERSION=$("$NODE" -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1])).version)' "$MARKER")
N=${VERSION##*.}
STATUS="$BASE/records/beta$N-release-status.txt"
EV="$BASE/evidence/foundation"
note() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" >> "$STATUS"; }
touch "$STATUS"; chmod 600 "$STATUS"
stop() { note "$1 FAILED"; echo; echo "STOPPED at: $1. $2 Tell Claude; running this again picks up from here."; exit 1; }
next() { "$NODE" chromium/release/daily/release-steps.mjs next "$WORK"; }
stage() { "$NODE" chromium/release/release.mjs "$1" "$WORK"; }

echo "Blanc Beta $VERSION"
STEP=$(next) || stop "planning" "The release folder could not be read."
if [ "$STEP" = done ]; then echo "This release is already public."; exit 0; fi
echo "Next step: $STEP"
echo

# The Mac Studio password, at most twice, before anything runs: sudo (only while
# the outbound check is still due) and the login keychain (codesign, gh).
if [ "$STEP" = outbound ]; then
  echo "Type your Mac Studio password for the outbound check (sudo)."
  sudo -v || stop "sudo" "Nothing ran."
fi
echo "Type your Mac Studio password again to open its keychain."
security unlock-keychain "$HOME/Library/Keychains/login.keychain-db" || stop "keychain" "Nothing ran."

while :; do
  STEP=$(next) || stop "planning" "The release folder could not be read."
  [ "$STEP" = done ] && break
  echo; echo "== $STEP"; note "$STEP started"
  case "$STEP" in
    outbound)
      START=$(date +%s)
      sudo sh /Users/Shared/blanc-outbound/repo/chromium/tests/outbound/beta-root-remote.sh || stop outbound "The firewall rule is off."
      RUN=""
      for dir in /Users/Shared/blanc-outbound/results/beta-*; do
        [ -f "$dir/user.log" ] && [ "$(stat -f %B "$dir")" -ge "$START" ] && grep -q ' Done' "$dir/user.log" && RUN=$dir
      done
      [ -n "$RUN" ] || stop outbound "No finished run was found."
      mkdir -p "$EV/beta$N"
      "$NODE" chromium/tests/outbound/analyze-beta.mjs "$RUN" > "$EV/beta$N/outbound-report.json.tmp" \
        && mv -n "$EV/beta$N/outbound-report.json.tmp" "$EV/beta$N/outbound-report.json" \
        || { rm -f "$EV/beta$N/outbound-report.json.tmp"; stop outbound "The beta reached something it shouldn't have, or the run was incomplete."; }
      ;;
    notarize-app|notarize-dmg)
      [ -n "$APPLE_ID_VALUE" ] && [ -n "$APPLE_PW_VALUE" ] || stop "$STEP" "1Password didn't send the Apple values."
      APPLE_ID=$APPLE_ID_VALUE APPLE_APP_SPECIFIC_PASSWORD=$APPLE_PW_VALUE APPLE_TEAM_ID=XYGUCY4498 stage "$STEP" || stop "$STEP" "Nothing was published."
      ;;
    dmg|preflight|sign|manifest|draft|publish|verify-public)
      stage "$STEP" || stop "$STEP" "See the message above."
      ;;
    sigstore)
      echo "Open the sign-in address printed below here on the MacBook Pro (Command-click it)."
      stage sigstore || stop sigstore "The draft stays private."
      ;;
    signed-evidence)
      "$NODE" chromium/release/owner/signed-evidence.mjs "$WORK" arm64 "$EV/beta$N-signed" || stop signed-evidence "The notarized DMG did not pass its signature or Gatekeeper check."
      ;;
    sparkle)
      [ -n "$SPARKLE_KEY_VALUE" ] || stop sparkle "1Password didn't send the update key."
      BLANC_SPARKLE_KEY=$SPARKLE_KEY_VALUE stage sparkle || stop sparkle "Nothing was published."
      ;;
    hand-checks*)
      note "$STEP"
      echo "${STEP#hand-checks } is due on this notarized build because its code changed."
      echo "Tell Claude: it starts that check, then run this command again to finish."
      exit 2
      ;;
    gate-evidence)
      "$NODE" chromium/release/gate-evidence.mjs write "$WORK" "$WORK/gate-sources.json" || stop gate-evidence "A gate is not ready."
      ;;
    *) stop "$STEP" "Unknown step." ;;
  esac
  note "$STEP passed"
  if [ "$STEP" = manifest ]; then
    echo; echo "These are the release notes the draft will carry:"; echo
    cat "$WORK/payloads/release-notes.md"; echo
  fi
done
forget
note "done"
echo
echo "Blanc Beta $VERSION is public. Opening the website PR..."
"$NODE" chromium/release/daily/site-pr.mjs "chromium-beta-$VERSION" || echo "The website PR didn't open; Claude will open it."
echo "Done. You can close this window and tell Claude."

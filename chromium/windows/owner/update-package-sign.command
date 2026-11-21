#!/bin/bash
# Blanc Beta for Windows: sign one update package (W3 Task D1). Takes the
# newest ~/Projects/Blanc/records/windows-update-packages/<version>/mini_installer.exe
# that has no package yet, signs it into blanc-beta-<version>.crx3 with Blanc's
# publisher key from 1Password ("Blanc Windows Beta CRX Publisher Key"), and
# checks the package against the committed public key. The key is used from a
# private temporary folder and deleted; nothing secret is printed.
# (BLANC_OP, BLANC_PACKAGES, BLANC_CRX_PUBLIC and BLANC_WORK_TMP are for tests.)
set -euo pipefail
umask 077
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"
OP="${BLANC_OP:-op}"
OPACCT=my.1password.com
PACKAGES="${BLANC_PACKAGES:-$HOME/Projects/Blanc/records/windows-update-packages}"
PUBLIC="${BLANC_CRX_PUBLIC:-$REPO/chromium/windows/keys/crx-public.der}"
export OP_BIOMETRIC_UNLOCK_ENABLED=true
WORK=$(mktemp -d "${BLANC_WORK_TMP:-/private/tmp}/blanc-package-sign.XXXXXX")
trap 'code=$?; rm -rf "$WORK"; if [ $code -ne 0 ]; then echo; echo "STOPPED. No key was left on disk. Tell Claude."; fi' EXIT
echo "Blanc Beta for Windows: sign an update package"
echo
DIR=""
for d in $(ls -d "$PACKAGES"/*/ 2>/dev/null | sort -V); do
  [ -f "$d/mini_installer.exe" ] && ! ls "$d"/*.crx3 >/dev/null 2>&1 && DIR="${d%/}"
done
[ -n "$DIR" ] || { echo "No installer waiting to be signed in $PACKAGES. Stopping."; exit 1; }
VERSION="$(basename "$DIR")"
echo "Installer: $VERSION ($(shasum -a 256 "$DIR/mini_installer.exe" | cut -c1-16)…)"
echo "1. Open 1Password's Dev vault (Touch ID)."
"$OP" vault get Dev --account "$OPACCT" >/dev/null 2>&1 || { echo "1Password's Dev vault didn't open. Stopping."; exit 1; }
echo "2. Signing with the publisher key."
"$OP" document get "Blanc Windows Beta CRX Publisher Key" --vault Dev --account "$OPACCT" --output "$WORK/crx.pem" >/dev/null
node "$REPO/chromium/release/windows-package.mjs" --installer="$DIR/mini_installer.exe" --key="$WORK/crx.pem" \
  --public="$PUBLIC" --version="$VERSION" --out="$DIR" > "$WORK/result.json"
rm -f "$WORK/crx.pem"
echo
echo "Done. $(node -e 'const r=require(process.argv[1]); console.log(`${r.file}: ${r.size} bytes, sha256 ${r.sha256}`)' "$WORK/result.json")"

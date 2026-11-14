#!/bin/bash
# Blanc Beta 2.0.0-beta.2: release stages "preflight" and "sign" (docs/chromium-beta-release.md §10.3).
# Run by the owner in Terminal. Signs a new copy of the unsigned beta with the
# pinned Developer ID certificate; nothing leaves this Mac and nothing is
# notarized or published here. macOS may ask whether codesign may use the
# "Developer ID Application" key: choose Always Allow (or Allow each time).
set -uo pipefail
cd "$HOME/Projects/Blanc/repo" || exit 1
WORK="$HOME/Projects/Blanc/records/beta2-work"
STATUS="$HOME/Projects/Blanc/records/beta2-sign-status.txt"
NODE=/usr/local/bin/node
note() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" >> "$STATUS"; }
: > "$STATUS"

echo "Blanc Beta 2.0.0-beta.2: preflight and signing"
echo
for stage in preflight sign; do
  echo "== $stage"
  note "$stage started"
  if "$NODE" chromium/release/release.mjs "$stage" "$WORK"; then
    note "$stage passed"
  else
    note "$stage FAILED (exit $?)"
    echo
    echo "STOPPED at: $stage. Nothing was notarized or published. Tell Claude."
    exit 1
  fi
done
"$NODE" chromium/release/release.mjs status "$WORK"
note "done"
echo
echo "Done: the beta is signed. You can close this window and tell Claude."

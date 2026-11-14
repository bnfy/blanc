#!/bin/bash
# Blanc Beta 2.0.0-beta.3: release stages "manifest" and "draft" (docs/chromium-beta-release.md §7, §10.8).
# manifest builds RELEASE-MANIFEST.json and SHA256SUMS on this Mac. draft checks the tag and
# release are absent on GitHub, asks you to type a confirmation, then pushes the tag and
# creates a PRIVATE draft pre-release, and re-downloads it to compare every byte.
set -uo pipefail
cd "$HOME/Projects/Blanc/repo" || exit 1
# Over SSH the search path is only the system folders; gh is in Homebrew.
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
WORK="$HOME/Projects/Blanc/records/beta3-work"
STATUS="$HOME/Projects/Blanc/records/beta3-draft-status.txt"
note() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" >> "$STATUS"; }
: > "$STATUS"
echo "Blanc Beta 2.0.0-beta.3: manifest, then tag and draft"
echo
DONE=" $(/usr/local/bin/node chromium/release/release.mjs status "$WORK" | /usr/bin/python3 -c "import json,sys; print(' '.join(json.load(sys.stdin)['done']))") "
for stage in manifest draft; do
  # A stage that already passed doesn't run again.
  case "$DONE" in *" $stage "*) echo "== $stage (already done)"; continue;; esac
  echo "== $stage"
  note "$stage started"
  if /usr/local/bin/node chromium/release/release.mjs "$stage" "$WORK"; then
    note "$stage passed"
  else
    note "$stage FAILED (exit $?)"
    echo; echo "STOPPED at: $stage. Tell Claude."; exit 1
  fi
done
note "done"
echo
echo "Done: the tag is pushed and the draft pre-release is on GitHub (private). Tell Claude."

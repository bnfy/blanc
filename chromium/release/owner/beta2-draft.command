#!/bin/bash
# Blanc Beta 2.0.0-beta.2: release stages "manifest" and "draft" (docs/chromium-beta-release.md §7, §10.8).
# manifest builds RELEASE-MANIFEST.json and SHA256SUMS on this Mac. draft checks the tag and
# release are absent on GitHub, asks you to type a confirmation, then pushes the tag and
# creates a PRIVATE draft pre-release, and re-downloads it to compare every byte.
set -uo pipefail
cd "$HOME/Projects/Blanc/repo" || exit 1
WORK="$HOME/Projects/Blanc/records/beta2-work"
STATUS="$HOME/Projects/Blanc/records/beta2-draft-status.txt"
note() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" >> "$STATUS"; }
: > "$STATUS"
echo "Blanc Beta 2.0.0-beta.2: manifest, then tag and draft"
echo
for stage in manifest draft; do
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

#!/bin/bash
# Blanc Beta for Windows: run the release's next stage (W3 Task E1). Reads the
# release's work folder from ~/Projects/Blanc/records/windows-release/CURRENT,
# asks chromium/release/windows-release.mjs which stage comes next, and runs
# that one stage here, in this Terminal. Open it again for the next stage.
# (BLANC_NODE and BLANC_WINDOWS_RELEASE_WORK are for tests.)
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"
NODE="${BLANC_NODE:-node}"
trap 'code=$?; if [ $code -ne 0 ]; then echo; echo "STOPPED. Nothing after this stage ran. Tell Claude."; fi' EXIT
WORK="${BLANC_WINDOWS_RELEASE_WORK:-$(cat "$HOME/Projects/Blanc/records/windows-release/CURRENT")}"
case "$WORK" in /*) ;; *) echo "The release work folder must be an absolute path."; exit 1 ;; esac
cd "$REPO"
STATUS=$("$NODE" chromium/release/windows-release.mjs status "$WORK")
NEXT=$(printf '%s' "$STATUS" | sed -n 's/.*"next":"\([a-z-]*\)".*/\1/p')
if [ -z "$NEXT" ]; then echo "Every stage of this Windows release is done."; exit 0; fi
echo "Blanc Beta for Windows release: running the \"$NEXT\" stage"
echo
"$NODE" chromium/release/windows-release.mjs "$NEXT" "$WORK"
echo
echo "The \"$NEXT\" stage finished. Tell Claude."

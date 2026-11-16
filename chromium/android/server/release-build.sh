#!/usr/bin/env bash
# A7: build only from a clean release tag; never signs or uploads.
set -euo pipefail
if [[ "$(uname -s)" != Linux || "$(uname -m)" != x86_64 ]]; then
  echo 'Android release builds run only on x86-64 Linux.' >&2
  exit 1
fi
TREE="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
exec node "${TREE}/chromium/android/release/record.mjs" "$@"

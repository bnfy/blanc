#!/bin/bash
# Open once per stage. CURRENT contains the absolute path to the private
# release work directory with linux-release.json and release-notes.md.
set -euo pipefail
umask 077
here=$(cd "$(dirname "$0")/../.." && pwd -P)
node_bin=${BLANC_NODE:-node}
work=${BLANC_LINUX_RELEASE_WORK:-$(cat "$HOME/Projects/Blanc/records/linux-release/CURRENT")}
case "$work" in /*) ;; *) echo 'Expected an absolute release work directory.' >&2; exit 1;; esac
status=$("$node_bin" "$here/release/linux-release.mjs" status "$work")
next=$(printf '%s' "$status" | "$node_bin" -pe 'JSON.parse(require("node:fs").readFileSync(0,"utf8")).next ?? ""')
if [[ -z "$next" ]]; then echo 'Every Linux release stage is complete.'; exit 0; fi
echo "Running the Linux beta $next stage."
exec "$node_bin" "$here/release/linux-release.mjs" "$next" "$work"

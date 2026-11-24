#!/bin/bash
# repository-upload.command staging|production SIGNED_TREE GENERATION [PROVEN_DIGEST PREDECESSOR_JSON]
# R2 uses the owner's Wrangler login. Upload only needs the public OpenPGP key.
set +x
set -euo pipefail
umask 077
[[ ( $# == 3 && $1 == staging ) || ( $# == 5 && $1 == production ) ]] || { echo "Usage: $0 staging|production SIGNED_TREE GENERATION [PROVEN_DIGEST PREDECESSOR_JSON]" >&2; exit 2; }
source "$(dirname "$0")/repository-common.sh"
open_repository_work
cp "$2/signed-tree.json" "$2/signed-tree.json.asc" "$work/"
verify "$work/signed-tree.json.asc" "$work/signed-tree.json"
node "$repo/worker/upload.mjs" "$1" "$2" "$3" "$work/signed-tree.json" "${4:-}" "${5:-}"


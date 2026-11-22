#!/bin/bash
# Verify the runner's complete index graph before importing the signing key.
set +x
set -euo pipefail
umask 077
[[ $# == 3 ]] || { echo "Usage: $0 APPROVAL_DIR UNSIGNED_TREE NEW_SIGNED_TREE" >&2; exit 2; }
source "$(dirname "$0")/repository-common.sh"
open_repository_work
mkdir "$work/approved" "$work/rpmdb"
cp "$1/approved-packages.json" "$1/approved-packages.json.asc" "$work/approved/"
verify "$work/approved/approved-packages.json.asc" "$work/approved/approved-packages.json"
python3 -c 'import shutil,sys; shutil.copytree(sys.argv[1],sys.argv[2],symlinks=True)' "$2" "$work/tree"
tree="$work/tree"
python3 "$repo/metadata.py" check "$work/approved" "$tree" "$public" "$work/rpmdb" "$1"
rm "$tree/tree.json"
open_signing_key
release="$tree/deb/dists/stable/Release"
sign "$release" "${release%/*}/InRelease" --clearsign
verify "${release%/*}/InRelease"
sign "$release" "$release.gpg" --detach-sign
verify "$release.gpg" "$release"
for xml in "$tree"/rpm/stable/*/repodata/repomd.xml; do
  sign "$xml" "$xml.asc" --detach-sign
  verify "$xml.asc" "$xml"
done
python3 "$repo/metadata.py" seal "$tree"
sign "$tree/signed-tree.json" "$tree/signed-tree.json.asc" --detach-sign
verify "$tree/signed-tree.json.asc" "$tree/signed-tree.json"
finish_directory "$tree" "$3"


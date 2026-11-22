#!/bin/bash
# Run on the owner's Mac with the architecture and tarball digest printed by ship-candidate.sh.
set +x
set -euo pipefail
[[ $# == 2 && ( $1 == x64 || $1 == arm64 ) && $2 =~ ^[0-9a-f]{64}$ ]] || {
  echo "Usage: $0 x64|arm64 TAR_SHA256" >&2; exit 2;
}
[[ $(uname -s) == Darwin ]] || { echo "Run this command on the owner's Mac." >&2; exit 1; }
source "$(dirname "$0")/repository-common.sh"
arch=$1
tar_sha=$2
tag=fork-linux-candidate
github_repo=bnfy/blanc
asset="blanc-linux-$arch-candidate.tar.gz"
require_selected_archive() {
  local draft digest
  draft=$(gh release view "$tag" --repo "$github_repo" --json isDraft,assets)
  [[ $(jq -r .isDraft <<< "$draft") == true ]] || {
    echo "$tag must be an unpublished draft." >&2; exit 1;
  }
  digest=$(jq -r --arg name "$asset" '.assets[] | select(.name == $name) | (.digest // "unknown")' <<< "$draft")
  [[ -n $digest ]] || { echo "Missing $arch candidate archive $asset on $tag." >&2; exit 1; }
  [[ $digest == "sha256:$tar_sha" ]] || {
    echo "Archive $asset SHA-256 differs from the selected $tar_sha (draft has $digest)." >&2; exit 1;
  }
}

require_selected_archive
[[ -f $public ]] || {
  echo "Missing $public. Signing requires the owner's committed key and a candidate containing the DEB and RPM." >&2; exit 1;
}
open_repository_work
gh release download "$tag" --repo "$github_repo" --pattern "$asset" --dir "$work"
python3 "$repo/metadata.py" unpack-candidate "$arch" "$tar_sha" "$work/$asset" "$work/packages"
open_rpm_database
open_signing_key
rpms=("$work/packages/"*.rpm)
# unpack-candidate verified exactly one RPM for this architecture.
sign_rpm "${rpms[0]}"
python3 "$repo/metadata.py" approve-candidate "$work/packages"
record="$work/packages/signed-candidate-$arch.json"
sign_record "$record"
upload_approval() {
  require_selected_archive
  gh release upload "$tag" --repo "$github_repo" --clobber "${rpms[0]}" "$record" "$record.asc"
}
with_candidate_lock "$tag" "$github_repo" "$arch" upload_approval
echo "Uploaded the signed $arch RPM and detached candidate record for $tar_sha."

#!/bin/bash
# Approve both versions and architectures from the build-checked beta candidates.
set +x
set -euo pipefail
umask 077
[[ $# == 2 ]] || { echo "Usage: $0 VERIFIED_PACKAGES NEW_APPROVED_DIR" >&2; exit 2; }
source "$(dirname "$0")/repository-common.sh"
open_repository_work
python3 "$repo/metadata.py" copy-packages "$1" "$work/packages"
open_signing_key
mkdir -m 700 "$work/rpmdb"
rpmkeys --dbpath "$work/rpmdb" --import "$public"
for rpm in "$work/packages/"*.rpm; do
  rpmsign --define '_openpgp_sign gpg' --define "_gpg_name $fingerprint" \
    --define "__gpg $here/repository-rpm-gpg.sh" --define '_gpg_digest_algo sha256' --addsign "$rpm"
  python3 "$repo/metadata.py" verify-rpm "$rpm" "$work/rpmdb"
done
python3 "$repo/metadata.py" approve "$work/packages"
manifest="$work/packages/approved-packages.json"
sign "$manifest" "$manifest.asc" --detach-sign
verify "$manifest.asc" "$manifest"
finish_directory "$work/packages" "$2"


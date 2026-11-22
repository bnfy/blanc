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
open_rpm_database
for rpm in "$work/packages/"*.rpm; do
  sign_rpm "$rpm"
done
python3 "$repo/metadata.py" approve "$work/packages"
sign_record "$work/packages/approved-packages.json"
finish_directory "$work/packages" "$2"


#!/bin/bash
# build-metadata.sh APPROVED_PACKAGE_DIR NEW_UNSIGNED_TREE
set -euo pipefail
umask 077
here=$(cd "$(dirname "$0")" && pwd -P)
public="$here/../keys/blanc-repository.asc"
[[ $# == 2 ]]
work=$(mktemp -d "${TMPDIR:-/tmp}/blanc-metadata.XXXXXX")
trap 'rm -rf -- "$work"' EXIT
export GNUPGHOME="$work"
gpg --batch --dearmor --output "$work/public.gpg" "$public"
gpgv --keyring "$work/public.gpg" "$1/approved-packages.json.asc" "$1/approved-packages.json"
python3 "$here/metadata.py" build "$1" "$work/tree" "$public"
python3 "$here/metadata.py" finish "$work/tree" "$2"


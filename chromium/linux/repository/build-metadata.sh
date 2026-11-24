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
cp "$1/approved-packages.json" "$1/approved-packages.json.asc" "$work/"
gpgv --keyring "$work/public.gpg" "$work/approved-packages.json.asc" "$work/approved-packages.json"
python3 "$here/metadata.py" build "$1" "$work/tree" "$public" "$work"
python3 "$here/metadata.py" finish "$work/tree" "$2"


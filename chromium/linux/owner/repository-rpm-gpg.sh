#!/bin/bash
# rpmsign supplies GnuPG's package data and signature arguments. Keep stdin available to it.
set +x
set -euo pipefail
source "$(dirname "$0")/repository-common.sh"
exec gpg --batch --pinentry-mode loopback --passphrase-fd 3 "$@" 3< <(password)


# shellcheck shell=bash
# Shared by the owner commands. Only signing opens the Dev vault.
set +x
set -euo pipefail
umask 077
ulimit -c 0
here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)
repo="$here/../repository"
public="$here/../keys/blanc-repository.asc"
export OP_BIOMETRIC_UNLOCK_ENABLED=true
export BLANC_OP="${BLANC_OP:-op}"
account=my.1password.com

# GitHub enforces unique asset names on a release. Acquire without --clobber
# so shipping and signing on different Macs use the same per-architecture lock.
with_candidate_lock() (
  local lock_tag=$1 lock_repo=$2 lock_arch=$3 lock="blanc-linux-$3-candidate.lock"
  shift 3
  printf 'Writing the %s candidate\n' "$lock_arch" > "$work/$lock"
  if ! gh release upload "$lock_tag" --repo "$lock_repo" "$work/$lock"; then
    echo "Could not acquire the $lock_arch draft lock ($lock). Check for an active ship or sign command before retrying." >&2
    exit 1
  fi
  trap 'gh release delete-asset "$lock_tag" "$lock" --repo "$lock_repo" --yes || { echo "Could not release $lock on $lock_tag." >&2; exit 1; }' EXIT
  trap 'exit 129' HUP
  trap 'exit 130' INT
  trap 'exit 143' TERM
  "$@"
)

cleanup() {
  local code=$?
  set +e
  gpgconf --homedir "$GNUPGHOME" --kill all >/dev/null 2>&1 || true
  # Best-effort overwrite before unlink. Use encrypted local storage on APFS/SSDs.
  python3 - "$GNUPGHOME/private-keys-v1.d" <<'PY' || code=1
from pathlib import Path
import os, sys
for path in Path(sys.argv[1]).glob('*.key'):
    with path.open('r+b') as f:
        f.write(bytes(path.stat().st_size))
        f.flush()
        os.fsync(f.fileno())
PY
  rm -rf -- "$work" || code=1
  exit "$code"
}
open_repository_work() {
  # The configured UUID is a machine identifier, not a credential. Checking it
  # also rejects another Mac with a copy of the owner's Git configuration.
  local configured actual
  configured=$(git config --global --get blanc.linuxRepositoryOwnerUUID || true)
  if [[ $(uname -s) != Darwin || ! "$configured" =~ ^[[:xdigit:]]{8}(-[[:xdigit:]]{4}){3}-[[:xdigit:]]{12}$ ]]; then
    echo "Run on the owner's Mac registered in blanc.linuxRepositoryOwnerUUID (see repository.md)." >&2
    return 1
  fi
  actual=$(ioreg -rd1 -c IOPlatformExpertDevice | awk -F '"' '/"IOPlatformUUID" =/ {print $(NF-1)}')
  if [[ -z "$actual" || "$actual" != "$configured" ]]; then
    echo "This is not the registered owner's Mac." >&2
    return 1
  fi
  work=$(mktemp -d "${BLANC_WORK_TMP:-${TMPDIR:-/tmp}}/blanc-sign.XXXXXX")
  export GNUPGHOME="$work/gnupg"
  trap cleanup EXIT
  trap 'exit 129' HUP
  trap 'exit 130' INT
  trap 'exit 143' TERM
  mkdir -m 700 "$GNUPGHOME"
  gpg --batch --dearmor --output "$work/public.gpg" "$public"
}

verify() {
  gpgv --keyring "$work/public.gpg" "$@"
}

password() {
  "$BLANC_OP" item get 'Blanc Linux Repository Signing (passphrase and revocation)' \
    --vault Dev --account "$account" --fields label=password --format json --reveal </dev/null |
    python3 -c 'import json, sys; sys.stdout.buffer.write(json.load(sys.stdin)["value"].encode("utf-8") + b"\n")'
}

open_signing_key() {
  "$BLANC_OP" vault get Dev --account "$account" >/dev/null
  fingerprint=$(gpg --batch --with-colons --show-keys "$public" | awk -F: '$1=="fpr" {print $10}')
  [[ "$fingerprint" =~ ^[0-9A-F]{40}$ ]]
  # The import and GnuPG signing use distinct file descriptors for the key and password.
  "$BLANC_OP" document get 'Blanc Linux Repository Signing' --account "$account" --vault Dev |
    gpg --batch --pinentry-mode loopback --passphrase-fd 3 --import 3< <(password)
}

sign() {
  password | gpg --batch --pinentry-mode loopback --passphrase-fd 0 --digest-algo SHA256 --armor \
    --local-user "$fingerprint!" --output "$2" "$3" "$1"
}

open_rpm_database() {
  mkdir -m 700 "$work/rpmdb"
  rpmkeys --dbpath "$work/rpmdb" --import "$public"
}

sign_rpm() {
  rpmsign --define '_openpgp_sign gpg' --define "_gpg_name $fingerprint" \
    --define "__gpg $here/repository-rpm-gpg.sh" --define '_gpg_digest_algo sha256' --addsign "$1"
  python3 "$repo/metadata.py" verify-rpm "$1" "$work/rpmdb"
}

sign_record() {
  sign "$1" "$1.asc" --detach-sign
  verify "$1.asc" "$1"
}

finish_directory() {
  python3 "$repo/metadata.py" finish "$1" "$2"
}


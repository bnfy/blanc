#!/usr/bin/env bash
# The Windows nightly's first step on the build server (docs/superpowers/plans/
# 2026-11-21-windows-nightly.md, Task 4). The Mac Studio sends this script over
# SSH (bash -s -- COMMIT BUILD STAMP), because the night's own copy of the server
# script exists only after the checkout this makes. It takes the desktop
# checkout lock with an owner token, checks out the night's commit, and runs
# nightly-build.mjs under that lock; the lock is removed only while it still
# holds this token. Prints one JSON line.
set -uo pipefail
export PATH="${HOME}/chromium-desktop/src/third_party/node/linux/node-linux-x64/bin:${HOME}/depot_tools-desktop:${PATH}"
commit="${1:-}"; build="${2:-}"; stamp="${3:-}"
TREE="${HOME}/blanc-desktop"
LOCK="${HOME}/chromium-desktop/.blanc-checkout.lock"
say() { printf '{"status":"%s","reason":"%s"}\n' "$1" "$2"; }

[[ "${commit}" =~ ^[0-9a-f]{40}$ && "${build}" =~ ^[1-9][0-9]{0,3}$ && "${stamp}" =~ ^[0-9]{8}-[0-9]{4}$ ]] || { say stopped "bad arguments"; exit 0; }
if pgrep -f '[s]iso ninja' >/dev/null; then say busy "a build is running on the server"; exit 0; fi
token="$(head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n')"
if ! mkdir "${LOCK}" 2>/dev/null; then say busy "the desktop checkout is locked on the build server"; exit 0; fi
printf '%s\n' "${token}" > "${LOCK}/owner"
release() { if [ "$(cat "${LOCK}/owner" 2>/dev/null)" = "${token}" ]; then rm -f "${LOCK}/owner"; rmdir "${LOCK}"; fi; }
trap release EXIT

git -C "${TREE}" fetch -q origin chromium/next || { say stopped "could not fetch chromium/next"; exit 0; }
git -C "${TREE}" checkout -q --detach "${commit}" || { say stopped "could not check out the night's commit"; exit 0; }
test -z "$(git -C "${TREE}" status --porcelain)" || { say stopped "the server's fork checkout has local changes"; exit 0; }

BLANC_CHECKOUT_LOCK_OWNER="${token}" node "${TREE}/chromium/windows/server/nightly-build.mjs" "${commit}" "${build}" "${stamp}"

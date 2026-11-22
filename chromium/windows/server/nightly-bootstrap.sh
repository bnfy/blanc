#!/usr/bin/env bash
# The Windows nightly's first step on the build server (docs/superpowers/plans/
# 2026-11-21-windows-nightly.md, Task 4). The Mac Studio sends this script over
# SSH (bash -s -- COMMIT BUILD STAMP), because the night's own copy of the server
# script exists only after the checkout this makes. It takes the desktop
# checkout lock with an owner token, checks out the night's commit, and runs
# nightly-build.mjs under that lock. The lock is removed only while it still
# holds this token, and only after the build process (and its workers) ended:
# a TERM, INT or HUP is passed on to it and waited for. Prints one JSON line.
set -uo pipefail
export PATH="${HOME}/chromium-desktop/src/third_party/node/linux/node-linux-x64/bin:${HOME}/depot_tools-desktop:${PATH}"
commit="${1:-}"; build="${2:-}"; stamp="${3:-}"
TREE="${HOME}/blanc-desktop"
LOCK="${HOME}/chromium-desktop/.blanc-checkout.lock"
say() { printf '{"status":"%s","reason":"%s"}\n' "$1" "$2"; }

[[ "${commit}" =~ ^[0-9a-f]{40}$ && "${build}" =~ ^[1-9][0-9]{0,3}$ && "${stamp}" =~ ^[0-9]{8}-[0-9]{4}$ ]] || { say stopped "bad arguments"; exit 0; }
pgrep -f '[s]iso ninja' >/dev/null; rc=$?
if [ "${rc}" -eq 0 ]; then say busy "a build is running on the server"; exit 0; fi
if [ "${rc}" -ne 1 ]; then say stopped "could not check for a running build"; exit 0; fi
if [ -e "${LOCK}" ]; then say busy "the desktop checkout is locked on the build server"; exit 0; fi
token="$(head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n')"
[[ "${token}" =~ ^[0-9a-f]{32}$ ]] || { say stopped "could not make a lock token"; exit 0; }
if ! mkdir "${LOCK}" 2>/dev/null; then
  if [ -e "${LOCK}" ]; then say busy "the desktop checkout is locked on the build server"; else say stopped "could not create the checkout lock"; fi
  exit 0
fi
child=""
release() { if [ "$(cat "${LOCK}/owner" 2>/dev/null)" = "${token}" ]; then rm -f "${LOCK}/owner"; rmdir "${LOCK}"; fi; }
forward() { if [ -n "${child}" ]; then kill -"$1" "${child}" 2>/dev/null; wait "${child}" 2>/dev/null; fi; release; trap - EXIT; exit 1; }
trap release EXIT
trap 'forward TERM' TERM
trap 'forward INT' INT
trap 'forward HUP' HUP
printf '%s\n' "${token}" > "${LOCK}/owner" || { rmdir "${LOCK}" 2>/dev/null; trap - EXIT; say stopped "could not write the lock token"; exit 0; }

git -C "${TREE}" fetch -q origin chromium/next || { say stopped "could not fetch chromium/next"; exit 0; }
git -C "${TREE}" checkout -q --detach "${commit}" || { say stopped "could not check out the night's commit"; exit 0; }
status_out="$(git -C "${TREE}" status --porcelain)" || { say stopped "git status failed in the server's fork checkout"; exit 0; }
test -z "${status_out}" || { say stopped "the server's fork checkout has local changes"; exit 0; }

BLANC_CHECKOUT_LOCK_OWNER="${token}" PYTHONDONTWRITEBYTECODE=1 node "${TREE}/chromium/windows/server/nightly-build.mjs" "${commit}" "${build}" "${stamp}" &
child=$!
wait "${child}"

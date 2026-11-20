#!/usr/bin/env bash
# Makes the Windows toolchain readable for a build, idempotently:
#
#   bash chromium/windows/server/mount-toolchain.sh
#
# The Windows SDK only works on a case-insensitive file system, so Chromium
# serves the unpacked package through ciopfs, a small FUSE process
# (build/vs_toolchain.py). That mount does not survive a reboot, and the
# process inherits its starter's open-file limit: with the usual 1024 a
# parallel build fails with "Too many open files" on SDK headers. This mounts
# it when it is missing and raises the limit of the one that is running.
set -euo pipefail
SRC="${HOME}/chromium-desktop/src"
MOUNT="${SRC}/third_party/depot_tools/win_toolchain/vs_files"
LIMIT=1048576
die() { echo "mount-toolchain: $*" >&2; exit 1; }

[[ "$(uname -s)" == Linux ]] || die "this runs on the Linux build server."
[[ -d "${MOUNT}.ciopfs" ]] || die "no unpacked toolchain at ${MOUNT}.ciopfs; run bootstrap.sh first."
hard="$(ulimit -Hn)"; [[ "${hard}" == unlimited || "${hard}" -ge "${LIMIT}" ]] || LIMIT="${hard}"
if ! mountpoint -q "${MOUNT}"; then
  mkdir -p "${MOUNT}"
  # use_ino: as build/vs_toolchain.py mounts it (clang's #pragma once needs it).
  (ulimit -n "${LIMIT}" && "${SRC}/build/ciopfs" -o use_ino "${MOUNT}.ciopfs" "${MOUNT}")
  echo "Mounted ${MOUNT}."
fi
# The process serving this mount, whoever started it.
pids=()
for pid in $(pgrep -x ciopfs || true); do
  if tr '\0' ' ' < "/proc/${pid}/cmdline" | grep -qF -- "${MOUNT}.ciopfs"; then pids+=("${pid}"); fi
done
(( ${#pids[@]} == 1 )) || die "expected one ciopfs process for ${MOUNT}, found ${#pids[@]}."
prlimit --pid "${pids[0]}" --nofile="${LIMIT}:${LIMIT}"
echo "ciopfs ${pids[0]} may hold ${LIMIT} open files."

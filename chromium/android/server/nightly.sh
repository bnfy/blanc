#!/usr/bin/env bash
# The Android nightly (systemd user timer, 01:00 US Eastern): move the dedicated ~/blanc-nightly
# clone to main's tip, then run that commit's nightly.mjs. Never touches ~/blanc or ~/blanc-release.
set -euo pipefail
if [[ "$(uname -s)" != Linux || "$(uname -m)" != x86_64 ]]; then
  echo 'The Android nightly runs only on the x86-64 Linux build server.' >&2
  exit 1
fi
CLONE="${HOME}/blanc-nightly"
NODE="${HOME}/chromium-android/src/third_party/node/linux/node-linux-x64/bin/node"
if [[ ! -d "${CLONE}/.git" ]]; then
  git clone --filter=blob:none "$(git -C "${HOME}/blanc" remote get-url origin)" "${CLONE}"
fi
if [[ -n "$(git -C "${CLONE}" status --porcelain)" ]]; then
  echo 'The nightly clone has local changes; it is left as it is.' >&2
  exit 1
fi
git -C "${CLONE}" fetch --filter=blob:none origin main
git -C "${CLONE}" checkout --detach --quiet FETCH_HEAD
exec "${NODE}" "${CLONE}/chromium/android/release/nightly.mjs"

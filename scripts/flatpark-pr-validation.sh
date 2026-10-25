#!/usr/bin/env bash
set -euo pipefail
BASE="$PWD"
ROOT="$BASE/flatpak-evidence"
mkdir -p "$ROOT"
exec > >(tee "$ROOT/setup.log") 2>&1
[[ ${FLATPARK_PR_SHA:-} =~ ^[0-9a-f]{40}$ ]] || exit 64
repo="$HOME/flatpark-pr-validation"
git init "$repo"
git -C "$repo" remote add origin https://github.com/bnfy/flatpark.git
git -C "$repo" fetch origin "$FLATPARK_PR_SHA"
git -C "$repo" checkout --detach FETCH_HEAD
flatpak remote-add --user --if-not-exists flathub https://flathub.org/repo/flathub.flatpakrepo
flatpak install --user -y --noninteractive flathub org.freedesktop.Platform//26.08 org.freedesktop.Sdk//26.08 org.electronjs.Electron2.BaseApp//26.08
(
  cd "$repo"
  node scripts/read-descriptor.mjs registry/com.blancbrowser.Blanc/flatpark.yml
  node scripts/audit-descriptor.mjs registry/com.blancbrowser.Blanc/flatpark.yml
  npm --prefix site ci --no-audit --no-fund
  bash tests/run-tests.sh > "$ROOT/flatpark-tests.log" 2>&1
  ./scripts/check-apply-extra.sh com.blancbrowser.Blanc > "$ROOT/system-install-unpack.log" 2>&1
  export OUT_DIR="$repo/out/verification" GNUPGHOME_DIR="$repo/out/verification/gnupg"
  export KEY_NAME='Disposable Flatpak validation' KEY_EMAIL='flatpak-validation@example.invalid'
  export STATS_URL='' FLATPARK_VERIFY_KEEP=1
  ./scripts/publish.sh --verify com.blancbrowser.Blanc > "$ROOT/publish-verify.log" 2>&1
)
flatpak info --user --show-metadata com.blancbrowser.Blanc > "$ROOT/metadata.txt"
flatpak info --user --show-permissions com.blancbrowser.Blanc > "$ROOT/permissions.txt"
flatpak list --user > "$ROOT/runtimes.txt"
deployed=$(flatpak info --user --show-location com.blancbrowser.Blanc)
printf '%s\n' "$FLATPARK_PR_SHA" > "$ROOT/flatpark-commit.txt"
cp "$repo/registry/com.blancbrowser.Blanc/blanc-wrapper" "$ROOT/production-wrapper.sh"
cp "$repo/registry/com.blancbrowser.Blanc/apply_extra.sh" "$ROOT/production-extractor.sh"
printf '%s\n' "$deployed" > "$ROOT/deployed-path.txt"
export DISPLAY=:99
Xvfb :99 -screen 0 1280x900x24 -nolisten tcp > "$ROOT/xvfb.log" 2>&1 &
sleep 2
export BLANC_USE_PRODUCTION_WRAPPER=1 BLANC_FLATPAK_MODES=wrapper-integration,wrapper-restart
node scripts/flatpak-investigation.mjs

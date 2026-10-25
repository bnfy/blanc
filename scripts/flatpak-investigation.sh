#!/usr/bin/env bash
set -euo pipefail
ROOT="$PWD/flatpak-evidence"
mkdir -p "$ROOT" "$HOME/Downloads"
exec > >(tee "$ROOT/setup.log") 2>&1
uname -a
flatpak --version
sysctl kernel.unprivileged_userns_clone user.max_user_namespaces || true
# No sysctl changes, AppArmor changes, or sandbox-disabling switches.
flatpak remote-add --user --if-not-exists flathub https://flathub.org/repo/flathub.flatpakrepo
flatpak install --user -y --noninteractive flathub org.freedesktop.Platform//26.08 org.electronjs.Electron2.BaseApp//26.08
flatpak list --user > "$ROOT/runtime-commits.txt"
flatpak info --user --show-commit org.freedesktop.Platform//26.08 >> "$ROOT/runtime-commits.txt"
flatpak info --user --show-commit org.electronjs.Electron2.BaseApp//26.08 >> "$ROOT/runtime-commits.txt"
gh release download v1.43.1 --repo bnfy/blanc --pattern 'Blanc-1.43.1.AppImage' --pattern SHA256SUMS --pattern SHA256SUMS.sigstore.json --dir "$ROOT"
(cd "$ROOT" && sha256sum --check --ignore-missing SHA256SUMS)
chmod +x "$ROOT/Blanc-1.43.1.AppImage"
(cd "$ROOT" && ./Blanc-1.43.1.AppImage --appimage-extract >/dev/null)
gh api 'repos/bnfy/blanc/contents/scripts/ecs-linux-launcher.cc?ref=v1.43.1' --jq .content | base64 -d > "$ROOT/launcher.original.cc"
gh api 'repos/flatpark/flatpark/contents/registry/com.blancbrowser.Blanc/com.blancbrowser.Blanc.yml?ref=2a792fa6d84cf1574b93bee3eea1036339a74659' --jq .content | base64 -d > "$ROOT/original-manifest.yml"
python3 - "$ROOT" <<'PY'
import pathlib,sys,difflib
r=pathlib.Path(sys.argv[1]); old=(r/'launcher.original.cc').read_text()
needle='    execv(core.c_str(), raw.data());'; assert old.count(needle)==1
new=old.replace(needle,'''    // Candidate: initialize zypak after preparing the native profile/CDM policy.
    if (fs::exists("/.flatpak-info")) {
      const std::string wrapper = "/app/bin/zypak-wrapper";
      if (!fs::is_regular_file(wrapper)) throw std::runtime_error("Flatpak requires zypak-wrapper");
      set("ZYPAK_LD_PRELOAD", shim.string());
      unsetenv("LD_PRELOAD");
      args.insert(args.begin(), wrapper);
      raw.clear();
      for (auto& arg : args) raw.push_back(arg.data());
      raw.push_back(nullptr);
      execv(wrapper.c_str(), raw.data());
      throw std::runtime_error(std::string("Flatpak zypak exec failed: ") + strerror(errno));
    }
''' + needle)
(r/'launcher.candidate.cc').write_text(new)
(r/'launcher.patch').write_text(''.join(difflib.unified_diff(old.splitlines(True),new.splitlines(True),fromfile='a/scripts/ecs-linux-launcher.cc',tofile='b/scripts/ecs-linux-launcher.cc')))
PY
g++ -std=c++20 -O2 -DBLANC_ECS_PRODUCTION -static "$ROOT/launcher.candidate.cc" -o "$ROOT/blanc-ecs-launcher-candidate"
flatpak build-init --arch=x86_64 --base=org.electronjs.Electron2.BaseApp --base-version=26.08 "$ROOT/build" com.blancbrowser.Blanc org.freedesktop.Platform org.freedesktop.Platform 26.08
mkdir -p "$ROOT/build/files/lib/blanc" "$ROOT/build/files/bin" "$ROOT/build/files/share/applications"
cp -a "$ROOT/squashfs-root/." "$ROOT/build/files/lib/blanc/"
cp "$ROOT/blanc-ecs-launcher-candidate" "$ROOT/build/files/lib/blanc/"
printf '[Desktop Entry]\nType=Application\nName=Blanc Flatpak Test\nExec=blanc\n' > "$ROOT/build/files/share/applications/com.blancbrowser.Blanc.desktop"
cat > "$ROOT/build/files/bin/blanc" <<'EOF'
#!/bin/sh
set -eu
unset ELECTRON_RUN_AS_NODE
export LD_LIBRARY_PATH="/app/lib/blanc/usr/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
export BLANC_UPDATE_CHANNEL=flatpak BLANC_TEST=1
export BLANC_TEST_UNCAUGHT_LOG="$XDG_CONFIG_HOME/uncaught.log"
mode=${BLANC_FLATPAK_CASE:?}
profile="$XDG_CONFIG_HOME/Blanc-$mode"
mkdir -p "$profile"
chmod 700 "$profile"
export BLANC_ECS_FULL_PROFILE="$profile" BLANC_ECS_LAUNCHER_ROOT=/app/lib/blanc
set -- --remote-debugging-port=9222 --ozone-platform=x11 "$@"
case "$mode" in
 baseline|unset) exec zypak-wrapper /app/lib/blanc/blanc "$@" ;;
 profile|profile-unset) exec zypak-wrapper /app/lib/blanc/blanc --user-data-dir="$profile" "$@" ;;
 original-launcher) exec zypak-wrapper /app/lib/blanc/blanc-ecs-launcher --user-data-dir="$profile" "$@" ;;
 integrated-launcher) exec /app/lib/blanc/blanc-ecs-launcher-candidate --user-data-dir="$profile" "$@" ;;
 wrapper-integration|wrapper-restart)
   # Keep the published native launcher as the sole CDM selector. Its query
   # uses the production default profile and verifies that profile's safety.
   profile="$XDG_CONFIG_HOME/Blanc"
   if [ ! -d "$profile" ]; then (umask 077; mkdir -p "$profile"); fi
   cdm=$(/app/lib/blanc/blanc-ecs-launcher --ecs-query-cdm)
   export BLANC_ECS_FULL_PROFILE="$profile"
   # The AppImage CDM helper relies on launcher environment which zypak does
   # not forward to its portal-spawned child. Do not claim a CDM was preloaded.
   # Ordinary browsing retains zypak; protected playback remains unavailable.
   if [ -n "$cdm" ]; then printf '%s\n' 'Flatpak: cached CDM retained; protected playback unavailable with this wrapper' >&2; fi
   unset LD_PRELOAD ZYPAK_LD_PRELOAD BLANC_ECS_CDM_PRELOAD_PATH BLANC_ECS_CDM_EXECUTABLE
   exec zypak-wrapper /app/lib/blanc/blanc --user-data-dir="$profile" "$@" ;;
 *) exit 64 ;;
esac
EOF
chmod +x "$ROOT/build/files/bin/blanc"
mapfile -t permissions < <(sed -n 's/^  - \(--[^ ]*\)$/\1/p' "$ROOT/original-manifest.yml")
extra_args=()
if [[ ${BLANC_REAL_PACKAGE:-false} == true ]]; then
  # /app/extra is populated by Flatpak during installation, as in FlatPark.
  rm -rf "$ROOT/build/files/lib/blanc"
  sed -i 's|/app/lib/blanc|/app/extra/blanc|g' "$ROOT/build/files/bin/blanc"
  gh api 'repos/flatpark/flatpark/contents/registry/com.blancbrowser.Blanc/apply_extra.sh?ref=2a792fa6d84cf1574b93bee3eea1036339a74659' --jq .content | base64 -d > "$ROOT/apply_extra.original.sh"
  python3 - "$ROOT" <<'PY'
import pathlib,sys,difflib
r=pathlib.Path(sys.argv[1]);old=(r/'apply_extra.original.sh').read_text()
needle='[ -n "$name" ] || { echo "could not read the launcher name from the AppDir\'s AppRun" >&2; exit 1; }'
assert old.count(needle)==1
new=old.replace(needle,'''if [ -z "$name" ] && [ -x blanc/blanc-ecs-launcher ] && grep -Fq 'exec "$ECS_APPDIR/blanc-ecs-launcher" "$@"' blanc/AppRun; then
    name=blanc-ecs-launcher
fi
'''+needle)
(r/'build/files/bin/apply_extra').write_text(new)
(r/'apply-extra.patch').write_text(''.join(difflib.unified_diff(old.splitlines(True),new.splitlines(True),fromfile='a/registry/com.blancbrowser.Blanc/apply_extra.sh',tofile='b/registry/com.blancbrowser.Blanc/apply_extra.sh')))
PY
  chmod +x "$ROOT/build/files/bin/apply_extra"
  app_hash=$(sha256sum "$ROOT/Blanc-1.43.1.AppImage" | cut -d' ' -f1)
  extra_args+=(--metadata=Extra\ Data=NoRuntime=false
    "--extra-data=blanc.AppImage:$app_hash:158888732:500000000:https://github.com/bnfy/blanc/releases/download/v1.43.1/Blanc-1.43.1.AppImage"
    "--extra-data=appimage-tools.tar.xz:01ff0b363031060c3d9877bc61b026a1a7422308fd9e5cfda53cc24971b12304:57220:1000000:https://github.com/flatpark/prebuilt/releases/download/appimage-tools-v2/appimage-tools-appimage-tools-v2-fd-26.08-x86_64.tar.xz")
fi
flatpak build-finish --command=blanc "${permissions[@]}" "${extra_args[@]}" "$ROOT/build"
flatpak build-export "$ROOT/repo" "$ROOT/build"
flatpak remote-add --user --no-gpg-verify blanc-test "$ROOT/repo"
flatpak install --user -y --noninteractive blanc-test com.blancbrowser.Blanc
if [[ ${BLANC_REAL_PACKAGE:-false} == true ]]; then
  flatpak run --command=sh com.blancbrowser.Blanc -c 'ls -la /app/extra/blanc/blanc /app/extra/blanc/blanc-ecs-launcher; test -x /app/extra/blanc/blanc; cat /app/extra/launcher' > "$ROOT/installed-files.txt"
  deployed=$(flatpak info --user --show-location com.blancbrowser.Blanc)
  python3 - "$ROOT" "$deployed/files/extra/blanc" <<'PY'
import pathlib,sys,hashlib,json
r=pathlib.Path(sys.argv[1]);original=r/'squashfs-root';installed=pathlib.Path(sys.argv[2]);count=0
for p in original.rglob('*'):
 q=installed/p.relative_to(original)
 if p.is_symlink(): assert q.is_symlink() and p.readlink()==q.readlink(),str(p)
 elif p.is_file():
  assert q.is_file() and hashlib.sha256(p.read_bytes()).digest()==hashlib.sha256(q.read_bytes()).digest(),str(p)
  count+=1
(r/'installed-integrity.json').write_text(json.dumps({'allOriginalFilesMatch':True,'regularFiles':count,'installed':str(installed)},indent=2))
PY
else
  flatpak run --command=sh com.blancbrowser.Blanc -c 'ls -la /app/lib/blanc/blanc /app/lib/blanc/blanc-ecs-launcher /app/lib/blanc/blanc-ecs-launcher-candidate; test -x /app/lib/blanc/blanc' > "$ROOT/installed-files.txt"
fi
flatpak info --user --show-permissions com.blancbrowser.Blanc > "$ROOT/permissions.txt"
flatpak info --user --show-metadata com.blancbrowser.Blanc > "$ROOT/metadata.txt"
export DISPLAY=:99
export XDG_RUNTIME_DIR
XDG_RUNTIME_DIR=$(mktemp -d)
chmod 700 "$XDG_RUNTIME_DIR"
Xvfb :99 -screen 0 1280x900x24 -nolisten tcp > "$ROOT/xvfb.log" 2>&1 &
sleep 2
dbus-run-session -- node scripts/flatpak-investigation.mjs

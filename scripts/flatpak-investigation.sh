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
flatpak list --user --columns=application,branch,commit > "$ROOT/runtime-commits.txt"
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
g++ -std=c++20 -O2 -DBLANC_ECS_PRODUCTION -static-libstdc++ -static-libgcc "$ROOT/launcher.candidate.cc" -o "$ROOT/blanc-ecs-launcher-candidate"
flatpak build-init --arch=x86_64 --base=org.electronjs.Electron2.BaseApp --base-version=26.08 "$ROOT/build" com.blancbrowser.Blanc org.freedesktop.Platform org.freedesktop.Platform 26.08
mkdir -p "$ROOT/build/files/extra/blanc" "$ROOT/build/files/bin" "$ROOT/build/files/share/applications"
cp -a "$ROOT/squashfs-root/." "$ROOT/build/files/extra/blanc/"
cp "$ROOT/blanc-ecs-launcher-candidate" "$ROOT/build/files/extra/blanc/"
printf '[Desktop Entry]\nType=Application\nName=Blanc Flatpak Test\nExec=blanc\n' > "$ROOT/build/files/share/applications/com.blancbrowser.Blanc.desktop"
cat > "$ROOT/build/files/bin/blanc" <<'EOF'
#!/bin/sh
set -eu
unset ELECTRON_RUN_AS_NODE
export LD_LIBRARY_PATH="/app/extra/blanc/usr/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
export BLANC_UPDATE_CHANNEL=flatpak BLANC_TEST=1
export BLANC_TEST_UNCAUGHT_LOG="$XDG_CONFIG_HOME/uncaught.log"
mode=${BLANC_FLATPAK_CASE:?}
profile="$XDG_CONFIG_HOME/Blanc-$mode"
mkdir -p "$profile"
chmod 700 "$profile"
export BLANC_ECS_FULL_PROFILE="$profile" BLANC_ECS_LAUNCHER_ROOT=/app/extra/blanc
set -- --remote-debugging-port=9222 --ozone-platform=x11 "$@"
case "$mode" in
 baseline|unset) exec zypak-wrapper /app/extra/blanc/blanc "$@" ;;
 profile|profile-unset) exec zypak-wrapper /app/extra/blanc/blanc --user-data-dir="$profile" "$@" ;;
 original-launcher) exec zypak-wrapper /app/extra/blanc/blanc-ecs-launcher --user-data-dir="$profile" "$@" ;;
 integrated-launcher) exec /app/extra/blanc/blanc-ecs-launcher-candidate --user-data-dir="$profile" "$@" ;;
 *) exit 64 ;;
esac
EOF
chmod +x "$ROOT/build/files/bin/blanc"
mapfile -t permissions < <(sed -n 's/^  - \(--[^ ]*\)$/\1/p' "$ROOT/original-manifest.yml")
flatpak build-finish --command=blanc "${permissions[@]}" "$ROOT/build"
flatpak build-export "$ROOT/repo" "$ROOT/build"
flatpak remote-add --user --no-gpg-verify blanc-test "$ROOT/repo"
flatpak install --user -y --noninteractive blanc-test com.blancbrowser.Blanc
flatpak info --user --show-permissions com.blancbrowser.Blanc > "$ROOT/permissions.txt"
flatpak info --user --show-metadata com.blancbrowser.Blanc > "$ROOT/metadata.txt"
export DISPLAY=:99
Xvfb :99 -screen 0 1280x900x24 -nolisten tcp > "$ROOT/xvfb.log" 2>&1 &
sleep 2
dbus-run-session -- node scripts/flatpak-investigation.mjs

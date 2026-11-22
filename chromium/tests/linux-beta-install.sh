#!/bin/bash
# Run as an ordinary user on the hosted Ubuntu runner or in its distro container.
# unpack-beta-candidate has already verified both native packages against the pinned archive.
set -euo pipefail
system=$1 version=$2 input=$3 results=$4
case "$system" in
  ubuntu|debian) format=deb; manager=apt-get ;;
  fedora) format=rpm; manager=dnf ;;
  *) echo "Unknown install system: $system" >&2; exit 2 ;;
esac
shopt -s nullglob
packages=("$input"/*."$format")
[[ ${#packages[@]} == 1 && -f ${packages[0]} && ! -L ${packages[0]} ]]
sudo -n "$manager" install -y "${packages[0]}"
# A disposable, unlocked keyring, as on a signed-in desktop: without one, GNOME
# Keyring raises a password prompt nobody answers and the browser waits on it
# (run 45069499269). The prototype's install check does the same.
# Each attempt is time-limited and proven by a store-and-lookup probe, as the
# suite's unlockSuiteKeyring does; an unanswered unlock prompt once hung the
# browser (run 45071799668), so a failed attempt restarts the daemon.
exec xvfb-run -a dbus-run-session -- bash -c '
  if command -v gnome-keyring-daemon >/dev/null; then
    for attempt in 1 2 3; do
      printf %s "disposable session only" | timeout 15 gnome-keyring-daemon --replace --unlock --components=secrets >/dev/null || true
      timeout 15 gnome-keyring-daemon --start --components=secrets >/dev/null || true
      if printf ready | timeout 15 secret-tool store --label="Blanc beta smoke check" blanc-beta-smoke readiness 2>/dev/null &&
         [[ $(timeout 15 secret-tool lookup blanc-beta-smoke readiness 2>/dev/null) == ready ]]; then break; fi
      if [[ $attempt == 3 ]]; then echo "Secret Service never accepted the smoke keyring probe" >&2; exit 1; fi
      pkill -u "$(id -u)" -x gnome-keyring-d || true
      sleep 2
    done
  fi
  exec node "$@"' smoke "$(dirname "$0")/linux-beta-smoke.mjs" \
  "$version" "$results/linux-beta-smoke-$format.json" "--package=${packages[0]}" "--references=$input/references"

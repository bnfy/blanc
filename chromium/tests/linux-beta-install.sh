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
exec xvfb-run -a dbus-run-session -- node "$(dirname "$0")/linux-beta-smoke.mjs" \
  "$version" "$results/linux-beta-smoke-$format.json" "--package=${packages[0]}" "--references=$input/references"

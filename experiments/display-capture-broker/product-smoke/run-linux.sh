#!/bin/bash
# Unpackaged Linux product smoke in the parallels guest session.
set -euo pipefail
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/1000}"
export WAYLAND_DISPLAY="${WAYLAND_DISPLAY:-wayland-0}"
export XDG_SESSION_TYPE=wayland
export DBUS_SESSION_BUS_ADDRESS="${DBUS_SESSION_BUS_ADDRESS:-unix:path=/run/user/1000/bus}"
unset ELECTRON_RUN_AS_NODE || true

ROOT="${BLANC_TREE:-/home/parallels/blanc-tree}"
NODE="${BLANC_NODE:-$HOME/.local/node/bin/node}"
ELECTRON="${BLANC_PRODUCT_SMOKE_ELECTRON:-$HOME/electron-44.1.1-linux-arm64/electron}"
export BLANC_PRODUCT_SMOKE_ELECTRON="$ELECTRON"
export BLANC_PRODUCT_SMOKE_PORTAL=1
export BLANC_PRODUCT_SMOKE_PORTAL_CLICK="${BLANC_PRODUCT_SMOKE_PORTAL_CLICK:-$ROOT/experiments/display-capture-broker/audio-probe/click-share-portal.py}"

systemctl --user start at-spi-dbus-bus.service xdg-desktop-portal.service xdg-desktop-portal-gnome.service 2>/dev/null || true
# Avoid leftover portal latch from prior probes.
pkill -f gnome-remote-desktop-daemon 2>/dev/null || true
pkill -f 'electron-44.1.1-linux-arm64/electron' 2>/dev/null || true
sleep 1

cd "$ROOT"
echo "node=$NODE electron=$ELECTRON"
exec "$NODE" experiments/display-capture-broker/product-smoke/run.cjs "$@"

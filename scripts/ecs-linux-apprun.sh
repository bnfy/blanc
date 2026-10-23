#!/bin/sh
# Candidate only. Never trust an APPDIR or preload inherited from an old
# AppImage. Resolve this entrypoint and use only the replacement's own files.
unset LD_PRELOAD BLANC_ECS_CDM_PRELOAD_PATH APPIMAGE_EXIT_AFTER_INSTALL
ECS_APPDIR=$(CDPATH= cd -- "$(dirname -- "$(readlink -f -- "$0")")" && pwd -P) || exit 126
export APPDIR="$ECS_APPDIR"
export LD_LIBRARY_PATH="$ECS_APPDIR/usr/lib"
export GSETTINGS_SCHEMA_DIR="$ECS_APPDIR/usr/share/glib-2.0/schemas"
exec "$ECS_APPDIR/blanc-ecs-launcher" "$@"

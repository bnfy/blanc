#!/usr/bin/env bash
# Release APK emulator checks. Required gates cannot be filtered by split-gate settings.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/gate-lib.sh"
# gate-lib's *-gate steps are mandatory; unset filters for child checks as well.
gate_wants release-gate || exit 1
unset BLANC_GATE_ONLY BLANC_GATE_SKIP
exec node "$(dirname "${BASH_SOURCE[0]}")/release-gate.mjs" "$@"

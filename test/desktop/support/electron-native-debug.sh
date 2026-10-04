#!/usr/bin/env bash
# Optional fresh-profile CI diagnostics only. Official Electron, unchanged
# sandbox flags and filtering deadlines; never used by packaged Blanc.
set -euo pipefail
: "${BLANC_UBLOCK_NATIVE_EXECUTABLE:?Official fixture executable required}"
exec gdb --batch --return-child-result \
  --eval-command='set pagination off' \
  --eval-command='set print thread-events off' \
  --eval-command='handle SIGPIPE nostop noprint pass' \
  --eval-command='handle SIGUSR1 nostop noprint pass' \
  --eval-command='run' \
  --eval-command='thread apply all bt 16' \
  --args "$BLANC_UBLOCK_NATIVE_EXECUTABLE" "$@"

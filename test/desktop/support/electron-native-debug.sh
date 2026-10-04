#!/usr/bin/env bash
# Optional fresh-profile CI diagnostics only. Official Electron, unchanged
# sandbox flags and filtering deadlines; never used by packaged Blanc.
set -euo pipefail
: "${BLANC_UBLOCK_NATIVE_EXECUTABLE:?Official fixture executable required}"
exec gdb --batch --return-child-result \
  --eval-command="set logging file ${BLANC_UBLOCK_NATIVE_STACK_DIR:?Stack directory required}/native-$$.txt" \
  --eval-command='set logging overwrite on' \
  --eval-command='set logging enabled on' \
  --eval-command='set pagination off' \
  --eval-command='set print thread-events off' \
  --eval-command='handle SIGPIPE nostop noprint pass' \
  --eval-command='handle SIGUSR1 nostop noprint pass' \
  --eval-command='run' \
  --eval-command='info registers rip rdi rsi rdx' \
  --eval-command='x/12i $pc-16' \
  --eval-command='thread apply all bt 16' \
  --args "$BLANC_UBLOCK_NATIVE_EXECUTABLE" "$@"

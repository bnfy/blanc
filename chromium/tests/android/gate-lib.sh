# Copyright 2026 Bananify Creative. MIT; see LICENSE.
# Shared by the gate scripts (sourced). Which of a gate's steps this run takes, so split-gate.sh can
# run one gate across both emulators: BLANC_GATE_ONLY names the only steps to run, BLANC_GATE_SKIP
# steps to leave out (space-separated step names, as each gate's run() names them). A lower gate
# (a step named *-gate) always runs, and inherits both, so the choice reaches every gate in the
# chain. With neither set, every step runs, as before.
gate_wants() {
  local name=$1
  [[ $name == *-gate ]] && return 0
  if [[ -n "${BLANC_GATE_ONLY:-}" && " $BLANC_GATE_ONLY " != *" $name "* ]]; then return 1; fi
  if [[ -n "${BLANC_GATE_SKIP:-}" && " $BLANC_GATE_SKIP " == *" $name "* ]]; then return 1; fi
  return 0
}

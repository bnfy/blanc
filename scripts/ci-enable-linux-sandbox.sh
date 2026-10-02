#!/usr/bin/env bash
set -euo pipefail
# This is explicit test-host provisioning, never an application startup action.
if [[ ${GITHUB_ACTIONS:-} != true || ${RUNNER_OS:-} != Linux ]]; then
  echo 'Namespace provisioning is restricted to disposable GitHub Linux runners.' >&2
  exit 1
fi
for knob in kernel.unprivileged_userns_clone user.max_user_namespaces; do
  if sysctl "$knob" >/dev/null 2>&1; then
    case "$knob" in
      kernel.unprivileged_userns_clone) sudo sysctl -w "$knob=1" ;;
      user.max_user_namespaces) sudo sysctl -w "$knob=15000" ;;
    esac
  fi
done
if sysctl kernel.apparmor_restrict_unprivileged_userns >/dev/null 2>&1; then
  sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0
fi
unshare -Ur true

#!/bin/bash
# GitHub-maintainer workaround for actions/runner-images#14924. Keep TLS,
# certificate validation and Gatekeeper intact; only force TCP for this check.
set -euo pipefail
if [[ "${GITHUB_ACTIONS:-}" != true || "${RUNNER_OS:-}" != macOS || "$(uname -m)" != x86_64 ]]; then
  echo 'Apple ticket transport workaround is restricted to disposable Intel CI' >&2
  exit 1
fi
ECS_TICKET_APP="${1:?an app bundle is required}"
[[ "$ECS_TICKET_APP" = /*.app && -d "$ECS_TICKET_APP" ]]
# Use an existing wildcard anchor; never replace or flush the host ruleset.
sudo pfctl -sr 2>/dev/null | grep -F 'anchor "com.apple/*"' >/dev/null
ECS_TICKET_ANCHOR="com.apple/blanc-ecs-ticket-$$"
ECS_TICKET_TOKEN=''
cleanup() {
  ECS_TICKET_STATUS=$?
  sudo pfctl -a "$ECS_TICKET_ANCHOR" -F rules >/dev/null 2>&1 || ECS_TICKET_STATUS=1
  if [[ -n "$ECS_TICKET_TOKEN" ]]; then
    sudo pfctl -X "$ECS_TICKET_TOKEN" >/dev/null 2>&1 || ECS_TICKET_STATUS=1
  fi
  exit "$ECS_TICKET_STATUS"
}
trap cleanup EXIT
printf '%s\n' 'block return out quick proto udp from any to any port 443' | sudo pfctl -a "$ECS_TICKET_ANCHOR" -f -
ECS_TICKET_ENABLE=$(sudo pfctl -E 2>&1)
ECS_TICKET_TOKEN=$(printf '%s\n' "$ECS_TICKET_ENABLE" | awk '/Token/{print $NF}')
[[ "$ECS_TICKET_TOKEN" =~ ^[0-9]+$ ]]
xcrun stapler validate "$ECS_TICKET_APP"
spctl --assess --type execute --verbose=4 "$ECS_TICKET_APP"

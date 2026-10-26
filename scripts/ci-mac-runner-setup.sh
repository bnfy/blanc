#!/usr/bin/env bash
# Set up (or remove) the self-hosted Apple Silicon CI runner for bnfy/blanc.
# docs/ci-self-hosted-macos-runner.md explains the design; this is its quick,
# direct-install path (no VM per job). Run it on the CI Mac, logged in as the
# account the runner should use, with `gh` authenticated as a repository admin.
#
#   scripts/ci-mac-runner-setup.sh            install, start, then offer to switch CI over
#   scripts/ci-mac-runner-setup.sh --status   show the runner and the repository variable
#   scripts/ci-mac-runner-setup.sh --off      switch CI back to GitHub-hosted (keeps the runner)
#   scripts/ci-mac-runner-setup.sh --remove   switch CI back, stop and unregister the runner
#
# Never run it on the release Mac's main account: pull request code from this
# repository runs here, beside whatever that account can reach.
set -euo pipefail

REPO="bnfy/blanc"
LABEL="blanc-ci"
LABELS_JSON='["self-hosted","macOS","ARM64","blanc-ci"]'
DIR="${BLANC_RUNNER_DIR:-$HOME/actions-runner-blanc}"
NAME="${BLANC_RUNNER_NAME:-$(scutil --get LocalHostName 2>/dev/null || hostname -s)-blanc}"

say() { printf '\n==> %s\n' "$*"; }
die() { printf '\nerror: %s\n' "$*" >&2; exit 1; }
confirm() { local reply; read -r -p "$1 [y/N] " reply; [[ "$reply" =~ ^[Yy]$ ]]; }

preflight() {
  [[ "$(uname -s)" == Darwin ]] || die "run this on the CI Mac (macOS), not $(uname -s)"
  [[ "$(uname -m)" == arm64 ]] || die "Apple Silicon only: Intel stays on GitHub-hosted runners"
  command -v gh >/dev/null || die "install the GitHub CLI first: brew install gh"
  command -v git >/dev/null || die "install the Xcode command-line tools first: xcode-select --install"
  gh auth status >/dev/null 2>&1 || die "sign in first: gh auth login"
  [[ "$(gh api "repos/$REPO" --jq .permissions.admin)" == true ]] \
    || die "the signed-in GitHub account must be an admin of $REPO"
}

runner_json() {
  gh api "repos/$REPO/actions/runners" --paginate \
    --jq ".runners[] | select(.name == \"$NAME\") | {status, busy, labels: [.labels[].name]}"
}

runner_status() {
  gh api "repos/$REPO/actions/runners" --paginate --jq ".runners[] | select(.name == \"$NAME\") | .status"
}

variable_value() { gh variable get MAC_RUNNER_LABELS -R "$REPO" 2>/dev/null || true; }

status() {
  say "Runner \"$NAME\""
  local json; json="$(runner_json)"
  if [[ -n "$json" ]]; then echo "$json"; else echo "not registered"; fi
  say "MAC_RUNNER_LABELS"
  local value; value="$(variable_value)"
  if [[ -n "$value" ]]; then echo "$value (Apple Silicon jobs use this Mac)"; else echo "unset (GitHub-hosted macOS)"; fi
}

switch_off() {
  if [[ -n "$(variable_value)" ]]; then
    gh variable delete MAC_RUNNER_LABELS -R "$REPO"
    say "MAC_RUNNER_LABELS deleted: new runs use GitHub-hosted macOS again"
  else
    say "MAC_RUNNER_LABELS was already unset"
  fi
}

install() {
  if [[ -x "$DIR/config.sh" && -f "$DIR/.runner" ]]; then
    say "Runner already configured in $DIR; (re)starting its service"
  else
    say "Downloading the latest GitHub Actions runner for macOS arm64"
    mkdir -p "$DIR"
    local url
    url="$(gh api repos/actions/runner/releases/latest \
      --jq '.assets[] | select(.name | test("actions-runner-osx-arm64-.*\\.tar\\.gz$")) | .browser_download_url')"
    [[ -n "$url" ]] || die "couldn't find the macOS arm64 runner download"
    curl -fsSL "$url" | tar -xz -C "$DIR"

    say "Registering \"$NAME\" with $REPO (labels: self-hosted, macOS, ARM64, $LABEL)"
    local token
    token="$(gh api -X POST "repos/$REPO/actions/runners/registration-token" --jq .token)"
    (cd "$DIR" && ./config.sh --unattended --replace --url "https://github.com/$REPO" \
      --token "$token" --name "$NAME" --labels "$LABEL" --work _work)
  fi

  # A LaunchAgent in this user's session: Electron tests need a GUI session.
  (cd "$DIR" && { ./svc.sh install >/dev/null 2>&1 || true; } && ./svc.sh start)

  say "Waiting for GitHub to see the runner online"
  local i
  for i in $(seq 1 30); do
    if [[ "$(runner_status)" == online ]]; then echo "online"; break; fi
    sleep 2
    [[ "$i" -lt 30 ]] || die "the runner didn't come online; see $DIR/_diag"
  done

  say "Requiring approval for workflows from outside collaborators' forks"
  if gh api -X PUT "repos/$REPO/actions/permissions/fork-pr-contributor-approval" \
       -f approval_policy=all_external_contributors >/dev/null 2>&1; then
    echo "done"
  else
    echo "couldn't set it through the API: set it by hand in"
    echo "  Settings -> Actions -> General -> Fork pull request workflows from outside collaborators"
    echo "  -> Require approval for all outside collaborators"
  fi

  cat <<EOF

Keep this Mac awake and logged in to this account:
  System Settings -> Energy: prevent automatic sleep; start up after a power failure.
  The runner only takes jobs while this account's session is running.
EOF

  if [[ -n "$(variable_value)" ]]; then
    say "MAC_RUNNER_LABELS is already set: Apple Silicon jobs already use this Mac"
  elif confirm "Switch CI's Apple Silicon jobs to this Mac now (sets MAC_RUNNER_LABELS)?"; then
    gh variable set MAC_RUNNER_LABELS -R "$REPO" --body "$LABELS_JSON"
    say "Done. New runs of unit-tests, parity-guards and the uBO desktop job use this Mac."
    echo "Undo at any time: $0 --off"
  else
    echo "Left unset. Switch over later with: gh variable set MAC_RUNNER_LABELS -R $REPO --body '$LABELS_JSON'"
  fi
}

remove() {
  switch_off
  if [[ -x "$DIR/config.sh" ]]; then
    say "Stopping and unregistering the runner"
    (cd "$DIR" && { ./svc.sh stop || true; } && { ./svc.sh uninstall || true; })
    local token
    token="$(gh api -X POST "repos/$REPO/actions/runners/remove-token" --jq .token)"
    (cd "$DIR" && ./config.sh remove --token "$token")
    say "Removed. $DIR can be deleted."
  else
    say "No runner in $DIR"
  fi
}

case "${1:-}" in
  "") preflight; install ;;
  --status) preflight; status ;;
  --off) preflight; switch_off ;;
  --remove) preflight; remove ;;
  -h|--help) sed -n '2,14p' "$0" ;;
  *) die "unknown option: $1 (try --help)" ;;
esac

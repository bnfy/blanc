#!/usr/bin/env bash
# Run bnfy/blanc's self-hosted Apple Silicon CI jobs in throwaway Tart VMs:
# every job gets a fresh copy of a golden macOS image and the copy is deleted
# when the job ends, so nothing a pull request does survives into the next job.
# docs/ci-self-hosted-macos-runner.md explains the design. Run it on the CI Mac,
# as the account the VMs should run under, with `gh` signed in as a repository
# admin (the same setup scripts/ci-mac-runner-setup.sh needs).
#
#   scripts/ci-mac-vm-runners.sh install         install Tart, build the image, start the VM loop,
#                                                retire the direct runner, set MAC_RUNNER_LABELS
#   scripts/ci-mac-vm-runners.sh status          VMs, the loop's service and the runners GitHub sees
#   scripts/ci-mac-vm-runners.sh rebuild-image   rebuild the golden image (newer macOS image or runner)
#   scripts/ci-mac-vm-runners.sh stop|start      stop or start the VM loop (jobs wait while it's stopped)
#   scripts/ci-mac-vm-runners.sh retire-direct   unregister the direct-install runner once it's idle
#   scripts/ci-mac-vm-runners.sh uninstall       stop everything, delete the VMs and image, unset the variable
#
# How a job runs: the host asks GitHub for a just-in-time runner config (single
# use, one job), writes it into a per-VM folder, clones the golden image and
# boots the clone with that folder shared read-only. In the VM, a LaunchAgent in
# the auto-logged-in admin session (Electron tests need a GUI session) runs the
# runner with that config, takes one job and powers the VM off; the host then
# deletes the clone and starts the next one. The host's GitHub sign-in never
# enters a VM. Apple's licence and Virtualization.framework allow two macOS VMs
# per Mac, so at most two jobs run at once.
set -euo pipefail

REPO="bnfy/blanc"
LABELS=(self-hosted macOS ARM64 blanc-ci)
LABELS_JSON='["self-hosted","macOS","ARM64","blanc-ci"]'
BASE_IMAGE="${BLANC_VM_BASE_IMAGE:-ghcr.io/cirruslabs/macos-sequoia-base:latest}"
STATE="${BLANC_VM_STATE:-$HOME/blanc-ci-vms}"
TART="$STATE/tart.app/Contents/MacOS/tart"
GOLDEN="blanc-ci-golden"
AGENT="dev.blanc.ci-vms"
AGENT_PLIST="$HOME/Library/LaunchAgents/$AGENT.plist"
DIRECT_RUNNER_DIR="${BLANC_RUNNER_DIR:-$HOME/actions-runner-blanc}"
HOST="$(scutil --get LocalHostName 2>/dev/null || hostname -s)"
DIRECT_NAME="${BLANC_RUNNER_NAME:-$HOST-blanc}"
MAX_VM_HOURS="${BLANC_VM_MAX_HOURS:-6}"

say() { printf '\n==> %s\n' "$*"; }
log() { printf '%s %s\n' "$(date '+%F %T')" "$*"; }
die() { printf '\nerror: %s\n' "$*" >&2; exit 1; }

preflight() {
  [[ "$(uname -s)" == Darwin ]] || die "run this on the CI Mac (macOS), not $(uname -s)"
  [[ "$(uname -m)" == arm64 ]] || die "Tart needs Apple Silicon"
  command -v gh >/dev/null || die "install the GitHub CLI first (see docs/ci-self-hosted-macos-runner.md)"
  gh auth status >/dev/null 2>&1 || die "sign in first: gh auth login"
  [[ "$(gh api "repos/$REPO" --jq .permissions.admin)" == true ]] \
    || die "the signed-in GitHub account must be an admin of $REPO"
}

# Two VMs when the Mac has the memory for them, otherwise one. Each VM gets an
# even share of the cores and memory, keeping some back for macOS itself.
sizing() {
  local mem_gb cores
  mem_gb=$(( $(sysctl -n hw.memsize) / 1073741824 ))
  cores=$(sysctl -n hw.ncpu)
  SLOTS="${BLANC_VM_SLOTS:-$(( mem_gb >= 24 ? 2 : 1 ))}"
  (( SLOTS >= 1 && SLOTS <= 2 )) || die "BLANC_VM_SLOTS must be 1 or 2 (macOS allows two VMs per Mac)"
  VM_CPU="${BLANC_VM_CPU:-$(( (cores - 2) / SLOTS > 2 ? (cores - 2) / SLOTS : 2 ))}"
  local mem_mb=$(( (mem_gb - 6) * 1024 / SLOTS ))
  (( mem_mb > 16384 )) && mem_mb=16384
  VM_MEM_MB="${BLANC_VM_MEMORY_MB:-$mem_mb}"
  (( VM_MEM_MB >= 4096 )) || die "not enough memory for a CI VM (${VM_MEM_MB} MB); set BLANC_VM_MEMORY_MB"
}

install_tart() {
  if [[ -x "$TART" ]]; then
    say "Tart already installed: $("$TART" --version)"
    return
  fi
  say "Installing Tart into $STATE (no admin rights needed)"
  mkdir -p "$STATE"
  # Tart must run from inside tart.app so macOS applies its virtualization entitlement.
  curl -fsSL https://github.com/cirruslabs/tart/releases/latest/download/tart.tar.gz | tar -xz -C "$STATE"
  [[ -x "$TART" ]] || die "Tart's download didn't contain tart.app"
  echo "Tart $("$TART" --version)"
}

ssh_vm() {
  # The Cirrus Labs images' account is admin/admin. The password is only used
  # while building the image, from this script, against a VM on this Mac's NAT.
  local ip="$1"; shift
  local askpass; askpass="$(mktemp)"
  printf '#!/bin/sh\necho admin\n' > "$askpass"; chmod 700 "$askpass"
  SSH_ASKPASS="$askpass" SSH_ASKPASS_REQUIRE=force DISPLAY=:0 \
    ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR \
        -o ConnectTimeout=5 "admin@$ip" "$@"
  local status=$?
  rm -f "$askpass"
  return $status
}

build_image() {
  sizing
  local free_gb; free_gb=$(df -g "$HOME" | awk 'NR==2 {print $4}')
  (( free_gb >= 80 )) || die "about 80 GB of free disk is needed for the image and two clones (${free_gb} GB free)"
  local tmp="$GOLDEN-building" pid ip runner_url
  "$TART" stop "$tmp" >/dev/null 2>&1 || true
  "$TART" delete "$tmp" >/dev/null 2>&1 || true

  say "Fetching $BASE_IMAGE (tens of GB the first time; later runs reuse it)"
  "$TART" clone "$BASE_IMAGE" "$tmp"
  "$TART" set "$tmp" --cpu "$VM_CPU" --memory "$VM_MEM_MB"

  say "Booting it to install the GitHub Actions runner"
  "$TART" run --no-graphics "$tmp" > "$STATE/image-build.log" 2>&1 &
  pid=$!
  ip="$("$TART" ip --wait 300 "$tmp")" || die "the VM never got an IP address; see $STATE/image-build.log"
  local i
  for i in $(seq 1 60); do ssh_vm "$ip" true 2>/dev/null && break; sleep 5; done
  ssh_vm "$ip" true || die "couldn't reach the VM over SSH"

  runner_url="$(gh api repos/actions/runner/releases/latest \
    --jq '.assets[] | select(.name | test("actions-runner-osx-arm64-.*\\.tar\\.gz$")) | .browser_download_url')"
  [[ -n "$runner_url" ]] || die "couldn't find the macOS arm64 runner download"

  ssh_vm "$ip" "RUNNER_URL='$runner_url' bash -s" <<'GUEST'
set -euo pipefail
# The base image logs admin in automatically and gives it passwordless sudo;
# fail now rather than at the first job if either ever changes.
[[ "$(defaults read /Library/Preferences/com.apple.loginwindow autoLoginUser 2>/dev/null)" == admin ]] \
  || { echo "the base image no longer logs admin in automatically" >&2; exit 1; }
sudo -n true || { echo "the base image no longer gives admin passwordless sudo" >&2; exit 1; }
xcode-select -p >/dev/null 2>&1 || { echo "the base image has no Command Line Tools (git)" >&2; exit 1; }

mkdir -p ~/actions-runner
curl -fsSL "$RUNNER_URL" | tar -xz -C ~/actions-runner

# One job per boot: read the one-time runner config from the host's read-only
# share, run exactly one job, power off. The host deletes this VM afterwards.
cat > ~/blanc-ci-job.sh <<'JOB'
#!/bin/bash
config="/Volumes/My Shared Files/blanc-ci/jitconfig"
for _ in $(seq 1 300); do [[ -s "$config" ]] && break; sleep 1; done
if [[ -s "$config" ]]; then
  cd "$HOME/actions-runner" && ./run.sh --jitconfig "$(cat "$config")" > "$HOME/blanc-ci-job.log" 2>&1
fi
sudo shutdown -h now
JOB
chmod 755 ~/blanc-ci-job.sh

mkdir -p ~/Library/LaunchAgents
cat > ~/Library/LaunchAgents/dev.blanc.ci-job.plist <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>dev.blanc.ci-job</string>
  <key>ProgramArguments</key><array><string>/bin/bash</string><string>/Users/admin/blanc-ci-job.sh</string></array>
  <key>LimitLoadToSessionType</key><string>Aqua</string>
  <key>RunAtLoad</key><true/>
</dict>
</plist>
PLIST
GUEST

  say "Saving the image as $GOLDEN"
  ssh_vm "$ip" 'sudo shutdown -h now' || true
  wait "$pid" || true
  "$TART" delete "$GOLDEN" >/dev/null 2>&1 || true
  "$TART" rename "$tmp" "$GOLDEN"
}

gh_runner_ids() {  # ids of this Mac's VM runners, optionally only the offline ones
  local filter='true'
  [[ "${1:-}" == offline ]] && filter='.status == "offline"'
  gh api "repos/$REPO/actions/runners" --paginate \
    --jq ".runners[] | select((.name | startswith(\"$HOST-vm\")) and $filter) | .id"
}

remove_runner_named() {
  local id
  id="$(gh api "repos/$REPO/actions/runners" --paginate --jq ".runners[] | select(.name == \"$1\") | .id")" || return 0
  [[ -n "$id" ]] && gh api -X DELETE "repos/$REPO/actions/runners/$id" >/dev/null 2>&1 || true
}

jit_config() {
  local args=(-X POST "repos/$REPO/actions/runners/generate-jitconfig"
    -f name="$1" -F runner_group_id=1 -f work_folder=_work --jq .encoded_jit_config) label
  for label in "${LABELS[@]}"; do args+=(-f "labels[]=$label"); done
  gh api "${args[@]}"
}

# One slot: register a single-use runner, boot a fresh clone for it, wait for
# the VM to power itself off after its job, delete it, repeat. A VM still up
# after MAX_VM_HOURS (a hung job, or an idle runner) is stopped and replaced.
slot_loop() {
  local slot="$1" vm="blanc-ci-$1" share="$STATE/slot-$1" name config pid deadline
  mkdir -p "$share"; chmod 700 "$share"
  while true; do
    "$TART" stop "$vm" >/dev/null 2>&1 || true
    "$TART" delete "$vm" >/dev/null 2>&1 || true
    rm -f "$share/jitconfig"
    name="$HOST-vm$slot-$(date +%Y%m%d-%H%M%S)"
    if ! config="$(jit_config "$name")" || [[ -z "$config" ]]; then
      log "slot $slot: couldn't get a runner config from GitHub; retrying in 60 s"
      sleep 60; continue
    fi
    (umask 077; printf '%s' "$config" > "$share/jitconfig")
    if ! "$TART" clone "$GOLDEN" "$vm"; then
      log "slot $slot: couldn't clone $GOLDEN; retrying in 60 s"
      remove_runner_named "$name"; sleep 60; continue
    fi
    log "slot $slot: $name is up and waiting for a job"
    "$TART" run --no-graphics --dir="blanc-ci:$share:ro" "$vm" >> "$STATE/slot-$slot.log" 2>&1 &
    pid=$!
    deadline=$(( SECONDS + MAX_VM_HOURS * 3600 ))
    while kill -0 "$pid" 2>/dev/null; do
      if (( SECONDS > deadline )); then
        log "slot $slot: $name still running after $MAX_VM_HOURS h; replacing it"
        "$TART" stop "$vm" >/dev/null 2>&1 || true
        remove_runner_named "$name"
        break
      fi
      sleep 15
    done
    wait "$pid" 2>/dev/null || true
    log "slot $slot: $name finished"
  done
}

serve() {
  sizing
  [[ -x "$TART" ]] || die "Tart isn't installed; run install first"
  "$TART" list 2>/dev/null | awk '{print $2}' | grep -qx "$GOLDEN" || die "no $GOLDEN image; run install or rebuild-image"
  # Runners left registered by a crash or reboot can never take a job again.
  local id
  for id in $(gh_runner_ids offline || true); do gh api -X DELETE "repos/$REPO/actions/runners/$id" >/dev/null 2>&1 || true; done
  log "starting $SLOTS VM slot(s)"
  local pids=() slot
  trap 'kill "${pids[@]}" 2>/dev/null; for s in $(seq 1 "$SLOTS"); do "$TART" stop "blanc-ci-$s" >/dev/null 2>&1 || true; done; exit 0' TERM INT
  for slot in $(seq 1 "$SLOTS"); do slot_loop "$slot" & pids+=($!); done
  # If a slot's loop ever dies, exit so launchd restarts everything (macOS's
  # bash 3.2 has no `wait -n`). Sleeping in the background keeps the trap prompt.
  local pid
  while true; do
    for pid in "${pids[@]}"; do
      kill -0 "$pid" 2>/dev/null || { log "a slot loop stopped; restarting"; kill "${pids[@]}" 2>/dev/null; exit 1; }
    done
    sleep 30 & wait $!
  done
}

write_agent() {
  mkdir -p "$HOME/Library/LaunchAgents"
  # Run from a copy, so a git checkout or pull in the repository never changes
  # the script under a running loop. `install` refreshes the copy.
  cp "$0" "$STATE/ci-mac-vm-runners.sh"
  chmod 755 "$STATE/ci-mac-vm-runners.sh"
  local path_dirs; path_dirs="$(dirname "$(command -v gh)"):/usr/bin:/bin:/usr/sbin:/sbin"
  cat > "$AGENT_PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$AGENT</string>
  <key>ProgramArguments</key><array><string>/bin/bash</string><string>$STATE/ci-mac-vm-runners.sh</string><string>serve</string></array>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>$path_dirs</string></dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$STATE/loop.log</string>
  <key>StandardErrorPath</key><string>$STATE/loop.log</string>
</dict>
</plist>
EOF
}

agent_start() {
  launchctl bootstrap "gui/$(id -u)" "$AGENT_PLIST" 2>/dev/null \
    || launchctl kickstart -k "gui/$(id -u)/$AGENT" 2>/dev/null \
    || die "couldn't start the LaunchAgent: run this in Terminal on the Mac's desktop, logged in as this account, not over SSH"
}
agent_stop() { launchctl bootout "gui/$(id -u)/$AGENT" 2>/dev/null || true; }

direct_runner_busy() {
  gh api "repos/$REPO/actions/runners" --paginate --jq ".runners[] | select(.name == \"$DIRECT_NAME\") | .busy"
}

# Retire a runner left by scripts/ci-mac-runner-setup.sh, but only between
# jobs: stopping it mid-job kills that job, and GitHub refuses to unregister a
# runner it still counts as busy. A job killed that way is reported busy until
# GitHub gives up on it, which can take several minutes.
retire_direct_runner() {
  [[ -x "$DIRECT_RUNNER_DIR/config.sh" && -f "$DIRECT_RUNNER_DIR/.runner" ]] || return 0
  say "Retiring the directly installed runner $DIRECT_NAME (the VMs replace it)"
  local waited=0
  while [[ "$(direct_runner_busy)" == true ]]; do
    (( waited % 60 == 0 )) && echo "waiting for it to finish its current job…"
    sleep 15; waited=$(( waited + 15 ))
  done
  (cd "$DIRECT_RUNNER_DIR" && { ./svc.sh stop >/dev/null 2>&1 || true; } && { ./svc.sh uninstall >/dev/null 2>&1 || true; })
  local token
  token="$(gh api -X POST "repos/$REPO/actions/runners/remove-token" --jq .token)"
  if (cd "$DIRECT_RUNNER_DIR" && ./config.sh remove --token "$token"); then
    echo "Removed. $DIRECT_RUNNER_DIR can be deleted."
  else
    echo "warning: couldn't unregister it; once GitHub shows it idle or offline, run: $0 retire-direct" >&2
    return 1
  fi
}

install() {
  preflight
  sizing
  echo "This Mac: $SLOTS VM(s) at a time, each with $VM_CPU CPUs and $(( VM_MEM_MB / 1024 )) GB of memory"
  install_tart
  build_image
  say "Starting the VM loop (LaunchAgent $AGENT)"
  agent_stop
  write_agent
  agent_start

  say "Waiting for GitHub to see a VM runner online (first boot takes a minute or two)"
  local i
  for i in $(seq 1 60); do
    if gh api "repos/$REPO/actions/runners" --paginate \
         --jq ".runners[] | select((.name | startswith(\"$HOST-vm\")) and .status == \"online\") | .name" | grep -q .; then
      echo "online"; break
    fi
    sleep 5
    [[ "$i" -lt 60 ]] || die "no VM runner came online; see $STATE/loop.log and $STATE/slot-1.log"
  done

  retire_direct_runner || true

  if [[ "$(gh variable get MAC_RUNNER_LABELS -R "$REPO" 2>/dev/null || true)" != "$LABELS_JSON" ]]; then
    gh variable set MAC_RUNNER_LABELS -R "$REPO" --body "$LABELS_JSON"
    say "MAC_RUNNER_LABELS set: Apple Silicon jobs use these VMs"
  fi
  cat <<EOF

Done. Each job now runs in a fresh VM that is deleted afterwards.
Keep this Mac awake, logged in to this account, and starting up after a power failure.
Status: $0 status     Logs: $STATE/loop.log
EOF
}

status() {
  say "VM loop"
  if launchctl print "gui/$(id -u)/$AGENT" >/dev/null 2>&1; then echo "running ($AGENT)"; else echo "not running"; fi
  say "VMs"
  if [[ -x "$TART" ]]; then "$TART" list; else echo "Tart not installed"; fi
  say "Runners GitHub sees from this Mac"
  gh api "repos/$REPO/actions/runners" --paginate \
    --jq ".runners[] | select(.name | startswith(\"$HOST\")) | \"\(.name)  \(.status)  busy=\(.busy)\""
  say "MAC_RUNNER_LABELS"
  gh variable get MAC_RUNNER_LABELS -R "$REPO" 2>/dev/null || echo "unset (GitHub-hosted macOS)"
  say "Recent loop log"
  tail -n 10 "$STATE/loop.log" 2>/dev/null || true
}

uninstall() {
  if [[ -n "$(gh variable get MAC_RUNNER_LABELS -R "$REPO" 2>/dev/null || true)" ]]; then
    gh variable delete MAC_RUNNER_LABELS -R "$REPO"
    say "MAC_RUNNER_LABELS deleted: new runs use GitHub-hosted macOS again"
  fi
  agent_stop
  rm -f "$AGENT_PLIST"
  local vm id
  if [[ -x "$TART" ]]; then
    for vm in blanc-ci-1 blanc-ci-2 "$GOLDEN-building" "$GOLDEN"; do
      "$TART" stop "$vm" >/dev/null 2>&1 || true
      "$TART" delete "$vm" >/dev/null 2>&1 || true
    done
  fi
  for id in $(gh_runner_ids || true); do gh api -X DELETE "repos/$REPO/actions/runners/$id" >/dev/null 2>&1 || true; done
  say "Removed the loop, the VMs and their runners. Tart and the cached base image stay in $STATE and ~/.tart."
}

case "${1:-}" in
  install) install ;;
  status) preflight; status ;;
  rebuild-image)
    preflight; [[ -x "$TART" ]] || die "run install first"
    agent_stop; build_image; agent_start; say "Rebuilt; the loop restarted with the new image" ;;
  stop) agent_stop; say "Stopped. Jobs wait for a runner until you start it again or run uninstall." ;;
  start) agent_start; say "Started." ;;
  uninstall) preflight; uninstall ;;
  retire-direct) preflight; retire_direct_runner ;;
  serve) serve ;;
  -h|--help|"") sed -n '2,25p' "$0" ;;
  *) die "unknown command: $1 (try --help)" ;;
esac

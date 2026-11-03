#!/usr/bin/env bash
# Sets up the Android lane's checkout on the build server, idempotently.
#
#   bash chromium/android/server/bootstrap.sh --dry-run   # print the plan, change nothing
#   bash chromium/android/server/bootstrap.sh             # run it (owner-approved, A0 task 5)
#
# Each run does only what is missing: depot_tools at a pinned commit, the
# Android checkout at the lane's pinned Chromium commit, the build
# dependencies, the lane's Blanc source, and the two debug output folders.
# It never deletes an output folder and never overwrites an args.gn that
# differs from the tree's; it stops instead. Layout: README.md beside this file.
set -euo pipefail

DEPOT_TOOLS_COMMIT=23239db8570fe61d2b7c078c2a63aea7e1cca08d
DEPOT_TOOLS="${HOME}/depot_tools"
CHECKOUT="${HOME}/chromium-android"
SRC="${CHECKOUT}/src"
EVIDENCE="${HOME}/blanc-evidence/android"
TREE="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
LANE="${TREE}/chromium/lanes/android.json"
OUTPUTS=("AndroidDebug:debug-arm64.gn" "AndroidDebugX64:debug-x64.gn")

dry_run=0
for arg in "$@"; do
  case "${arg}" in
    --dry-run) dry_run=1 ;;
    *) echo "Usage: bootstrap.sh [--dry-run]" >&2; exit 2 ;;
  esac
done

die() { echo "bootstrap: $*" >&2; exit 1; }
in_dir() { local dir="$1"; shift; (cd "${dir}" && "$@"); }
# Runs a planned action, or only prints it in a dry run.
step() {
  local what="$1"; shift
  if (( dry_run )); then printf 'would %s:' "${what}"; printf ' %q' "$@"; printf '\n'
  else echo "== ${what}"; "$@"; fi
}

[[ "$(uname -s)" == Linux && "$(uname -m)" == x86_64 ]] \
  || die "Android builds only on x86-64 Linux (this is $(uname -s) $(uname -m))."
(( EUID != 0 )) || die "run as the build user, not root; the script asks sudo for packages."
[[ -f "${LANE}" ]] || die "no lane pin at ${LANE}; record it first (A0 task 2)."
UPSTREAM="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["upstream"])' "${LANE}")"
[[ "${UPSTREAM}" =~ ^[0-9a-f]{40}$ ]] || die "lane upstream is not a full commit: ${UPSTREAM}"
(( dry_run )) && echo "Dry run: nothing below is executed."
echo "Lane pin: ${UPSTREAM}"

for tool in git python3 curl; do
  command -v "${tool}" >/dev/null || step "install ${tool}" sudo apt-get install -y "${tool}"
done

if [[ ! -d "${DEPOT_TOOLS}/.git" ]]; then
  step "clone depot_tools" git clone https://chromium.googlesource.com/chromium/tools/depot_tools.git "${DEPOT_TOOLS}"
fi
if [[ "$(git -C "${DEPOT_TOOLS}" rev-parse HEAD 2>/dev/null || true)" != "${DEPOT_TOOLS_COMMIT}" ]]; then
  step "fetch depot_tools" git -C "${DEPOT_TOOLS}" fetch origin
  step "pin depot_tools" git -C "${DEPOT_TOOLS}" checkout --detach "${DEPOT_TOOLS_COMMIT}"
fi
export PATH="${DEPOT_TOOLS}:${PATH}" DEPOT_TOOLS_UPDATE=0

if [[ ! -d "${SRC}/.git" ]]; then
  [[ ! -e "${CHECKOUT}/.gclient" ]] || die "${CHECKOUT}/.gclient exists without src; reconcile it by hand."
  step "create the checkout folder" mkdir -p "${CHECKOUT}"
  step "fetch Chromium for Android (no hooks)" in_dir "${CHECKOUT}" fetch --nohooks android
else
  grep -q "target_os *= *\[.*'android'" "${CHECKOUT}/.gclient" \
    || die "${CHECKOUT}/.gclient doesn't target android; this isn't the Android checkout."
  [[ -z "$(git -C "${SRC}" status --porcelain --untracked-files=no)" ]] \
    || echo "Note: ${SRC} has local edits; apply.py below accepts only pristine or Blanc-applied files."
fi

if [[ "$(git -C "${SRC}" rev-parse HEAD 2>/dev/null || true)" != "${UPSTREAM}" ]]; then
  step "fetch the pinned commit" git -C "${SRC}" fetch origin "${UPSTREAM}"
  step "check out the pinned commit" git -C "${SRC}" checkout --detach "${UPSTREAM}"
fi
step "install Android build dependencies" sudo "${SRC}/build/install-build-deps.sh" --android --no-prompt
step "sync dependencies and run hooks" in_dir "${CHECKOUT}" gclient sync -D --with_branch_heads

step "check the lane's Blanc source" python3 "${TREE}/chromium/tools/apply.py" --lane android --src "${SRC}"
step "apply the lane's Blanc source" python3 "${TREE}/chromium/tools/apply.py" --lane android --src "${SRC}" \
  --apply --backup "${EVIDENCE}/backups/apply-$(date -u +%Y%m%dT%H%M%SZ)"

step "create the evidence folder" mkdir -p "${EVIDENCE}"
for entry in "${OUTPUTS[@]}"; do
  out="${SRC}/out/${entry%%:*}"; args="${TREE}/chromium/android/args/${entry#*:}"
  if [[ -f "${out}/args.gn" ]]; then
    cmp -s "${args}" "${out}/args.gn" \
      || die "${out}/args.gn differs from ${args}; review it by hand (nothing was overwritten)."
    continue
  fi
  step "create ${entry%%:*}" mkdir -p "${out}"
  step "write ${entry%%:*}/args.gn" cp "${args}" "${out}/args.gn"
  step "generate ${entry%%:*}" in_dir "${SRC}" gn gen "out/${entry%%:*}"
done
(( dry_run )) && echo "Dry run complete; nothing changed." || echo "Bootstrap complete."

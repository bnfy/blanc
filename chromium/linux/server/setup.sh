#!/usr/bin/env bash
# Applies the desktop lane's Blanc source and generates the selected Linux
# output in the server's existing desktop checkout (the one the Windows build
# uses), under the shared checkout lock:
#
#   bash chromium/linux/server/setup.sh --dry-run                 # print the plan, change nothing
#   bash chromium/linux/server/setup.sh --windows-release-idle    # run it
#   bash chromium/linux/server/setup.sh --windows-release-idle --install-arm64-sysroot
#   bash chromium/linux/server/setup.sh --windows-release-idle --out=BlancLinuxArm64Prototype
#   bash chromium/linux/server/setup.sh --windows-release-idle --out=BlancLinuxBeta --build=905
#
# It never syncs, runs hooks or installs packages. It records both Windows
# outputs' build plans before and after, so a change to what Windows would
# rebuild is visible. Layout and rules: README.md beside this file.
set -euo pipefail

CHECKOUT="${HOME}/chromium-desktop"
SRC="${CHECKOUT}/src"
LOCK="${CHECKOUT}/.blanc-checkout.lock"
APPLIED="${CHECKOUT}/.blanc-applied-source-map.json"
NODE="${SRC}/third_party/node/linux/node-linux-x64/bin/node"
TREE="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
LANE="${TREE}/chromium/lanes/desktop.json"
EVIDENCE="${HOME}/blanc-evidence/linux"
WINDOWS_OUTPUTS=(BlancWinPrototype BlancWinBeta)

die() { echo "setup: $*" >&2; exit 1; }
dry_run=0
windows_release_idle=0
install_arm64_sysroot=0
out_name=
build=
for arg in "$@"; do
  case "${arg}" in
    --dry-run) dry_run=1 ;;
    --windows-release-idle) windows_release_idle=1 ;;
    --install-arm64-sysroot) install_arm64_sysroot=1 ;;
    --out=BlancLinuxPrototype|--out=BlancLinuxArm64Prototype|--out=BlancLinuxBeta|--out=BlancLinuxArm64Beta)
      [[ -z "${out_name}" ]] || die "choose only one --out."
      out_name="${arg#--out=}" ;;
    --build=*)
      [[ -z "${build}" && "${arg#--build=}" =~ ^[1-9][0-9]{0,3}$ ]] || die "use one --build=N (1..9999)."
      build="${arg#--build=}" ;;
    *) echo "Usage: setup.sh [--dry-run] [--windows-release-idle] [--out=BlancLinuxPrototype|BlancLinuxArm64Prototype|BlancLinuxBeta|BlancLinuxArm64Beta] [--build=N] [--install-arm64-sysroot]" >&2; exit 2 ;;
  esac
done
if (( install_arm64_sysroot )); then
  out_name="${out_name:-BlancLinuxArm64Prototype}"
  [[ "${out_name}" == BlancLinuxArm64* ]] || die "--install-arm64-sysroot requires an arm64 output."
fi
out_name="${out_name:-BlancLinuxPrototype}"
arch=x64
[[ "${out_name}" != BlancLinuxArm64* ]] || arch=arm64
channel=prototype
if [[ "${out_name}" == *Beta ]]; then
  channel=beta
  [[ -n "${build}" ]] || die "a beta output requires --build=N."
elif [[ -n "${build}" ]]; then
  die "--build=N is only valid for a beta output."
fi
ARGS="${TREE}/chromium/linux/args/${channel}-${arch}.gn"
OUT="${SRC}/out/${out_name}"

in_dir() { local dir="$1"; shift; (cd "${dir}" && "$@"); }
step() {
  local what="$1"; shift
  if (( dry_run )); then printf 'would %s:' "${what}"; printf ' %q' "$@"; printf '\n'
  else echo "== ${what}"; "$@"; fi
}
require_idle_build() {
  if pgrep -f '[s]iso ninja' >/dev/null; then
    die "a Siso build is running; wait for it to finish."
  else
    [[ $? == 1 ]] || die "cannot check for a running Siso build."
  fi
}

[[ "$(uname -s)" == Linux && "$(uname -m)" == x86_64 ]] || die "setup runs only on x86-64 Linux."
(( EUID != 0 )) || die "run as the build user (blanc), not root."
(( dry_run || windows_release_idle )) || die "confirm the Windows release is idle with --windows-release-idle."
UPSTREAM="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["upstream"])' "${LANE}")"
[[ "${UPSTREAM}" =~ ^[0-9a-f]{40}$ ]] || die "lane upstream is not a full commit: ${UPSTREAM}"
[[ -r "${CHECKOUT}/.blanc-synced" && "$(awk 'NR == 1 {print $1; exit}' "${CHECKOUT}/.blanc-synced")" == "${UPSTREAM}" ]] \
  || die "the checkout is not synced to ${UPSTREAM}; run the Windows bootstrap first."
[[ -d "${SRC}/build/linux/debian_bullseye_amd64-sysroot" ]] || die "amd64 sysroot missing; a hooks run is needed; ask the owner."
require_idle_build
[[ ! -e "${LOCK}" ]] || die "the desktop checkout is locked: ${LOCK}"
export PATH="${HOME}/depot_tools-desktop:${PATH}" DEPOT_TOOLS_UPDATE=0 DEPOT_TOOLS_METRICS=0
stamp="$(date -u +%Y%m%dT%H%M%S%NZ)"
plans="${EVIDENCE}/plans"
declare -A missing_plan=()

# The guard can refuse before it opens the log. Keep the whole file even then,
# but distinguish that older plan from one written by this check.
plan_version() { if [[ -f "$1" ]]; then stat -c '%i %y %z' "$1"; fi; }
snapshot_windows() {
  local phase="$1" output plan saved previous_version message status
  for output in "${WINDOWS_OUTPUTS[@]}"; do
    plan="${SRC}/out/${output}/blanc-build-plan.log"
    saved="${plans}/${stamp}-${phase}-${output}.log"
    previous_version="$(plan_version "${plan}")"
    status=0
    message="$(step "check ${output}" "${NODE}" "${TREE}/chromium/tools/build.mjs" "${SRC}" --check "--out=${output}" 2>&1)" || status=$?
    printf '%s\n' "${message}"
    if (( dry_run )) || [[ -f "${plan}" ]]; then
      step "save the ${phase} plan" cp "${plan}" "${saved}"
    fi
    (( dry_run )) && continue
    if [[ "$(plan_version "${plan}")" == "${previous_version}" || ! -f "${plan}" ]]; then
      missing_plan[${output}]=1
      printf '\nNo fresh plan from this check.\n' >> "${saved}"
    fi
    if (( status != 0 )); then
      printf '\nWindows guard exited %d:\n%s\n' "${status}" "${message}" >> "${saved}"
    fi
  done
}

(( dry_run )) && echo "Dry run: nothing below is executed."
step "create the plan evidence folder" mkdir -p "${plans}"
snapshot_windows before

# Scope the EXIT trap to this subshell. The after checks need to take the
# same lock themselves, and only the process that acquired it may remove it.
(
  step "acquire the desktop checkout lock" mkdir "${LOCK}" || die "cannot acquire ${LOCK}."
  trap 'step "release the desktop checkout lock" rmdir "${LOCK}"' EXIT
  trap 'exit 1' HUP INT TERM
  require_idle_build
  if (( install_arm64_sysroot )); then
    step "install the pinned arm64 sysroot" python3 "${SRC}/build/linux/sysroot_scripts/install-sysroot.py" --arch=arm64
  elif [[ "${arch}" == arm64 && ! -s "${SRC}/build/linux/debian_bullseye_arm64-sysroot/.stamp" ]]; then
    die "arm64 sysroot .stamp missing or empty; use --install-arm64-sysroot."
  fi
  previous=()
  [[ -f "${APPLIED}" ]] && previous=(--previous-map "${APPLIED}")
  step "check the lane's Blanc source" python3 "${TREE}/chromium/tools/apply.py" --lane desktop --src "${SRC}" "${previous[@]}"
  step "apply the lane's Blanc source" python3 "${TREE}/chromium/tools/apply.py" --lane desktop --src "${SRC}" "${previous[@]}" \
    --apply --backup "${EVIDENCE}/backups/apply-${stamp}"
  step "record what was applied" python3 -c 'import json,sys; t=sys.argv[1]; l=json.load(open(t+"/chromium/lanes/desktop.json")); m=json.load(open(t+"/chromium/"+l["sourceMap"])); json.dump({"upstream":m["upstream"],"upstreamFiles":m["upstreamFiles"],"canonicalSha256":m["canonicalSha256"]},open(sys.argv[2],"w"),indent=2)' "${TREE}" "${APPLIED}"
  if [[ "${channel}" == beta ]]; then
    step "create ${out_name}" mkdir -p "${OUT}"
    step "set beta build ${build}" "${NODE}" "${TREE}/chromium/release/beta-args.mjs" "--build=${build}" "${ARGS}" "${OUT}/args.gn"
  elif [[ -f "${OUT}/args.gn" ]]; then
    cmp -s "${ARGS}" "${OUT}/args.gn" || die "${OUT}/args.gn differs from ${ARGS}; review it by hand (nothing was overwritten)."
  else
    step "create ${out_name}" mkdir -p "${OUT}"
    step "write ${out_name}/args.gn" cp "${ARGS}" "${OUT}/args.gn"
  fi
  step "generate ${out_name}" in_dir "${SRC}" gn gen "out/${out_name}"
)

snapshot_windows after
# Compare the sorted before/after plan lines, ignoring Siso's progress counters
# so a reordered action alone doesn't show up as a changed target.
sorted_plan() { LC_ALL=C sed -E 's/^\[[0-9]+\/[0-9]+\][[:space:]]*//' "$1" | LC_ALL=C sort; }
compare_plans() {
  diff -u --label "$1" --label "$2" <(sorted_plan "$1") <(sorted_plan "$2") || [[ $? == 1 ]]
}
for output in "${WINDOWS_OUTPUTS[@]}"; do
  if [[ -n "${missing_plan[${output}]:-}" ]]; then
    echo "${output}: cannot compare targets without two fresh plans. See ${plans}/${stamp}-*-${output}.log."
  else
    step "compare ${output} targets" compare_plans "${plans}/${stamp}-before-${output}.log" "${plans}/${stamp}-after-${output}.log"
  fi
done
(( dry_run )) && echo "Dry run complete; nothing changed." || echo "Linux setup complete."

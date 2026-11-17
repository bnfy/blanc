#!/usr/bin/env bash
# Sets up the desktop lane's Windows cross-build checkout on the build server,
# idempotently.
#
#   bash chromium/windows/server/bootstrap.sh --dry-run   # print the plan, change nothing
#   bash chromium/windows/server/bootstrap.sh             # run it (owner-approved, W0)
#
# Each run does only what is missing: its own depot_tools at a pinned commit,
# a checkout at the desktop lane's pinned Chromium commit with Windows
# dependencies, the Visual Studio package gclient unpacks, the lane's Blanc
# source, and the Windows output folder. It never touches the Android lane's
# checkout or depot_tools, never deletes an output folder and never overwrites
# an args.gn that differs from the tree's; it stops instead.
# Layout: README.md beside this file.
set -euo pipefail

# The Mac Studio's depot_tools commit, so both desktop builds use one version.
DEPOT_TOOLS_COMMIT=382c208a9973e1a6c0867b6d8664dc6dc9116e30
DEPOT_TOOLS="${HOME}/depot_tools-desktop"
CHECKOUT="${HOME}/chromium-desktop"
SRC="${CHECKOUT}/src"
EVIDENCE="${HOME}/blanc-evidence/windows"
# The packaged Visual Studio and Windows SDK (<name>.zip), made once per pin by
# .github/workflows/chromium-windows-toolchain.yml and decrypted here by hand.
TOOLCHAIN="${HOME}/blanc-assets/win-toolchain"
TREE="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
LANE="${TREE}/chromium/lanes/desktop.json"
OUTPUTS=("BlancWinPrototype:prototype-x64.gn")

dry_run=0
for arg in "$@"; do
  case "${arg}" in
    --dry-run) dry_run=1 ;;
    *) echo "Usage: bootstrap.sh [--dry-run]" >&2; exit 2 ;;
  esac
done

die() { echo "bootstrap: $*" >&2; exit 1; }
in_dir() { local dir="$1"; shift; (cd "${dir}" && "$@"); }
# The checkout's .gclient: Chromium at the lane's pin, with Windows' deps.
write_gclient() {
  cat > "${CHECKOUT}/.gclient" <<GCLIENT
solutions = [{"name": "src", "url": "https://chromium.googlesource.com/chromium/src.git@${UPSTREAM}",
              "managed": False, "custom_deps": {}, "custom_vars": {}}]
target_os = ['win']
GCLIENT
}
# Runs a planned action, or only prints it in a dry run.
step() {
  local what="$1"; shift
  if (( dry_run )); then printf 'would %s:' "${what}"; printf ' %q' "$@"; printf '\n'
  else echo "== ${what}"; "$@"; fi
}

[[ "$(uname -s)" == Linux && "$(uname -m)" == x86_64 ]] \
  || die "the Windows cross build runs only on x86-64 Linux (this is $(uname -s) $(uname -m))."
(( EUID != 0 )) || die "run as the build user, not root; the script asks sudo for packages."
[[ -f "${LANE}" ]] || die "no lane pin at ${LANE}."
UPSTREAM="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["upstream"])' "${LANE}")"
[[ "${UPSTREAM}" =~ ^[0-9a-f]{40}$ ]] || die "lane upstream is not a full commit: ${UPSTREAM}"
(( dry_run )) && echo "Dry run: nothing below is executed."
echo "Lane pin: ${UPSTREAM}"

# Exactly one package may be staged: gclient is told its name, so a second
# zip left beside it would be a silent choice.
shopt -s nullglob
packages=("${TOOLCHAIN}"/*.zip)
shopt -u nullglob
if (( ${#packages[@]} > 1 )); then
  die "expected one Visual Studio package (<name>.zip) in ${TOOLCHAIN}, found ${#packages[@]}; see README.md."
elif (( ${#packages[@]} == 0 )); then
  # The source can be fetched before the package exists; the run stops at the
  # step that needs it.
  echo "Note: no Visual Studio package in ${TOOLCHAIN} yet; this run stops after fetching the source."
  package_name=MISSING
else
  package_name="$(basename "${packages[0]}" .zip)"
  [[ "${package_name}" =~ ^[0-9a-f]{10,40}$ ]] || die "unexpected package name: ${package_name}.zip"
fi

for tool in git python3 curl file; do
  command -v "${tool}" >/dev/null || step "install ${tool}" sudo apt-get install -y "${tool}"
done

if [[ ! -d "${DEPOT_TOOLS}/.git" ]]; then
  step "clone depot_tools" git clone https://chromium.googlesource.com/chromium/tools/depot_tools.git "${DEPOT_TOOLS}"
fi
if [[ "$(git -C "${DEPOT_TOOLS}" rev-parse HEAD 2>/dev/null || true)" != "${DEPOT_TOOLS_COMMIT}" ]]; then
  step "fetch depot_tools" git -C "${DEPOT_TOOLS}" fetch origin
  step "pin depot_tools" git -C "${DEPOT_TOOLS}" checkout --detach "${DEPOT_TOOLS_COMMIT}"
fi
export PATH="${DEPOT_TOOLS}:${PATH}" DEPOT_TOOLS_UPDATE=0 DEPOT_TOOLS_METRICS=0
# With updates off, depot_tools never initializes itself; do it once.
if [[ ! -f "${DEPOT_TOOLS}/python3_bin_reldir.txt" ]]; then
  step "initialize depot_tools" "${DEPOT_TOOLS}/ensure_bootstrap"
fi

if [[ ! -d "${SRC}/.git" ]]; then
  [[ ! -e "${CHECKOUT}/.gclient" ]] || die "${CHECKOUT}/.gclient exists without src; reconcile it by hand."
  step "create the checkout folder" mkdir -p "${CHECKOUT}"
  step "write the .gclient" write_gclient
  # Only the pinned commit, not Chromium's history (as on the Android lane).
  step "fetch Chromium at the pin (no history, no hooks)" \
    in_dir "${CHECKOUT}" gclient sync --nohooks --no-history --revision "src@${UPSTREAM}"
else
  grep -q "target_os *= *\[.*'win'" "${CHECKOUT}/.gclient" \
    || die "${CHECKOUT}/.gclient doesn't target win; this isn't the Windows cross-build checkout."
  [[ -z "$(git -C "${SRC}" status --porcelain --untracked-files=no)" ]] \
    || echo "Note: ${SRC} has local edits; apply.py below accepts only pristine or Blanc-applied files."
fi

if [[ "${package_name}" == MISSING ]] && (( ! dry_run )); then
  die "the source is fetched; stage the Visual Studio package in ${TOOLCHAIN} (README.md) and run this again."
fi
step "install Linux build dependencies" sudo "${SRC}/build/install-build-deps.sh" --no-prompt
# gclient's hook unpacks the Visual Studio package named by GYP_MSVS_HASH_<the
# tree's toolchain hash> from the folder in DEPOT_TOOLS_WIN_TOOLCHAIN_BASE_URL
# (Chromium's docs/win_cross.md). The tree's hash is read from the checkout.
toolchain_hash() { sed -n "s/^TOOLCHAIN_HASH = '\([0-9a-f]*\)'$/\1/p" "${SRC}/build/vs_toolchain.py"; }
# Once synced, src carries Blanc's applied source, which gclient refuses to
# sync over; a marker records the pin the dependencies were synced for.
SYNCED="${CHECKOUT}/.blanc-synced"
if [[ "$(cat "${SYNCED}" 2>/dev/null || true)" != "${UPSTREAM} ${package_name}" ]]; then
  if (( dry_run )) && [[ ! -f "${SRC}/build/vs_toolchain.py" ]]; then
    tree_hash=TREE_HASH
  else
    tree_hash="$(toolchain_hash)"
    [[ "${tree_hash}" =~ ^[0-9a-f]{10}$ ]] || die "cannot read TOOLCHAIN_HASH from ${SRC}/build/vs_toolchain.py."
  fi
  step "sync dependencies at the pin and run hooks" \
    env "DEPOT_TOOLS_WIN_TOOLCHAIN_BASE_URL=${TOOLCHAIN}" "GYP_MSVS_HASH_${tree_hash}=${package_name}" \
    bash -c 'cd "$1" && gclient sync -D --no-history --revision "src@$2"' _ "${CHECKOUT}" "${UPSTREAM}"
  step "record the synced pin" bash -c 'echo "$1" > "$2"' _ "${UPSTREAM} ${package_name}" "${SYNCED}"
fi
# The hook above serves the package through a ciopfs mount that inherits a
# 1024 open-file limit, too few for a parallel build; and the mount is gone
# after a reboot. Mount it if needed and raise its limit.
step "mount the toolchain with a build-sized open-file limit" bash "${TREE}/chromium/windows/server/mount-toolchain.sh"

# What the last run applied, so apply.py accepts its own earlier output when a
# patch changes (and still refuses edits it doesn't recognize).
APPLIED="${CHECKOUT}/.blanc-applied-source-map.json"
previous=()
[[ -f "${APPLIED}" ]] && previous=(--previous-map "${APPLIED}")
step "check the lane's Blanc source" python3 "${TREE}/chromium/tools/apply.py" --lane desktop --src "${SRC}" "${previous[@]}"
step "apply the lane's Blanc source" python3 "${TREE}/chromium/tools/apply.py" --lane desktop --src "${SRC}" "${previous[@]}" \
  --apply --backup "${EVIDENCE}/backups/apply-$(date -u +%Y%m%dT%H%M%SZ)"
step "record what was applied" python3 -c 'import json,sys; t=sys.argv[1]; l=json.load(open(t+"/chromium/lanes/desktop.json")); m=json.load(open(t+"/chromium/"+l["sourceMap"])); json.dump({"upstream":m["upstream"],"upstreamFiles":m["upstreamFiles"],"canonicalSha256":m["canonicalSha256"]},open(sys.argv[2],"w"),indent=2)' "${TREE}" "${APPLIED}"

step "create the evidence folder" mkdir -p "${EVIDENCE}"
for entry in "${OUTPUTS[@]}"; do
  out="${SRC}/out/${entry%%:*}"; args="${TREE}/chromium/windows/args/${entry#*:}"
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

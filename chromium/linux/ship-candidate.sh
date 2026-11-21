#!/usr/bin/env bash
# Takes a packaged Linux candidate from the build server to GitHub, from the
# operator's Mac (the server holds no GitHub credential):
#
#   bash chromium/linux/ship-candidate.sh blanc@SERVER ~/blanc-evidence/linux/candidate-1 [~/.ssh/key]
#
# The tarball becomes the one asset of a reused, unpublished draft release,
# which only repository collaborators can read. It is never published. Prints
# the command that runs it on a hosted Linux runner.
set -euo pipefail
DRAFT_TAG=fork-linux-candidate
ASSET=blanc-linux-candidate.tar.gz
REPO=bnfy/blanc

[[ $# -ge 2 && $# -le 3 ]] || { echo "Usage: ship-candidate.sh USER@SERVER REMOTE_FOLDER [SSH_KEY]" >&2; exit 2; }
server="$1"; remote="$2"; key="${3:-}"
ssh_opts=(-o BatchMode=yes -o ConnectTimeout=15)
[[ -z "${key}" ]] || ssh_opts+=(-i "${key}" -o IdentitiesOnly=yes)
die() { echo "ship-candidate: $*" >&2; exit 1; }

work="$(mktemp -d)"; trap 'rm -rf "${work}"' EXIT
scp -q "${ssh_opts[@]}" -- "${server}:${remote}/package.json" "${work}/package.json"
expected="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["tarSha256"])' "${work}/package.json")"
candidate="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["id"])' "${work}/package.json")"
[[ "${expected}" =~ ^[0-9a-f]{64}$ && "${candidate}" =~ ^linux-x64-[0-9a-f]{16}$ ]] || die "unexpected package record."
scp -q "${ssh_opts[@]}" -- "${server}:${remote}/${ASSET}" "${work}/${ASSET}"
actual="$(shasum -a 256 "${work}/${ASSET}" | cut -d' ' -f1)"
[[ "${actual}" == "${expected}" ]] || die "tarball SHA-256 mismatch: expected ${expected}, got ${actual}."

state="$(gh release view "${DRAFT_TAG}" --repo "${REPO}" --json isDraft --jq .isDraft 2>/dev/null || echo missing)"
case "${state}" in
  true) ;;
  missing) gh release create "${DRAFT_TAG}" --repo "${REPO}" --draft --title "Fork Linux candidate (private transfer, never published)" \
             --notes "Carries the Linux preview build to chromium-linux-candidate.yml. Keep this release in draft." ;;
  *) die "${DRAFT_TAG} is published; refusing upload." ;;
esac
gh release upload "${DRAFT_TAG}" "${work}/${ASSET}" --repo "${REPO}" --clobber
echo "Uploaded ${candidate} (${actual})."
echo "Run it: gh workflow run chromium-linux-candidate.yml --repo ${REPO} --ref chromium/next -f sha256=${actual}"

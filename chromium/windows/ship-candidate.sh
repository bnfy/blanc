#!/usr/bin/env bash
# Takes a packaged Windows candidate from the build server to GitHub, from the
# operator's Mac (the server holds no GitHub credential):
#
#   bash chromium/windows/ship-candidate.sh blanc@SERVER ~/blanc-evidence/windows/candidate-1 [~/.ssh/key]
#
# The zip becomes the one asset of a reused, unpublished draft release, which
# only repository collaborators can read. It is never published. Prints the
# command that runs it on a hosted Windows runner.
set -euo pipefail
DRAFT_TAG=fork-windows-candidate
ASSET=blanc-windows-candidate.zip
REPO=bnfy/blanc

[[ $# -ge 2 && $# -le 3 ]] || { echo "Usage: ship-candidate.sh USER@SERVER REMOTE_FOLDER [SSH_KEY]" >&2; exit 2; }
server="$1"; remote="$2"; key="${3:-}"
ssh_opts=(-o BatchMode=yes -o ConnectTimeout=15)
[[ -z "${key}" ]] || ssh_opts+=(-i "${key}" -o IdentitiesOnly=yes)
die() { echo "ship-candidate: $*" >&2; exit 1; }

work="$(mktemp -d)"; trap 'rm -rf "${work}"' EXIT
scp -q "${ssh_opts[@]}" "${server}:${remote}/package.json" "${work}/package.json"
expected="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["zipSha256"])' "${work}/package.json")"
candidate="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["id"])' "${work}/package.json")"
[[ "${expected}" =~ ^[0-9a-f]{64}$ && "${candidate}" =~ ^windows-x64-[0-9a-f]{16}$ ]] || die "unexpected package record."
scp -q "${ssh_opts[@]}" "${server}:${remote}/${ASSET}" "${work}/${ASSET}"
actual="$(shasum -a 256 "${work}/${ASSET}" | cut -d' ' -f1)"
[[ "${actual}" == "${expected}" ]] || die "the copied zip is ${actual}, not ${expected}."

# Only ever a draft: refuse to touch a release of this name that was published.
state="$(gh release view "${DRAFT_TAG}" --repo "${REPO}" --json isDraft --jq .isDraft 2>/dev/null || echo missing)"
case "${state}" in
  true) ;;
  missing) gh release create "${DRAFT_TAG}" --repo "${REPO}" --draft --title "Fork Windows candidate (private transfer, never published)" \
             --notes "Carries the current cross-compiled Windows preview build to chromium-windows-candidate.yml. A draft, visible to collaborators only. Never publish it." ;;
  *) die "${DRAFT_TAG} exists and is not a draft; nothing uploaded." ;;
esac
gh release upload "${DRAFT_TAG}" "${work}/${ASSET}" --repo "${REPO}" --clobber
echo "Uploaded ${candidate} (${actual})."
echo "Run it: gh workflow run chromium-windows-candidate.yml --repo ${REPO} --ref chromium/next -f sha256=${actual}"

#!/usr/bin/env bash
# Takes a packaged Windows candidate from the build server to GitHub, under the
# draft's hold (BLANC_DRAFT_HOLD_OWNER), from the
# operator's Mac (the server holds no GitHub credential):
#
#   bash chromium/windows/ship-candidate.sh blanc@SERVER ~/blanc-evidence/windows/candidate-1 [~/.ssh/key]
#
# The zip becomes the one asset of a reused, unpublished draft release, which
# only repository collaborators can read. It is never published. Prints the
# command that runs it on a hosted Windows runner.
set -euo pipefail
DRAFT_TAG="${BLANC_CANDIDATE_DRAFT:-fork-windows-candidate}"
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

# Only under the draft's hold (chromium/windows/draft-hold.mjs): take one with
# `node chromium/windows/draft-hold.mjs acquire-manual "<note>"`, set
# BLANC_DRAFT_HOLD_OWNER to the token it prints, and release it afterwards.
[[ -n "${BLANC_DRAFT_HOLD_OWNER:-}" ]] || die "set BLANC_DRAFT_HOLD_OWNER to a hold you took with draft-hold.mjs acquire-manual."
node "$(dirname "$0")/draft-hold.mjs" upload "${work}/${ASSET}" "${ASSET}"
echo "Uploaded ${candidate} (${actual})."
echo "Run it: gh workflow run chromium-windows-candidate.yml --repo ${REPO} --ref chromium/next -f sha256=${actual} -f draft_tag=${DRAFT_TAG}"

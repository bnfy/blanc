#!/usr/bin/env bash
# Takes a packaged Linux candidate from the build server to GitHub, from the
# operator's Mac (the server holds no GitHub credential):
#
#   bash chromium/linux/ship-candidate.sh blanc@SERVER ~/blanc-evidence/linux/candidate-1 [~/.ssh/key]
#
# Preview assets are per architecture and beta assets are per architecture and
# build. All use the same private transfer draft.
set -euo pipefail
DRAFT_TAG=fork-linux-candidate
REPO=bnfy/blanc

[[ $# -ge 2 && $# -le 3 ]] || { echo "Usage: ship-candidate.sh USER@SERVER REMOTE_FOLDER [SSH_KEY]" >&2; exit 2; }
server="$1"; remote="$2"; key="${3:-}"
ssh_opts=(-o BatchMode=yes -o ConnectTimeout=15)
[[ -z "${key}" ]] || ssh_opts+=(-i "${key}" -o IdentitiesOnly=yes)
die() { echo "ship-candidate: $*" >&2; exit 1; }

work="$(mktemp -d)"; trap 'rm -rf "${work}"' EXIT
scp -q "${ssh_opts[@]}" -- "${server}:${remote}/package.json" "${work}/package.json"
here=$(cd "$(dirname "$0")" && pwd -P)
fields=$(node --input-type=module - "$here/candidate.mjs" "$work/package.json" <<'JS'
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
const [module, file] = process.argv.slice(2);
const {ASSET_NAME, candidateId} = await import(pathToFileURL(module));
const record = JSON.parse(fs.readFileSync(file));
const {id, arch = 'x64', channel = 'preview', build, exeSha256, tarSha256} = record;
if (id !== candidateId(exeSha256, arch) || !/^[0-9a-f]{64}$/.test(tarSha256)) throw Error('Unexpected package record');
const legacy = channel === 'preview' && arch === 'x64' && !Object.hasOwn(record, 'packages');
console.log(arch, id, tarSha256, legacy ? 'blanc-linux-candidate.tar.gz' : ASSET_NAME(arch, channel, build), record.packages?.length === 2, channel);
JS
)
read -r arch candidate expected asset packaged channel <<< "$fields"
scp -q "${ssh_opts[@]}" -- "${server}:${remote}/${asset}" "${work}/${asset}"
actual="$(shasum -a 256 "${work}/${asset}" | cut -d' ' -f1)"
[[ "${actual}" == "${expected}" ]] || die "tarball SHA-256 mismatch: expected ${expected}, got ${actual}."

state="$(gh release view "${DRAFT_TAG}" --repo "${REPO}" --json isDraft --jq .isDraft 2>/dev/null || echo missing)"
case "${state}" in
  true) ;;
  missing) gh release create "${DRAFT_TAG}" --repo "${REPO}" --draft --title "Fork Linux candidate (private transfer, never published)" \
             --notes "Private transfer of Linux candidates. Keep this release in draft." ;;
  *) die "${DRAFT_TAG} is published; refusing upload." ;;
esac
source "$here/owner/repository-common.sh"
with_candidate_lock "$DRAFT_TAG" "$REPO" "$arch" gh release upload "$DRAFT_TAG" "$work/$asset" --repo "$REPO" --clobber
echo "Uploaded ${asset} for ${candidate} (${actual})."
[[ $channel == preview ]] || exit 0
echo "Run it: gh workflow run chromium-linux-candidate.yml --repo ${REPO} --ref chromium/next -f arch=${arch} -f sha256=${actual}"
if [[ $packaged == true ]]; then
  echo "Sign it: chromium/linux/owner/sign-candidate.command ${arch} ${actual}"
else
  echo "Runtime-only candidate. Signing and install checks need both DEB and RPM from a build with the owner's committed repository key."
fi

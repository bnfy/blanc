#!/bin/sh
# Prints "true" when this pull_request event is a push whose commits, since
# the PR's last head that this workflow passed on, change only the Chromium
# fork's own work (chromium/, its experiment folder) or documentation, and
# "false" otherwise. Desktop and iOS jobs skip such pushes: nothing they build
# or test changed since a run that passed them (owner direction, November 1,
# 2026, after fork-only pushes kept re-running every desktop job on
# bnfy/blanc#1028).
# That run must have concluded success: one that a newer push cancelled, that
# failed or that is still going never ran the jobs (bnfy/blanc#1542, November
# 15, 2026, skipped every Electron job after its earlier runs were cancelled).
# A successful run either ran them or was a skip that passed this same check,
# so the trust chains back to a full run. Fails closed: a new PR, a reopen, no
# passing run among this head's ancestors, an unreadable API or any other path
# prints "false".
# Inputs: EVENT_NAME, EVENT_ACTION, AFTER (the PR head SHA), HEAD_REF (the PR's
# branch), GITHUB_REPOSITORY and GITHUB_WORKFLOW_REF (set by Actions),
# GH_TOKEN with actions: read; GH overrides the gh command (tests).
set -u
no() { echo false; exit 0; }
[ "${EVENT_NAME:-}" = pull_request ] && [ "${EVENT_ACTION:-}" = synchronize ] || no
[ -n "${AFTER:-}" ] && [ -n "${HEAD_REF:-}" ] || no
repo=${GITHUB_REPOSITORY:-}
[ -n "$repo" ] || no
workflow=${GITHUB_WORKFLOW_REF:-}
workflow=${workflow#"$repo"/}
workflow=${workflow%%@*}
case "$workflow" in .github/workflows/*.yml|.github/workflows/*.yaml) ;; *) no ;; esac
# This workflow's passing pull-request runs on the PR's branch, newest first.
passed=$(${GH:-gh} api -X GET "repos/$repo/actions/workflows/${workflow##*/}/runs" -f event=pull_request \
  -f status=success -f branch="$HEAD_REF" -f per_page=30 --jq '.workflow_runs[].head_sha' 2>/dev/null) || no
# A shallow checkout (parity-guards keeps two levels) hides the ancestry, so the
# head comes with enough history to hold the earlier heads.
git fetch -q --no-tags --filter=blob:none --depth=1000 origin "$AFTER" 2>/dev/null || no
base=
for sha in $passed; do
  [ "$sha" != "$AFTER" ] || continue
  if git merge-base --is-ancestor "$sha" "$AFTER" 2>/dev/null; then base=$sha; break; fi
done
[ -n "$base" ] || { echo "no passing run on an earlier head" >&2; no; }
changed=$(git -c core.quotePath=false diff --name-only --no-renames "$base" "$AFTER") || no
[ -n "$changed" ] || no
outside=$(printf '%s\n' "$changed" | grep -v -E '^(chromium|experiments/chromium-extension-spike|docs)/' | head -1)
[ -z "$outside" ] || { echo "outside the fork since ${base}: $outside" >&2; no; }
echo true

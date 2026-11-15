#!/bin/sh
# Prints "true" when this pull_request event is a push whose new commits change
# only the Chromium fork's own work (chromium/, its experiment folder) or
# documentation, and "false" otherwise. Desktop and iOS jobs skip such pushes:
# nothing they build or test changed since the PR's previous run, which ran
# them (owner direction, November 1, 2026, after fork-only pushes kept
# re-running every desktop job on bnfy/blanc#1028). Fails closed: a new PR, a
# reopen, a force push, a missing commit or any other path prints "false".
# The previous head's run of the same workflow must also have finished with
# success: a run that a newer push cancelled, that failed or that is still
# going never ran the jobs this push would skip (seen on bnfy/blanc#1542,
# November 15, 2026). A successful run either ran them or was itself a
# skip that passed this same check, so the trust chains back to a full run.
# Inputs: EVENT_NAME, EVENT_ACTION, BEFORE, AFTER (github.event.before and the
# PR head SHA), GITHUB_REPOSITORY and GITHUB_WORKFLOW_REF (set by Actions),
# GH_TOKEN with actions: read; GH overrides the gh command (tests).
set -u
no() { echo false; exit 0; }
[ "${EVENT_NAME:-}" = pull_request ] && [ "${EVENT_ACTION:-}" = synchronize ] || no
case "${BEFORE:-}" in ''|0000000000000000000000000000000000000000) no ;; esac
[ -n "${AFTER:-}" ] || no
# A shallow checkout (parity-guards keeps two levels) hides the ancestry the
# fast-forward check needs, so both commits come with enough history.
git fetch -q --no-tags --filter=blob:none --depth=1000 origin "$BEFORE" "$AFTER" 2>/dev/null || no
git merge-base --is-ancestor "$BEFORE" "$AFTER" 2>/dev/null || no
changed=$(git -c core.quotePath=false diff --name-only --no-renames "$BEFORE" "$AFTER") || no
[ -n "$changed" ] || no
outside=$(printf '%s\n' "$changed" | grep -v -E '^(chromium|experiments/chromium-extension-spike|docs)/' | head -1)
[ -z "$outside" ] || { echo "outside the fork: $outside" >&2; no; }
repo=${GITHUB_REPOSITORY:-}
[ -n "$repo" ] || no
workflow=${GITHUB_WORKFLOW_REF:-}
workflow=${workflow#"$repo"/}
workflow=${workflow%%@*}
case "$workflow" in .github/workflows/*.yml|.github/workflows/*.yaml) ;; *) no ;; esac
previous=$(${GH:-gh} api "repos/$repo/actions/workflows/${workflow##*/}/runs?head_sha=$BEFORE&event=pull_request&per_page=1" \
  --jq '.workflow_runs[0].conclusion // ""' 2>/dev/null) || no
[ "$previous" = success ] || { echo "previous run: ${previous:-none or unfinished}" >&2; no; }
echo true

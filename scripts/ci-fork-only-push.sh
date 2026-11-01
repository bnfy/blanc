#!/bin/sh
# Prints "true" when this pull_request event is a push whose new commits change
# only the Chromium fork's own work (chromium/, its experiment folder) or
# documentation, and "false" otherwise. Desktop and iOS jobs skip such pushes:
# nothing they build or test changed since the PR's previous run, which ran
# them (owner direction, November 1, 2026, after fork-only pushes kept
# re-running every desktop job on bnfy/blanc#1028). Fails closed: a new PR, a
# reopen, a force push, a missing commit or any other path prints "false".
# Inputs: EVENT_NAME, EVENT_ACTION, BEFORE, AFTER (github.event.before and the
# PR head SHA).
set -u
no() { echo false; exit 0; }
[ "${EVENT_NAME:-}" = pull_request ] && [ "${EVENT_ACTION:-}" = synchronize ] || no
case "${BEFORE:-}" in ''|0000000000000000000000000000000000000000) no ;; esac
[ -n "${AFTER:-}" ] || no
git fetch -q --no-tags --filter=blob:none origin "$BEFORE" "$AFTER" 2>/dev/null || no
git merge-base --is-ancestor "$BEFORE" "$AFTER" 2>/dev/null || no
changed=$(git -c core.quotePath=false diff --name-only --no-renames "$BEFORE" "$AFTER") || no
[ -n "$changed" ] || no
outside=$(printf '%s\n' "$changed" | grep -v -E '^(chromium|experiments/chromium-extension-spike|docs)/' | head -1)
[ -z "$outside" ] || { echo "outside the fork: $outside" >&2; no; }
echo true

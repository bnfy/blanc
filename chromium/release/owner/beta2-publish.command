#!/bin/bash
# Blanc Beta 2.0.0-beta.2: release stages "sigstore", "publish" and "verify-public"
# (docs/chromium-beta-release.md §7–8). Uses the checksum-verified cosign v3.1.3 copy
# (from the release Mac's Homebrew) for this run only; nothing is installed.
# sigstore: Safari opens for the GitHub sign-in; approve it right away.
# publish: asks you to type a confirmation, then makes the pre-release public (not latest).
# verify-public: downloads every public asset logged out and checks them all.
set -uo pipefail
cd "$HOME/Projects/Blanc/repo" || exit 1
WORK="$HOME/Projects/Blanc/records/beta2-work"
STATUS="$HOME/Projects/Blanc/records/beta2-publish-status.txt"
COSIGN="$HOME/Documents/ChatGPT/Blanc Browser/Chromium Preview/tools/cosign"
note() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" >> "$STATUS"; }
: > "$STATUS"
[ "$(shasum -a 256 "$COSIGN" | cut -c1-64)" = 77bbab240111761d50044f37541da0734d964dfe5f092cab6d584663c912372e ] || { note "cosign checksum mismatch"; echo "cosign doesn't match its recorded checksum. Stopping."; exit 1; }
BIN=$(mktemp -d /private/tmp/blanc-cosign.XXXXXX); ln -s "$COSIGN" "$BIN/cosign"; trap 'rm -rf "$BIN"' EXIT
export PATH="$BIN:$PATH"
echo "Blanc Beta 2.0.0-beta.2: Sigstore, publish, public check"
echo
for stage in sigstore publish verify-public; do
  echo "== $stage"
  note "$stage started"
  if /usr/local/bin/node chromium/release/release.mjs "$stage" "$WORK"; then
    note "$stage passed"
  else
    note "$stage FAILED (exit $?)"
    echo; echo "STOPPED at: $stage. Tell Claude."; exit 1
  fi
done
note "done"
echo
echo "Done: Blanc Beta 2.0.0-beta.2 is public and verified. Tell Claude."

# Sparkle integration input

Pin: [Sparkle 2.10.1](https://github.com/sparkle-project/Sparkle/releases/tag/2.10.1),
framework build 2065, selected under the owner's November 10, 2026 approval to
use the newest stable 2.x release. Its macOS 12 minimum fits Blanc Beta's 13.0.
The complete upstream LICENSE remains byte-identical and is retained here;
framework binaries are staged outside Git.

Archive SHA-256:
`1a856d2a9edb8e628de88121d7be04cf0e2167f8641650b78fca00b14244cf27`.
The downloaded archive matches the first-party release asset digest. Source
hashes, provenance and license digest are in `chromium/release/sources.json`;
the advisory review is in `chromium/release/sparkle-review-2026-11-10.md`.

Use the offline `chromium/release/stage-sparkle.py` with that archive and digest.
It refuses an existing destination, validates the full framework tree and
writes a receipt. GN validates the immutable receipt and tree before linking
or copying it. Staging does not download, sign, create keys or qualify native
runtime behavior. Upstream archive `./` prefixes are normalized before safety
and duplicate checks. Do not use a floating version or download inside GN.

The post-2.8.0 installer and symlink advisories are fixed by this pin. That
review does not substitute for the separate native updater, signed-artifact
and N-to-N+1 installation gates. Deltas and root-host operation remain refused.

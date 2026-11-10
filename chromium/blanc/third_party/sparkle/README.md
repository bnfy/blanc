# Sparkle integration input

Pin: Sparkle 2.8.0, upstream https://github.com/sparkle-project/Sparkle/tree/2.8.0.
The full pinned LICENSE is retained. Framework binaries are not committed.
Use the offline `chromium/release/stage-sparkle.py` with an owner-reviewed
archive and SHA-256. It refuses an existing destination, validates the entire
framework tree and writes a receipt. The GN build validates that immutable
receipt and tree before linking/copying the framework. Do not download inside
GN, use a floating version, or create a signing key as part of staging.

The queue forbids GitHub release contacts and a cold/official beta build.
No actual distribution has been staged or linked here. Actual framework
architecture, helper signatures and runtime behavior remain unverified.

Security review, 2026-11-10: upstream documents fixes after the approved 2.8.0
pin in https://sparkle-project.org/documentation/security-and-reliability/
and https://github.com/sparkle-project/Sparkle/discussions/2838 . These include
delta symlink attacks, a local appcast-information race, an authenticated
installer download-move symlink race and root-host cache handling. The wrapper
refuses deltas and root-host operation and does not consume delayed appcast
metadata, but this does not establish protection against the installer race.
2.8.0 is not security-cleared for release. Resolve the version/backport decision
before distributing a signed beta. No version upgrade or waiver is inferred.

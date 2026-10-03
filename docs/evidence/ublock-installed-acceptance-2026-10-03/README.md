# Installed uBO acceptance — October 3, 2026

These are sanitized observations from real installed v1.27.0 candidates (macOS bundle build 1270), not results from the unpackaged desktop suite. Production fuses and sandbox settings remained intact. Disposable profiles and local fixtures were used; no browsing URLs, personal data, credentials or raw Chromium logs are retained.

- `macos-1270-failed.json`: signed, notarized arm64 DMG installed in an isolated Applications folder. The first Blanc → uBO restart, request/cosmetic blocking, original Dashboard and Logger, private isolation and quiet/wake passed. The later uBO → Blanc restart quit without reopening. Repeated with the same outcome.
- `windows-1270-failed.json`: signed NSIS installed in an isolated folder in the existing Windows 11 ARM64 VM. The x64 app launched under emulation; its first Blanc → uBO restart quit without reopening. Repeated, including a detached launch. This is not native Windows x64 certification.

The new installed suite drives the real shield CTA and requires a different process and a ready provider after each restart. Unit and unpackaged UI tests alone did not detect these failures. A change to prepare Electron's native relaunch helper during `will-quit` is under test; these failed records are retained and are not superseded until rebuilt signed candidates pass.

The owner required the existing installed Linux VM and prohibited creating another VM. That VM is Ubuntu 26.04 ARM64; the available candidate is x86-64. Its direct launch returned `Exec format error`. A normal-user namespace probe also failed. This combination cannot certify Linux x86-64 installed acceptance. No VM, kernel policy, sandbox bypass or runtime adaptation was created to turn this into a pass.

Platform acceptance and public enablement remain pending. No release, public updater metadata, CodeQL dismissal or platform flag was changed by these tests.

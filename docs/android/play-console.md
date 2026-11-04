# Blanc for Android: Google Play Console

How Blanc for Android is set up on Google Play, and the contract the release
script follows. Nothing here is set up yet (A0, November 4, 2026); each item
is the owner's step, in the order the plan needs it
(`docs/superpowers/plans/2026-11-03-android-port.md`, A7 and A8).

## Account

- **Type:** organization account for Bananify Creative, which needs a
  **D-U-N-S number**. An organization account skips the personal-account rule
  of a 12-tester, 14-day closed test before production.
- **D-U-N-S:** requested by the owner from Dun & Bradstreet; issuing it can
  take weeks, so it's the long pole.

## App

- **Application ID:** `me.bnfy.blanc` (release). Debug builds are
  `me.bnfy.blanc.dev`, so both install side by side. Neither can change after
  the first upload.
- **Display name:** Blanc.
- **Architectures:** arm64-v8a (devices) and x86_64 (emulators). No 32-bit ARM.

## Signing

- **Play App Signing:** Google holds the app signing key. Blanc keeps only
  the **upload key**.
- **Upload key and Play API credential:** in 1Password (vault Dev). They
  never reach the build server or the repository.
- **Release-script contract (A7):** the server builds an unsigned AAB from a
  tagged commit; the owner's Mac verifies it, signs it with the upload key and
  uploads it through `op run`, with an SBOM and Sigstore record like desktop
  releases.

## Tracks

Internal (A7) → closed testing → open beta (A8) → production with staged
rollout (A9). Each promotion is the owner's explicit approval.

## Listing and Data safety

To come in A8, release-backed only (`docs/marketing-claims.md`): listing copy,
screenshots from the real app (no Wikipedia), the support address, and Data
safety answers matching what the released build sends (a launch `/ping` after
consent; no crash upload).

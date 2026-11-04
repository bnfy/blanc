# Blanc for Android: Google Play Console

How Blanc for Android is set up on Google Play, and the contract the release
script follows. Nothing here is set up yet (November 4, 2026); each item
is the owner's step, in the order the plan needs it
(`docs/superpowers/plans/2026-11-03-android-port.md`, A7 and A8).

## Account

- **Existing account (owner, November 4, 2026):** Blanc's owner already has a
  **personal** Play Console account, created in 2023 or later. Bananify
  Creative also already has a **D-U-N-S number** (kept out of this
  repository).
- **Testing rule:** a personal account created after November 13, 2023 must
  run a **closed test with at least 12 testers opted in continuously for 14
  days** before it can apply for production
  (support.google.com/googleplay/android-developer/answer/14151465). Testers who
  leave before day 14 don't count. Unless the account turns out to predate
  that cutoff, the A8 closed beta doubles as this test: invite 15 to 20 people
  so a few dropping out doesn't restart the clock.
- **Listing name:** a personal account shows the owner's legal name and
  country, as the individual Apple enrollment does. To show Bananify Creative
  instead, Blanc would need an **organization** account (with the D-U-N-S
  number). Google's help describes no way to convert an existing personal
  account; ask Play Console support before choosing, and decide **before A7
  uploads the first build**, because the app can't move accounts easily after
  that.
- **Open decision (owner):** keep the personal account, or open an
  organization account for Blanc.

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

# Blanc for Android: Google Play Console

How Blanc for Android is set up on Google Play, and the contract the release
script follows. Nothing here is set up yet (November 4, 2026); each item
is the owner's step, in the order the plan needs it
(`docs/superpowers/plans/2026-11-03-android-port.md`, A7 and A8).

## Account

- **Type:** organization account for Bananify Creative, which needs a
  **D-U-N-S number**. An organization account skips the personal-account rule
  of a 12-tester, 14-day closed test before production.
- **D-U-N-S:** the long pole (it can take up to about 30 days), so it's
  requested first, before any Android beta work needs it.

### Registering (owner steps, in order)

1. **Check for an existing D-U-N-S number.** Bananify Creative may already
   have one (from a bank, a supplier or Apple's developer program). Search
   Dun & Bradstreet's free lookup, linked from Google's Play Console help page
   on D-U-N-S numbers. If Apple's organization enrollment used one, it is the
   same number.
2. **If there's none, request one** through that same free lookup (it's free
   for app-store developers; don't pay for expedited service). Use the legal
   name and address exactly as the business is registered, because Google
   checks them against the D-U-N-S record letter for letter.
3. **Wait for the number,** then wait about two more business days before
   using it, while D&B's record reaches Google.
4. **Sign up for Play Console** at `play.google.com/console/signup` with the
   Google account that will own Blanc (ideally a shared business account, not a
   personal one), and choose **An organization**.
5. **Enter the organization details:** the D-U-N-S number; the legal name and
   address as D&B has them; the organization's website (`https://blanc.day`);
   a contact phone and email for Google. Pay the one-time registration fee.
6. **Enter the public developer details** shown on the store listing: the
   developer name (Bananify Creative), the support email
   (`support@blanc.day`), the website. Google verifies the email and phone.
7. **Verify the website** if asked, through Google Search Console for
   `blanc.day` (it may already be verified there for the site).
8. **Answer Google's identity check** for the organization, if it asks for
   documents; it can take a few days.
9. **Record it here:** the developer account ID and the date, never any
   password or key. Then the app itself is created (below) when A7 needs it.

Steps 4 to 8 follow Google's screens as they stand on the day; if a screen
differs from this list, follow the screen and update this section.

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

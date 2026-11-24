# Blanc Mail page hero, November 24, 2026

The owner redesigned the `/mail` hero on November 24, 2026:
- **Layout:** centred copy and one primary action, then the real app window.
- **Actions:** the two equal "Keep your email address" and "Get a Blanc address" cards and the "See pricing" link are gone.
- **Envelope:** the gold envelope moved to the closing section, "Get Blanc Mail at launch."

For this one image, the owner lifted the November 20 hold on full-window images (#1664). No other Mail page shows a screenshot, and `test/unit/site-mail-screens.test.js` enforces that.

| Wording or asset | Source and qualification |
| --- | --- |
| "Reserve your address" | Primary action while reservations are open. The reservation offer is unchanged from the November 20 record. |
| "Reserving a name like mira@inbox.day is free. The address and its 15 GB mailbox come with a paid plan at launch." | The November 20 offer lines, joined under the button. The displayed ending comes from the site's reservation settings. |
| "Keeping your Gmail? Join the waitlist" | Secondary link. It opens the same double opt-in waitlist form as before (`MailWaitlistForm`, id `waitlist`). The form's copy and the Worker contract are unchanged. |
| "Join the app waitlist" / "Choose an address like mira@inbox.day." / "Explore Blanc addresses" | The closed-reservations state: the waitlist leads and the address section is linked. All three are wordings the page used before. |
| "Preview build · sample mail" | `MailShot`'s fixed caption. Blanc Mail has no public release, so a screenshot must read as a preview (`docs/marketing-claims.md`). The mail in it is the demo's made-up corpus, as the Mail repository's 11-17 copy rules require. |
| Hero window (`public/mail/screens/hero-light.webp`, 2200 × 1455) | A capture of the signed demo build, taken with the Mail repository's `native/scripts/capture-public-shots.sh main` (the light scene): demo mode only, no connected mailbox, no automation overlay. Taken from bnfy/blanc-mail commit `731dff0e` (#401), whose new demo corpus (owner-approved November 24, 2026) credits its three Unsplash photos in the app's third-party notices. Refresh this image whenever the app's visible UI changes, per the Mail repository's website-screenshot rule. |

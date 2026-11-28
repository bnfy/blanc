# Blanc Mail page hero, November 24, 2026

The owner redesigned the `/mail` hero on November 24, 2026:
- **Layout:** centred copy and one primary action, then the real app window.
- **Actions:** the two equal "Keep your email address" and "Get a Blanc address" cards and the "See pricing" link are gone.
- **Envelope:** the gold envelope moved to the closing section, "Get Blanc Mail at launch."

For the original Mac hero, the owner lifted the November 20 hold on full-window images (#1664). On November 28, the owner supplied and approved the dark Mac and iPhone inbox screenshots for a paired hero. No other Mail page shows a screenshot, and `test/unit/site-mail-screens.test.js` enforces that.

| Wording or asset | Source and qualification |
| --- | --- |
| "Reserve your address" | Primary action while reservations are open. The reservation offer is unchanged from the November 20 record. |
| "Reserving a name like mira@inbox.day is free. The address and its 15 GB mailbox come with a paid plan at launch." | The November 20 offer lines, joined under the button. The displayed ending comes from the site's reservation settings. |
| "Keeping your Gmail? Join the waitlist" | Secondary link. It opens the same double opt-in waitlist form as before (`MailWaitlistForm`, id `waitlist`). The form's copy and the Worker contract are unchanged. |
| "Join the app waitlist" / "Choose an address like mira@inbox.day." / "Explore Blanc addresses" | The closed-reservations state: the waitlist leads and the address section is linked. All three are wordings the page used before. |
| "Preview builds" | `MailShot` labels the two screenshots together (`docs/marketing-claims.md`). Both show sample mail. |
| Mac inbox (`public/mail/screens/hero-dark.webp`, 2200 × 1421) | Owner-supplied November 28 dark Mac capture at 2:39:54 p.m. The signed demo shows Mira's sample inbox with “Your Blanc Mail preview” open, the gold Sunrise sender mark, and the Ghost Mode control. The display pipeline preserves the whole window and its transparent shadow and generates an 1100px copy. |
| iPhone inbox (`public/mail/screens/iphone-inbox.webp`, 1170 × 2532) | Owner-supplied November 28 Inbox QA capture of the dark iPhone preview with sample mail. The sample sign-in code and print proof attachment are in the iPhone QA fixture. Displayed through `MailShot` with its preview caption and a 640px copy. |

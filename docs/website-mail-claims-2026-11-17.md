# Blanc Mail page claims — November 17, 2026

Lines added to `site/src/pages/mail.astro` with the design teasers: the next
Blanc Mail look in dark and light, and the hosted Blanc Mail address. The
owner approved the design on November 17, 2026 (designed by Codex in the Blanc
Mail repository, bnfy/blanc-mail:
`docs/superpowers/specs/assets-2026-11-17-blanc-address-onboarding-codex/`,
whose `teasers/README.md` records how the images were made). Neither is
shipped: under `docs/marketing-claims.md`, mockups never prove a capability,
so every line below is a plan, framed as a preview, with no date.

Owner copy rules (November 17, 2026), kept on the page:

- Never claim that Blanc can't read your mail.
- The address offer's line is exactly "A private mailbox of your own."
- Don't mention Apple Mail or other device support (not built yet).
- The mail in the images is made up, and the page says so.

## Images

Every image is a `MailTeaser` (`site/src/components/MailTeaser.astro`), whose
fixed caption is "Design preview"; `test/unit/site-mail-teasers.test.js`
keeps teasers out of any other component. Masters are the Mail repository's
2512px transparent PNGs resized to 2000px WebP in `site/public/mail/teasers/`;
`site/scripts/build-display-images.mjs` builds the 1400px and 800px copies.

| Image | Shows | Alt text says |
| --- | --- | --- |
| `night-inbox` | Main window, dark | Design preview, dark mode, made-up mail |
| `porcelain-inbox` | Main window, light | Design preview, light mode, made-up mail |
| `night-offer` | "Your plan includes a Blanc Mail address" offer | Design preview; quotes the dialog |
| `night-address` | Choosing an address | Design preview; describes the form |
| `night-arrival` | "mira@blnc.day — Your mailbox is ready in Blanc Mail." | Design preview; quotes the dialog |

The light offer and arrival teasers are not used: the address step has no
light version, so the address set stays in dark, the stage's own appearance.

## Copy

| Wording on the page | Kind | Evidence | Limits kept in the copy | Verdict |
| --- | --- | --- | --- | --- |
| A first look at the new design. | Heading | Owner-approved design, November 17, 2026 | "First look" frames it as a preview | Aspirational, labelled |
| This is where Blanc Mail’s design is heading, in dark mode and in light mode. It’s a design preview: the mail is made up, and details may change before release. | Lead | As above; the teasers' README (fictional mail) | Preview, made-up mail, may change; no date | Aspirational, labelled |
| Appearance; Dark; Light | Control labels | — | — | Label |
| Coming later: a Blanc Mail address. | Heading | Hosted addresses designed in the Mail repository; not available to customers | "Coming later"; no date | Aspirational, labelled |
| A private mailbox of your own, with an address like mira@blnc.day, set up from inside Blanc Mail. It isn’t available yet, and what’s shown may change before it is. | Lead | Owner's offer line, word for word, first; the address flow is set up inside the app in the design | Not available; may change; no plan, price, storage or date promised in the copy | Aspirational, labelled |
| Step; Offer; Choose; Ready | Control labels | — | — | Label |
| Design preview | Every teaser's caption | `MailTeaser.astro` | — | Label |

The offer image itself shows "Your plan includes a Blanc Mail address" and
15 GB of storage, as designed; the page's copy repeats neither, and the lead
says what's shown may change. Recheck this ledger, and replace the teasers
with captures from a signed build, when hosted addresses or the new look
ship.

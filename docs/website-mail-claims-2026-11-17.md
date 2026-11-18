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
| `island-dark` | Main window, Island layout, dark | Design preview, Island layout, dark mode, made-up mail |
| `island-light` | Main window, Island layout, light | Design preview, Island layout, light mode, made-up mail |
| `island-offer` | "Your plan includes a Blanc Mail address" offer | Design preview; quotes the dialog |
| `island-address` | Choosing an address | Design preview; describes the form |
| `island-arrival` | "mira@blnc.day — Your mailbox is ready in Blanc Mail." | Design preview; quotes the dialog |

Every teaser shows the **Island** layout (owner, November 17, 2026: "show
Island view here in light/dark instead of Classic", then "use Island" for the
address teasers too). Classic is still the app's default layout and Island a
choice in Settings; the page's copy names no layout. How they were made, in
headless Chromium at 2x with a transparent background, each window pinned to
1176 × 692 CSS px with a 40px margin for its shadow (2512 × 1544):

- `island-dark`, `island-light`: the Mail repository's window study,
  `docs/superpowers/specs/assets-2026-11-17-premium-main-window-codex/index.html`,
  at the approved level A ("Refined"), layout Island, mode dark or light.
- `island-offer`, `island-address`, `island-arrival`: each dialog rendered
  alone from the onboarding mock,
  `docs/superpowers/specs/assets-2026-11-17-blanc-address-onboarding-codex/teaser.html?theme=night&screen=offer|address|arrival`,
  with its Classic window, veil and frame hidden; then laid over the window
  study's dark Island window, dimmed by the onboarding mock's own veil
  (`#0807056b`) with its traffic lights greyed as the mock's modal window
  greys them. Both mocks draw the same made-up mail.

The address teasers stay in dark, the stage's own appearance; no light
versions are used.

## Copy

| Wording on the page | Kind | Evidence | Limits kept in the copy | Verdict |
| --- | --- | --- | --- | --- |
| A new outlook on email. | Heading | Owner-approved design, November 17, 2026; wording from the owner, November 17, 2026 | The lead below says it is a design preview | Aspirational, labelled |
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

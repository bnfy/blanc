# Blanc Mail page claims — November 17, 2026

Lines added to `site/src/pages/mail.astro` with the design teasers: the next
Blanc Mail look in dark and light, and the hosted Blanc Mail address. The
owner approved the design on November 17, 2026 (designed by Codex in the Blanc
Mail repository, bnfy/blanc-mail:
`docs/superpowers/specs/assets-2026-11-17-blanc-address-onboarding-codex/`,
whose `teasers/README.md` records how the images were made). Neither is
shipped: under `docs/marketing-claims.md`, mockups never prove a capability,
so every line below is a plan, framed as a preview, with no date. The
address section sits right after the first look: the owner moved it up on
November 17, 2026, as a headline feature that launches with the app.

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
| A new look for your inbox. | Heading | Owner-approved design, November 17, 2026; wording from the owner-approved messaging audit, November 17, 2026 (replaced "A new outlook on email.", which read as Microsoft Outlook) | The lead labels it a design preview | Aspirational, labelled |
| Blanc Mail’s design, in dark mode and light mode: one Island at the top, your mailboxes a click away, and your list and message side by side. It’s a design preview with made-up mail, and details may change. | Lead | The Island-layout teasers it introduces (level A of the window study): the Island toolbar, the mailbox chip row, and the list and reader cards side by side | Design preview; made-up mail; may change; no date. Describes the Island layout shown, which is a choice beside the default Classic layout | Aspirational, labelled |
| Appearance; Dark; Light | Control labels | — | — | Label |
| A Blanc Mail address of your own. | Heading | Hosted addresses designed in the Mail repository; the owner said on November 17, 2026 that the address launches when the app does | No date; the lead labels the images a design preview | Aspirational, labelled |
| A private mailbox of your own, with an address like mira@blnc.day, set up from inside Blanc Mail. It launches with Blanc Mail. What’s shown is a design preview and may change. | Lead | Owner's offer line, word for word, first; owner, November 17, 2026: "it'll launch when the app does"; the address flow is set up inside the app in the design | Launches with the app, which is itself "Coming soon" with no date; design preview; may change; no plan, price or storage promised in the copy | Aspirational, labelled |
| Step; 1 Get started; 2 Pick a name; 3 Open inbox | Control labels (owner's choice, November 17, 2026, replacing Offer, Choose, Ready) | — | — | Label |
| Design preview | Every teaser's caption | `MailTeaser.astro` | — | Label |

The offer image itself shows "Your plan includes a Blanc Mail address" and
15 GB of storage, as designed; the page's copy repeats neither, and the lead
says what's shown may change. Recheck this ledger, and replace the teasers
with captures from a signed build, when hosted addresses or the new look
ship.

## Messaging audit fixes (owner-approved, November 17, 2026)

An audit of the page against Apple's design principles (purpose, consistency,
specific labels) found the address missing from the first screen, a
requirements line that contradicted it, and Set Aside wording the app no
longer uses. The owner approved these fixes and their wording. Paths are in
the Blanc Mail repository (bnfy/blanc-mail) at `main` (ecf582c3).

| Wording on the page | Evidence | Limits kept in the copy | Verdict |
| --- | --- | --- | --- |
| Blanc Mail brings a careful, native experience for Gmail and Proton Mail to your Mac, and a private mailbox of your own. | November 12 Proton line, unchanged, plus the hosted address, which launches with the app (owner, November 17, 2026) | The address section below labels its images a design preview; no date | Qualified |
| Blanc Mail is a native Gmail and Proton Mail app for macOS, with a private Blanc Mail address of your own, coming soon from the makers of Blanc Browser. | Meta description; as above | "Coming soon"; no date | Qualified |
| plus a Google account, a Proton account with Proton Mail Bridge, or a Blanc Mail address. | Requirements line; a Blanc Mail address is a mailbox in its own right, so a visitor with only that one needs no Google or Proton account | Which plans include the address is not stated anywhere in the copy (owner to decide before the pricing cards name it) | Qualified |
| Groups (tile title) | `AGENTS.md`, Groups in Island: "the feature is called Groups in both layouts" | — | Qualified |
| Move conversations into a named group, like “Read on the flight”, and they leave your Inbox to wait there until you’re ready. | `AGENTS.md`, Groups: holding adds the group's label and removes `INBOX`, with the five-second Undo | Drops two lines of the October 22 tile: review dates are gone (owner, November 17, 2026; `AGENTS.md`: "Groups have no review dates any more"), and "names … stay on this Mac" no longer holds, since a group keeps its mail in a `Postel/Set Aside/<name>` Gmail label | Qualified |
| Type a few letters to jump to a mailbox, label, conversation, group or person … | `MailIslandPanel.swift`: groups have their own jump results | — | Qualified |
| Type / to snooze, move to a group, label, move, archive or trash what you’ve selected … | `MailIsland.swift` (`MailIslandCommand`); `MailIslandPanel.swift` `commandTitle`: `/set-aside` and `/group` both read "Move to Group…" | — | Qualified |
| … the Island holds Archive, Snooze, Move to Group, Labels and Trash … | `AGENTS.md`, the Island toolbar's trailing actions | — | Qualified |
| `/set-aside` Move to Group… (Island panel figure row; its aria-label says Move to Group) | `MailIslandPanel.swift` `commandTitle`; the default Classic layout lists `/set-aside` and its footer chips stay `/snooze /set-aside /label /rule` | The figure draws the Classic panel, the default | Qualified |

## What a Blanc Mail address does (owner-approved wording, November 17, 2026)

Six points under the address teaser. Evidence is in the Blanc Mail repository:
`AGENTS.md` (Hosted mailboxes), the hosted spec
`docs/superpowers/specs/2026-11-15-blanc-day-hosted-mailboxes-design.md` and the
Apple Mail spec `docs/superpowers/specs/2026-11-17-hosted-mail-apple-mail-design.md`,
whose §8 and the hosted spec's §12.1 are the only protection claims the product
may make. Owner rules kept: no "Blanc can't read your mail", nothing about Apple
Mail or other devices. Not claimed: end-to-end encryption, which is a later step.

| Wording on the page | Evidence | Limits kept in the copy | Verdict |
| --- | --- | --- | --- |
| Your name, your ending: Pick a name and the ending you like: blnc.day, blnc.page, blancmail.me, blancmail.co or blncmail.com. | `AGENTS.md`, Hosted mailboxes: the five domains, the user's choice, blnc.day the default | Names under three characters and reserved names are refused (hosted spec §7), not stated | Aspirational, labelled (launches with the app) |
| 15 GB for your mail: Each address has 15 GB for your mail and its attachments. | `AGENTS.md` and hosted spec §14: 15 GB per address | — | Aspirational, labelled |
| Encrypted where it’s stored: Messages and attachments in your mailbox are encrypted with a key made on your Mac. Blanc keeps only a copy locked with your password, which never leaves your Mac. Senders, recipients, subjects and dates aren’t encrypted, and mail is readable to the server as it arrives and as it’s sent. | Hosted spec §12.1 and Apple Mail spec §8: bodies and attachments S/MIME to the customer's certificate, made on the Mac; Blanc holds only a copy locked with a secret derived from the password, which never leaves the Mac | States the unprotected headers and the arrival and sending windows. Not stated: a weak password plus a breach of Blanc's database could expose stored mail (§12.1); mail stored before encryption is on (none: it is on before first delivery) | Qualified |
| Back in with a code: Forget your password and a code sent to your backup email gets you back in. On a new Mac, a forgotten password means mail you’d already received can’t be opened. | Sign-up design `2026-11-16-hosted-mailbox-sign-up-design.md`; the approved "Choose your address" dialog's own words | The new-Mac limit is stated | Qualified |
| Time to renew: If your subscription lapses, mail keeps arriving for 30 days and renewing brings everything back. Before a mailbox is deleted, we email you how to export your mail. | Hosted spec §6 (built November 16, 2026): suspended mailboxes accept mail for 30 days; renewing restores; no deletion without the warning email and export guide | Sign-in and sending pause while suspended (implied by "renewing brings everything back") | Qualified |
| Filtered for spam: Incoming mail is checked for spam and phishing before it reaches your Inbox. | Hosted spec §7: Stalwart's built-in filter (rules, classifier, DNSBL, Pyzor, phishing checks) | No promise that every spam or phishing message is caught | Qualified |

Which plans include an address is settled below (Pricing, November 17).

## Pricing: Bundle at $7.99 / $79.99, Nodding Off, and the address (November 17, 2026)

The owner had Polar checked: Blanc Bundle was $9 / $90 with the Blanc Mail,
Blanc Browser and Nodding Off License benefits, and no subscriptions. After an
objective look at the plan, the owner chose the November 15 decision and asked
for Nodding Off on the page with a link. On November 17 both Bundle products
were changed in Polar production (dashboard, owner signed in): Monthly
`bb3a14c5…` to $7.99 and Annual `28957184…` to $79.99. Product IDs and
benefits are unchanged; Polar applies a price change to new customers only,
and there were none. Blanc Mail stays $4.99 / $49.99.

| Wording on the page | Where | Evidence | Limits kept in the copy | Verdict |
| --- | --- | --- | --- | --- |
| $7.99 / month or $79.99 / year | Bundle card, from `mail-commerce.mjs` | Polar production, read back after the change on November 17, 2026 | "Purchases are not open yet" stays above the cards | Verified (price in Polar) |
| ~~A Blanc Mail address with the annual plan~~ | Mail card | Removed the same day: the address became an add-on (below) | — | Removed |
| Blanc Mail on macOS, with a Blanc Mail address | Bundle card | As above: the Bundle includes one address | — | Aspirational, labelled |
| Nodding Off, bedtime stories for iPhone (links to https://noddingoffapp.com/) | Bundle card | Nodding Off License benefit attached to both Bundle products (Polar, read November 17); the app's own site describes it as bedtime stories for adults on iPhone | **Unlocking Nodding Off with a Bundle licence awaits App Review:** its first App Store release leaves Bundle sign-in out (Guideline 3.1.1), and it returns only in a later submission (`bnfy/nodding-off` `docs/app-review-notes.md`). The page sells nothing yet; recheck before checkout opens | Qualified (pending App Review) |
| Your Mail, Nodding Off and Browser license keys in one subscription | Bundle card | The three License Keys benefits on both Bundle products | As above for Nodding Off | Qualified |
| At launch, a Blanc Bundle subscription will include Blanc Mail on macOS with a Blanc Mail address, Nodding Off on iPhone, and Browser Patron benefits on Browser's supported platforms. | Closing note | As above | "At launch" | Qualified |
| Blanc Mail is planned at $4.99 per month or $49.99 per year; the annual plan includes one Blanc Mail address. Blanc Bundle is planned at $7.99 per month or $79.99 per year and includes Mail on macOS, Nodding Off on iPhone and Browser Patron on Browser's supported platforms, each with its own license key, and one Blanc Mail address. | `/mail/terms`, Subscriptions (now "Updated November 17, 2026") | As above | Pre-release terms, effective when subscriptions open | Qualified |

## The address as an add-on: three plans (November 17, 2026)

The owner asked for the address to read clearly as an add-on or a Bundle
purchase, and for the most marketable, enticing pricing. Agreed plan: Blanc
Mail stays the app alone; a new **Blanc Mail + Address** plan is $69.99 a year
(Blanc Mail Annual plus $20); Blanc Bundle includes the address. On the
owner's explicit go-ahead, "Blanc Mail + Address — Annual" was created in
Polar production on November 17 (`77d31f96-aa36-4012-a2d9-7a1587fbf532`,
$69.99 a year, Private, the Blanc Mail License benefit only). This supersedes
the November 15 rule that Mail Annual includes an address. **Not yet
enforced:** the Mail repository's Worker grants an address to any valid Blanc
Mail licence (`services/mail-worker/src/polar.js` checks only the Mail
benefit), so limiting addresses to this plan and the Bundle is work for that
repository before addresses go on sale.

| Wording on the page | Where | Evidence | Limits kept in the copy | Verdict |
| --- | --- | --- | --- | --- |
| Blanc Mail + Address · $69.99 / year | Pricing card | Polar production product above | Annual only; "Purchases are not open yet" stays above the cards | Verified (price in Polar) |
| Blanc Mail plus your own address, $20 more a year | Pricing card | Computed on the page from the two Polar amounts ($69.99 − $49.99) | — | Verified |
| Everything in Blanc Mail · Your own address on blnc.day or another Blanc ending · A private mailbox with 15 GB | Pricing card | Mail benefit on the product; hosted endings and 15 GB per `AGENTS.md` | Launches with the app | Aspirational, labelled |
| Add it to Blanc Mail for $20 a year, or get it with Blanc Bundle, when Blanc Mail launches. | Address section lead | As above | No date | Aspirational, labelled |
| Blanc Mail + Address is planned at $69.99 per year and includes Mail on macOS and one Blanc Mail address. | `/mail/terms`, Subscriptions | As above | Pre-release terms | Qualified |

## Section links in the Blanc Mail bar (November 18, 2026)

`MailBar.astro` links to the page's notable sections: Design, Blanc email
address, Island, Features, Pricing (labels; the second is the owner's
wording, November 18, replacing "Address", which wasn't descriptive enough). At
960px and narrower they sit behind a ≡ menu button named "Sections". Owner, November 18: "New look" was not used,
because Blanc Mail is a new, unreleased product, not a redesign; for the same
reason the first section's lead now reads "Blanc Mail’s design" (it said
"Blanc Mail’s new design").

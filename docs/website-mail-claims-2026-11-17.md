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
| Blanc Mail’s new design, in dark mode and light mode: one Island at the top, your mailboxes a click away, and your list and message side by side. It’s a design preview with made-up mail, and details may change. | Lead | The Island-layout teasers it introduces (level A of the window study): the Island toolbar, the mailbox chip row, and the list and reader cards side by side | Design preview; made-up mail; may change; no date. Describes the Island layout shown, which is a choice beside the default Classic layout | Aspirational, labelled |
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

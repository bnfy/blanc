# Blanc Mail overview: the gold envelope (October 21, 2026)

## Intent

Until Blanc Mail launches, `/mail` is a premium coming-soon page rather than a
feature tour. The owner asked for "a premium golden coming soon page … authentic,
high-end with realistic gold materials and lighting accents", chose to replace
the whole overview, and pointed at Robinhood's Gold Card and Gold pages as the
mood: a near-black stage, one photoreal gold object lit on a warm floor, gilt
type, a gold pill button, lots of quiet space.

It replaces the October 12 overview (screenshots, feature bento, light/dark
compare, trust band, closing waitlist) described in
`2026-10-12-mail-pages-redesign-design.md` §4. The other five Mail pages keep
that design.

## The page

- **Stage:** black above, a warm pool of light on the floor where the object
  stands. The site header and footer are unchanged.
- **Hero copy, top to bottom:** the eyebrow "Blanc Mail · for Mac · Coming soon",
  the headline "A little less inbox." in gilt (the metal's gradient clipped to
  the letters), the gold envelope, the lead "Blanc Mail brings a careful,
  native Gmail experience to your Mac.", the waitlist, and two quiet notes
  (still in development; Blanc Browser available now). Every sentence was
  already on the Mail pages and is recorded in
  `docs/website-mail-claims-2026-10-12.md`; nothing new is claimed.
- **The envelope:** the Mail icon as an object. Satin gold made of layers (fine
  grain from stretched noise, the lamp's reflection, a darker rim, the alloy),
  a lit top edge and the metal's thickness below, the flap and side folds
  pressed in as grooves with lit lips, and the Sunrise stamped where the flap
  meets. A contact shadow and, where supported (Chromium, Safari), a fading
  floor reflection. It is decorative (`aria-hidden`).
- **Light and motion:** on load the copy rises, the envelope arrives, and one
  band of light crosses it. After that, for a mouse only, the lamp's highlight
  follows the pointer and the envelope leans a few degrees toward it, easing
  back when the pointer leaves. Reduced motion and touch screens get the
  resting light with nothing moving, which is the finished design.
- **Waitlist:** the existing `MailWaitlistForm` and Worker contract,
  restyled: a smoked field and the gold pill. Its label is visually hidden but
  still names the field; the privacy note shows.

## Features (added October 22, 2026)

The owner asked for the app's features on the page. Below the hero, on the
same dark stage and in the same words as the October 12 overview:

- **"The Island, made for mail."** leads, as the owner directed: a lead
  sentence, a drawing of Mail's open Island panel after typing "/" (its
  real layout, metrics, strings and command order, from
  `MailIslandPanel.swift`; no mail content), and three points: Jump
  anywhere, Commands with a slash, Actions at hand.
- **"Every account, one calm inbox."** (gilt) over nine dark cards, each with a
  gilt line glyph in a hairline ring: Every account together, Set Aside
  (owner request), A native window, Gmail first, A moment to change your
  mind, Later on your terms, Ghost Mode, Replies you type often, Drafts that
  keep up.
- **"Rules that read like sentences"** in its own section. The owner wants a
  real dark-mode capture of the rule editor (Edit Rule) beside it, taken by a
  new `rule-editor` scene in the Mail repository's capture script; until it
  lands the section is copy only.
- **"Careful in what it sends, generous in what it accepts."** over four
  columns divided by gold hairlines: Mail that opens, No accidental double
  sends, Nothing added to your mail, Privacy choices.
- **The waitlist again**, its label set as a gilt heading.

Cards rise into place as they scroll in where scroll timelines are
supported; reduced motion shows them still. The Inbox Zero and light/dark
sections are not carried over. The Island, Set Aside and Rules copy is in
the claims ledger's October 22 section, Qualified until it is rechecked
against the signed Mail candidate.

## The Mail bar

Restyled on all six Mail pages to match: smoked black glass with a gold
hairline along its foot, cream links, a short gilt rule under the current
page, the gold Join pill, and dark popovers (page menu and waitlist). Its
structure, links and behavior are unchanged.

## Retired

The Mail screenshots, `MailShot.astro`, their display-image entries, the overview-only CSS, and the tests
that covered them (most of `test/site/mail-overview.test.mjs`).
Git history keeps them for the launch page.

## Not changed

The global site header (still light on Mail pages), the other Mail pages'
content, the waitlist Worker and its privacy-page section, and the OG image.

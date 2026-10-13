# Blanc Mail pages redesign — design

Status: approved by the owner, October 12, 2026 (spec, then the prototype commit "Prototype the Blanc Mail pages redesign").
Scope: the six Blanc Mail pages on blancbrowser.com — `/mail`, `/mail/pricing`,
`/mail/download`, `/mail/support`, `/mail/privacy`, `/mail/terms`.
Method: Apple's design guidance as captured in the `apple-design` skill
(purpose, hierarchy, size-specific type, translucent layers, instant press
feedback, interruptible motion, reduced motion/transparency/contrast).

## 1. Purpose

The owner's goals (AskUserQuestion, October 12, 2026):

1. **Show what Mail feels like**, instead of twelve identical text tiles.
2. **More waitlist sign-ups**: joining is the obvious next step on every Mail
   page, without being pushy.
3. **Apple-grade craft on every Mail page**, not only the overview.

Not a goal: preparing pricing and download for launch day.

Decisions already taken by the owner:

- **Overview layout: bento grid.** One varied grid replaces the equal
  three-column grids. A few large tiles carry wireframe vignettes; the rest
  stay compact. Mostly still, with small hover and press reactions.
- **Navigation: sticky product bar.** An Apple-style bar replaces the in-page
  segmented sub-nav on all six pages, with a "Join the waitlist" button.

What exists today: #636 (October 2026) rebuilt the overview hero along the
same guidance — the icon materializes, the copy rises in, a textless
three-pane window wireframe rises with scroll, and reduced
motion/transparency/contrast are handled. #732 then added two sections, so the
overview now has 12 identical tiles in three identical grids. The five
subpages are prose with the segmented sub-nav.

## 2. Constraints

**Copy is fixed.** Every product claim stays word for word. Claims and their
evidence are recorded in `docs/website-mail-claims-2026-10-12.md`; the rules
are in `docs/marketing-claims.md`. The redesign may reorder and regroup
existing sentences but not reword them. The only new text is the interface
labels listed in §7.

**Illustrations carry no claims.** `docs/marketing-claims.md` treats text
inside an image as a product claim and forbids imagery that invents controls,
automatic behavior, names or states. Blanc Mail has no public build. So every
vignette:

- is an abstract wireframe made of shapes and the site's line glyphs, with no
  words, numbers or data;
- depicts only the behavior the copy beside it already states, and nothing
  more (no extra controls, states or settings);
- is decorative (`aria-hidden="true"`); the tile's copy carries the meaning.

**The waitlist contract is unchanged.** `MailWaitlistForm` keeps its markup,
endpoint, honeypot, confirmation flow and privacy note. A page may hold more
than one instance; each takes a distinct `id`, and the existing script already
wires every `form[data-mail-waitlist]`.

**Tests that pin today's pages** (all must stay green):

- `test/unit/site-eyebrows.test.js` pins each Mail subpage's eyebrow text; the
  eyebrows stay as they are.
- `test/site/newsreader-reach.test.mjs`: serif (Newsreader Condensed) text is
  never set looser than `letter-spacing: -0.035em`.
- `test/site/header.test.mjs` and `test/site/footer.test.mjs`: the site header
  marks Mail as current on `/mail`, and the footer renders there.
- The SEO check in the site build (titles, descriptions, sitemap) is unchanged:
  no page is added, removed or renamed.

**House rules.** Styles live in `site/src/styles/mail.css`, never inline. No
new JavaScript dependency: motion here is not gesture-driven, so CSS
transitions and keyframes are enough; the two small scripts below are plain
JavaScript. The Mail pages are light-only, like today.

**Deploys.** Until a release includes #706, Mail-only deploys are built from
the local branch `site-production-source` plus the Mail commits, as on
October 12.

## 3. The Mail product bar (all six pages)

A new component, `MailBar.astro`, replaces `MailNav.astro` (which is deleted)
on every Mail page.

**Layout (wide).** One slim row under the site header:

- left: the Mail app icon (24 px) and the words "Blanc Mail", linking to
  `/mail`;
- centre: the six page links (Overview, Pricing, Download, Support, Privacy,
  Terms). The current page is ink and semibold with `aria-current="page"`;
  the others are secondary ink. No pill or segmented chrome;
- right: a small dark capsule button, "Join the waitlist".

**Layout (phone, ≤ 640 px).** Icon and "Blanc Mail"; then a button naming the
current page with a chevron, which opens a menu listing all six pages; then a
compact "Join" button (accessible name "Join the waitlist").

**Behavior.**

- Sticky. It sits directly under the site header (`top: 48px`). When the site
  header hides on scroll down (`.site-header.is-scroll-hidden`), the bar moves
  up to `top: 0` with the header's own 220 ms curve, so the two read as one
  piece; it comes back down with the header. Same technique as the Media
  page's index (`body:has(.site-header.is-scroll-hidden)`).
- Material. Translucent ivory with a background blur and saturation boost, so
  content scrolls visibly underneath. Instead of a permanent divider, a soft
  scroll-edge shadow appears only once content is actually under the bar.
- "Join the waitlist" opens a popover anchored to the button (Popover API:
  top layer, light dismiss, Escape). It contains a `MailWaitlistForm` with
  `id="bar-waitlist"`. Focus moves to its email field on open and returns to
  the button on close. After a successful sign-up the popover stays open to
  show the form's own confirmation message.
- Motion: the popover materializes from the button (scale, blur and opacity
  together, `transform-origin` at the button's top-right corner) and leaves
  along the same path. The phone page menu does the same from its button.
  Under reduced motion both use a short opacity fade only.
- Press feedback on pointer-down (`:active` scale 0.97, 100 ms). Hover
  styles apply only on hover-capable pointers.

## 4. Overview (`/mail`)

Order: hero → window → "One place to read, reply, and move on." →
"Every account, one calm inbox." (bento) → "Careful in what it sends,
generous in what it accepts." → closing waitlist → "One Blanc family."

**Hero.** Kept from #636 (icon, badge, headline, lead, waitlist). The two
links under the form ("See planned pricing ›", "Release status ›") are
removed: the product bar now carries Pricing and Download one click away, and
the hero ends on its call to action.

**Window wireframe.** Kept as is. The in-page sub-nav below it is removed
(the bar replaces it).

**"One place to read, reply, and move on."** The three tiles (A native
window, Gmail first, Privacy choices) become an open three-column row without
card chrome: glyph, title and copy separated by hairlines. It reads as a quick
overview, not three more cards.

**"Every account, one calm inbox." — the bento.** A four-column grid on wide
screens (two columns at tablet width, one on phones):

| Tile | Size | Vignette (textless; depicts only the stated behavior) |
| --- | --- | --- |
| Every account together | 2 × 2 | Five account-colored dots flow into one stacked inbox; each row carries its account's dot. Hover: rows settle into place. |
| A moment to change your mind | 2 × 1 | A row slides out to the archive glyph while an undo glyph's ring empties; on hover or focus the sequence plays once and the row returns. |
| Later, on your terms | 2 × 1 | An envelope glyph moves along a short track to a later mark on a clock face. |
| Ghost Mode | 2 × 1 | Rows sit blurred behind a lock glyph; on hover or focus the lock opens and the rows sharpen, then lock again. |
| Replies you type often | 1 × 1 | Compact: glyph, title, copy. |
| Drafts that keep up | 1 × 1 | Compact: glyph, title, copy. |

Vignettes play only on hover or keyboard focus of their tile, never on their
own in a loop, and a pointer leaving mid-play returns them smoothly from where
they are. Under reduced motion each shows one still frame of its end state.

**"Careful in what it sends, generous in what it accepts."** A full-width
dark band (Sunrise ink background, ivory text, gold glyphs) with the three
items (Mail that opens, No accidental double sends, Nothing added to your
mail) as columns. The change in material marks the shift from features to
trust.

**Closing waitlist.** Before the family section: the Mail icon and a second
`MailWaitlistForm` (`id="closing-waitlist"`), centred. The form's own label
("Get an email when Blanc Mail is ready") is the heading, so no new copy is
needed.

**"One Blanc family."** Kept as is (two app cards, Suite note,
in-development note).

## 5. Subpages

All five share a page header: the eyebrow (unchanged), the serif title and
the lead, left-aligned on a 12-column grid, with the product bar above.

**Pricing.** The "Purchases are not open yet…" note moves above the plans as a
status callout, so nobody reads prices as an offer first. The two plans become
equal cards. Each price is set large in tabular figures, with monthly and
yearly on separate lines, and each list item gets a check glyph. Neither plan
is marked as recommended. "What happens when a subscription ends?" follows as
a quiet section.

**Download.** Two columns on wide screens: left, the title, the lead and the
waitlist form; right, a requirements card holding the existing Requirements
paragraphs verbatim, with the Browser download link. One column on phones.

**Support.** The lead and its support address become a contact card at the
top. The three topics (Accounts and data, Uninstalling, Updates and licensing)
become three cards with glyphs, in a row on wide screens.

**Privacy and Terms.** A document layout. On screens 1024 px and wider: a
sticky "On this page" list on the left, linking to every section heading,
which highlights the section being read; the text column is about 68
characters wide. On narrower screens the list becomes a collapsed
"On this page" disclosure under the page header. Every section heading gets a
stable anchor id derived from its text.

## 6. Type and motion

Size-specific tracking and leading (serif rows respect the −0.035em limit):

| Role | Face | Size | Leading | Tracking |
| --- | --- | --- | --- | --- |
| Page title (h1) | Newsreader | clamp(44px, 7.4vw, 92px) | 1.02 | −0.04em |
| Section heading (h2) | Newsreader | clamp(32px, 4.6vw, 56px) | 1.06 | −0.035em |
| Tile or card title (h3) | Newsreader | 23–26px | 1.2 | −0.035em |
| Lead | Inter | clamp(18px, 2vw, 22px) | 1.45 | −0.01em |
| Body | Inter | 16–17px | 1.6 | 0 |
| Small, labels | Inter | 13–14px | 1.4 | 0.005em |

Motion rules:

- Nothing moves on its own except the existing hero entrance and window rise.
- Transitions are critically damped (no overshoot): `cubic-bezier(.16,1,.3,1)`
  for arrivals, 160–240 ms for state changes.
- Enter and exit follow the same path; popovers and menus originate at their
  button.
- `prefers-reduced-motion`: opacity fades only, vignettes show still end
  frames. `prefers-reduced-transparency`: the bar and popovers become solid.
  `prefers-contrast: more`: borders darken and secondary text darkens, as
  today.

## 7. New interface text

Only these labels are new; none is a product claim:

- "Blanc Mail" (product bar title)
- "Join the waitlist" (bar button; already the form's button label) and
  "Join" (its phone label)
- "On this page" (Privacy and Terms contents list)
- The current page's name in the phone page-menu button (an existing nav label)

## 8. Files

- New: `site/src/components/MailBar.astro` (markup and its script),
  `site/src/components/MailPageContents.astro` (the "On this page" list and
  its scroll highlight).
- Changed: `site/src/pages/mail.astro`, the five `site/src/pages/mail/*.astro`
  pages, `site/src/styles/mail.css` (reorganized by section).
- Deleted: `site/src/components/MailNav.astro`.
- Unchanged: `MailWaitlistForm.astro`, `MailIcon.astro`, `BaseLayout.astro`,
  the site header and footer.
- `docs/website-mail-claims-2026-10-12.md` gains a note that the redesign
  changed layout only, with the §7 labels.

## 9. Verification

- Site build and SEO check pass; site browser suites (`test/site`) and the unit
  tests that read the Mail pages pass.
- No horizontal page scroll at 390, 800 and 1440 px on all six pages.
- Keyboard: every bar link, the page menu and the waitlist popover are
  reachable; Escape closes them and focus returns to the button.
- Emulated reduced motion, reduced transparency and increased contrast each
  render correctly.
- Proof for the owner: full-resolution crops of each page, live site above and
  redesign below, before a plan is written. The prototype is approved before
  implementation starts.
- Deploy only after owner approval, as a Mail-only deploy on
  `site-production-source`.

## 10. Out of scope

Launch-day changes to pricing and download; any change to product claims or
the hero copy; Blanc Browser pages; a dark appearance for the Mail pages.

## 11. Amendment: real screenshots (owner, October 12, 2026)

The owner judged Blanc Mail's interface close to final and approved real
screenshots, placed in four spots: the hero window, a light-and-dark
moment, the unified-inbox tile, and a new Inbox Zero and Rules showcase.
This replaces §2's "illustrations carry no claims" for those places only.
The remaining vignettes (undo, send later, Ghost Mode) stay textless.

**Where the images come from.** Only from the Mail repository's
`native/scripts/capture-public-shots.sh`, which rebuilds the signed demo app,
launches it through `run-dev.sh` and captures one window in demo mode, so no
connected mailbox can appear. The scenes are `main`, `dark`, `island`, `zero`,
`zero-night` and `rules`. Files are 2200 px WebP plus an 1100 px copy, served
from `site/public/mail/screens/`. The Island tile uses a crop of `island`.

**Labelled as a preview.** Blanc Mail has no public build, so
`docs/marketing-claims.md` requires a clearly labelled preview. A new
component, `MailShot.astro`, is the only way the Mail pages show a screenshot,
and it always renders a "Preview build" caption.

**Placement.**

- Hero: the real main window replaces the wireframe, in the same sunrise
  frame, still rising with scroll.
- "Every account together": the Island searching ("trip") replaces the
  account-colors vignette.
- New section "An empty inbox, kept that way." It has an Inbox Zero row,
  where a Dawn/Night segmented control (radio buttons, no script)
  cross-fades the two captures, and a Rules row.
- New section "At home in light and dark.": a compare control. A
  full-width range input sets where the dark window begins, so the divider
  sits under the pointer; arrow keys move it too.

**New copy.** Written from the source-backed research and recorded in
`docs/website-mail-claims-2026-10-12.md`; the owner approves it before deploy.
New interface labels: "Preview build", "Wallpaper" (hidden legend), "Dawn",
"Night", and "Compare the light and dark appearance" (the compare control's
accessible name).

**Before deploy.**

- Recapture every image from the signed release candidate, and refresh it
  whenever the interface changes (Mail `AGENTS.md`: a stale screenshot is
  claim drift).
- No screenshot names a real company. On October 12 the owner chose a
  fictional photo newsletter for the hero and fictional `.example` senders
  throughout the demo (bnfy/blanc-mail#128).
- The Mail repository's `docs/ISLAND_SIGNED_CHECKLIST.md` says captures are
  never published until launch. That line is updated to record the owner's
  October 12 decision in the same change that publishes them.
- The Rules copy depends on live Gmail behavior that EM-960 still lists as
  partial. Its live checks must pass before the page deploys.

## 12. Amendment: decisions after the prototype (owner, October 12, 2026)

These supersede the earlier sections where they differ.

- **Tagline.** "A little less inbox." replaces "Email that minds its own
  business." in the `/mail` hero, the page title and `public/mail-og.png`
  (pairs with Blanc Browser's "A little less browser."). It is branding, not
  a product claim. This overrides §10's "no change to the hero copy" for the
  headline only. `site/scripts/render-mail-og-card.mjs` re-renders the card.
- **A quiet site strip.** On Mail pages the site header is a 36px strip
  (44px at 760px and narrower) in the page's ivory, with muted 12px links and
  no Download pill styling, so the Mail bar reads as the page's navigation.
- **Bar breakpoints.** The six links fold into the page menu at 880px and
  narrower (not 640px). At 480px and narrower Join reads "Join" on screen
  and keeps the accessible name "Join the waitlist".
- **Screenshots large and unframed.** The hero, the Island, Inbox Zero and
  the light/dark compare are wider than the text column (up to 1360px, never
  wider than the viewport minus 32px) with no frame. On phones they crop to
  the window's centre. The hero rises into place with a scroll-driven
  animation where `animation-timeline: view()` is supported.
- **The Island uses the whole `island` capture**, not a crop.
- **Vignettes** play once when their tile first comes into view (touch has
  no hover) and again when a pointer enters the tile. They never loop and
  never play under reduced motion.
- **Demo content.** The captures show only fictional senders on reserved
  `.example` domains. The hero conversation is *Northlight Journal*, a
  fictional photo newsletter whose photos are crops of the app's own Inbox
  Zero art (bnfy/blanc-mail#128).
- **blanc.day.** The site moved to blanc.day (#747–#749). The Mail pages
  name `support@blanc.day`, and the share card reads "blanc.day/mail".
- **1100px copies** of the screenshots are built by
  `site/scripts/build-display-images.mjs`, so a recapture cannot leave a stale
  copy behind.
- **Deploy.** §2's and §9's deploy notes are replaced by Task 8 of
  `docs/superpowers/plans/2026-10-12-mail-pages-redesign.md`.

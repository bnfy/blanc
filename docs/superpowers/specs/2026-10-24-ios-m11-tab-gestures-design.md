# iOS M11: tab gestures and the card strip (F56) — design

Status: proposed 2026-10-24, for the owner's review. Builds on M9 (private
tabs, #1110) being merged. Parent design: the iOS 1.0 companion release
(`2026-10-24-ios-v1-companion-release-design.md`), which puts F56 in 1.0 and
leaves "the card strip's layout and the pill swipe's physics" to the builder
(§9). The behavior itself was decided in the user-feedback plan
(`2026-10-23-ios-user-feedback-plan.md` §7) and is recorded as F56 in
`spec/features.md`.

## 1. Why

On r/ArcBrowser (2026-10-24) a person looking for an Arc replacement on iPhone
named the two gestures they rely on: switching tabs by swiping the bottom bar,
and closing tabs by swiping up. The owner made both 1.0 features, and on
2026-10-24 chose a strip of page cards over keeping the list. On 2026-10-24
the owner moved M11 ahead of M10, because Bangs aren't a priority for the first
iOS release.

## 2. What the person gets

**Swipe the pill to switch tabs.** A sideways swipe on the resting pill moves
to the previous or next tab. The page follows the finger: the current page
slides with it and the neighbor's page comes in from the side. Let go past the
threshold and that tab is current; short of it, the page springs back. At
either end the pill resists and springs back. A tap still opens the palette,
and the pill's buttons (heart, Send, reload, +) still work. Back and forward
stay WebKit's swipes from the page edge (D7).

**The palette's tabs are a strip of page cards.** With the field empty, the
palette shows the open tabs as cards in a row that scrolls sideways, each a
picture of the page with its title under it. The current tab's card is
outlined and scrolled into view. Tap a card to go to that tab. Flick a card up
to close it: it follows the finger up and fades, as apps do in the iOS app
switcher. The list's swipe-left Delete goes. Pages sent here and other
devices' tabs stay lists under the strip; typing still shows the Quick
Switcher and `/` the commands.

**Undo after closing (owner, 2026-10-24).** Closing a tab, by flicking its card,
with `/close`, or any other way the person closes one, shows "Tab closed ·
Undo" at the pill for five seconds. Undo puts the same tab back where it was,
with its page and back history as they were. After the banner goes, `/reopen`
brings back the most recent closed tabs one at a time (their addresses and
titles), until Recently closed reaches the phone in M17.

**Private tabs.** They take part in both gestures like any tab, and their
cards carry the private look. Closing a private tab is final, as on desktop:
no Undo banner, and it never joins the `/reopen` list.

**Accessibility.** VoiceOver users get Next tab and Previous tab as actions on
the pill, and Close as an action on each card; `/close` and `/reopen` work as
before. With Reduce Motion, switching tabs and closing a card cross-fade
instead of sliding.

## 3. Calls made here (the builder's, for the owner to check)

- **Order.** The swipe and the strip follow the order of the phone's open
  tabs, private ones included. Groups aren't on the phone until M17; when they
  arrive, the swipe follows the pill's dots (the current group or run of
  ungrouped tabs) as F56 says, and groups become labeled runs in the strip.
- **Swipe feel.** The swipe starts on the pill only, and only when it is
  clearly sideways (at least 12 pt, and more sideways than vertical). It
  switches when the finger has travelled 30% of the screen's width, or when
  its predicted end passes 50%. Past either end the page moves a quarter of
  the finger's distance. The commit and the spring back use the same spring,
  and a light selection haptic marks the switch.
- **Page pictures.** A tab's picture is taken when it stops being the current
  tab, and the current tab's when the palette opens or a swipe starts. Pictures
  stay in memory only, private tabs' included, are never saved or synced, and
  go when the tab closes. Under memory pressure only the current tab's
  neighbors keep theirs. A tab with no picture yet shows its site's name on a
  plain card.
- **Card size.** Cards are about a third of the screen's width, at the
  screen's own proportions, with the title in one line under each, so about
  two and a half cards show at once and the row reads as scrollable.
- **Undo's reach.** The closed tab's page is kept alive only while its banner
  shows; Undo then restores it exactly. Closing the last tab still opens a
  blank one; undoing that close removes the blank tab if it hasn't been used.
  The `/reopen` list holds ten, lives only while the app runs, and reopens an
  address in a new tab.
- **Not in M11.** The iPhone Duo's regular width (D30) waits for Duo-1; the
  strip's drag-to-reorder and groups wait for M17.

## 4. Changes to the 1.0 design (owner, 2026-10-24)

- **Bangs (F47) leave iOS 1.0.** They follow after the first release. M10
  keeps the full slash-command set, Find in page and the shield chip.
- **M11 goes before M10.**

## 5. Done means

Both gestures, the strip, Undo and `/reopen` work on iPhone simulators on iOS
26.5 and 27.0, proven by UI tests, with VoiceOver actions and Reduce Motion as
above; private tabs follow §2; `spec/parity-matrix.md` F56 iOS reads PARTIAL.
A by-hand check on a real iPhone (feel of the swipe, the flick, the haptic)
comes before the beta.

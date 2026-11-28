# Mini Window: Move to Space (#1734, part 1)

**Status:** shipping Blanc (Electron) merged in bnfy/blanc#1763 (870c400de) and shipped in v1.53.0; the editor's tab count fixed in #1789 (unreleased); Blanc Beta (the fork) on `chromium/next` (2026-11-28).
**Asked for:** #1734 item 1, from Koen's feedback on #1138: the mini window as
a "look, then decide" window. Open something fast, then file it into a Space,
keep it (Open in Blanc), or let it close after an hour. Parts 2 (switch to
tabs and Spaces from the mini window) and 3 (opt-in: links from other apps
open in a mini window) get their own designs.

## What it does

- A **Spaces button** sits beside **Open in Blanc** at the front of a mini
  window's Island (the place the Space mark has in an ordinary window). It
  opens the ordinary Spaces menu in a *move* mode: the profile's Spaces, and
  New Space… (the usual editor). File → **Move to Space ▸** offers the same
  choices.
- Choosing a Space moves **every tab** of the mini window into it, in order,
  with their groups and splits, through `moveTabsToSpace` (all tabs, last tab
  allowed). Then the **mini window closes** and the Space's window comes
  forward, or opens if the Space is set aside (`openSpaceInProfile`). New
  Space… creates the Space with those tabs (`createSpaceWithTabs`) and shows
  it the same way.
- **This profile only.** Tabs can't change profile, so other profiles' Spaces
  aren't offered in move mode (the menu lists only the window's own profile).
- **All or nothing.** If any tab can't move (`canMoveTabToSpace`: a private
  tab, a page playing sound, using the camera or microphone, sharing the
  screen, holding a pop-up, mid quiet transition), nothing moves and the menu
  shows why, as Move to Space ▸ does today (`spaceMoveError`). A failed move
  leaves the mini window as it was. The File item is disabled in that case.
- **A blank start page doesn't count.** An unused New Tab page (exactly
  `blanc://newtab/`, `newTabPageUsed` false) isn't moved and doesn't block;
  it closes with the window. With only a blank page, the button is disabled.

## Approaches considered

1. **Spaces button beside Open in Blanc + the existing Spaces menu (chosen).**
   Most discoverable; reuses the menu, editor and error messages people
   already know, so almost nothing new is designed.
2. **Fold everything into the Open in Blanc chip** (a menu with Open in Blanc,
   the Spaces, New Space…). One chip, but Open in Blanc becomes two clicks.
3. **Menus only** (tab menu Move to Space ▸ for the last tab, File menu).
   Nothing new on the Island, but hard to find, which is what Koen asked to
   fix.

## Decisions

- **D1. Tabs join, mini closes** (owner, November 25, 2026). This departs
  from the Mini Window spec's D2 ("pages never move between windows") for
  this one action: the move goes through the same write-first Space move the
  ordinary Move to Space ▸ uses, so a page's state is handled as it is there.
- **D2. Spaces button + menu** (owner, November 25, 2026), over a combined
  chip or menus only.
- **D3. All or nothing, blank start page ignored** (builder's call): a
  partial move would leave a mini window holding the pages that couldn't
  move, which is neither choice the person made.

## Left to the builder

- The button's icon and tooltip copy (all five translations in the same PR),
  and how move mode marks itself in the Spaces menu (a header line such as
  "Move this window to…").
- Unit tests beside `test/unit/mini-window.test.js`; acceptance scenarios
  F61-6 and F61-7 for moving a mini window to an existing Space and to a new
  one.
- `browser-api/contract.json` and `bridges.json` edits for any new channel or
  payload field, and `copy/` and `substrate` checks.

# Mahjong visual refresh: Dawn sky

Date: 2026-10-17
Status: draft for owner approval
Scope: `src/renderer/pages/mahjong.*`, its tile artwork, `copy/messages/*`, `test/unit/mahjong-page.test.js`, `test/unit/start-page-fonts.test.js`, `docs/brand-usage.md`

## Why

Blanc Mahjong (`blanc://mahjong`, opened from every Start Page footer) still wears
the "classic lacquer" look from Mahjong v2 (#256, August 2026): a dark green
lacquer table (`mahjong-lacquer.webp`), brass trim, a heavy vignette, and glossy
enamel tile art with gold rims. The owner's words: "darker, drabber colors with
a more gothic traditional overall look. Reminds me of vintage board game." The
rest of Blanc has since moved to the Sunrise palette and Instrument Sans, so the
game feels like it belongs to an older Blanc.

The goal is a game that feels fresh, modern, **lighter and brighter**, so
regular Blanc Mahjong players notice the change and enjoy coming back.

## References

- **Look:** *Mahjong Blast!* by Zafer Studio (App Store id6499418475): a pale,
  bright sky backdrop, cream tiles, simple round controls.
- **Feel:** *Mahjong Blast* by Nebula Studio (App Store id6747492600, the one the
  owner plays): a glowing trail joins each matched pair, and clears feel
  satisfying. Its green felt and wood look is *not* the target.

## Goals

1. Replace the dark lacquer table with a **Dawn sky**: soft blue at the top
   fading through a pale lilac-white into Sunrise peach at the bottom (approved
   mock-up, option C).
2. In dark mode, an **Evening sky**: deep indigo at the top settling into a warm
   ember glow at the horizon (approved). Tiles stay light in both, so symbols
   stay legible.
3. Bright, clean tile bodies: white-to-warm-white face, a warm peach edge (deeper
   caramel at night), soft shadow. No brass.
4. **Keep every existing tile illustration's shape and motif** (flame, flourish,
   Blanc B, sunrise, sun, moon and wave, mountain, compass, panda, jade ring pip,
   jade and gold bamboo sticks, flower, ginkgo, the three seal variants) and give
   it a fresher finish (see Tile artwork).
5. Numbered (character) tiles move from JetBrains Mono to **Inter Bold**
   (approved option C).
6. All other game UI text (meters, dock labels, Boards, Records, setup, rescue,
   notices, the results card) moves to **Instrument Sans**, matching Blanc's
   internal pages (width 98, +0.01em tracking, as in the root CLAUDE.md).
7. Controls become light pills (white, translucent at night) with warm orange
   highlights and focus rings in place of brass.
8. Two gameplay "feel" upgrades borrowed from Nebula:
   - **Match trail:** when two tiles are matched, a short glowing trail draws
     from the first tile to the second, then both clear.
   - **Board-cleared celebration:** clearing a board gets a real celebratory
     moment before the results card, instead of the card simply appearing.

## Non-goals

- No change to rules, scoring, combos, modes (Classic/Burst), layouts, daily
  deal, records, saved-game state, or keyboard controls. `mahjong-engine.js` and
  `mahjong-state.js` should not change behaviour.
- No level path or progression map (discussed and deferred as a separate feature).
- No new tile set drawn from scratch. A flat, cartoon-style redraw was mocked up
  and **rejected as "too childish."**
- No new fonts. Inter, Instrument Sans and JetBrains Mono are already bundled.
- No change to sound cues (`mahjong-sound.js`).

## Anti-goals (would count as failure even if it works)

- Anything that reads as childish or cartoonish: flat clip-art icons, chunky
  rounded "kids' game" type, candy colors.
- Keeping any dark, drab, vintage-board-game cue in light mode: felt or lacquer
  texture, brass, heavy vignette.
- Tile symbols becoming harder to tell apart at the smallest board sizes.
- Losing the Blanc "B" on the white dragon (CLAUDE.md: the B motif in Mahjong
  tile art is an intentional nod to Blanc's origins and must remain).
- Any remote asset or new network path (per-file CSP; everything stays local).

## Palette (starting values from the approved mock-ups; the builder may tune)

Light, Dawn sky:
- Backdrop gradient, top to bottom: `#cfe6f7` 0%, `#f3ecf0` 45%, `#fde4cc` 80%,
  `#fbd7b4` 100%.
- Tile face `#ffffff` to `#fdf7ef`; edge `#ecc9a2`; shadow `rgba(160,100,50,.18)`.
- Pills: `#ffffffd9` on the sky, text warm brown `#6b5440`.
- Highlight, focus and selected tile: warm orange `#ff9f43`.
- Text on the sky: `#2a2017`.
- Tie to Sunrise tokens (`--sunrise-*` in `pages.css`) where a value matches
  (text, borders, accent) rather than inventing near-duplicates.

Dark, Evening sky (under `prefers-color-scheme: dark`, as today):
- Backdrop: `#1c2340` 0%, `#2e2a4a` 45%, `#5a3a46` 80%, `#7a4a3c` 100%.
- Tile face `#f7f0e5` to `#ece2d2`; edge `#b9875f`; shadow `rgba(0,0,0,.35)`.
- Pills: frosted `rgba(255,255,255,.1)`, text `#eadfce`.
- Highlight and trail: amber `#ffb35c`.

Private tabs (`:root[data-theme="private"]`): **my call** is the same light/evening
structure shifted to lilac (a lilac-to-rose dawn, a violet night), replacing
today's hue-rotated lacquer. No grain image.

Suit ink colors (characters, dots, bamboo accents) get brighter and cleaner than
today's `--mj-red #a63730` / `--mj-green #1f6d50` / `--mj-blue #275d86`, but stay
grown-up rather than candy-bright. Each must keep at least 4.5:1 contrast on the
tile face.

## Tile artwork

> **Out of scope (owner decision, 2026-10-17).** The original tile art ships
> unchanged in this refresh. Tone-mapped treatments were reviewed and
> rejected; the owner will have the art redone separately. The section below
> is kept as the original intent.

Keep each illustration's silhouette, composition and motif exactly. Change the
finish:
- Brighter, cleaner jade, red and black; lift the dark shadows inside the art.
- Replace heavy gold rims and bevels with softer, lighter **champagne** trim.
- Less specular gloss and embossing, so it reads as a modern enamel pin, not an
  heirloom set.

How (**my call**, builder may propose better): a committed, re-runnable script
(for example `scripts/build-mahjong-art.mjs`, matching the repo's other
`*:build`/`*:check` scripts) that derives the refreshed PNGs from the current
ones by tone and color mapping (gold to champagne, deepened shadows lifted,
saturation and brightness tuned, gloss highlights softened). This keeps shapes
pixel-identical and the result reproducible. Keep the same file names and sizes
so `mahjong.js` face-building code stays unchanged. If a mapping can't reach an
acceptable finish for a particular asset, that asset is flagged to the owner
rather than redrawn freehand.

One set of art serves both light and evening (tiles stay light at night). The
CSS may apply a small per-theme filter if the evening tile needs it.

**Review stop (my call):** the owner has only seen a rough CSS-filter preview of
the finish. Before the art PR goes further, produce a contact sheet of every
refreshed asset on light and evening tiles beside today's art for owner sign-off.
Until it's approved, the art stays untouched. There is no interim "ship the
CSS filter" fallback.

## Typography

- Character tile numerals: `--mj-face-font` becomes Inter at weight 700 (approved
  "Inter Bold"), tight tracking (about -0.02em). The wind badge letters
  (`.mj-wind-direction-label`), which share `--mj-face-font`, follow it.
  **This reverses the September 2026 decision** that kept tile faces on
  JetBrains Mono 800 (PR #274). The owner made the reversal explicitly in this
  design. Update the guarding test "tile-face type stays JetBrains Mono…"
  rather than deleting coverage: it should now assert Inter 700 on the faces.
  The wind badge letters (`.mj-wind-direction-label`) already use Inter at
  weight 820. They only get tracking and weight tuned to sit with the numerals.
- **JetBrains Mono stays bundled (my call).** After this change nothing in the
  app uses it, but removing it touches the license-gated packaging and notices
  (`THIRD-PARTY-NOTICES.md`, `src/THIRD_PARTY_NOTICES.txt`, the packaged
  compliance check) and CLAUDE.md. That cleanup is a separate follow-up, not
  part of this work.
- Game UI: drop the `--font-text: var(--font-ui)` remap at the top of
  `mahjong.css` so shared page rules use Instrument Sans as everywhere else.
  Counts and key caps follow the internal-page rule (they stay Inter). Score,
  timer and pair counts are counts, so they stay Inter with tabular numerals.
- Both changes **supersede recorded decisions** in `docs/brand-usage.md`: the
  "Mahjong: classic lacquer" exception (`#0B3D31`, `mahjong-lacquer.webp`,
  brass) and System v3's (Oct 15) "the game keeps Inter for its controls."
  Rewrite those entries to describe the Dawn sky decision and mark the old ones
  superseded (dated 2026-10-17, owner-approved in this design).
  `test/unit/start-page-fonts.test.js` asserts the JetBrains face and the
  `--font-text: var(--font-ui)` remap, so update it alongside.

## Match trail

- Fires on every successful pair, in both Classic and Burst, from the
  first-selected tile to the second.
- A short, bright stroke (warm orange by day, amber by night, lilac in private)
  that draws from tile A to tile B, glows briefly, and fades as the tiles leave.
  It should feel quick and never delay play. Target total ≤ 350 ms, overlapping
  the existing clear and tray-flight animations rather than running before them.
- **Burst mode (my call):** a `tray-pair` match pairs a board tile with a tile
  already parked in the tray, so the trail runs from the **tray slot to the
  board tile** the player just clicked, then the tile's existing flight to the
  tray proceeds. A board-only pair (Classic) runs tile to tile.
- **Auto-clears (my call):** pairs removed automatically at a milestone
  (`result.autoClear`) get their own trail too, a beat after the player's pair,
  so "every successful pair" holds.
- Must hook into the existing animation bookkeeping (`trackTransient`,
  `invalidateTileAnimations`, tile-animation generations) so undo, shuffle, new
  deal and visibility changes cancel it cleanly.
- Combos may intensify it (brighter, thicker at heated/brilliant/masterful
  tiers), consistent with `.mj-combo-fx` tiers. **My call:** subtle scaling only.
- Rendered as CSS/SVG over the board, using no new raster assets and no new network path.

## Board-cleared celebration

- When the last pair clears, play a short celebration over the board (about
  1–1.5 s): the sky brightens, a burst of soft light and confetti-like sparks
  in the tile and suit colors (reuse or recolor `mahjong-combo-particles.png`
  and `mahjong-combo-glint.png` where they fit), then the existing results card
  (`.mj-win-result`) rises in.
- New-record and first-clear outcomes (already distinguished by
  `mahjong.win.newRecord` / `firstClear`) get a slightly bigger moment.
- Click or key press skips straight to the card.
- Zen and "quiet" wins keep a gentler version (**my call**), matching how
  `mahjong.win.quietTitle` already softens them.
- Reuse existing win copy where possible. Any new visible or announced string
  goes in `copy/messages/en.json` and every shipped language
  (de, es, fr, pt-BR, it) in the same PR, acknowledged with `copy:ack`.

## Reduced motion

`mahjong.css` already has one `prefers-reduced-motion` block. With reduced
motion, matched tiles are removed immediately (`animateTileResult` at 0 ms)
and that must not change. **My call:** no pause is added. Instead, a soft, static
glow mark appears where each matched tile was and fades out. It doesn't travel
and doesn't delay play. The celebration becomes a simple fade-in of the results
card with a still glow and no particles.

## What else changes

- Remove `mahjong-lacquer.webp` and the `::before` and `::after` grain and vignette
  layers. Delete the asset from the package if nothing else references it.
- Restyle every Mahjong surface to the light treatment: header meters, dock,
  Boards sheet and layout cards, setup, Records, rescue and notice dialogs, the
  tray (Burst), results card, combo callouts, hint glow and blocked-tile
  feedback.
- `color-scheme` follows the theme (light by day, dark at night) instead of
  being forced dark.

## Constraints

- Flat-file serving: every asset sits directly in `src/renderer/pages/`
  (`pages.js` serves no subdirectories).
- Per-file CSP in `mahjong.html` stays as narrow as it is now.
- CSS over inline styles (owner's global rule). Theme values are custom
  properties on `.mahjong-body`.
- `test/unit/mahjong-page.test.js` asserts many current values (lacquer tokens
  `#0b3d31` and others, `mahjong-lacquer.webp`, JetBrains Mono on faces,
  `.mj-win-result` using `var(--mj-table)`, primary-button hover colors).
  Update these to assert the new design deliberately. They encode decisions
  (see the repo's policy-test convention), so every changed assertion should
  reflect the new decision, not just be loosened.
- `copy:check` / i18n scope: `mahjong.html`, `mahjong.js` are guarded, so no
  hard-coded English.
- Verify in the real app, not the Browser pane: the pane reports
  `document.hidden`, which freezes Mahjong's dialog animations and timer. Use
  `npm start` relaunches (chrome-level reload doesn't apply here, but a fresh tab
  is safest) or a Playwright `_electron` probe, and check light, dark and
  private.
- **Website:** `site/` has a Mahjong preview (`site/src/scripts/mahjong-preview.js`,
  guarded by `website-mahjong-preview.test.js`). Marketing must stay
  release-backed, so the site preview and any captures keep the released look
  until this ships in a public release. Updating them is a post-release
  follow-up in its own website-only PR.

## Left to the builder

- Exact gradient stops, shadow values and suit ink hues within the direction above.
- The trail's exact shape (straight vs gentle arc), thickness and easing.
- Celebration choreography details and particle count, within the budget and
  feel above.
- How to structure the art script and which color mappings achieve the finish.
- Breaking the work into PRs. A suggested order: (1) table, palette, fonts and
  surfaces; (2) refreshed tile art; (3) match trail and celebration.

## Calls I made (owner to confirm while reading)

1. Private tabs get a lilac version of Dawn and Evening skies.
2. Tile art is refreshed by a reproducible script from today's PNGs, not
   redrawn by hand. Any asset that can't reach the finish gets flagged.
3. Score, timer and counts stay Inter (tabular), consistent with the
   internal-page rule. All other game text moves to Instrument Sans.
4. Wind badge letters follow the numerals to Inter Bold.
5. Combo tiers scale the trail subtly. Zen and quiet wins get a gentler
   celebration.
6. The website preview waits for a public release.
7. The refreshed tile art gets a contact-sheet review stop before it ships, with no
   CSS-filter fallback.
8. In Burst, the trail runs tray slot to board tile. Auto-cleared pairs get a
   trail too.
9. With reduced motion, a static glow mark where the tiles were, no added pause.
10. JetBrains Mono stays bundled. Its removal is a separate follow-up.
11. `docs/brand-usage.md`'s lacquer exception and "game keeps Inter" entries
    are rewritten as superseded.

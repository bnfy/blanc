# Island UI refresh (1.1.0) — design

**Date:** 2026-08-08
**Status:** Approved, ready for planning
**Source of truth:** the Blanc Design System, `design_handoff_island_chrome/PORT-CHECKLIST.md`
(10 items, locked 2026-08-08) with `components/chrome/Island.jsx` as the byte-synced
reference implementation.

## Decision

Port all ten checklist items into `src/renderer` in one cycle. Per the maintainer's
ruling, **UI/UX changes made in Claude Design on 2026-08-08 supersede code** — this is
the app catching up to a design that deliberately moved ahead.

## Nature of the work: transcription, not interpretation

The handoff is far more specified than a typical design reference: **83 CSS rules across
31 classes**, with final values covering every checklist item — including the two that
look hardest. The cistern downloads fill is fully specified (`inset: 4.5px`, fluid
`height: calc(var(--dl-progress,0) * 100%)`, two wave layers at 2.4s and 3.9s-reversed at
0.5 opacity, `clip-path: inset(calc(100% - var(--dl-progress,0) * 100% + 1.2px) 0 0 0)`
for the submerged glyph, `translateX(-16.6667%)` drift keyframe). So is the blocker
(24px button, badge `top:-1px right:-4px` at 7.5px mono, `.quiet`/`.off` states).

The plan therefore quotes DS declarations verbatim into its task steps rather than
re-deriving them. Three things the DS does **not** give, which we author:

1. `--font-kbd` and `--island-panel-radius` — named by the checklist, but their
   `tokens.json` entries are ours to write.
2. The B monogram path — lives in the DS's `assets/blanc-symbol.svg`
   (`viewBox 0 0 149.21 199.16`, aspect 0.749, so a 12px-tall glyph is 8.99px wide),
   not in `Island.jsx`.
3. Placement of the new pill ✕ — `.bw-pill-close` CSS exists; its position is stated
   only as prose ("after heart, before downloads").

## Architecture

No new modules, no new IPC channels, no main-process logic changes. The surface is
`styles.css`, `overlay.js`, `renderer.js`, `index.html`, `overlay.html`, plus
`tokens/tokens.json` and `pages/pages.css`.

**Class naming: keep the app's names, port the declarations into them.** The DS
namespaces everything `.bw-*`; the app uses `#pillShield`, `.footer-new`,
`.island-row`, and so on. Introducing a parallel `.bw-*` namespace would leave two
naming systems for one surface — the exact drift the 2026-08-08 DS reconciliation just
removed. The mapping is mechanical and belongs in the plan as an explicit table.

## Token changes (items 1–3)

Four token edits, each landing in `tokens.json` **and** the consuming CSS in the same
commit. CLAUDE.md is explicit that desktop CSS is *guarded, not generated*: a token
value changed in `styles.css` without the matching `tokens.json` update fails
`npm run substrate:check`, which `.github/workflows/parity-guards.yml` runs on every
push.

| Token | Change | Consumers |
|---|---|---|
| `--shadow-pill` | single drop → contrast-rim specular + diffuse | chrome |
| `--shadow-popover` | single drop → specular variant | chrome |
| `--island-panel-radius` | **new**, `18px` (panel radius was hardcoded 10px) | chrome |
| `--font-kbd` | **new**, system stack | chrome **and pages** |

`--font-kbd` reaches `pages.css`: `.shortcut-row kbd` (`pages.css:752`, with a
wrapping rule at `:994`) renders shortcut chords on `blanc://shortcuts`. JetBrains Mono
draws ⌘/⇧/⌥/⎋ malformed, which is the whole reason for the token, so the internal page
needs it as much as the chrome does.

## Ordering

1. **Tokens (1–3)** first. The shadows and panel radius change how every other surface
   reads; judging the new blocker against the old shadow means judging it against a look
   we are replacing.
2. **Structural chrome (6–9)** — pill ✕ and group-name removal, panel chevron and
   capsule address input, tab-row changes, footer pills.
3. **Showpieces (4, 5) and glyphs (10)** — cistern downloads, Blanc Blocker, the
   redrawn `mute` and new `bookmark` glyphs. These sit *inside* the surfaces the first
   two stages establish.

## Behaviour changes (everything else is visual)

Two, both explicitly confirmed by the maintainer:

- **The active group's name leaves the resting pill.** Group identity remains in the ⌘L
  panel (group headers, the per-row chip) and in the dots, which still show the active
  group's tabs. `pillGroupName` and its render path are removed.
- **A ✕ joins the pill's action cluster** (after heart, before downloads; accent
  background on hover; hidden when there are no tabs), closing the active tab.

These two get release notes. The rest is a restyle and does not need itemising for
users.

## Blanc Blocker naming (item 5)

**User-visible strings only.** Tooltips ("Blanc Blocker — ads & trackers blocked here" /
"Blanc Blocker off for this site"), the popover header, and aria-labels adopt the name.

**Internal identifiers deliberately stay `shield`** — `#pillShield`, `shield-model.js`,
`calculateShieldBounds`, the `'shield'` overlay mode, and the `@F12` step text are
unchanged. This is the same label/identifier split the codebase already applies to
Favorites↔`bookmarks`, and it avoids a wide mechanical rename across `main.js`, both
renderers, the test hook, and four acceptance scenarios — code that changed hours ago in
the 1.1 M1 window-runtime work.

The visual becomes the B monogram in a 24px button with the count as a badge disc, per
`PORT-CHECKLIST` item 5 and `Island.jsx`. The README's §1 description (a tinted capsule
with the count as a right lobe) is **stale** and was annotated as such in the DS on
2026-08-08.

## Verification

**Geometry by measurement, against the DS's own declared numbers** — using the
Playwright harness pattern established for the shield popover: launch with
`BLANC_TEST=1`, drive the real chrome, read computed styles and
`getBoundingClientRect()`, and assert the DS values (24px blocker button, 4.5px vessel
inset, 10px badge, 18px panel radius, 620px panel width, hit targets ≥24px). Numbers
are transcribed, so the check is "did the transcription land on the same rendered
geometry", not "what should the geometry be".

**Existing acceptance scenarios stay green, unchanged.** This is a restyle: a scenario
needing edits means behaviour moved where it should not have. The two intended
behaviour changes above are the only exceptions, and neither is covered by an existing
scenario (no scenario asserts the pill's group name or a pill ✕).

**A deliberate dark-mode pass** on the two items where a correct number can still render
wrong: the specular rim (item 1) and the cistern's submerged-glyph clip (item 4).
Playwright pins `colorScheme: light`, so this requires the per-page `emulateMedia`
override — the same gap that made an earlier dark-mode check inconclusive during the
shield-popover work.

**Substrate:** `npm run substrate:check` must pass, which is what proves the four token
edits moved `tokens.json` and the CSS together.

## Out of scope

- Anything not in `PORT-CHECKLIST.md`. The README's `/off-leash` and `blanc://favorites/`
  were stale handoff text, corrected in the DS on 2026-08-08; shipped `/allow-ads` and
  `blanc://bookmarks/` are correct and stay.
- The `search` glyph's quarter-pixel difference between DS and app — below the threshold
  of mattering, left alone in both.
- M2 (independent windows) and M3 (local profiles). This refresh is independent of them
  and touches no window-runtime code.

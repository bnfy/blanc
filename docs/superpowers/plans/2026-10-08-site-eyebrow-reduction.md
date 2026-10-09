# Site eyebrow reduction — implementation plan

Spec: `docs/superpowers/specs/2026-10-08-site-eyebrow-reduction-design.md` (approve that first).
Branch: `site/reduce-eyebrows`, in the main checkout. This change is site-only, so the
website-only CI gate skips the Electron jobs.

Goal: cut the site's eyebrows from 230 to the spec's 17-entry allowlist, keep the Features popover
previous/next labels working, remove the CSS left with nothing to style, and add a guard test so
the count stays down.

## Task 0 — Baseline build

Before editing anything, build the site and keep a copy of the output for comparison.

```bash
npm run site:build
rm -rf "$SCRATCH/dist-before" && cp -R site/dist "$SCRATCH/dist-before"
```

(`$SCRATCH` is the session scratchpad.) This build is the "before" for Tasks 6 and 7.

## Task 1 — Guard test (write it failing)

Create `test/unit/site-eyebrows.test.js`:

- Walk `site/src/**/*.astro`.
- Match every element whose `class` attribute contains one of `section-kicker`, `pop-eyebrow`,
  `mail-eyebrow`, `frame-kicker` or `eyebrow` as a whole class name. Take the inner text,
  collapse whitespace and decode `&amp;`. The homepage hero's text spans several lines, so the
  match must allow newlines.
- Record `MemoryChart.astro`'s `{kicker}` expression as a dynamic entry. The test then fails
  while the prop exists, and Task 4 removes it.
- Assert the sorted `file → text` list equals the spec's 17 entries exactly, so both additions
  and removals fail with a readable diff.
- Add a positive control: run the matcher on a small inline fixture with one eyebrow of each class
  (including a multi-line one) and assert it finds all five. A typo in the matcher then fails the
  test instead of letting it pass on an empty list.

Run `node --test test/unit/site-eyebrows.test.js`. It must fail and list the 213 surplus entries.

## Task 2 — Popover labels move to a data attribute

1. `site/src/components/bento/FeaturePop.astro`: add a required `label: string` prop and render
   `data-pop-label={label}` on the `<article>`.
2. `site/src/scripts/feature-bento.js:38`: change `labelOf` to read
   `bodies.get(tile.dataset.pop)?.dataset.popLabel ?? ''`.
3. `site/src/pages/features.astro`: on each of the 33 `<FeaturePop>`s, add `label="…"` with the
   text of its eyebrow, then delete the `<p class="pop-eyebrow">` line. The two exceptions:
   `label="Named Workspaces"` and `label="1Password"`.
4. `test/site/features-bento.test.mjs`: in an existing popover-navigation test, open Glance and
   assert `[data-pop-prev]` and `[data-pop-next]` contain the neighbouring tiles' names (read from
   those tiles' `data-pop-label`s, not hard-coded). Assert both are non-empty.

## Task 3 — Remove the section, frame, legal and mail eyebrows

Use a throwaway script in `$SCRATCH` (not committed) that takes the spec's removal list as
`(file, exact text)` pairs. For each pair it deletes exactly one matching
`<p class="…">text</p>` element and its surrounding whitespace, and it stops with an error if a
pair matches zero times or more than once. Where several identical texts appear in one file
("good to know" and "ready when you are" on a feature page), list the pair with its count and
check the count. The script leaves wrapper elements in place.

Groups (the counts are the expected number of removals):

| Group | Files | Removals |
|---|---|---|
| Feature detail pages | `pages/features/*.astro` | 85 (all but the workspaces hero and the security version line) |
| Trust-page guides | `components/guides/*.astro` | 49 |
| Features hub closing CTA | `pages/features.astro` | 1 ("ready when you are") |
| Homepage | `pages/index.astro` | 5 |
| Landing pages | `download`, `arc-alternative`, `ublock-origin-after-chrome` | 14 |
| Ambassadors, About, Press | `ambassadors`, `about`, `press` | 4 + 1 + 11 |
| Changelog | `changelog.astro` | 1 |
| Legal and import | `terms`, `privacy`, `import-tabs` | 3 |
| Mail | `mail.astro` (2), `mail/pricing.astro` plan labels (2) | 4 |
| Release evidence | `components/ReleaseEvidence.astro` | 1 ("independent review") |

The 33 popovers (Task 2) and the `MemoryChart` kicker (Task 4) bring the total to 213.

Afterwards, read the diff by hand. Every hunk should delete one eyebrow element and nothing else.
Pay particular attention to the homepage, where the `frame-kicker`s share lines with `<h2`.

## Task 4 — MemoryChart

`site/src/components/MemoryChart.astro`: remove the `kicker` prop, its default and the
`<p class="section-kicker">{kicker}</p>`. Remove the `kicker="…"` argument from its three callers
(`pages/features/ad-blocking.astro`, `pages/press.astro`, `components/guides/ad-blocking.astro`).
Leave the figures and the `public-truth` pins alone.

Run the guard test; it must now pass.

## Task 5 — Remove orphaned CSS

For each candidate in the spec's CSS section, confirm the class it requires appears nowhere the site
renders from: `site/src`, `site/public` HTML/SVG, and the desktop files the figures import with
`?raw` (`src/renderer/index.html`, `renderer.js`). Ignore names inside `:not()`. Delete only the
confirmed rules. Where a selector list mixes a dead and a live selector, remove only the dead one.
Don't rewrite any `:not(.section-kicker)` or `:not(.pop-eyebrow)` selector.

## Task 6 — Automated checks

```bash
npm run test:unit
npm run site:build
(cd site && npm run preview -- --background --host 127.0.0.1 --port 4322)
BLANC_SITE_URL=http://127.0.0.1:4322 node --test test/site/features-bento.test.mjs test/site/crawl-hygiene.test.mjs
(cd site && npm run preview -- stop)
```

Then the computed-style comparison (a throwaway Playwright script in `$SCRATCH`). Serve
`$SCRATCH/dist-before` and `site/dist` on two ports and load every page by its `.html` path at
1280 and 390 px, with reduced motion and analytics consent denied. For each page:

- Fail if any removed eyebrow selector still matches an element.
- Match elements between the two builds by DOM path, skipping removed eyebrows. Hash each
  element's computed style, plus `::before` and `::after`, with property names sorted and
  `location.origin` stripped from `url()` values. Compare the hashes. Expect no differences.
  Positions are not part of computed style, so any difference means a rule changed.
- Separately compare each heading's `getBoundingClientRect().top`, relative to its section,
  between the builds. Report every heading that moved, and confirm each one moved only because the
  eyebrow above it was removed.

## Task 7 — Visual check and proof

With the `site-4331` dev server (or the two static builds), capture at full resolution, crop to the
changed area, and stack before above after with a thin divider:

1. Homepage: the Island section (eyebrow kept) and the Tabs section (eyebrow removed).
2. `/features/glance`: hero and first two sections.
3. `/features`: a popover open, showing the previous/next labels.
4. `/download` hero and install section.
5. `/press` hero (kept) and one section (removed).
6. `/mail/pricing`: the hero (kept) and the plan cards (removed).

Send them with a numbered "where to look" list. If a block now looks too tight against what is
above it, fix the spacing in CSS (never with inline styles) and recapture. Spacing changes like
that are allowed under this plan; anything else goes back to the owner.

## Task 8 — Commit and PR (after owner approval of the results)

One commit for the spec and plan, then one for the implementation. Run `/verify` and `/simplify`
before committing the implementation. Open the PR against `main`. Merge only after every check run
on the head SHA passes. Deploying is a separate step that needs an explicit "deploy" from the owner
(`npm run site:deploy`, then confirm the deployment is `Production` on `main` at the merged SHA).

## Rollback

Revert the implementation commit. Nothing here touches data, the app, or a URL.

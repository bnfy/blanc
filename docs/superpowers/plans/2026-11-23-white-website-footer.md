# White Website Footer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the shared website footer from a dark `#111` block into a white band that matches the header, with the same links and layout.

**Architecture:** A restyle of `.website-footer` in `site/src/styles/revamp.css` plus one asset swap in `site/src/components/Footer.astro` (the ink Blanc word). No markup structure, link or copy changes. The brand guide and site notes change with it.

**Tech Stack:** Astro site, plain CSS, Playwright site tests (`node --test test/site/*.test.mjs` against a running site), Node unit tests.

**Spec:** `docs/superpowers/specs/2026-11-23-white-website-footer-design.md`

## Global Constraints

- Footer background: `--site-surface-raised` (`#FFFFFF`).
- Lockup word: `/lockup/blanc-word-display-ink.svg`; the Sunrise mark (`/lockup/sunrise-mark-256.webp`) is unchanged.
- Headings and tagline in ink; links `--site-text-dim` (`#6B6257`) at rest, ink on hover; focus rings `--site-gold`; dividers `--site-border` (`#E6DDD0`).
- Newsletter: white field with a `--site-border` outline, ink Subscribe pill with a cream label.
- Horizon rule unchanged: `--site-gold-on-dark` hairline and the 0.22 glow (builder's call: it reads as gold on both the cream seam and the homepage's dark seam; gold on light at 55% read muddy on cream).
- Link rows tighter only with `pointer: fine`; touch keeps today's rows (9px padding, about 36px).
- No link, wording, order or structure changes; the header is untouched.

- Amendment (owner, after the build): the homepage keeps the dark footer through BaseLayout `footer="dark"` and Footer `tone`; both looks come from `--footer-*` variables; the contrast test expects the homepage dark with the white word.

## Review Focus

1. Every footer text color on white meets WCAG AA (4.5:1), including the homepage notes, the bottom row and the newsletter status line.
2. On a touch device the column links stay as tall as today (about 36px).
3. Hover, focus rings and the Privacy choices button still show on white.
4. The homepage's dark section meets the white band with the gold hairline on the seam and no gap.
5. The newsletter prompt card (`NewsletterPrompt.astro`) shares `foot-news-*` classes; footer-scoped rules must not change it.

---

### Task 1: White footer band

**Files:**
- Modify: `site/src/components/Footer.astro` (lockup word `src`)
- Modify: `site/src/styles/revamp.css` (the *Site footer* block, about lines 400–620)
- Modify: `test/unit/brand-assets.test.js:258`
- Modify: `test/site/footer.test.mjs` (two new tests)
- Modify: `docs/brand-usage.md` (*Editorial website footer*), `site/CLAUDE.md` (footer sentence)

**Interfaces:** none beyond the files above.

- [ ] **Step 1: Write the failing tests**

In `test/unit/brand-assets.test.js`, the footer assertion expects the ink word:
`assert.match(footer, /site-lockup--display[\s\S]*src="\/lockup\/blanc-word-display-ink\.svg"/);`

In `test/site/footer.test.mjs` add:
- `footer text meets AA contrast on its white band on every page profile`: for `/`, `/features/island`, `/privacy`, `/mail` at 1440px, assert the footer's computed background is `rgb(255, 255, 255)`, then for every `a`, `h2`, `p`, `li`, `button`, `.foot-news-status` inside `#site-footer` (honeypot excluded) assert the WCAG contrast ratio of its color against white is at least 4.5.
- `footer column links sit closer with a mouse and keep their rows on touch screens`: at 1440px every `.website-footer-grid nav a` is at most 31px tall; in a context with `hasTouch: true, isMobile: true` at 390px each is at least 36px.

- [ ] **Step 2: Run the tests and see them fail**

Run: `node --test test/unit/brand-assets.test.js` → FAIL on the footer word.
Run (site on 4331): `BLANC_SITE_URL=http://127.0.0.1:4331 node --test test/site/footer.test.mjs` → the contrast test FAILS (background `rgb(17, 17, 17)`).

- [ ] **Step 3: Implement**

Swap the word `src` in `Footer.astro`. Restyle the footer block in `revamp.css` to the Global Constraints values, update the block's comment, add an `@media (pointer: fine)` rule with tighter column-link padding (6px) and keep 9px otherwise, and scope every newsletter rule under `.website-footer`.

- [ ] **Step 4: Run the tests and see them pass**

Run: `node --test test/unit/brand-assets.test.js test/unit/site-navigation.test.js test/unit/media-page.test.js test/unit/site-island-visual.test.js` → PASS.
Run: `BLANC_SITE_URL=http://127.0.0.1:4331 node --test test/site/footer.test.mjs test/site/newsletter-prompt.test.mjs test/site/blubird-reach.test.mjs test/site/whats-new-page.test.mjs` → PASS.

- [ ] **Step 5: Docs**

`docs/brand-usage.md` *Editorial website footer*: white band, ink lockup word, `--site-text-dim` links turning ink, `--site-gold` focus rings, `--site-border` rules, and the November 23, 2026 date and reason. `site/CLAUDE.md`: "one unified dark component" becomes the white band.

- [ ] **Step 6: Build and look**

Run: `npm run site:build` → succeeds. Screenshot the footer at 1440, 768 and 390px on `/` and `/features/island` and compare with the approved mockup A.

- [ ] **Step 7: Commit**

```bash
git add site/src/components/Footer.astro site/src/styles/revamp.css test/unit/brand-assets.test.js test/site/footer.test.mjs docs/brand-usage.md site/CLAUDE.md docs/superpowers/specs/2026-11-23-white-website-footer-design.md docs/superpowers/plans/2026-11-23-white-website-footer.md
git commit -m "Site: white footer band"
```

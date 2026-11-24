# Lighter Website Cream Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give blanc.day a lighter cream page background, with its section and border tones lightened to keep the same steps between them.

**Architecture:** This changes only the website's own tokens: `--site-bg`, `--site-bg-rgb`, `--site-surface` and `--site-border` in `site/src/styles/site.css`, their copies in `revamp.css`, and the homepage's own copies in `home.css`. Blanc White (`#F8F2E8`) stays the brand color and the app's light Sunrise color, so nothing outside `site/` and the brand guide changes. A new unit test keeps the three stylesheets equal and checks text contrast.

**Tech Stack:** Astro site CSS, `node --test` unit tests.

**Spec:** None. The owner asked for "a lighter cream bg for the website" (November 23, 2026) and said to dive in without a design discussion. The decisions below were made while planning and are the owner's to change.

## Decisions (planner's calls, for the owner to confirm)

1. **Website only.** `#F8F2E8` stays **Blanc White**, the brand color in `docs/brand-usage.md`, used by the app's `--sunrise-bg`, `tokens/tokens.json`, the newsletter emails and the press material. The site's page color stops being Blanc White and becomes its own lighter value. Changing Blanc White itself would touch the app and need a release, so it is out of scope.
2. **Option A, "Lighter", is the default.** It was compared on the live homepage against Option B on November 23, 2026:

   | Token | Current | **A: Lighter (default)** | B: Lightest |
   |---|---|---|---|
   | `--site-bg` | `#F8F2E8` | `#FBF7F0` | `#FDFAF5` |
   | `--site-bg-rgb` | `248, 242, 232` | `251, 247, 240` | `253, 250, 245` |
   | `--site-surface` | `#F2EADE` | `#F5EFE5` | `#F7F2EA` |
   | `--site-border` | `#E1D7C9` | `#E6DDD0` | `#E9E1D5` |

   B makes the white masthead, footer, forms and cards nearly vanish (white vs. page contrast is 1.04, against 1.11 today and 1.07 with A). To switch to B, replace the A values with the B values in every task; nothing else changes.
3. **Unchanged:** `--site-surface-raised` (white), `--site-text-dim` `#6B6257`, `--site-gold` `#805D28`, `--site-gold-on-dark`, `--site-selection` `#F6EBD5`, `--site-ink-warm`. Cream *text* on dark tiles (`color: #F8F2E8` in `site.css` lines 516, 523, 1228, 1240, 1250, 1260, 1273, 1274 and the checkmark in `home.css:1324`) stays Blanc White: it sits on ink, not on the page. The Media page's `#f7f0e5` icon tile (`media.css:298`) and the Mail pages' own `--mail-paper` palette are deliberate and stay as they are. OG share cards (`site/scripts/render-og-cards.mjs`) are images and keep Blanc White.

## Global Constraints

- Muted text (`#6B6257`) and gold (`#805D28`) must still meet **4.5:1** on the page and section colors (`docs/brand-usage.md`, *Sunrise palette*). With A they measure 5.60:1 on the page and 5.22:1 on sections; with B, 5.74 and 5.36.
- `site.css` and `revamp.css` must carry equal page, surface and border values (the comment at `site.css:34` requires it).
- Website-only PR: touch only `site/`, `docs/` and `test/` (memory: split website-only PRs). Because it changes `test/unit/`, CI's website-only gate doesn't apply and the Electron jobs run too.
- Don't merge to `main` while a desktop release is being prepared (CLAUDE.md, *Merges to `main` during a release*).
- Deploying is a separate step (`npm run site:deploy`, then confirm the commit is `Production` on `main`); this plan stops at the merged PR.

## Review Focus

1. **The homepage's opening sunrise** ends on a hard-coded `#f8f2e8` (`home.css:2269`, `@keyframes sun-sky`). Left alone, the hero ends one shade darker than the page around it, a visible band. Task 2 points it at `--paper`, and Task 1's test fails on any hex there.
2. **Pages with their own copies of the tokens.** `home.css` repeats the values on `.home-cinema` (`--paper`, `--surface`, `--line`). Task 1's test checks all three files.
3. **White raised surfaces against the lighter page** (masthead once scrolled, footer, forms, Download tiles, FAQ). They rely on shadow and border to stand out. Task 3 checks them on screen.
4. **Dark-mode or translucent overlays built from `--site-bg-rgb`** (the consent dialog, the masthead's blur). They pick up the new RGB automatically; Task 3 checks one.
5. **Contrast regressions if someone later picks B or another value.** Task 1's test computes contrast from the CSS, not from constants.

---

### Task 1: Guard test for the website's cream

**Files:**
- Create: `test/unit/site-cream.test.js`

**Interfaces:**
- Produces: the test file Task 2 makes pass.

- [ ] **Step 1: Write the failing test**

CommonJS, like `test/unit/blanc-white-palette.test.js`. Read the three stylesheets as text. Tests:

- `site cream tokens are the lighter website palette`: `site.css` contains `--site-bg: #FBF7F0;`, `--site-bg-rgb: 251, 247, 240;`, `--site-surface: #F5EFE5;`, `--site-border: #E6DDD0;` (case-insensitive match).
- `revamp.css and the homepage repeat the same values`: `revamp.css` has `--site-bg`, `--site-bg-rgb`, `--site-surface`, `--site-border` equal to `site.css`'s (compare lowercased); `home.css`'s `.home-cinema` block has `--paper`, `--surface`, `--line` equal to `--site-bg`, `--site-surface`, `--site-border`.
- `the homepage sunrise ends on the page color`: the `@keyframes sun-sky` rule's `100%` step uses `var(--paper)` and contains no `#` hex.
- `muted text and gold meet 4.5:1 on the page and sections`: a small WCAG relative-luminance helper; `contrast('#6B6257', bg)`, `contrast('#805D28', bg)`, and the same two on `surface`, each `>= 4.5`, with `bg` and `surface` read from `site.css`.
- `Blanc White stays the brand and app color`: `tokens/tokens.json`'s `sunrise-bg` light value is still `#f8f2e8` (keeps this change website-only).

- [ ] **Step 2: Run it and see it fail**

Run: `node --test test/unit/site-cream.test.js`
Expected: FAIL on the token values and the `sun-sky` keyframe; the contrast and Blanc White tests pass already.

- [ ] **Step 3: Commit**

```bash
git add test/unit/site-cream.test.js
git commit -m "Site: test for the lighter website cream"
```

### Task 2: Lighter cream in the site stylesheets

**Files:**
- Modify: `site/src/styles/site.css:34-46` (the four tokens and the comment)
- Modify: `site/src/styles/revamp.css:2-5`
- Modify: `site/src/styles/home.css:3-4, 9-12, 2269`

**Interfaces:**
- Consumes: Task 1's test.

- [ ] **Step 1: Set the values**

In all three files, use the A values from the Decisions table. In `home.css`, set `--paper`, `--surface`, `--line` on `.home-cinema` to the same values, and change the `sun-sky` keyframe's `76%, 100%` step to `background-color: var(--paper);`.

- [ ] **Step 2: Fix the comments**

`site.css:34`: the page color is no longer Blanc White. Say `--site-bg` is the website's own lighter cream (November 23, 2026), and Blanc White (`#F8F2E8`) stays the brand and app color. `home.css:3-4`: "Light sections sit on the website cream", not "on Blanc White".

- [ ] **Step 3: Run the test**

Run: `node --test test/unit/site-cream.test.js`
Expected: PASS, 5 of 5.

- [ ] **Step 4: Run the site's checks**

Run: `npm run lint && npm --prefix site run build`
Expected: both succeed. Then `npm run test:unit` and expect no new failures (the `blanc-white-palette` and `surface-style` tests read only app files and must still pass).

- [ ] **Step 5: Commit**

```bash
git add site/src/styles/site.css site/src/styles/revamp.css site/src/styles/home.css
git commit -m "Site: lighter cream page background"
```

### Task 3: Brand guide and on-screen check

**Files:**
- Modify: `docs/brand-usage.md:76-102` (*Sunrise palette for website and marketing*)

- [ ] **Step 1: Update the brand guide**

In the website palette list, the page background becomes `#FBF7F0` (`--site-bg`), sections `#F5EFE5`, borders `#E6DDD0`. Add one dated paragraph: on November 23, 2026 the website moved to a lighter cream of its own; **Blanc White stays `#F8F2E8`** and remains the brand color for creative, press, email and the app's Sunrise surfaces. Update the contrast sentence's figures if it cites any. Keep US spelling ("color").

- [ ] **Step 2: Check it on screen**

With the dev server from this worktree (`.claude/launch.json` entry `site`, port 4321), capture with Playwright at 1440 and 390 px wide: `/` (top, after the sunrise finishes, and the Start Page section), `/download`, `/patron`, `/features`, `/media`, `/about`. Expected: no darker band where the hero meets the page; the scrolled masthead, footer, forms and Download tiles still read as separate white surfaces; the consent dialog (Footer → Privacy choices) looks right. Compare against the same captures from `main`.

- [ ] **Step 3: Commit**

```bash
git add docs/brand-usage.md
git commit -m "Brand guide: the website's lighter cream; Blanc White unchanged"
```

### Task 4: Pull request

- [ ] **Step 1: Open a website-only PR** against `main` with the before/after captures from Task 3, the A/B table, and a line that Blanc White and the app are unchanged. Run the code review the repository expects for every PR, then merge when checks pass, unless a desktop release is in preparation.
- [ ] **Step 2: Deploy** only when the owner asks: `npm run site:deploy`, then confirm Cloudflare shows the merge commit as `Production` on `main`.

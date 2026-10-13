# Blanc Mail Pages Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the owner-approved Blanc Mail pages redesign (prototype commit `912874d9`) on top of today's `main`, pinned by tests, with its claims, its screenshots' display copies and the Mail repository's records brought in line, ready for an owner-approved deploy.

**Architecture:** The prototype already is the implementation: `MailBar`, `MailShot` and `MailPageContents` components, the six rewritten Mail pages and `mail.css`. This plan carries it onto `main` (which moved the website to blanc.day in #747–#749), routes the screenshots' 1100px copies through the site's existing display-image pipeline, and adds three browser suites and one unit test that pin the behavior. Because the code exists before its tests, every test task proves its tests can fail with a temporary mutation before trusting a pass.

**Tech Stack:** Astro 5 static site, plain CSS (`site/src/styles/mail.css`), small inline scripts, Node `node:test`, Playwright (Chromium by default, WebKit with `BLANC_SITE_BROWSER=webkit`), `sharp` for display copies.

**Spec:** `docs/superpowers/specs/2026-10-12-mail-pages-redesign-design.md` (§1–11, plus the §12 amendment Task 1 adds).

## Global Constraints

- Work in the worktree `.claude/worktrees/mail-pages-redesign-proto`. Task 1 renames its branch to `claude/mail-pages-redesign`. Never commit on `main`.
- Copy is fixed: product claims stay word for word. New text is limited to the labels in spec §7 and §11 and the tagline "A little less inbox." (owner, October 12, 2026). Every image and line is recorded in `docs/website-mail-claims-2026-10-12.md`.
- Styles live in `site/src/styles/mail.css`, never in `style=` attributes. Scripts may set CSS custom properties only (`--split`, `--pop-top`, `--pop-start`, `--pop-end`, `--mail-header-h`).
- No new JavaScript dependency.
- Serif (Newsreader Condensed) text is never set looser than `letter-spacing: -0.035em` (`test/site/newsreader-reach.test.mjs`).
- The Mail pages stay light-only.
- The site's origin comes only from `site/src/lib/site-origin.mjs` (`https://blanc.day`). Pages name `support@blanc.day` and never `blancbrowser.com` (`test/unit/site-domain.test.js`).
- Screenshots appear only through `MailShot.astro`, which always captions them "Preview build". They come only from the Mail repository's `native/scripts/capture-public-shots.sh` (signed demo build, demo corpus, no connected mailbox).
- This is a website-only PR: `site/`, `test/site/`, `test/unit/site-*`, `docs/` only.
- Before committing code (not docs or tests), run the `/verify` and `/simplify` skills.
- Merges, deploys and every live change need the owner's explicit approval for that step. Never push `site-production-source`. Never deploy `main` until a public Blanc release contains #706 (`git tag --contains e01bd0bd3` prints a tag).
- Mail repository (`~/Projects/Blanc Mail`, `bnfy/blanc-mail`): never commit the four xcodegen-modified `.xcscheme` files.

### How to run the site browser suites

Each suite runs against a built preview. Use port 4334, which no dev server uses:

```bash
npm run site:build
(cd site && npx astro preview --host 127.0.0.1 --port 4334 > "${TMPDIR:-/tmp}/mail-preview.log" 2>&1 &)
until curl -s -o /dev/null http://127.0.0.1:4334/; do sleep 1; done
BLANC_SITE_URL=http://127.0.0.1:4334 node --test test/site/<suite>.test.mjs
pkill -f 'astro.mjs preview.*4334'
```

A browser test reads the build, so rebuild and restart the preview after every source change, including the temporary mutations below.

## Review Focus

1. **A waitlist error in the bar's popover** (the Worker answers 400, 5xx or not at all): the message appears inside the open popover, the popover stays open, and the hero form is untouched. Pinned in Task 4.
2. **A deep link to a Privacy or Terms section** (`/mail/terms#subscriptions`): the heading lands below both sticky bars, and its contents link is marked current. Pinned in Task 5.
3. **No JavaScript:** the page menu and the waitlist popover still open, the waitlist explains how to join, and Dawn/Night and the light/dark compare still work. Pinned in Tasks 3 and 4.
4. **Join pressed after the site header has tucked away:** the popover still opens directly under the button, inside the viewport. Pinned in Task 3.
5. **Opening one bar popover while the other is open:** only one is ever open. Pinned in Task 3.

---

### Task 1: Carry the prototype onto blanc.day `main`

**Files:**
- Modify (conflicts): `site/src/pages/mail/privacy.astro`, `site/src/pages/mail/support.astro`, `site/src/pages/mail/terms.astro`
- Modify: `site/scripts/render-mail-og-card.mjs:39`, `site/public/mail-og.png` (re-rendered)
- Modify: `docs/superpowers/specs/2026-10-12-mail-pages-redesign-design.md` (status line, §12 amendment)
- Test: `test/unit/site-domain.test.js` (exists on `main`)

**Interfaces:**
- Consumes: prototype commit `912874d9` and spec commit `0a5a2689` on `claude/mail-pages-redesign-proto`; `origin/main` at or after `5178b746`.
- Produces: branch `claude/mail-pages-redesign` rebased on `origin/main`, whose Mail pages name `support@blanc.day` and whose share card reads "blanc.day/mail". Later tasks run from this branch.

- [ ] **Step 1: Start clean and up to date**

```bash
git status --short
git fetch origin
```

Expected: `git status` prints nothing.

- [ ] **Step 2: Rebase onto `main`**

```bash
git rebase origin/main
```

Expected: the spec commit applies cleanly. The prototype commit stops with `CONFLICT (content)` in exactly `site/src/pages/mail/privacy.astro`, `support.astro` and `terms.astro`. `main` changed only words in those files: `blancbrowser.com` became `blanc.day` (4, 4 and 2 times), and Privacy gained "Updated October 13, 2026 · ".

- [ ] **Step 3: Resolve: keep the prototype's markup, take `main`'s words**

During a rebase, `--theirs` is the commit being replayed (the prototype).

```bash
git checkout --theirs -- site/src/pages/mail/privacy.astro site/src/pages/mail/support.astro site/src/pages/mail/terms.astro
sed -i '' 's/blancbrowser\.com/blanc.day/g' site/src/pages/mail/privacy.astro site/src/pages/mail/support.astro site/src/pages/mail/terms.astro
sed -i '' 's/Prepared September 22, 2026 · Effective when Blanc Mail launches\./Prepared September 22, 2026 · Updated October 13, 2026 · Effective when Blanc Mail launches./' site/src/pages/mail/privacy.astro
for f in privacy support terms; do printf '%s %s %s\n' "$f" "$(grep -o 'blanc\.day' site/src/pages/mail/$f.astro | wc -l | tr -d ' ')" "$(grep -c 'blancbrowser' site/src/pages/mail/$f.astro)"; done
grep -c 'Updated October 13, 2026' site/src/pages/mail/privacy.astro
```

Expected: `privacy 4 0`, `support 4 0`, `terms 2 0`, then `1`.

- [ ] **Step 4: Finish the rebase and rename the branch**

```bash
git add site/src/pages/mail/privacy.astro site/src/pages/mail/support.astro site/src/pages/mail/terms.astro
GIT_EDITOR=true git rebase --continue
git branch -m claude/mail-pages-redesign
git log --oneline -4
```

Expected: the rebase completes. The log shows the plan, prototype and spec commits above `origin/main`'s head.

- [ ] **Step 5: Run the domain guard and watch it fail**

```bash
node --test test/unit/site-domain.test.js
```

Expected: FAIL, naming `site/scripts/render-mail-og-card.mjs:39`, because the share card prints "blancbrowser.com/mail".

- [ ] **Step 6: Point the share card at blanc.day and re-render it**

In `site/scripts/render-mail-og-card.mjs`, change line 39 from

```html
<p class="address">blancbrowser.com/mail</p>
```

to

```html
<p class="address">blanc.day/mail</p>
```

Then:

```bash
node site/scripts/render-mail-og-card.mjs
```

Expected: `Wrote public/mail-og.png (1200x630): A little less inbox.` Open `site/public/mail-og.png` and check that it reads "A little less inbox." and "blanc.day/mail".

- [ ] **Step 7: Run the domain guard and watch it pass**

```bash
node --test test/unit/site-domain.test.js
```

Expected: PASS.

- [ ] **Step 8: Record the decisions made after the spec**

In the spec, replace the line `Status: draft for owner review, October 12, 2026.` with:

```markdown
Status: approved by the owner, October 12, 2026 (spec, then prototype `912874d9`).
```

Then append this section to the end of the spec:

```markdown
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
```

- [ ] **Step 9: Verify the whole site on the rebased branch**

```bash
npm run site:build
node --test test/unit/site-*.test.js test/unit/website-*.test.js test/unit/newsletter-worker.test.js
```

Then run every browser suite: `BLANC_SITE_URL=http://127.0.0.1:4334 node --test test/site/*.test.mjs`, using the steps in "How to run the site browser suites".

Expected: the build prints `SEO verification passed`, and both test runs report `# fail 0`.

- [ ] **Step 10: Commit**

Run `/verify` and `/simplify` first (this commit changes a script).

```bash
git add site/scripts/render-mail-og-card.mjs site/public/mail-og.png docs/superpowers/specs/2026-10-12-mail-pages-redesign-design.md
git commit -m "Carry the Mail pages redesign onto blanc.day

The share card reads blanc.day/mail, and the spec records the owner's
decisions after the prototype: the tagline, the quiet site strip, the bar's
breakpoints, large unframed screenshots, the whole Island capture, the
vignettes' trigger, the fictional demo content and blanc.day.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Build the screenshots' 1100px copies in the display-image pipeline

**Files:**
- Create: `test/unit/site-mail-screens.test.js`
- Modify: `site/scripts/build-display-images.mjs` (add six jobs)
- Modify: `site/src/data/display-images.json` (regenerated)
- Modify: `site/public/mail/screens/*-1100.webp` (regenerated)
- Modify: `site/src/components/MailShot.astro` (drop the unused `single` prop)

**Interfaces:**
- Consumes: the six captures `site/public/mail/screens/{main,dark,island,zero,zero-night,rules}.webp` from Task 1's branch.
- Produces: manifest entries `{ source: 'mail/screens/<name>.webp', output: 'mail/screens/<name>-1100.webp', width: 1100 }`. `MailShot` props become `name, alt, width, height, class, eager, sizes`.

- [ ] **Step 1: Write the failing test**

Create `test/unit/site-mail-screens.test.js`:

```js
'use strict';

// The Blanc Mail pages show real screenshots only through MailShot.astro,
// which always labels them "Preview build": Blanc Mail has no public build,
// and docs/marketing-claims.md requires a screenshot of an unreleased app to
// read as a preview. Each 1100px copy is a display image built from its
// capture (site/scripts/build-display-images.mjs), so a recapture cannot
// leave a stale copy behind.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SITE = path.resolve(__dirname, '../../site');
const read = (file) => fs.readFileSync(path.join(SITE, file), 'utf8');
const mailPages = ['src/pages/mail.astro', ...fs.readdirSync(path.join(SITE, 'src/pages/mail')).map((f) => `src/pages/mail/${f}`)];
const SHOTS = ['dark', 'island', 'main', 'rules', 'zero', 'zero-night'];

test('MailShot is the only way to show a Mail screenshot, and its caption is not optional', () => {
  const shot = read('src/components/MailShot.astro');
  assert.match(shot, /<figcaption>Preview build<\/figcaption>/);
  assert.doesNotMatch(shot, /\{[^}]*&&\s*<figcaption|caption\s*[:=]/, 'the caption must not depend on a prop');
  const sources = fs.readdirSync(path.join(SITE, 'src'), { recursive: true })
    .filter((file) => /\.(astro|css|mjs|js|ts)$/.test(file) && file !== path.join('components', 'MailShot.astro'));
  for (const file of sources) {
    assert.doesNotMatch(read(path.join('src', file)), /mail\/screens\//, `${file} uses a Mail screenshot without MailShot`);
  }
});

test('every screenshot the Mail pages name exists, with a built 1100px copy', () => {
  const named = new Set(mailPages.flatMap((file) => [...read(file).matchAll(/<MailShot\b[^>]*\bname="([^"]+)"/g)].map((m) => m[1])));
  assert.deepEqual([...named].sort(), SHOTS);
  const manifest = JSON.parse(read('src/data/display-images.json'));
  for (const name of SHOTS) {
    assert.ok(fs.existsSync(path.join(SITE, 'public/mail/screens', `${name}.webp`)), `${name}.webp`);
    const copy = manifest.find((entry) => entry.output === `mail/screens/${name}-1100.webp`);
    assert.ok(copy, `${name}: add it to site/scripts/build-display-images.mjs`);
    assert.equal(copy.source, `mail/screens/${name}.webp`);
    assert.equal(copy.width, 1100);
  }
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
node --test test/unit/site-mail-screens.test.js
```

Expected: the first test PASSES. The second FAILS with `main: add it to site/scripts/build-display-images.mjs`.

- [ ] **Step 3: Add the six jobs**

In `site/scripts/build-display-images.mjs`, add this entry at the end of the `jobs` array, after the Mahjong entry:

```js
  // Blanc Mail screenshots (capture-public-shots.sh in bnfy/blanc-mail):
  // 1100px copies for MailShot's srcset; the 2200px captures stay as taken.
  ...['main', 'dark', 'island', 'zero', 'zero-night', 'rules'].map(name => ({
    source: `mail/screens/${name}.webp`,
    output: `mail/screens/${name}-1100.webp`,
    width: 1100,
  })),
```

- [ ] **Step 4: Rebuild the display copies and keep only the Mail changes**

```bash
node site/scripts/build-display-images.mjs
git status --short site/public site/src/data
```

Expected: the six `site/public/mail/screens/*-1100.webp` files and `site/src/data/display-images.json` are modified. If any other display copy also changed (a `sharp` version difference), restore it with `git checkout -- <that file>`. Its manifest entry records only the source hash and size, so it stays valid.

- [ ] **Step 5: Drop MailShot's unused `single` prop**

No page passes `single` since the Island crop was removed (`grep -rn "single" site/src/pages/mail.astro site/src/pages/mail` prints nothing). In `site/src/components/MailShot.astro`:

- remove `single?: boolean;` from `Props`;
- change the destructuring line to `const { name, alt, width, height, class: className = '', eager = false, sizes = '(max-width: 1120px) 100vw, 1072px' } = Astro.props;`;
- change the two `<img>` attributes to `srcset={`/mail/screens/${name}-1100.webp 1100w, /mail/screens/${name}.webp 2200w`}` and `sizes={sizes}`;
- in the header comment, delete the sentence "a crop that is already small passes single and has only the first."

- [ ] **Step 6: Run the tests and watch them pass**

```bash
node --test test/unit/site-mail-screens.test.js test/unit/website-display-images.test.js
npm run site:build
```

Expected: PASS, and the build prints `SEO verification passed`.

- [ ] **Step 7: Commit**

Run `/verify` and `/simplify` first.

```bash
git add test/unit/site-mail-screens.test.js site/scripts/build-display-images.mjs site/src/data/display-images.json site/public/mail/screens site/src/components/MailShot.astro
git commit -m "Build the Mail screenshots' 1100px copies with the display images

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Pin the Mail bar on every Mail page

**Files:**
- Create: `test/site/mail-bar.test.mjs`
- Fix, only if a test finds a defect: `site/src/components/MailBar.astro`, `site/src/styles/mail.css`

**Interfaces:**
- Consumes: the markup `MailBar.astro` renders: `.mail-bar` > `nav[aria-label="Blanc Mail"]` > `.mail-bar-title`, `.mail-bar-links a[aria-current="page"]`, `button.mail-bar-pages[popovertarget="mail-bar-menu"]`, `button.mail-bar-join[popovertarget="mail-bar-waitlist"]`; popovers `#mail-bar-menu` and `#mail-bar-waitlist` (which holds `form#bar-waitlist`, email input `#bar-waitlistEmail`); `.site-header.is-scroll-hidden` from the site header.
- Produces: nothing later tasks consume.

- [ ] **Step 1: Write the suite**

Create `test/site/mail-bar.test.mjs`:

```js
// BLANC_SITE_URL=http://127.0.0.1:4322 node --test test/site/mail-bar.test.mjs
//
// The Blanc Mail product bar on all six Mail pages
// (docs/superpowers/specs/2026-10-12-mail-pages-redesign-design.md §3, §12):
// the product's name, its six pages with the current one marked, and a "Join
// the waitlist" popover. At 880px and narrower the links fold into a page
// menu; at 480px and narrower Join shortens on screen but keeps its name.
// The bar sticks under the site header and rises with it when it tucks away.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium, webkit } from 'playwright';

const baseURL = process.env.BLANC_SITE_URL || 'http://127.0.0.1:4322';
const isWebKit = process.env.BLANC_SITE_BROWSER === 'webkit';
const pages = [
  ['/mail', 'Overview'], ['/mail/pricing', 'Pricing'], ['/mail/download', 'Download'],
  ['/mail/support', 'Support'], ['/mail/privacy', 'Privacy'], ['/mail/terms', 'Terms'],
];
let browser;
before(async () => { browser = await (isWebKit ? webkit : chromium).launch(); });
after(async () => { await browser?.close(); });

async function openPage(path, width = 1440, options = {}) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce', ...options });
  const page = await context.newPage();
  // No analytics or other remote requests leave these tests.
  await page.route('**/*', route => new URL(route.request().url()).origin === new URL(baseURL).origin ? route.continue() : route.abort());
  await page.addInitScript(() => { try { localStorage.setItem('measurement-consent-v2', 'denied'); } catch {} });
  await page.goto(`${baseURL}${path}`);
  await page.evaluate(() => document.fonts.ready);
  return { page, context };
}

const isOpen = (page, id) => page.evaluate(id => document.getElementById(id).matches(':popover-open'), id);
const waitOpen = (page, id, open = true) =>
  page.waitForFunction(([id, open]) => document.getElementById(id).matches(':popover-open') === open, [id, open]);
const tuckHeaderAway = async page => {
  await page.mouse.move(700, 450);
  for (let i = 0; i < 8; i++) { await page.mouse.wheel(0, 200); await page.waitForTimeout(60); }
  await page.waitForFunction(() => document.querySelector('.site-header').classList.contains('is-scroll-hidden'));
  await page.waitForTimeout(400); // the bar's 220ms slide
};

test('every Mail page names the product, lists its six pages and marks the current one', async () => {
  const { page, context } = await openPage('/mail');
  try {
    for (const [path, label] of pages) {
      await page.goto(`${baseURL}${path}`);
      const bar = await page.evaluate(() => {
        const nav = document.querySelector('.mail-bar nav');
        return {
          name: nav.getAttribute('aria-label'),
          title: nav.querySelector('.mail-bar-title').textContent.trim(),
          links: [...nav.querySelectorAll('.mail-bar-links a')].map(a => [a.getAttribute('href'), a.textContent.trim()]),
          current: [...nav.querySelectorAll('.mail-bar-links a[aria-current="page"]')].map(a => a.textContent.trim()),
        };
      });
      assert.equal(bar.name, 'Blanc Mail', path);
      assert.equal(bar.title, 'Blanc Mail', path);
      assert.deepEqual(bar.links, pages, path);
      assert.deepEqual(bar.current, [label], path);
    }
  } finally { await context.close(); }
});

test('nothing on a Mail page scrolls sideways, from phones to wide screens', async () => {
  for (const width of [320, 390, 800, 1440]) {
    const { page, context } = await openPage('/mail', width);
    try {
      for (const [path] of pages) {
        await page.goto(`${baseURL}${path}`);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
        assert.ok(overflow <= 0, `${path} at ${width}px overflows by ${overflow}px`);
      }
    } finally { await context.close(); }
  }
});

test('the bar sits under the site header and rises with it when the header tucks away', async () => {
  const { page, context } = await openPage('/mail/privacy', 1440, { reducedMotion: 'no-preference' });
  try {
    const place = () => page.evaluate(() => {
      const bar = document.querySelector('.mail-bar').getBoundingClientRect();
      const header = document.querySelector('.site-header').getBoundingClientRect();
      return { top: Math.round(bar.top), underHeader: Math.round(bar.top - header.bottom) };
    });
    assert.equal((await place()).underHeader, 0, 'directly under the header at first');
    await tuckHeaderAway(page);
    assert.equal((await place()).top, 0, 'the bar takes the top edge while the header is away');
    for (let i = 0; i < 4; i++) { await page.mouse.wheel(0, -200); await page.waitForTimeout(60); }
    await page.waitForFunction(() => !document.querySelector('.site-header').classList.contains('is-scroll-hidden'));
    await page.waitForTimeout(400);
    assert.equal((await place()).underHeader, 0, 'back under the header');
  } finally { await context.close(); }
});

test('Join keeps its name, opens the waitlist under the button, and Escape hands focus back', async () => {
  for (const width of [1440, 390, 320]) {
    const { page, context } = await openPage('/mail/pricing', width);
    try {
      const join = page.getByRole('navigation', { name: 'Blanc Mail' }).getByRole('button', { name: 'Join the waitlist', exact: true });
      assert.equal(await join.count(), 1, `${width}px: Join keeps its full accessible name`);
      await join.click();
      await waitOpen(page, 'mail-bar-waitlist');
      const state = await page.evaluate(() => {
        const pop = document.getElementById('mail-bar-waitlist').getBoundingClientRect();
        const button = document.querySelector('.mail-bar-join').getBoundingClientRect();
        return { focused: document.activeElement?.id, left: pop.left, right: pop.right, top: pop.top, buttonBottom: button.bottom };
      });
      assert.equal(state.focused, 'bar-waitlistEmail', `${width}px: focus moves to the email field`);
      assert.ok(state.left >= 0 && state.right <= width, `${width}px: inside the viewport`);
      assert.ok(state.top >= state.buttonBottom && state.top <= state.buttonBottom + 16, `${width}px: just under the button`);
      await page.keyboard.press('Escape');
      await waitOpen(page, 'mail-bar-waitlist', false);
      assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('mail-bar-join')), true, `${width}px: focus back on Join`);
    } finally { await context.close(); }
  }
});

test('at 880px and narrower the six links fold into a page menu', async () => {
  for (const width of [800, 390]) {
    const { page, context } = await openPage('/mail/download', width);
    try {
      assert.equal(await page.locator('.mail-bar-links').isVisible(), false, `${width}px: links folded away`);
      const button = page.locator('.mail-bar-pages');
      assert.equal((await button.textContent()).trim(), 'Download', `${width}px: the button names the page`);
      await button.click();
      await waitOpen(page, 'mail-bar-menu');
      const menu = await page.evaluate(() => {
        const pop = document.getElementById('mail-bar-menu');
        const rect = pop.getBoundingClientRect();
        return {
          links: [...pop.querySelectorAll('a')].map(a => [a.getAttribute('href'), a.textContent.trim()]),
          current: pop.querySelector('[aria-current="page"]')?.textContent.trim(),
          inside: rect.left >= 0 && rect.right <= innerWidth,
        };
      });
      assert.deepEqual(menu.links, pages);
      assert.equal(menu.current, 'Download');
      assert.ok(menu.inside, `${width}px: inside the viewport`);
      await page.keyboard.press('Escape');
      await waitOpen(page, 'mail-bar-menu', false);
      assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('mail-bar-pages')), true);
    } finally { await context.close(); }
  }
  const wide = await openPage('/mail/download', 1440);
  try {
    assert.equal(await wide.page.locator('.mail-bar-pages').isVisible(), false, '1440px: no menu button');
  } finally { await wide.context.close(); }
});

test('Join pressed after the header has tucked away still opens under the button', async () => {
  const { page, context } = await openPage('/mail/privacy', 1440, { reducedMotion: 'no-preference' });
  try {
    await tuckHeaderAway(page);
    await page.locator('.mail-bar-join').click();
    await waitOpen(page, 'mail-bar-waitlist');
    const state = await page.evaluate(() => {
      const pop = document.getElementById('mail-bar-waitlist').getBoundingClientRect();
      const button = document.querySelector('.mail-bar-join').getBoundingClientRect();
      return { top: pop.top, right: pop.right, buttonBottom: button.bottom };
    });
    assert.ok(state.top >= state.buttonBottom && state.top <= state.buttonBottom + 16, `popover at ${state.top}, button ends at ${state.buttonBottom}`);
    assert.ok(state.right <= 1440);
  } finally { await context.close(); }
});

test('only one bar popover is ever open', async () => {
  const { page, context } = await openPage('/mail/support', 390);
  try {
    await page.locator('.mail-bar-join').click();
    await waitOpen(page, 'mail-bar-waitlist');
    await page.locator('.mail-bar-pages').click();
    await waitOpen(page, 'mail-bar-menu');
    assert.equal(await isOpen(page, 'mail-bar-waitlist'), false);
  } finally { await context.close(); }
});

test('without script the page menu and the waitlist still open, and the waitlist says how to join', async () => {
  const { page, context } = await openPage('/mail/support', 390, { javaScriptEnabled: false });
  try {
    await page.locator('.mail-bar-pages').click();
    assert.equal(await page.locator('#mail-bar-menu').isVisible(), true);
    await page.keyboard.press('Escape');
    await page.locator('.mail-bar-join').click();
    assert.equal(await page.locator('#bar-waitlist .mail-waitlist-note', { hasText: 'Turn on JavaScript to join the waitlist' }).isVisible(), true);
  } finally { await context.close(); }
});

test('reduced transparency makes the bar solid, and more contrast darkens its links',
  { skip: isWebKit && 'needs Chromium media-feature emulation' }, async () => {
    const { page, context } = await openPage('/mail', 1440);
    try {
      const cdp = await context.newCDPSession(page);
      await cdp.send('Emulation.setEmulatedMedia', {
        features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }, { name: 'prefers-contrast', value: 'more' }],
      });
      const style = await page.evaluate(() => {
        const bar = getComputedStyle(document.querySelector('.mail-bar'));
        const link = getComputedStyle(document.querySelector('.mail-bar-links a:not([aria-current])'));
        return { background: bar.backgroundColor, blur: bar.backdropFilter, link: link.color };
      });
      assert.equal(style.background, 'rgb(248, 242, 232)');
      assert.equal(style.blur, 'none');
      assert.equal(style.link, 'rgb(43, 37, 29)');
    } finally { await context.close(); }
  });
```

- [ ] **Step 2: Run it**

Run the suite as in "How to run the site browser suites", with `<suite>` = `mail-bar`.

Expected: `# pass 9`, `# fail 0`. Any failure is a defect in the prototype. Diagnose it with superpowers:systematic-debugging, fix it in `MailBar.astro` or `mail.css`, and record the fix in the ledger.

- [ ] **Step 3: Prove the suite can fail**

Temporarily delete this line from the script in `site/src/components/MailBar.astro`:

```js
      if ((event as ToggleEvent).newState === 'open') pop.querySelector<HTMLInputElement>('input[type=email]')?.focus();
```

Rebuild, restart the preview and run `mail-bar` again.

Expected: FAIL in "Join keeps its name…" with `1440px: focus moves to the email field`. Restore the line with `git checkout -- site/src/components/MailBar.astro`, rebuild, restart the preview and rerun: `# fail 0`.

- [ ] **Step 4: Commit**

```bash
git add test/site/mail-bar.test.mjs
git commit -m "Pin the Mail bar on every Mail page

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

If Step 2 needed a fix, commit it separately first, after `/verify` and `/simplify`.

---

### Task 4: Pin the overview's screenshots, controls, vignettes and waitlists

**Files:**
- Create: `test/site/mail-overview.test.mjs`
- Fix, only if a test finds a defect: `site/src/pages/mail.astro`, `site/src/styles/mail.css`

**Interfaces:**
- Consumes: `/mail` markup: `figure.mail-shot` > `img[src^="/mail/screens/"]` + `figcaption`; `fieldset.mail-segmented` (legend "Wallpaper") with radios "Dawn" and "Night"; `.mail-zero-night`; `[data-mail-compare]` > `.mail-compare-dark img`, `.mail-compare-handle`, `input.mail-compare-range` (name "Compare the light and dark appearance"); `[data-mail-bento] .mail-bento-tile` > `.mail-vignette`, `.is-playing`; forms `#bar-waitlist`, `#waitlist`, `#closing-waitlist`, each with `.mail-waitlist-status`; the endpoint constant `WAITLIST_ENDPOINT` in `site/src/components/MailWaitlistForm.astro`.
- Produces: nothing later tasks consume.

- [ ] **Step 1: Write the suite**

Create `test/site/mail-overview.test.mjs`:

```js
// BLANC_SITE_URL=http://127.0.0.1:4322 node --test test/site/mail-overview.test.mjs
//
// The Blanc Mail overview (/mail) after the redesign
// (docs/superpowers/specs/2026-10-12-mail-pages-redesign-design.md §4, §11, §12):
// real screenshots, always labelled as a preview; a Dawn/Night switch and a
// light/dark compare that work from the keyboard and without script;
// vignettes that move only when asked; and three separate waitlist forms.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { chromium, webkit } from 'playwright';

const baseURL = process.env.BLANC_SITE_URL || 'http://127.0.0.1:4322';
const WAITLIST = readFileSync(new URL('../../site/src/components/MailWaitlistForm.astro', import.meta.url), 'utf8')
  .match(/WAITLIST_ENDPOINT = '([^']+)'/)[1];
let browser;
before(async () => { browser = await (process.env.BLANC_SITE_BROWSER === 'webkit' ? webkit : chromium).launch(); });
after(async () => { await browser?.close(); });

async function openPage(path, width = 1440, options = {}) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce', ...options });
  const page = await context.newPage();
  // No analytics or other remote requests leave these tests.
  await page.route('**/*', route => new URL(route.request().url()).origin === new URL(baseURL).origin ? route.continue() : route.abort());
  await page.addInitScript(() => { try { localStorage.setItem('measurement-consent-v2', 'denied'); } catch {} });
  await page.goto(`${baseURL}${path}`);
  await page.evaluate(() => document.fonts.ready);
  return { page, context };
}

// Stands in for the waitlist Worker. Registered after openPage's catch-all,
// so it runs first (Playwright runs routes in reverse order of registration).
async function answerWaitlist(page, status) {
  await page.route(WAITLIST, route => {
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST', 'access-control-allow-headers': 'content-type' };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    return route.fulfill({ status, headers: { ...cors, 'content-type': 'application/json' }, body: '{}' });
  });
}

test('every screenshot is a labelled preview with alt text, and it loads', async () => {
  const { page, context } = await openPage('/mail');
  try {
    const shots = await page.evaluate(async () => {
      const images = [...document.querySelectorAll('img')].filter(img => img.getAttribute('src')?.startsWith('/mail/screens/'));
      images.forEach(img => { img.loading = 'eager'; });
      await Promise.all(images.map(img => img.decode().catch(() => null)));
      return images.map(img => ({
        src: img.getAttribute('src'),
        loaded: img.complete && img.naturalWidth > 0,
        alt: img.alt.trim().length > 0,
        caption: img.closest('figure.mail-shot')?.querySelector('figcaption')?.textContent.trim(),
      }));
    });
    assert.equal(shots.length, 7);
    for (const shot of shots) {
      assert.ok(shot.loaded, `${shot.src} loads`);
      assert.ok(shot.alt, `${shot.src} has alt text`);
      assert.equal(shot.caption, 'Preview build', shot.src);
    }
  } finally { await context.close(); }
});

test('Dawn and Night switch the Inbox Zero picture, from the keyboard and without script', async () => {
  for (const javaScriptEnabled of [true, false]) {
    const { page, context } = await openPage('/mail', 1440, { javaScriptEnabled });
    try {
      const night = () => page.evaluate(() => getComputedStyle(document.querySelector('.mail-zero-night')).opacity);
      assert.equal(await page.getByRole('group', { name: 'Wallpaper' }).count(), 1, 'a named group');
      assert.equal(await night(), '0');
      const dawn = page.getByRole('radio', { name: 'Dawn' });
      assert.equal(await dawn.isChecked(), true);
      await dawn.focus();
      await page.keyboard.press('ArrowRight');
      assert.equal(await page.getByRole('radio', { name: 'Night' }).isChecked(), true);
      // A fixed wait, not waitForFunction: its in-page polling needs script.
      await page.waitForTimeout(600); // the 420ms cross-fade
      assert.equal(await night(), '1');
    } finally { await context.close(); }
  }
});

test('the light and dark compare follows the arrow keys, and shows half of each without script', async () => {
  const { page, context } = await openPage('/mail');
  try {
    const split = () => page.evaluate(() => {
      const compare = document.querySelector('[data-mail-compare]').getBoundingClientRect();
      return {
        value: document.querySelector('.mail-compare-range').value,
        clip: getComputedStyle(document.querySelector('.mail-compare-dark img')).clipPath,
        handle: document.querySelector('.mail-compare-handle').getBoundingClientRect().left + 1 - compare.left,
        width: compare.width,
      };
    });
    assert.equal((await split()).clip, 'inset(0px 0px 0px 50%)');
    await page.getByRole('slider', { name: 'Compare the light and dark appearance' }).focus();
    for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowRight');
    const moved = await split();
    assert.equal(moved.value, '60');
    assert.equal(moved.clip, 'inset(0px 0px 0px 60%)');
    assert.ok(Math.abs(moved.handle - moved.width * 0.6) <= 2, 'the divider sits where the dark window starts');
  } finally { await context.close(); }
  const still = await openPage('/mail', 1440, { javaScriptEnabled: false });
  try {
    assert.equal(await still.page.evaluate(() => getComputedStyle(document.querySelector('.mail-compare-dark img')).clipPath), 'inset(0px 0px 0px 50%)');
  } finally { await still.context.close(); }
});

test('vignettes hold still under reduced motion, and otherwise play once and settle', async () => {
  const tileOf = page => page.locator('[data-mail-bento] .mail-bento-tile:has(.mail-vignette)').first();
  const moving = tile => tile.evaluate(el => el.classList.contains('is-playing') || el.querySelector('.mail-vignette').getAnimations({ subtree: true }).length > 0);

  const reduced = await openPage('/mail');
  try {
    const tile = tileOf(reduced.page);
    await tile.scrollIntoViewIfNeeded();
    await tile.hover();
    await reduced.page.waitForTimeout(400);
    assert.equal(await moving(tile), false, 'nothing moves under reduced motion');
  } finally { await reduced.context.close(); }

  const full = await openPage('/mail', 1440, { reducedMotion: 'no-preference' });
  try {
    const tile = tileOf(full.page);
    await tile.scrollIntoViewIfNeeded();
    await tile.hover();
    const handle = await tile.elementHandle();
    await full.page.waitForFunction(el => el.classList.contains('is-playing'), handle);
    await full.page.waitForFunction(el => !el.classList.contains('is-playing'), handle, { timeout: 8000 });
    assert.equal(await moving(tile), false, 'it settles on its still frame');
  } finally { await full.context.close(); }
});

test('the bar, hero and closing waitlists are separate, and the bar keeps its answer in view', async () => {
  const { page, context } = await openPage('/mail');
  try {
    assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('form[data-mail-waitlist]')].map(f => f.id)), ['bar-waitlist', 'waitlist', 'closing-waitlist']);
    await answerWaitlist(page, 200);
    await page.locator('.mail-bar-join').click();
    await page.waitForFunction(() => document.getElementById('mail-bar-waitlist').matches(':popover-open'));
    await page.keyboard.type('reader@example.com');
    await page.keyboard.press('Enter');
    await page.locator('#bar-waitlist .mail-waitlist-status', { hasText: 'Check your inbox to confirm your place.' }).waitFor();
    assert.equal(await page.evaluate(() => document.getElementById('mail-bar-waitlist').matches(':popover-open')), true, 'the answer stays in view');
    assert.equal(await page.locator('#waitlist .mail-waitlist-status').textContent(), '', 'the hero form is untouched');
  } finally { await context.close(); }
});

test('a waitlist error shows inside the open bar popover', async () => {
  for (const [status, message] of [
    [400, 'That address didn’t look right. Please check it and try again.'],
    [503, 'We couldn’t add you just now. Please try again later.'],
  ]) {
    const { page, context } = await openPage('/mail/pricing');
    try {
      await answerWaitlist(page, status);
      await page.locator('.mail-bar-join').click();
      await page.waitForFunction(() => document.getElementById('mail-bar-waitlist').matches(':popover-open'));
      await page.keyboard.type('reader@example.com');
      await page.keyboard.press('Enter');
      await page.locator('#bar-waitlist .mail-waitlist-status', { hasText: message }).waitFor();
      assert.equal(await page.evaluate(() => document.getElementById('mail-bar-waitlist').matches(':popover-open')), true, `${status}: still open`);
      assert.equal(await page.locator('#bar-waitlist button[type=submit]').isEnabled(), true, `${status}: can try again`);
    } finally { await context.close(); }
  }
  // No answer at all (the catch-all aborts the request).
  const { page, context } = await openPage('/mail/pricing');
  try {
    await page.locator('.mail-bar-join').click();
    await page.waitForFunction(() => document.getElementById('mail-bar-waitlist').matches(':popover-open'));
    await page.keyboard.type('reader@example.com');
    await page.keyboard.press('Enter');
    await page.locator('#bar-waitlist .mail-waitlist-status', { hasText: 'We couldn’t add you just now. Please try again later.' }).waitFor();
    assert.equal(await page.evaluate(() => document.getElementById('mail-bar-waitlist').matches(':popover-open')), true);
  } finally { await context.close(); }
});
```

- [ ] **Step 2: Run it**

Run the suite with `<suite>` = `mail-overview`.

Expected: `# pass 6`, `# fail 0`. Treat a failure as in Task 3 Step 2.

- [ ] **Step 3: Prove the suite can fail**

Temporarily change `<figcaption>Preview build</figcaption>` in `site/src/components/MailShot.astro` to `<figcaption>Preview</figcaption>`. Rebuild, restart the preview and rerun `mail-overview`.

Expected: FAIL in "every screenshot is a labelled preview…" with `expected 'Preview build'`. Restore with `git checkout -- site/src/components/MailShot.astro`, rebuild, restart and rerun: `# fail 0`.

- [ ] **Step 4: Commit**

```bash
git add test/site/mail-overview.test.mjs
git commit -m "Pin the Mail overview's screenshots, controls, vignettes and waitlists

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Pin the five subpages

**Files:**
- Create: `test/site/mail-subpages.test.mjs`
- Fix, only if a test finds a defect: `site/src/pages/mail/*.astro`, `site/src/components/MailPageContents.astro`, `site/src/styles/mail.css`

**Interfaces:**
- Consumes: `.mail-contents` (sticky list, `a[aria-current="location"]`), `details.mail-contents-compact`, `.mail-doc-body h2[id]`; `.mail-pricing .mail-callout`, `.mail-plans`, `.mail-plan`, `.mail-plan-price`; `.mail-download-main`, `.mail-requirements`, `#download-waitlist`; `.mail-contact`, `.mail-topics .mail-card h2`.
- Produces: nothing later tasks consume.

- [ ] **Step 1: Write the suite**

Create `test/site/mail-subpages.test.mjs`:

```js
// BLANC_SITE_URL=http://127.0.0.1:4322 node --test test/site/mail-subpages.test.mjs
//
// The five Blanc Mail subpages after the redesign
// (docs/superpowers/specs/2026-10-12-mail-pages-redesign-design.md §5):
// Privacy and Terms as documents with an "On this page" list, Pricing that
// says purchases are not open before any price, Download beside its
// requirements, and Support that opens with its address.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium, webkit } from 'playwright';

const baseURL = process.env.BLANC_SITE_URL || 'http://127.0.0.1:4322';
let browser;
before(async () => { browser = await (process.env.BLANC_SITE_BROWSER === 'webkit' ? webkit : chromium).launch(); });
after(async () => { await browser?.close(); });

async function openPage(path, width = 1440, options = {}) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce', ...options });
  const page = await context.newPage();
  // No analytics or other remote requests leave these tests.
  await page.route('**/*', route => new URL(route.request().url()).origin === new URL(baseURL).origin ? route.continue() : route.abort());
  await page.addInitScript(() => { try { localStorage.setItem('measurement-consent-v2', 'denied'); } catch {} });
  await page.goto(`${baseURL}${path}`);
  await page.evaluate(() => document.fonts.ready);
  return { page, context };
}

const current = page => page.evaluate(() => document.querySelector('.mail-contents a[aria-current="location"]')?.getAttribute('href'));

test('Privacy and Terms list every section beside the text and mark the one being read', async () => {
  for (const path of ['/mail/privacy', '/mail/terms']) {
    const { page, context } = await openPage(path);
    try {
      const contents = await page.evaluate(() => ({
        links: [...document.querySelectorAll('.mail-contents a')].map(a => a.getAttribute('href')),
        headings: [...document.querySelectorAll('.mail-doc-body h2[id]')].map(h => `#${h.id}`),
        position: getComputedStyle(document.querySelector('.mail-contents')).position,
        compact: getComputedStyle(document.querySelector('.mail-contents-compact')).display,
      }));
      assert.ok(contents.headings.length >= 5, path);
      assert.deepEqual(contents.links, contents.headings, `${path}: one link per section, in order`);
      assert.equal(contents.position, 'sticky');
      assert.equal(contents.compact, 'none', `${path}: no disclosure on wide screens`);
      assert.equal(await current(page), contents.headings[0]);
      const target = contents.headings[2];
      await page.evaluate(id => document.querySelector(id).scrollIntoView({ block: 'start' }), target);
      await page.waitForFunction(id => document.querySelector('.mail-contents a[aria-current="location"]')?.getAttribute('href') === id, target);
    } finally { await context.close(); }
  }
});

test('a link to a section lands with its heading below the bars', async () => {
  const { page, context } = await openPage('/mail/terms#subscriptions');
  try {
    await page.waitForFunction(() => document.querySelector('.mail-contents a[aria-current="location"]')?.getAttribute('href') === '#subscriptions');
    const gap = await page.evaluate(() => document.getElementById('subscriptions').getBoundingClientRect().top - document.querySelector('.mail-bar').getBoundingClientRect().bottom);
    assert.ok(gap >= 0, `the heading starts ${gap}px below the bar`);
  } finally { await context.close(); }
});

test('below 1024px the list folds into a closed "On this page" disclosure', async () => {
  const { page, context } = await openPage('/mail/privacy', 800);
  try {
    const state = await page.evaluate(() => ({
      side: getComputedStyle(document.querySelector('.mail-contents')).display,
      open: document.querySelector('.mail-contents-compact').open,
      summary: document.querySelector('.mail-contents-compact summary').textContent.trim(),
      headings: document.querySelectorAll('.mail-doc-body h2[id]').length,
    }));
    assert.equal(state.side, 'none');
    assert.equal(state.open, false);
    assert.equal(state.summary, 'On this page');
    await page.locator('.mail-contents-compact summary').click();
    assert.equal(await page.evaluate(() => document.querySelector('.mail-contents-compact').open), true);
    assert.equal(await page.locator('.mail-contents-compact a').count(), state.headings);
  } finally { await context.close(); }
});

test('Pricing says purchases are not open before any price, and recommends neither plan', async () => {
  const { page, context } = await openPage('/mail/pricing');
  try {
    const pricing = await page.evaluate(() => {
      const callout = document.querySelector('.mail-pricing .mail-callout');
      const plans = document.querySelector('.mail-plans');
      return {
        text: callout.textContent.trim(),
        first: Boolean(callout.compareDocumentPosition(plans) & Node.DOCUMENT_POSITION_FOLLOWING),
        plans: document.querySelectorAll('.mail-plan').length,
        tabular: [...document.querySelectorAll('.mail-plan-price')].every(p => getComputedStyle(p).fontVariantNumeric.includes('tabular-nums')),
        badge: /recommended|best value|most popular/i.test(plans.textContent),
      };
    });
    assert.match(pricing.text, /^Purchases are not open yet\./);
    assert.ok(pricing.first, 'the status comes before the plans');
    assert.equal(pricing.plans, 2);
    assert.ok(pricing.tabular, 'prices use tabular figures');
    assert.equal(pricing.badge, false);
  } finally { await context.close(); }
});

test('Download puts the waitlist beside its requirements on wide screens and above them on phones', async () => {
  for (const [width, beside] of [[1440, true], [390, false]]) {
    const { page, context } = await openPage('/mail/download', width);
    try {
      const layout = await page.evaluate(() => {
        const main = document.querySelector('.mail-download-main').getBoundingClientRect();
        const requirements = document.querySelector('.mail-requirements').getBoundingClientRect();
        return {
          beside: requirements.left >= main.right - 1 && requirements.top < main.bottom,
          below: requirements.top >= main.bottom - 1,
        };
      });
      assert.equal(beside ? layout.beside : layout.below, true, `${width}px`);
      assert.equal(await page.locator('form#download-waitlist').count(), 1);
    } finally { await context.close(); }
  }
});

test('Support opens with its address, then three topics', async () => {
  const { page, context } = await openPage('/mail/support');
  try {
    const support = await page.evaluate(() => {
      const contact = document.querySelector('.mail-contact');
      const topics = document.querySelector('.mail-topics');
      return {
        address: contact.querySelector('a[href^="mailto:"]').getAttribute('href'),
        first: Boolean(contact.compareDocumentPosition(topics) & Node.DOCUMENT_POSITION_FOLLOWING),
        cards: [...topics.querySelectorAll('.mail-card h2')].map(h => h.textContent.trim()),
      };
    });
    assert.equal(support.address, 'mailto:support@blanc.day');
    assert.ok(support.first);
    assert.deepEqual(support.cards, ['Accounts and data', 'Uninstalling', 'Updates and licensing']);
  } finally { await context.close(); }
});
```

- [ ] **Step 2: Run it**

Run the suite with `<suite>` = `mail-subpages`.

Expected: `# pass 6`, `# fail 0`. Treat a failure as in Task 3 Step 2.

- [ ] **Step 3: Prove the suite can fail**

Temporarily delete this rule from `site/src/styles/mail.css`:

```css
.mail-doc-body h2{scroll-margin-top:calc(var(--mail-header-h) + var(--mail-bar-h) + 20px)}
```

Rebuild, restart the preview and rerun `mail-subpages`.

Expected: FAIL in "a link to a section lands with its heading below the bars", with a negative gap. Restore with `git checkout -- site/src/styles/mail.css`, rebuild, restart and rerun: `# fail 0`.

- [ ] **Step 4: Commit**

```bash
git add test/site/mail-subpages.test.mjs
git commit -m "Pin the Mail subpages: documents, pricing, download and support

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Bring the claims record and the Mail repository in line

**Files:**
- Modify: `docs/website-mail-claims-2026-10-12.md` (this repository)
- Mail repository, on a new branch `claude/mail-pages-published` from `origin/main`:
  - Modify: `AGENTS.md:5` (tagline) and `AGENTS.md:129` (public captures)
  - Modify: `docs/BLANC_MAIL_CLAIMS_REVIEW.md:23` (tagline row)
  - Modify: `docs/ISLAND_SIGNED_CHECKLIST.md:246-247` (§11 opening)

**Interfaces:**
- Consumes: the facts settled in Tasks 1–5.
- Produces: an open, unmerged Mail docs PR that Task 8 merges in the same window as the deploy (spec §11: the checklist line changes "in the same change that publishes them").

- [ ] **Step 1: Update the claims record**

In `docs/website-mail-claims-2026-10-12.md`:

- under **Tagline.**, replace "regenerates the share card." with "regenerates the share card, which reads “A little less inbox.” over “blanc.day/mail”.";
- under **Where the screenshots come from.**, append: "Their 1100px copies are display images built by `site/scripts/build-display-images.mjs` (`test/unit/site-mail-screens.test.js`).";
- under **Open before deploy.**, keep "Recapture every image from the signed release candidate." and add:

```markdown
- The Rules lines depend on EM-960's live checks (Mail `docs/RELEASE_ACCEPTANCE.md:76`).
- The deploy follows Task 8 of `docs/superpowers/plans/2026-10-12-mail-pages-redesign.md`.
```

- [ ] **Step 2: Check that no shipped claim was reworded**

```bash
git diff origin/main -- site/src/pages/mail.astro site/src/pages/mail | grep '^-' | grep -v '^---' | sed 's/<[^>]*>//g' | tr -s ' ' | sort -u > "${TMPDIR:-/tmp}/mail-removed.txt"
wc -l < "${TMPDIR:-/tmp}/mail-removed.txt"
```

Read each removed sentence and find it, word for word, in the new pages (`grep -F`). The only sentences allowed to disappear are the old tagline ("Email that minds its own business"), the two hero links ("See planned pricing ›", "Release status ›"), the old `MailNav` labels, and markup-only lines. Each one must already have a row or note in the claims record. Record the check's result in the ledger.

- [ ] **Step 3: Branch the Mail repository**

```bash
cd ~/Projects/Blanc\ Mail
git fetch origin
git switch -c claude/mail-pages-published origin/main
```

Expected: a new branch. The four `.xcscheme` files may show as modified; leave them alone.

- [ ] **Step 4: Edit the four lines**

`AGENTS.md` line 5: replace `Keep the tagline “Email that minds its own business.”` with `Keep the tagline “A little less inbox.” (chosen by the owner on October 12, 2026; it pairs with Blanc Browser’s “A little less browser.”)`.

`AGENTS.md` line 129: replace `The old postelmail.com homepage hero was retired on October 11, 2026, so no capture is public today.` with `Six captures are public on the Mail pages of Blanc's website (`site/public/mail/screens/` in `bnfy/blanc`), each labelled “Preview build”: the owner approved publishing them before launch on October 12, 2026, and `docs/website-mail-claims-2026-10-12.md` in `bnfy/blanc` records each one.`

`docs/BLANC_MAIL_CLAIMS_REVIEW.md` line 23: replace the row with:

```markdown
| “A little less inbox.” | Owner-selected tagline (October 12, 2026; replaces “Email that minds its own business.”) | Branding, not an empirical claim |
```

`docs/ISLAND_SIGNED_CHECKLIST.md` lines 246–247: replace

```markdown
Captures are only taken here, never published: publishing waits for launch
and owner-approved creative and captions.
```

with

```markdown
Captures are taken here. On October 12, 2026 the owner approved publishing
them before launch on the Mail pages, labelled “Preview build”; each
published set is recorded in `bnfy/blanc`'s
`docs/website-mail-claims-2026-10-12.md`.
```

- [ ] **Step 5: Check the edits**

```bash
git grep -n "minds its own business" -- AGENTS.md docs/BLANC_MAIL_CLAIMS_REVIEW.md
git grep -n "no capture is public today\|never published" -- AGENTS.md docs/ISLAND_SIGNED_CHECKLIST.md
git status --short | grep -v xcscheme
```

Expected: the claims-review row still names the old tagline (as "replaces …"), nothing else matches, and `git status` lists exactly the three edited docs.

- [ ] **Step 6: Commit and open the Mail PR, but don't merge it**

```bash
git add AGENTS.md docs/BLANC_MAIL_CLAIMS_REVIEW.md docs/ISLAND_SIGNED_CHECKLIST.md
git commit -m "Record the new tagline and the published Mail captures

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push -u origin claude/mail-pages-published
gh pr create -R bnfy/blanc-mail --base main --head claude/mail-pages-published --title "Record the new tagline and the published Mail captures" --body "Merges in the same window as the Mail pages redesign deploy (bnfy/blanc plan docs/superpowers/plans/2026-10-12-mail-pages-redesign.md, Task 8). Docs only.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
cd -
```

- [ ] **Step 7: Commit the claims record**

```bash
git add docs/website-mail-claims-2026-10-12.md
git commit -m "Record the Mail screenshots' display copies and the deploy gate

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Verify the whole branch and open the website PR

**Files:** none new.

**Interfaces:**
- Consumes: the branch after Tasks 1–6.
- Produces: an open website-only PR in `bnfy/blanc` with green CI and proof images for the owner.

- [ ] **Step 1: Run every gate**

```bash
npm run site:build
node --test test/unit/site-*.test.js test/unit/website-*.test.js test/unit/newsletter-worker.test.js
npm run lint
```

Then run all browser suites (`<suite>` = `*`, i.e. `node --test test/site/*.test.mjs`), and the three Mail suites again in WebKit:

```bash
BLANC_SITE_BROWSER=webkit BLANC_SITE_URL=http://127.0.0.1:4334 node --test test/site/mail-bar.test.mjs test/site/mail-overview.test.mjs test/site/mail-subpages.test.mjs
```

Expected: the build prints `SEO verification passed`, and every run reports `# fail 0`. In WebKit the reduced-transparency test reports as skipped. Run `npx playwright install webkit` first if WebKit is missing.

- [ ] **Step 2: Make the proof images**

Capture each of the six pages at 1440×900 from the live site and from the preview, and stack live above branch for each page. Write the script to `${TMPDIR:-/tmp}/mail-proof.mjs`:

```js
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
const { chromium } = createRequire(process.cwd() + '/package.json')('playwright');
const out = process.argv[2];
const sources = [['Live', 'https://blancbrowser.com'], ['This branch', 'http://127.0.0.1:4334']];
const pages = ['/mail', '/mail/pricing', '/mail/download', '/mail/support', '/mail/privacy', '/mail/terms'];
const browser = await chromium.launch();
for (const path of pages) {
  const shots = [];
  for (const [label, base] of sources) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    await page.goto(base + path, { waitUntil: 'networkidle' });
    await page.evaluate(async () => {
      document.querySelectorAll('img').forEach(img => { img.loading = 'eager'; });
      await Promise.all([...document.images].map(img => img.decode().catch(() => null)));
    });
    shots.push([label, await page.screenshot({ fullPage: true })]);
    await page.close();
  }
  const sheet = await browser.newPage({ viewport: { width: 1480, height: 900 } });
  await sheet.setContent(`<style>body{margin:0;padding:20px;font:600 16px system-ui}img{display:block;width:1440px;border:1px solid #ccc}p{margin:24px 0 8px}</style>` +
    shots.map(([label, png]) => `<p>${label}</p><img src="data:image/png;base64,${png.toString('base64')}">`).join(''));
  writeFileSync(`${out}/${path.slice(1).replace('/', '-')}.png`, await sheet.screenshot({ fullPage: true }));
  await sheet.close();
}
await browser.close();
```

Run it with the preview up:

```bash
mkdir -p "${TMPDIR:-/tmp}/mail-proof"
node "${TMPDIR:-/tmp}/mail-proof.mjs" "${TMPDIR:-/tmp}/mail-proof"
```

Expected: six PNGs. Look at each one. Send them to the owner with SendUserFile. Slice any image taller than 8000px first.

- [ ] **Step 3: Push and open the PR**

```bash
git push -u origin claude/mail-pages-redesign
gh pr create -R bnfy/blanc --base main --head claude/mail-pages-redesign --title "Redesign the Blanc Mail pages" --body-file "${TMPDIR:-/tmp}/mail-pr-body.md"
```

Write the PR body to `${TMPDIR:-/tmp}/mail-pr-body.md` first. It should cover: what changed (bar, overview, subpages, screenshots, tagline); the claims record; the tests (three suites, one unit test, mutation checks); and that the deploy is gated (Task 8). End it with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Bind the PR with the ccd_pr tools and read its CI. Don't merge without the owner's approval.

Expected: CI runs `substrate`, `unit` and the site workflow, and they pass. The Electron jobs report as skipped (website-only PR).

---

### Task 8: Deploy gate (stop for the owner)

**Files:** none. Live steps are the owner's to approve, one at a time.

**Interfaces:**
- Consumes: the merged website PR (owner-approved), the open Mail docs PR from Task 6.
- Produces: the redesigned Mail pages live, the Mail docs PR merged, the deploy recorded.

- [ ] **Step 1: Check the preconditions and report them to the owner**

| Precondition | How to check | If not met |
| --- | --- | --- |
| The owner approved the PR and its proof images | Their reply | Wait |
| Rules copy is backed by live Gmail behavior | Mail `docs/RELEASE_ACCEPTANCE.md:76` no longer says "Partial" for EM-960's live checks | The owner waives it in writing (recorded in the claims record), or the Rules lines and image stay off the deploy |
| Screenshots come from the signed release candidate | A Mail release candidate exists and `capture-public-shots.sh` ran from it | The owner waives it in writing, naming the demo build used (`edb50879`), recorded in the claims record |
| `support@blanc.day` receives mail | Step 1 of `docs/superpowers/specs/2026-10-13-blanc-day-domain-design.md` is done: mail to `support@blanc.day` arrives | Don't deploy pages naming that address |
| Which build may go live | `git tag --contains e01bd0bd3` | See Step 2 |

- [ ] **Step 2: Choose the deploy path with the owner**

- **A public release contains #706 and blanc.day is live:** after merging, deploy `main` with `npm run site:deploy` (owner approval). Then confirm `npx wrangler pages deployment list --project-name=blancbrowser` shows the merge commit as `Production` on `main`.
- **Otherwise:** a side deploy like October 12's. In a detached worktree at `site-production-source`, cherry-pick the redesign's squash-merge commit, resolve against that branch's older pages, build, and deploy with `npx wrangler pages deploy site/dist --project-name=blancbrowser --branch=main --commit-message "<what this is and why it is not main>"`. The side source still uses blancbrowser.com, so only do this once `support@blanc.day` receives mail, or ask the owner how the addresses should read. Never push `site-production-source`. Afterwards, move the branch to the new commit and update the memory record `site-production-held-for-blanc-spaces.md`.

- [ ] **Step 3: Merge the Mail docs PR in the same window**

After the deploy is live, merge the Task 6 PR on its tested head SHA, with the owner's approval.

- [ ] **Step 4: Verify live**

```bash
for p in /mail /mail/pricing /mail/download /mail/support /mail/privacy /mail/terms /mail/screens/main.webp /mail/screens/main-1100.webp /mail-og.png; do printf '%s ' "$p"; curl -s -o /dev/null -w '%{http_code}\n' "https://blanc.day$p"; done
```

Use the origin that was deployed (`https://blancbrowser.com` for a side deploy). Expected: `200` for every path. Open `/mail` in the in-app browser and confirm the bar, the hero screenshot and its "Preview build" caption.

- [ ] **Step 5: Record the deploy**

Append the deployment ID, source commit, origin and date to `docs/website-mail-claims-2026-10-12.md` under a new **Deployed.** paragraph. Commit it in a small docs PR.

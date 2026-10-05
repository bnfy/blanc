# Start Page Frame + Ledger (PR 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give all four `blanc://newtab` layouts one shared frame: an in-flow header, a centered content area, and a fixed footer with a Customize popover. Apply the approved type, surface, corner and motion rules, fix the private-tab and overlap bugs, and rebuild Ledger as a centered two-column spread.

**Architecture:** This is a renderer-only change to `src/renderer/pages/newtab.html`, `newtab.js` and `pages.css`. It adds no IPC, settings or new data. All layout positioning moves from `position: absolute/fixed` per layout into normal flow inside `.start-content`, so the checklist and footer can't overlap content. The Customize popover uses the native Popover API with CSS anchor positioning. Billboard, Shelf and Tally only move into the frame here; their own reworks are PRs 2–4.

**Tech Stack:** Electron 44.5.1 (Chromium 152), plain HTML/CSS/JS served flat from `src/renderer/pages/`, `node --test` unit tests, Cucumber + Playwright-Electron acceptance tests (`test/desktop/`).

**Spec:** `docs/superpowers/specs/2026-10-05-start-page-layouts-polish-design.md` (owner-approved 2026-10-05). Read it before starting; this plan implements its Section 1, the Ledger part of Section 2, and the PR 1 parts of Section 3.

## Global Constraints

- **No new IPC or data:** add no `pages:*` channel and no bridge member, and don't change what `pages:start:data` returns. `npm run browser-api:check` must pass untouched.
- **Keep the layout ids and their order:** `ledger`, `billboard`, `shelf`, `tally`. Keep the `newtabLayout` setting, its sync and `newtab_layout` telemetry. `applyLayout` still calls `layoutUsed`.
- **No inline styles in markup.** The CSP is `style-src 'self'`, and `migration-checklist-page.test.js` asserts there is no `style="`. Use classes and data attributes. Setting values through CSSOM in JS (the existing `bar.style.height`) is allowed.
- **Footer stays `position: fixed`.** Don't restore an in-flow footer.
- **Mahjong tile faces stay JetBrains Mono 800.** Don't touch `mahjong.css`.
- **Private tabs:** no Patron chip, no blocked counts, no favicon fetches (unchanged), and the private explanation stays.
- **Copy:** labels are sentence case with no letter-spacing ("Favorites", "Pick up where you left off", "On your other devices", "Blocked this week", "Blocked"). The date uses locale capitalization; private shows "Private tab". The footer reads "Customize", "Mahjong", "⌘L to go anywhere". The empty hint is exactly `Favorite a page with ♥ to pin it here`. Checklist copy is unchanged.
- **Values defined once on `.ledger-body`:**
  - `--start-measure: 1080px`
  - `--start-gutter: clamp(24px, 5vw, 72px)`
  - `--start-ease: cubic-bezier(0.2, 0, 0, 1)`
  - `--start-shadow-icon: 0 7px 22px -17px rgba(18, 16, 11, 0.65)`
  - `--start-shadow-card: 0 14px 36px -30px rgba(18, 16, 11, 0.68)`
  - `--start-shadow-float: 0 24px 60px -32px rgba(18, 16, 11, 0.7)`
- **Corner radii:** icon tiles 6px, cards 10px, floating surfaces 14px, chips and buttons 999px.
- **Durations:** enter 200ms, exit 150ms, layout fade 160ms, hover/press 120ms. No bounce, no JS animation library.
- **Don't edit `site/`.** The public site describes the released app (v1.27.0). Copy changes reach it only after release (see Task 10).
- **Branch:** `claude/start-page-layout-polish-59e9b3`. Run `git branch --show-current` before every commit; other sessions share this repo.
- Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## File map

| File | Responsibility in this PR |
| --- | --- |
| `src/renderer/pages/newtab.html` | Header row with the checklist slot; `.start-content` wrapping the four `<main>`s and an end sentinel; footer with the Customize button and popover; sentence-case labels; Ledger spread markup; Tally Patron moved to its root's end |
| `src/renderer/pages/newtab.js` | Patron hidden in private; empty hint helper; private blocked-count hiding; date casing; Customize `aria-expanded`; footer underflow observer; `layout-ready` flag |
| `src/renderer/pages/pages.css` | Delete the absolute/fixed layout rules; add one "Start page frame" block (frame, checklist slot, Patron chip, Customize, type, surfaces, motion, Ledger) |
| `tokens/tokens.json` + generated | Remove `patron-surface`, `patron-label`, `patron-halo` |
| `src/main/test-hook.js` | Test-only: `clickNewtabLayoutSwitcher` opens Customize first; new `openStartCustomize`, `readStartCustomize`, `pressStartPageKey`, `readStartFrameGeometry`; the font-usage hook learns `.ledger-where` |
| `test/unit/start-page-frame.test.js` (new) | Source guards for the frame, the Patron slot, private rules, the empty hint, Customize, surfaces, motion and Ledger |
| `test/unit/migration-checklist-page.test.js` | Patron + checklist-position assertions rewritten |
| `test/unit/start-page-fonts.test.js` | Allow "Where to?"; guard its type role and the clock's optical sizing |
| `spec/acceptance/newtab-layouts.feature`, `test/desktop/steps/newtab-layouts.steps.js`, `test/desktop/cucumber.mjs` | New scenarios F35-10…F35-14 and their steps; RUNNABLE ids |
| `docs/brand-usage.md`, `spec/features.md`, `spec/parity-matrix.md`, `CLAUDE.md`, `AGENTS.md` | Docs |

**Test commands used throughout:**
- One unit file: `node --test test/unit/<file>.test.js`
- All unit tests: `npm run test:unit`
- Acceptance dry-run: `npm run test:acceptance:dry`
- Selected scenarios: `npx cucumber-js -c test/desktop/cucumber.mjs -p runnable --tags '@F35'` (add `or @F40-…` as needed). This launches Electron in a visible window; it must run outside the sandbox.

---

### Task 1: Worktree setup and "before" captures

**Files:**
- Modify (gitignored, throwaway): `output/start-page-handoff-2026-10-05/capture-start.js`
- Create (gitignored): `output/start-page-pr1/before/*.png`

**Interfaces:**
- Produces: `capture-start.js` accepting `OUT`, `REPO`, and optional `EXTRAS=1`; the image set `<layout>-1440-light`, `<layout>-820-light`, `<layout>-1440-dark`, `<layout>-1440-private` that Task 11 reuses.

- [ ] **Step 1: Install the locked dependencies**

The worktree's Electron is 44.4.3 but the lockfile wants 44.5.1. A stale Electron throws a main-process error dialog on every launch. Never symlink `node_modules`.

Run: `npm ci`
Expected: completes. `node -p "require('electron/package.json').version"` prints `44.5.1`.

- [ ] **Step 2: Record the baseline**

Run: `npm run test:unit 2>&1 | tail -5; npm run lint; npm run substrate:check 2>&1 | tail -3`
Expected: all pass. If anything fails, run the same command on a clean `origin/main` checkout to check whether it's pre-existing, and write the failing test names into the task notes before continuing. Don't fix unrelated failures.

- [ ] **Step 3: Extend the capture harness**

In `output/start-page-handoff-2026-10-05/capture-start.js`, replace the whole `async function shoot(...) { ... }` and everything after it (down to and including `await app.close();`) with:

```js
  async function shoot(name, { layout, dark = false, width = 1440, height = 900, priv = false, media = [], script = null }) {
    await call('setNewtabLayout', layout);
    await app.evaluate(({ BrowserWindow }, [w, h]) => {
      const win = BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().includes('index.html')) || BrowserWindow.getAllWindows()[0];
      win.setContentSize(w, h);
    }, [width, height]);
    if (priv) await call('openTab', 'blanc://newtab/?private=1', { private: true });
    else await call('newTab');
    await new Promise((r) => setTimeout(r, 1800));
    const st = await call('state');
    const wcId = await call('workspacePageIdentity', st.activeTabId);
    const png = await app.evaluate(async ({ webContents }, [d, id, extra, js]) => {
      for (const wc of webContents.getAllWebContents()) {
        try {
          if (!wc.debugger.isAttached()) wc.debugger.attach('1.3');
          await wc.debugger.sendCommand('Emulation.setEmulatedMedia', {
            features: [{ name: 'prefers-color-scheme', value: d ? 'dark' : 'light' }, ...extra],
          });
        } catch {}
      }
      await new Promise((r) => setTimeout(r, 700));
      const pageWc = webContents.fromId(id);
      if (js) {
        await pageWc.executeJavaScript(js);
        await new Promise((r) => setTimeout(r, 500));
      }
      const page = await pageWc.capturePage();
      return { page: page.toPNG().toString('base64') };
    }, [dark, wcId, media, script]);
    fs.writeFileSync(path.join(OUT, `${name}.png`), Buffer.from(png.page, 'base64'));
    console.log('wrote', name);
  }

  const LAYOUTS = ['ledger', 'billboard', 'shelf', 'tally'];
  await call('setAppearance', 'light');
  for (const l of LAYOUTS) await shoot(`${l}-1440-light`, { layout: l });
  for (const l of LAYOUTS) await shoot(`${l}-820-light`, { layout: l, width: 820 });
  await call('setAppearance', 'dark');
  for (const l of LAYOUTS) await shoot(`${l}-1440-dark`, { layout: l, dark: true });
  await call('setAppearance', 'light');
  for (const l of LAYOUTS) await shoot(`${l}-1440-private`, { layout: l, priv: true });
  if (process.env.EXTRAS === '1') {
    await shoot('ledger-customize-open', {
      layout: 'ledger',
      script: "document.getElementById('customizeButton').focus(); document.getElementById('customizeButton').click();",
    });
    await shoot('shelf-reduced-transparency', { layout: 'shelf', media: [{ name: 'prefers-reduced-transparency', value: 'reduce' }] });
    await shoot('shelf-contrast-more', { layout: 'shelf', media: [{ name: 'prefers-contrast', value: 'more' }] });
    await shoot('ledger-reduced-motion', { layout: 'ledger', media: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  }
  await app.close();
```

- [ ] **Step 4: Capture "before"**

Run (outside the sandbox; it opens a visible window that closes itself):
`REPO="$PWD" OUT=output/start-page-pr1/before node output/start-page-handoff-2026-10-05/capture-start.js`
Expected: 16 `wrote …` lines, and 16 PNGs in `output/start-page-pr1/before/`. Open `tally-1440-light.png` and confirm the "before" bug is visible (the checklist overlaps the chart caption). Nothing to commit (gitignored).

---

### Task 2: Shared frame — in-flow header, checklist slot, centered content

**Files:**
- Modify: `src/renderer/pages/newtab.html` (header, `.start-content`, Tally Patron position)
- Modify: `src/renderer/pages/pages.css` (delete the positioning rules listed below; add the frame block)
- Create: `test/unit/start-page-frame.test.js`
- Modify: `test/unit/migration-checklist-page.test.js` (the test "checklist occupies the corner, compacts at tight viewports, and avoids private tabs")
- Modify: `src/main/test-hook.js` (add `readStartFrameGeometry`)
- Modify: `spec/acceptance/newtab-layouts.feature`, `test/desktop/steps/newtab-layouts.steps.js`, `test/desktop/cucumber.mjs` (F35-10)

**Interfaces:**
- Produces:
  - Markup: `<header class="start-header">` containing `.start-brand` and `#migrationChecklistShell`; `<div class="start-content" id="startContent">` containing the four `<main>`s and, last, `<div id="startContentEnd" class="start-content-end" aria-hidden="true"></div>`.
  - CSS custom properties on `.ledger-body`: `--start-measure`, `--start-gutter`, `--start-ease`, `--start-shadow-icon`, `--start-shadow-card`, `--start-shadow-float`, `--start-card-fill`, `--start-float-fill`, `--start-card-highlight`. Later tasks use these.
  - The CSS section comment `/* ---------- Start page frame (2026-10-05 polish) ---------- */`. Later tasks append inside this section.
  - Test hook `readStartFrameGeometry()` → `{ layout, private, viewportWidth, viewportHeight, maxScrollY, shell: Rect|null, compact: boolean, content: [{selector, rect}], footer: Rect|null, patronLast: boolean, patronVisible: boolean, emptyHints: number }`, where `Rect = {top, right, bottom, left, width, height}`.

- [ ] **Step 1: Write the failing unit test**

Create `test/unit/start-page-frame.test.js`:

```js
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const frameCss = () => {
  const css = read('src/renderer/pages/pages.css');
  const start = css.indexOf('/* ---------- Start page frame (2026-10-05 polish) ----------');
  assert.ok(start > 0, 'pages.css carries the start page frame section');
  const end = css.indexOf('/* ---------- first-run onboarding dialog ----------', start);
  assert.ok(end > start, 'the frame section ends before the onboarding section');
  return css.slice(start, end);
};

test('the header row holds the brand and the checklist slot, in flow', () => {
  const html = read('src/renderer/pages/newtab.html');
  assert.match(
    html,
    /<header class="start-header" aria-label="Blanc start page">\s*<div class="start-brand">[\s\S]*?id="startDate" class="start-brand-date"[\s\S]*?<\/div>\s*<div id="migrationChecklistShell"/,
  );
  const css = frameCss();
  assert.match(css, /\.start-header \{[^}]*display: flex;[^}]*justify-content: space-between;/s);
  assert.doesNotMatch(read('src/renderer/pages/pages.css'), /\.start-brand \{[^}]*position: fixed/s,
    'the brand no longer floats over content');
});

test('every layout renders inside one centered content area', () => {
  const html = read('src/renderer/pages/newtab.html');
  const content = html.match(/<div class="start-content" id="startContent">([\s\S]*?)<div id="startContentEnd" class="start-content-end" aria-hidden="true"><\/div>\s*<\/div>/);
  assert.ok(content, 'start-content wraps the layouts and ends with its sentinel');
  for (const id of ['layoutLedger', 'layoutBillboard', 'layoutShelf', 'layoutTally']) {
    assert.match(content[1], new RegExp(`<main [^>]*id="${id}"`), `${id} lives in the content area`);
  }
  const css = frameCss();
  assert.match(css, /\.start-content \{[^}]*max-width: calc\(var\(--start-measure\) \+ 2 \* var\(--start-gutter\)\);[^}]*margin-inline: auto;/s);
  for (const selector of ['.billboard', '.shelf', '.tally-left', '.tally-right']) {
    const escaped = selector.replace('.', '\\.');
    assert.match(css, new RegExp(`${escaped}[^{]*\\{[^}]*position: static;`, 's'), `${selector} is in flow`);
  }
});

test('the checklist sits in the header and compacts to a top-right ring', () => {
  const css = frameCss();
  assert.match(css, /\.migration-checklist-shell \{[^}]*position: relative;[^}]*width: 286px;/s);
  assert.match(css, /@media \(max-width: 960px\), \(max-height: 640px\) \{[\s\S]*?\.migration-checklist \{[^}]*position: absolute;[^}]*top: 58px;[^}]*right: 0;/);
  assert.doesNotMatch(read('src/renderer/pages/pages.css'), /body\[data-layout="(billboard|tally)"\] \.migration-checklist-shell \{ top:/,
    'no per-layout checklist offsets remain');
});

test('each layout ends with the Patron chip', () => {
  const html = read('src/renderer/pages/newtab.html');
  const mains = html.match(/<main [\s\S]*?<\/main>/g);
  assert.equal(mains.length, 4);
  for (const main of mains) {
    assert.match(main, /<p [^>]*class="[^"]*js-patron-callout[^"]*" hidden>\s*<a [^>]*>[\s\S]*?<\/a>\s*<\/p>\s*<\/main>$/,
      `${main.slice(0, 60)}… ends with its Patron chip`);
  }
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `node --test test/unit/start-page-frame.test.js`
Expected: FAIL. The first assertion fails with "pages.css carries the start page frame section".

- [ ] **Step 3: Restructure `newtab.html`**

3a. Replace:
```html
  <header class="start-brand" aria-label="Blanc start page">
    <img class="start-brand-mark" src="sunrise-mark.png" alt="" />
    <span id="startDate" class="start-brand-date"></span>
  </header>
```
with the header below. Move the whole existing `<div id="migrationChecklistShell" …> … </div>` block, unchanged, from its current position after the Tally `<main>` into the header, as its second child:
```html
  <header class="start-header" aria-label="Blanc start page">
    <div class="start-brand">
      <img class="start-brand-mark" src="sunrise-mark.png" alt="" />
      <span id="startDate" class="start-brand-date"></span>
    </div>
    <div id="migrationChecklistShell" class="migration-checklist-shell" hidden>
      … existing contents, byte-for-byte …
    </div>
  </header>
```

3b. Wrap the four `<main>` elements (and the HTML comment above Billboard) in:
```html
  <div class="start-content" id="startContent">
    … the four <main> elements …
    <div id="startContentEnd" class="start-content-end" aria-hidden="true"></div>
  </div>
```

3c. In `#layoutTally`, move `<p class="tally-patron js-patron-callout" hidden>…</p>` out of `.tally-left` so it becomes the last child of `<main class="tally" id="layoutTally">`, after `.tally-right`.

- [ ] **Step 4: Delete the per-layout positioning rules in `pages.css`**

Delete exactly these rules or declarations. Each is located by its selector; grep for it.

| Where | Delete |
| --- | --- |
| base, near "A single moving-in checklist replaces" | the rule `.migration-checklist-shell { position: fixed; z-index: 8; right: …; bottom: 84px; width: 286px; }` and the following `body[data-layout="billboard"] .migration-checklist-shell { top: 92px; bottom: auto; }` with its comment |
| base | the whole `@media (max-width: 960px), (max-height: 640px) { .migration-checklist-shell … }` block (it ends after `body[data-layout="billboard"] .migration-checklist { top: 58px; bottom: auto; }`) |
| base billboard section | in `.billboard { … }` delete `position: absolute;` and `inset: 0;` |
| base billboard section | the whole `@media (max-height: 640px) { body[data-layout="billboard"] { padding: 0; } … .bb-groups { margin-top: 18px; } }` block and its comment |
| base shelf section | in `.shelf { … }` delete `position: absolute; left: 110px; right: 110px; top: 120px;` |
| base tally section | in `.tally-left { … }` and `.tally-right { … }` delete `position`, `left`/`right`, `top`, `width` |
| Sunrise section | `.start-brand { position: fixed; … }` (the whole rule) |
| Sunrise section | `body.ledger-body:has(> #startupCard:not([hidden])) > .start-brand { display: none; }` |
| Sunrise section | `body[data-layout="ledger"] .ledger { width: …; max-width: none; margin: …; user-select: none; }` |
| Sunrise section | `.billboard { padding: 120px 80px 118px; transform: translateY(-28px); }` |
| Sunrise section | `.shelf { left: …; right: auto; top: …; width: …; padding-bottom: 84px; }` |
| Sunrise section | the `.tally-left { … }` and `.tally-right { … }` rules (keep `.tally-label { margin-top: 0; }` and everything after it) |
| Sunrise section | `.migration-checklist-shell { top: clamp(154px, 22vh, 194px); right: …; bottom: auto; width: 286px; }`, `body[data-layout="billboard"] .migration-checklist-shell { top: … }`, `body[data-layout="tally"] .migration-checklist-shell { top: … }` |
| Sunrise section | the whole `@media (max-width: 1120px) { … }` block |
| Sunrise `@media (max-width: 960px)` | the whole block |
| Sunrise `@media (max-width: 760px)` | the first rule (`.migration-checklist-shell, body[data-layout="billboard"] .migration-checklist-shell, body[data-layout="tally"] .migration-checklist-shell { top: auto; right: 20px; bottom: 72px; width: 136px; }`), the `.migration-checklist-compact { display: flex; … }` and `.migration-checklist-compact .migration-progress-ring { … }` and `.migration-compact-label { … }` rules (re-added in Step 5), `body[data-layout="billboard"] .migration-checklist { … }`, `.start-brand { top: 22px; left: 30px; }`, `body[data-layout="ledger"] .ledger { … }`, both `.shelf { … }` rules, `.billboard { padding: 110px 30px 140px; transform: none; }`, `.tally-left, .tally-right { margin-inline: 30px; }`, `.tally-left { padding-top: 122px; }`. **Keep** `.ledger-body { padding-bottom: 104px; … }`, `.start-brand-mark { … }`, `.shelf-grid`, `.shelf-cards`, `.bb-favs`, `.bb-site`. |
| Sunrise `@media (max-width: 1040px)` | the last rule (`.migration-checklist-shell, … { bottom: 102px; }`) |
| Sunrise `@media (max-height: 640px)` | `.start-brand { position: absolute; top: 16px; }`, `body[data-layout="ledger"] .ledger { margin-top: 98px; }`, `body[data-layout="billboard"] { padding: 0 0 72px; }`, the `.billboard { position: relative; … }` rule, `body[data-layout="billboard"] .ledger-footer { position: fixed; margin: 0; }`, `.shelf { top: 92px; }`, `.tally-left { padding-top: 100px; }`. **Keep** `.start-brand-mark`, `.bb-clock`, `.bb-favs`, `.bb-groups`, `.shelf-tile`. |
| Sunrise | the whole `@media (max-width: 500px) and (max-height: 320px) { … }` block |
| layouts section | in `body.ledger-body:has(> #startupCard:not([hidden])) > main, body.ledger-body:has(> #startupCard:not([hidden])) > .ledger-footer { display: none; }` change `> main` to `> .start-header, body.ledger-body:has(> #startupCard:not([hidden])) > .start-content` |
| base | `:root[data-theme="private"] .migration-checklist-shell, body.ledger-body:has(> #startupCard:not([hidden])) > .migration-checklist-shell { display: none; }` becomes `:root[data-theme="private"] .migration-checklist-shell { display: none; }` (the header is hidden whole while the startup card shows) |

- [ ] **Step 5: Add the frame block**

Insert this block immediately before `/* ---------- first-run onboarding dialog ----------`:

```css
/* ---------- Start page frame (2026-10-05 polish) ----------
   One page grid: an in-flow header (brand left, checklist right), one
   centered content area every layout renders into, and the fixed footer
   whose height the body reserves. Nothing below is absolutely positioned,
   so the checklist and the footer cannot cover content by construction.
   Spec: docs/superpowers/specs/2026-10-05-start-page-layouts-polish-design.md */
.ledger-body {
  --start-measure: 1080px;
  --start-gutter: clamp(24px, 5vw, 72px);
  --start-ease: cubic-bezier(0.2, 0, 0, 1);
  --start-shadow-icon: 0 7px 22px -17px rgba(18, 16, 11, 0.65);
  --start-shadow-card: 0 14px 36px -30px rgba(18, 16, 11, 0.68);
  --start-shadow-float: 0 24px 60px -32px rgba(18, 16, 11, 0.7);
  --start-card-fill: color-mix(in srgb, var(--surface-raised) 80%, transparent);
  --start-float-fill: color-mix(in srgb, var(--surface-raised) 94%, transparent);
  --start-card-highlight: inset 0 1px 0 rgb(255 255 255 / 0.55);
  display: flex;
  flex-direction: column;
}
@media (prefers-color-scheme: dark) {
  .ledger-body { --start-card-highlight: inset 0 0 0 transparent; }
}
:root[data-theme="private"] .ledger-body { --start-card-highlight: inset 0 0 0 transparent; }

.start-header {
  position: relative;
  z-index: 6;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  width: 100%;
  max-width: calc(var(--start-measure) + 2 * var(--start-gutter));
  margin-inline: auto;
  padding: clamp(30px, 5vh, 48px) var(--start-gutter) 0;
}
.start-brand {
  display: flex;
  align-items: center;
  gap: 16px;
  min-width: 0;
  color: var(--text-dim);
  user-select: none;
}
.start-content {
  flex: 1 0 auto;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: calc(var(--start-measure) + 2 * var(--start-gutter));
  margin-inline: auto;
  padding: clamp(32px, 6vh, 64px) var(--start-gutter) 48px;
}
body[data-layout="billboard"] .start-content { justify-content: center; }
.start-content-end { flex: 0 0 auto; height: 0; }

/* PR 1 places the three other layouts in flow; their reworks follow. */
.billboard { position: static; padding: 0; transform: none; }
.shelf { position: static; width: auto; padding-bottom: 0; }
body[data-layout="tally"] #layoutTally {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 310px);
  column-gap: 64px;
  row-gap: 32px;
  align-items: start;
}
#layoutTally:has(> .tally-right[hidden]) { grid-template-columns: minmax(0, 1fr); }
.tally-left,
.tally-right { position: static; width: auto; margin: 0; padding: 0; }
.tally-patron { grid-column: 1 / -1; margin-top: 0; }
@media (max-width: 900px) {
  body[data-layout="tally"] #layoutTally { grid-template-columns: minmax(0, 1fr); }
}

/* The checklist owns the header's right cell on every layout. Tight windows
   keep it in that same corner as a ring that opens downward. */
.migration-checklist-shell {
  position: relative;
  z-index: 8;
  flex: 0 0 auto;
  width: 286px;
}
@media (max-width: 960px), (max-height: 640px) {
  .migration-checklist-shell { width: 48px; }
  .migration-checklist-compact {
    display: grid;
    width: 48px;
    height: 48px;
    min-width: 0;
    padding: 0;
    place-items: center;
    border: 0;
    border-radius: 50%;
    background: var(--surface-raised);
    box-shadow: var(--start-shadow-float);
  }
  .migration-checklist-compact .migration-progress-ring {
    width: 48px;
    height: 48px;
    border-width: 3px;
    font-size: 11px;
  }
  .migration-checklist {
    position: absolute;
    top: 58px;
    right: 0;
    bottom: auto;
    display: none;
    width: 276px;
    padding: 16px 18px 14px;
    border: 1px solid color-mix(in srgb, var(--border) 74%, transparent);
    border-radius: 14px;
    background: var(--start-float-fill);
    box-shadow: var(--start-shadow-float);
    backdrop-filter: blur(20px) saturate(140%);
  }
  .migration-checklist-shell.is-expanded .migration-checklist { display: block; }
}
@media (max-width: 760px) {
  .migration-checklist-shell { width: 136px; }
  .migration-checklist-compact {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 136px;
    height: 44px;
    padding: 3px 10px 3px 3px;
    border: 1px solid var(--border);
    border-radius: 999px;
  }
  .migration-checklist-compact .migration-progress-ring {
    width: 36px;
    height: 36px;
    border-width: 2px;
    font-size: 10px;
  }
  .migration-compact-label {
    display: inline;
    color: var(--text);
    font: 600 11px/1.1 var(--font-ui);
    white-space: nowrap;
  }
}
```

- [ ] **Step 6: Run the unit test**

Run: `node --test test/unit/start-page-frame.test.js`
Expected: PASS (4 tests).

- [ ] **Step 7: Rewrite the old checklist-position unit test**

In `test/unit/migration-checklist-page.test.js`, replace the body of `test('checklist occupies the corner, compacts at tight viewports, and avoids private tabs', …)` with:

```js
  const css = read('src/renderer/pages/pages.css');
  const html = read('src/renderer/pages/newtab.html');

  assert.match(html, /<header class="start-header"[\s\S]*?<div id="migrationChecklistShell"[\s\S]*?<\/header>/,
    'the checklist lives in the header row');
  assert.match(css, /\/\* ---------- Start page frame \(2026-10-05 polish\) ----------[\s\S]*?\.migration-checklist-shell \{[^}]*position: relative;/);
  assert.match(css, /@media \(max-width: 960px\), \(max-height: 640px\) \{[\s\S]{0,900}?\.migration-checklist-compact \{[\s\S]{0,300}?display: grid;/);
  assert.match(css, /\.migration-checklist \{[\s\S]{0,340}?top: 58px;[\s\S]{0,340}?display: none;/,
    'the compact checklist opens downward from its ring');
  assert.doesNotMatch(css, /body\[data-layout="mahjong"\] \.migration-checklist-shell/);
  assert.match(css, /:root\[data-theme="private"\] \.migration-checklist-shell/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{[\s\S]{0,320}?animation: none;/);
```

Run: `node --test test/unit/migration-checklist-page.test.js`
Expected: PASS. If another test in that file asserts an old position value, update it to the header-slot values above, keeping its intent.

- [ ] **Step 8: Add the frame geometry test hook**

In `src/main/test-hook.js`, directly after `readMigrationChecklistDom() { … },` add:

```js
    // F35-10/11/12/13: one read of the frame — collapsed checklist, active
    // layout content, footer, Patron slot and empty hints — so scenarios can
    // prove "nothing covers content" without per-layout selectors.
    readStartFrameGeometry() {
      const tab = tabs.get(getActiveTabId());
      const wc = tab && urlOf(tab).startsWith('blanc://newtab') ? liveContents(tab) : null;
      if (!wc) return null;
      return wc.executeJavaScript(`(() => {
        const rect = (element) => {
          if (!element) return null;
          const style = getComputedStyle(element);
          if (style.display === 'none' || style.visibility === 'hidden') return null;
          const r = element.getBoundingClientRect();
          if (!r.width || !r.height) return null;
          return { top: r.top, right: r.right, bottom: r.bottom, left: r.left, width: r.width, height: r.height };
        };
        const layout = document.body.dataset.layout;
        const name = layout.charAt(0).toUpperCase() + layout.slice(1);
        const rootEl = document.getElementById('layout' + name);
        const shellEl = document.getElementById('migrationChecklistShell');
        const shell = shellEl && !shellEl.hidden ? rect(shellEl) : null;
        const content = [...rootEl.querySelectorAll('a, button, h2, .ledger-label, .shelf-card, .tally-chart, .tally-caption, .bb-clock, .bb-blocked, .start-empty-hint')]
          .map((element) => ({ selector: element.id ? '#' + element.id : element.className || element.tagName, rect: rect(element) }))
          .filter((entry) => entry.rect);
        const patron = rootEl.querySelector(':scope > .js-patron-callout');
        const root = document.documentElement;
        return {
          layout,
          private: document.documentElement.dataset.theme === 'private',
          viewportWidth: innerWidth,
          viewportHeight: innerHeight,
          maxScrollY: Math.max(0, Math.max(root.scrollHeight, document.body.scrollHeight) - innerHeight),
          shell,
          compact: !!shellEl && getComputedStyle(document.getElementById('migrationChecklistCompact')).display !== 'none',
          content,
          footer: rect(document.getElementById('layoutFooter')),
          patronLast: rootEl.lastElementChild === patron,
          patronVisible: !!patron && !patron.hidden && !!rect(patron),
          emptyHints: [...rootEl.querySelectorAll('.start-empty-hint')].filter((element) => rect(element)).length,
        };
      })()`);
    },
```

- [ ] **Step 9: Add acceptance scenario F35-10 with its steps**

Append to `spec/acceptance/newtab-layouts.feature`:

```gherkin
  @F35-10 @desktop
  Scenario: The checklist and the footer never cover start-page content
    Given a profile that completed first run
    And the moving-in checklist is incomplete and not hidden
    And local history contains repeated visits for the Billboard
    And eight favorites fill the Start Page
    When I open a new tab
    Then no start-page layout is covered by its checklist or footer at 1440x900 or 820x900
```

Append to `test/desktop/steps/newtab-layouts.steps.js`:

```js
const intersects = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;

Then('no start-page layout is covered by its checklist or footer at 1440x900 or 820x900', async function () {
  const original = await this.call('windowContentBounds');
  const originalLayout = await this.call('newtabLayout');
  try {
    for (const size of [{ width: 1440, height: 900 }, { width: 820, height: 900 }]) {
      await this.call('setWindowContentSize', size.width, size.height);
      await waitForValue(
        () => this.call('windowContentBounds'),
        (bounds) => bounds?.width === size.width && bounds?.height === size.height,
        `${size.width}x${size.height} content bounds`,
      );
      for (const layout of ['ledger', 'billboard', 'shelf', 'tally']) {
        assert.equal(await this.call('setNewtabLayout', layout), layout);
        const frame = await waitForValue(
          () => this.call('readStartFrameGeometry'),
          (value) => value?.layout === layout && value.viewportWidth === size.width && value.shell && value.content.length > 0,
          `${layout} frame at ${size.width}x${size.height}`,
        );
        const context = `${layout} at ${size.width}x${size.height}`;
        for (const entry of frame.content) {
          assert.ok(!intersects(frame.shell, entry.rect),
            `${context}: checklist ${JSON.stringify(frame.shell)} covers ${entry.selector} ${JSON.stringify(entry.rect)}`);
          const atBottom = { ...entry.rect, top: entry.rect.top - frame.maxScrollY, bottom: entry.rect.bottom - frame.maxScrollY };
          assert.ok(!intersects(frame.footer, atBottom),
            `${context}: footer covers ${entry.selector} when scrolled to the end`);
        }
      }
    }
  } finally {
    await this.call('setNewtabLayout', originalLayout);
    await this.call('setWindowContentSize', original.width, original.height);
  }
});
```

In `test/desktop/cucumber.mjs`, add `'@F35-10'` to the F35 line of `RUNNABLE` (after `'@F35-9'`).

- [ ] **Step 10: Run the dry-run, then the scenarios**

Run: `npm run test:acceptance:dry 2>&1 | tail -3`
Expected: no undefined steps.

Run: `npx cucumber-js -c test/desktop/cucumber.mjs -p runnable --tags '@F35'`
Expected: every F35 scenario passes, including F35-10, F35-7 and F35-8, plus F35-6 ("the start-page typography fits"). If F35-6 reports a new `unreachableText` or `clippedText`, fix the CSS. Don't weaken the audit.

- [ ] **Step 11: Look at it in the real app**

Run `npm start` (relaunch it if it's already running; chrome-level changes need a restart). Open a new tab and switch through all four layouts at a normal window width and at about 820px. Confirm the brand and checklist share the top row, and nothing sits behind the footer. Leave the dev app running.

- [ ] **Step 12: Commit**

```bash
git branch --show-current   # must print claude/start-page-layout-polish-59e9b3
git add src/renderer/pages/newtab.html src/renderer/pages/pages.css src/main/test-hook.js \
  test/unit/start-page-frame.test.js test/unit/migration-checklist-page.test.js \
  spec/acceptance/newtab-layouts.feature test/desktop/steps/newtab-layouts.steps.js test/desktop/cucumber.mjs
git commit -m "Give the start page one in-flow frame

The header row now holds the brand and the moving-in checklist, and every
layout renders inside one centered content area, so neither the checklist
nor the fixed footer can cover content.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Quiet Patron chip, and no Patron or blocked counts in private

**Files:**
- Modify: `src/renderer/pages/newtab.js` (`renderPatronCallout`, `renderShelf`, `renderTally`)
- Modify: `src/renderer/pages/pages.css` (Patron rules; remove `--patron-surface`/`--patron-label`/`--patron-halo`)
- Modify: `tokens/tokens.json`; regenerate `tokens/generated/*`
- Modify: `test/unit/migration-checklist-page.test.js` (the test "every start-page template names the Blanc Patron upgrade as an action")
- Modify: `test/unit/start-page-frame.test.js`
- Modify: `spec/acceptance/newtab-layouts.feature`, `test/desktop/steps/newtab-layouts.steps.js`, `test/desktop/cucumber.mjs` (F35-11, F35-12)

**Interfaces:**
- Consumes: `readStartFrameGeometry()` (`patronLast`, `patronVisible`) from Task 2.
- Produces: `renderPatronCallout(patronActive)`, which hides the chip when `patronActive || isPrivate`. In private, `.shelf-card` (blocked) and `.tally-right` are `hidden`.

- [ ] **Step 1: Write the failing tests**

Append to `test/unit/start-page-frame.test.js`:

```js
test('private tabs never show the Patron chip or blocked counts', () => {
  const js = read('src/renderer/pages/newtab.js');
  assert.match(js, /function renderPatronCallout\(patronActive\) \{[\s\S]*?const hide = !!patronActive \|\| isPrivate;/);
  assert.match(js, /document\.getElementById\('shBlocked'\)\.closest\('\.shelf-card'\)\.hidden = isPrivate;/);
  assert.match(js, /document\.querySelector\('\.tally-right'\)\.hidden = isPrivate;/);
});
```

In `test/unit/migration-checklist-page.test.js`, replace everything inside `test('every start-page template names the Blanc Patron upgrade as an action', …)` after the `assert.doesNotMatch(html, />Support Blanc</);` line with:

```js
  const chip = css.match(/\.js-patron-callout a \{([\s\S]*?)\n\}/)?.[1] ?? '';
  assert.match(chip, /border: 1px solid color-mix\(in srgb, var\(--patron-gold\) 60%, transparent\);/,
    'the upgrade is an outlined chip edged in Sunrise gold');
  assert.match(chip, /border-radius: 999px;/);
  assert.match(chip, /background: transparent;/, 'the chip carries no fill');
  assert.match(chip, /color: var\(--text\);/);
  assert.match(css, /\.patron-cta-mark \{[\s\S]{0,180}?width: 16px;[\s\S]{0,180}?height: 16px;/);
  assert.match(css, /\.patron-cta-arrow \{[\s\S]{0,100}?color: var\(--patron-gold\);/);
  const hover = css.match(/\.js-patron-callout a:hover \{([\s\S]*?)\}/)?.[1] ?? '';
  assert.match(hover, /border-color: var\(--patron-gold\);/);
  assert.doesNotMatch(hover, /transform|padding|font-size|min-height|border-width/,
    'hover cannot resize or move the chip');
  assert.match(css, /--patron-gold: #d4ad66;/i);
  assert.equal(tokens.tokens.find((entry) => entry.name === 'patron-gold')?.consumers?.[0], 'pages');
  for (const name of ['patron-surface', 'patron-label', 'patron-halo']) {
    assert.equal(tokens.tokens.find((entry) => entry.name === name), undefined, `${name} is retired`);
    assert.doesNotMatch(css, new RegExp(`--${name}`), `${name} has no CSS use left`);
  }
```

Append to `spec/acceptance/newtab-layouts.feature`:

```gherkin
  @F35-11 @desktop
  Scenario: The Patron upgrade sits in the same slot on every layout
    Given a profile that completed first run
    When I open a new tab
    Then every start-page layout ends with a visible Patron upgrade

  @F35-12 @desktop
  Scenario: Private start pages never offer Patron or blocked counts
    Given a private start page is open
    Then no start-page layout shows the Patron upgrade or a blocked count
```

Append to `test/desktop/steps/newtab-layouts.steps.js`:

```js
Then('every start-page layout ends with a visible Patron upgrade', async function () {
  for (const layout of ['ledger', 'billboard', 'shelf', 'tally']) {
    assert.equal(await this.call('setNewtabLayout', layout), layout);
    const frame = await waitForValue(
      () => this.call('readStartFrameGeometry'),
      (value) => value?.layout === layout,
      `${layout} frame`,
    );
    assert.equal(frame.patronLast, true, `${layout} ends with the Patron chip`);
    assert.equal(frame.patronVisible, true, `${layout} shows the Patron chip`);
  }
});

Then('no start-page layout shows the Patron upgrade or a blocked count', async function () {
  for (const layout of ['ledger', 'billboard', 'shelf', 'tally']) {
    assert.equal(await this.call('setNewtabLayout', layout), layout);
    const frame = await waitForValue(
      () => this.call('readStartFrameGeometry'),
      (value) => value?.layout === layout && value.private === true,
      `private ${layout} frame`,
    );
    assert.equal(frame.patronVisible, false, `private ${layout} hides Patron`);
    const selectors = frame.content.map((entry) => String(entry.selector));
    assert.ok(!selectors.some((s) => /tally-chart|tally-caption/.test(s)), `private ${layout} hides the Tally data column`);
    if (layout === 'shelf') {
      assert.equal(await this.call('readStartBlockedCard'), false, 'private Shelf hides its blocked card');
    }
  }
});
```

Add this hook to `src/main/test-hook.js`, next to `readStartFrameGeometry`:

```js
    readStartBlockedCard() {
      const tab = tabs.get(getActiveTabId());
      const wc = tab && urlOf(tab).startsWith('blanc://newtab') ? liveContents(tab) : null;
      if (!wc) return null;
      return wc.executeJavaScript(`(() => {
        const card = document.getElementById('shBlocked')?.closest('.shelf-card');
        return !!card && !card.hidden && getComputedStyle(card).display !== 'none';
      })()`);
    },
```

Add `'@F35-11', '@F35-12'` to the RUNNABLE F35 line in `test/desktop/cucumber.mjs`.

- [ ] **Step 2: Run the unit tests to make sure they fail**

Run: `node --test test/unit/start-page-frame.test.js test/unit/migration-checklist-page.test.js`
Expected: FAIL on "private tabs never show…" and on "the upgrade is an outlined chip…".

- [ ] **Step 3: Implement in `newtab.js`**

Replace `renderPatronCallout`:

```js
// Quiet Patron chip — one per layout, always its layout's last item. Hidden
// for Patrons and, whatever the Patron state, in private tabs: a private
// window is never a place to sell. Driven from both the initial
// pages:start:data load and every later pages:start:status push.
function renderPatronCallout(patronActive) {
  const hide = !!patronActive || isPrivate;
  for (const el of document.querySelectorAll('.js-patron-callout')) el.hidden = hide;
}
```

In `renderShelf()`, directly after the `shBlocked` `textContent` line, add:

```js
  // Private tabs show no blocked counts on any layout.
  document.getElementById('shBlocked').closest('.shelf-card').hidden = isPrivate;
```

In `renderTally()`, directly after the `tlCount` `textContent` line, add:

```js
  // Private tabs show no blocked counts; the data column goes entirely.
  document.querySelector('.tally-right').hidden = isPrivate;
```

- [ ] **Step 4: Restyle the chip and retire the dark Patron tokens in `pages.css`**

4a. Replace the base rules from `.js-patron-callout { font-family: var(--font-ui); font-size: 11.5px; }` through `.js-patron-callout a:hover .patron-cta-arrow { transform: translateX(2px); }`, and the comment above them, with:

```css
/* Quiet Patron chip — the last item of every informational layout, hidden
   for Patrons and in private tabs. Outlined in Sunrise gold with no fill, so
   it never outweighs the layout's own content. */
.js-patron-callout { margin: 0; font-family: var(--font-ui); font-size: 12px; }
.js-patron-callout a {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 32px;
  padding: 4px 12px 4px 8px;
  border: 1px solid color-mix(in srgb, var(--patron-gold) 60%, transparent);
  border-radius: 999px;
  background: transparent;
  color: var(--text);
  font-family: var(--font-ui);
  font-weight: 600;
  text-decoration: none;
  transition: border-color 120ms ease;
}
.js-patron-callout a:hover { color: var(--text); background: transparent; border-color: var(--patron-gold); }
.js-patron-callout a:focus-visible {
  outline: 1px solid var(--text-dim);
  outline-offset: 4px;
  border-radius: 999px;
}
.patron-cta-mark {
  width: 16px;
  height: 16px;
  flex: 0 0 auto;
  object-fit: contain;
}
.patron-cta-arrow {
  color: var(--patron-gold);
  transition: transform 120ms ease;
}
.js-patron-callout a:hover .patron-cta-arrow { transform: translateX(2px); }
```

4b. In the Sunrise section, delete the rule `.js-patron-callout a { min-height: 34px; border-color: …; box-shadow: 0 8px 22px -14px var(--patron-halo); }` and its comment ("The existing compact CTA is the only Patron copy shown here.").

4c. In the `:root` light block delete `--patron-surface: #12100b;`, `--patron-label: #f7f0e5;` and `--patron-halo: rgba(128, 93, 40, 0.24);`. In the dark `:root` block and the `:root[data-theme="private"]` block, delete their `--patron-halo: …;` lines.

4d. In `tokens/tokens.json`, delete the three entries whose `name` is `patron-surface`, `patron-label` and `patron-halo`.

Run: `npm run tokens:build && npm run tokens:check`
Expected: the build rewrites `tokens/generated/*` and the check prints success. `git status` shows the generated files changed. Commit them; never hand-edit them.

Run: `grep -rn "patron-surface\|patron-label\|patron-halo" src tokens | grep -v generated`
Expected: no output.

- [ ] **Step 5: Run the unit tests**

Run: `node --test test/unit/start-page-frame.test.js test/unit/migration-checklist-page.test.js`
Expected: PASS.

- [ ] **Step 6: Run the scenarios**

Run: `npm run test:acceptance:dry 2>&1 | tail -3 && npx cucumber-js -c test/desktop/cucumber.mjs -p runnable --tags '@F35-11 or @F35-12 or @F35-9'`
Expected: PASS. If F35-11 fails because the test profile is a Patron, read `settings.isPatronActive()` in the reset path. Don't skip the scenario.

- [ ] **Step 7: Commit**

```bash
git branch --show-current
git add src/renderer/pages/newtab.js src/renderer/pages/pages.css src/main/test-hook.js tokens/ \
  test/unit/start-page-frame.test.js test/unit/migration-checklist-page.test.js \
  spec/acceptance/newtab-layouts.feature test/desktop/steps/newtab-layouts.steps.js test/desktop/cucumber.mjs
git commit -m "Make the Patron upgrade a quiet chip and keep it out of private tabs

The black pill becomes an outlined gold chip in each layout's last slot.
Private start pages no longer show Patron or any blocked count. The three
dark Patron tokens lose their last use and are retired.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Empty-favorites hint on Ledger, Shelf and Tally

**Files:**
- Modify: `src/renderer/pages/newtab.js` (`emptyFavoritesHint`, `renderLedgerFavorites`, `renderShelf`, `renderTally`)
- Modify: `src/renderer/pages/pages.css` (`.start-empty-hint`, appended to the frame block)
- Modify: `test/unit/start-page-frame.test.js`
- Modify: `spec/acceptance/newtab-layouts.feature`, `test/desktop/steps/newtab-layouts.steps.js`, `test/desktop/cucumber.mjs` (F35-13)

**Interfaces:**
- Consumes: `readStartFrameGeometry().emptyHints` from Task 2.
- Produces: `emptyFavoritesHint()` → `HTMLParagraphElement` with class `start-empty-hint` and the exact copy. Billboard never calls it (its row holds recent sites, so the copy would be untrue there).

- [ ] **Step 1: Write the failing tests**

Append to `test/unit/start-page-frame.test.js`:

```js
test('Ledger, Shelf and Tally explain an empty Favorites list; Billboard does not', () => {
  const js = read('src/renderer/pages/newtab.js');
  assert.match(js, /const EMPTY_FAVORITES_HINT = 'Favorite a page with ♥ to pin it here';/);
  for (const fn of ['renderLedgerFavorites', 'renderShelf', 'renderTally']) {
    const body = js.match(new RegExp(`function ${fn}\\([^)]*\\) \\{([\\s\\S]*?)\\n\\}`))?.[1] ?? '';
    assert.match(body, /emptyFavoritesHint\(\)/, `${fn} renders the hint`);
  }
  const billboard = js.match(/function renderBillboard\(\) \{([\s\S]*?)\n\}/)?.[1] ?? '';
  assert.doesNotMatch(billboard, /emptyFavoritesHint/);
  assert.doesNotMatch(js, /♥ a page to pin it here/);
  assert.match(frameCss(), /\.start-empty-hint \{/);
});
```

Append to `spec/acceptance/newtab-layouts.feature`:

```gherkin
  @F35-13 @desktop
  Scenario: An empty Favorites list explains how to fill it
    Given a profile with no favorites
    When I open a new tab
    Then Ledger, Shelf and Tally each show one empty Favorites hint and Billboard shows none
```

Append to `test/desktop/steps/newtab-layouts.steps.js`:

```js
Given('a profile with no favorites', async function () {
  assert.deepEqual(await this.call('bookmarkUrls'), []);
});

Then('Ledger, Shelf and Tally each show one empty Favorites hint and Billboard shows none', async function () {
  for (const [layout, expected] of [['ledger', 1], ['shelf', 1], ['tally', 1], ['billboard', 0]]) {
    assert.equal(await this.call('setNewtabLayout', layout), layout);
    const frame = await waitForValue(
      () => this.call('readStartFrameGeometry'),
      (value) => value?.layout === layout,
      `${layout} frame`,
    );
    assert.equal(frame.emptyHints, expected, `${layout} empty hints`);
  }
});
```

Add `'@F35-13'` to RUNNABLE.

- [ ] **Step 2: Run the unit test to make sure it fails**

Run: `node --test test/unit/start-page-frame.test.js`
Expected: FAIL on the `EMPTY_FAVORITES_HINT` assertion.

- [ ] **Step 3: Implement**

In `newtab.js`, directly above `function renderLedgerFavorites(items)`, add:

```js
// One empty state for every layout that draws the Favorites feed. Billboard
// draws recent sites instead, so this copy would be untrue there.
const EMPTY_FAVORITES_HINT = 'Favorite a page with ♥ to pin it here';
function emptyFavoritesHint() {
  const hint = document.createElement('p');
  hint.className = 'start-empty-hint';
  hint.textContent = EMPTY_FAVORITES_HINT;
  return hint;
}
```

In `renderLedgerFavorites`, replace the four lines that build the `ledger-empty` hint with `list.appendChild(emptyFavoritesHint());` (keep the `return;`).

In `renderShelf`, replace `grid.hidden = !state.favorites.length;` with:

```js
  grid.hidden = false;
  if (!state.favorites.length) grid.appendChild(emptyFavoritesHint());
```

In `renderTally`, replace the block from `favs.hidden = !state.favorites.length;` through `document.querySelector('.tally-label').hidden = !state.favorites.length;` (including its two-line comment) with:

```js
  favs.hidden = false;
  document.querySelector('.tally-label').hidden = false;
  if (!state.favorites.length) favs.appendChild(emptyFavoritesHint());
```

In `pages.css`, delete the old `.ledger-empty { … }` rule. Then append to the end of the frame block:

```css
.start-empty-hint {
  margin: 0;
  color: var(--text-dim);
  font: 400 12px/1.45 var(--font-ui);
  letter-spacing: 0.005em;
}
.shelf-grid > .start-empty-hint { grid-column: 1 / -1; }
```

- [ ] **Step 4: Run the tests**

Run: `node --test test/unit/start-page-frame.test.js && npm run test:acceptance:dry 2>&1 | tail -2 && npx cucumber-js -c test/desktop/cucumber.mjs -p runnable --tags '@F35-13'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add src/renderer/pages/newtab.js src/renderer/pages/pages.css test/unit/start-page-frame.test.js \
  spec/acceptance/newtab-layouts.feature test/desktop/steps/newtab-layouts.steps.js test/desktop/cucumber.mjs
git commit -m "Explain an empty Favorites list on Ledger, Shelf and Tally

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Footer with a Customize popover

**Files:**
- Modify: `src/renderer/pages/newtab.html` (footer)
- Modify: `src/renderer/pages/newtab.js` (`aria-expanded` mirroring)
- Modify: `src/renderer/pages/pages.css` (delete the old switcher rules; add the Customize rules and the footer-left visibility rule)
- Modify: `src/main/test-hook.js` (`clickNewtabLayoutSwitcher`; new `openStartCustomize`, `readStartCustomize`, `pressStartPageKey`)
- Modify: `test/unit/start-page-frame.test.js`
- Modify: `spec/acceptance/newtab-layouts.feature`, `test/desktop/steps/newtab-layouts.steps.js`, `test/desktop/cucumber.mjs` (F35-14)

**Interfaces:**
- Produces:
  - Markup: `#customizeButton.start-customize` (`popovertarget="customizePopover"`) and `#customizePopover.start-customize-popover[popover][role="dialog"]` containing `#layoutSwitcher.layout-switcher` with four `button.layout-preview[data-layout-pick]`, an `hr.customize-divider`, and the unchanged `#dynamicWallpaperToggle`.
  - Hooks:
    - `openStartCustomize()` → `boolean` (open after the call)
    - `readStartCustomize()` → `{ open, expanded, focusedId, pressed: string[] }`
    - `pressStartPageKey(keyCode: string)` → `boolean`
    - `clickNewtabLayoutSwitcher(name)` opens Customize first.

- [ ] **Step 1: Write the failing tests**

Append to `test/unit/start-page-frame.test.js`:

```js
test('the footer offers one Customize popover with four layout previews and the wallpaper switch', () => {
  const html = read('src/renderer/pages/newtab.html');
  const js = read('src/renderer/pages/newtab.js');
  assert.match(html, /<button id="customizeButton" class="start-customize" type="button" popovertarget="customizePopover" aria-expanded="false">Customize<\/button>/);
  const popover = html.match(/<div id="customizePopover" class="start-customize-popover" popover role="dialog" aria-label="Customize start page">([\s\S]*?)<\/div>\s*<\/span>/)?.[1] ?? '';
  assert.deepEqual(
    [...popover.matchAll(/data-layout-pick="(\w+)"/g)].map((m) => m[1]),
    ['ledger', 'billboard', 'shelf', 'tally'],
    'the four layouts keep their order',
  );
  assert.match(popover, /id="dynamicWallpaperToggle"/);
  assert.doesNotMatch(html, /layout-switcher-label/);
  assert.match(js, /customizePopover\.addEventListener\('toggle', \(event\) => \{\s*customizeButton\.setAttribute\('aria-expanded', String\(event\.newState === 'open'\)\);/);
  const css = frameCss();
  assert.match(css, /\.start-customize-popover \{[^}]*position-anchor: --start-customize;[^}]*position-area: top center;/s);
  assert.match(css, /:root:not\(\[data-theme="private"\]\) body:not\(\[data-layout="ledger"\]\) #footerLeft \{ display: none; \}/,
    'only Ledger repeats the blocked count in the footer');
});
```

Append to `spec/acceptance/newtab-layouts.feature`:

```gherkin
  @F35-14 @desktop
  Scenario: Customize chooses the layout and closes with Escape
    Given a new tab is open
    When I open Customize on the start page
    And I choose the "tally" start page layout from its footer
    Then the start page renders the "tally" layout
    And the saved start page layout is "tally"
    And Customize stays open with "tally" pressed
    When I press Escape on the start page
    Then Customize is closed and its button has focus
```

Append to `test/desktop/steps/newtab-layouts.steps.js`:

```js
When('I open Customize on the start page', async function () {
  assert.equal(await this.call('openStartCustomize'), true);
});

Then('Customize stays open with {string} pressed', async function (layout) {
  const state = await waitForValue(
    () => this.call('readStartCustomize'),
    (value) => value?.open === true && value.pressed.length === 1,
    'Customize open with one pressed layout',
  );
  assert.deepEqual(state.pressed, [layout]);
  assert.equal(state.expanded, 'true');
});

When('I press Escape on the start page', async function () {
  assert.equal(await this.call('pressStartPageKey', 'Escape'), true);
});

Then('Customize is closed and its button has focus', async function () {
  const state = await waitForValue(
    () => this.call('readStartCustomize'),
    (value) => value?.open === false,
    'Customize to close',
  );
  assert.equal(state.expanded, 'false');
  assert.equal(state.focusedId, 'customizeButton');
});
```

Add `'@F35-14'` to RUNNABLE.

- [ ] **Step 2: Run the unit test to make sure it fails**

Run: `node --test test/unit/start-page-frame.test.js`
Expected: FAIL on the `customizeButton` markup assertion.

- [ ] **Step 3: Replace the footer's appearance cell in `newtab.html`**

Replace the whole `<span class="footer-appearance"> … </span>` with:

```html
    <span class="footer-appearance">
      <button id="customizeButton" class="start-customize" type="button" popovertarget="customizePopover" aria-expanded="false">Customize</button>
      <div id="customizePopover" class="start-customize-popover" popover role="dialog" aria-label="Customize start page">
        <div id="customizeLayoutLabel" class="customize-label">Layout</div>
        <div id="layoutSwitcher" class="layout-switcher" role="group" aria-labelledby="customizeLayoutLabel">
          <button type="button" class="layout-preview" data-layout-pick="ledger" aria-pressed="false">
            <span class="layout-thumb" data-thumb="ledger" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
            <span class="layout-name">Ledger</span>
          </button>
          <button type="button" class="layout-preview" data-layout-pick="billboard" aria-pressed="false">
            <span class="layout-thumb" data-thumb="billboard" aria-hidden="true"><i></i><i></i><i></i></span>
            <span class="layout-name">Billboard</span>
          </button>
          <button type="button" class="layout-preview" data-layout-pick="shelf" aria-pressed="false">
            <span class="layout-thumb" data-thumb="shelf" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></span>
            <span class="layout-name">Shelf</span>
          </button>
          <button type="button" class="layout-preview" data-layout-pick="tally" aria-pressed="false">
            <span class="layout-thumb" data-thumb="tally" aria-hidden="true"><i></i><i></i><i></i></span>
            <span class="layout-name">Tally</span>
          </button>
        </div>
        <hr class="customize-divider" />
        <button id="dynamicWallpaperToggle" class="wallpaper-toggle" type="button" aria-label="Time-of-day wallpaper" aria-pressed="false" title="Time-of-day wallpaper" disabled>
          <span class="wallpaper-toggle-track" aria-hidden="true"></span>
          <span>Dynamic wallpaper</span>
        </button>
      </div>
    </span>
```

Also in the footer, change `>mahjong</a>` to `>Mahjong</a>`.

- [ ] **Step 4: Mirror the popover state in `newtab.js`**

Directly after the `for (const button of document.querySelectorAll('[data-layout-pick]')) { … }` click-wiring loop, add:

```js
// Customize: the native popover owns opening, Escape, click-outside and
// focus return. This only mirrors its state onto the opener. Picking a layout
// leaves it open so layouts can be compared.
const customizeButton = document.getElementById('customizeButton');
const customizePopover = document.getElementById('customizePopover');
customizePopover.addEventListener('toggle', (event) => {
  customizeButton.setAttribute('aria-expanded', String(event.newState === 'open'));
});
```

- [ ] **Step 5: Replace the switcher CSS**

Delete these rules: base `.layout-switcher { … }`, `.layout-switcher button { … }`, `.layout-switcher button:hover`, `.layout-switcher button.active`; Sunrise `.layout-switcher { … }`, `.layout-switcher-label { … }`, `.layout-switcher button { … }`, `.layout-switcher button:hover …`, `.layout-switcher button.active, .layout-switcher button[aria-pressed="true"] { … }`. In the Sunrise `.wallpaper-toggle { … }` rule, delete `border-left: 1px solid var(--border);` and change `padding: 2px 0 2px 14px;` to `padding: 2px 0;`. In `.footer-appearance { … }` keep `display: inline-flex; align-items: center; justify-content: center;` and delete `gap: 14px;`.

Append to the end of the frame block:

```css
/* Footer: the blocked count repeats here only on Ledger; the other layouts
   already show it. Private tabs keep their explanation on every layout. */
:root:not([data-theme="private"]) body:not([data-layout="ledger"]) #footerLeft { display: none; }

.start-customize {
  min-height: 28px;
  padding: 4px 12px;
  border: 1px solid color-mix(in srgb, var(--border) 82%, transparent);
  border-radius: 999px;
  background: transparent;
  color: var(--text-dim);
  font: inherit;
  cursor: pointer;
  anchor-name: --start-customize;
}
.start-customize:hover,
.start-customize[aria-expanded="true"] { color: var(--text); border-color: var(--border); background: transparent; }
.start-customize:focus-visible { outline: 1px solid var(--text-dim); outline-offset: 3px; }

/* Level-2 material: near-opaque, because it floats over the translucent footer. */
.start-customize-popover {
  position: fixed;
  position-anchor: --start-customize;
  position-area: top center;
  inset: auto;
  margin: 0 0 10px;
  width: max-content;
  max-width: calc(100vw - 32px);
  padding: 14px 14px 12px;
  border: 1px solid color-mix(in srgb, var(--border) 74%, transparent);
  border-radius: 14px;
  background: var(--start-float-fill);
  backdrop-filter: blur(20px) saturate(140%);
  box-shadow: var(--start-shadow-float);
  color: var(--text);
  font-family: var(--font-ui);
}
.customize-label {
  margin: 0 0 8px;
  color: var(--text-dim);
  font: 600 12px/1.3 var(--font-ui);
  letter-spacing: 0.005em;
}
.layout-switcher { display: flex; gap: 6px; }
.layout-preview {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  min-width: 0;
  padding: 6px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--text-dim);
  font: 500 11px/1.3 var(--font-ui);
  letter-spacing: 0.005em;
  cursor: pointer;
}
.layout-preview:hover { background: color-mix(in srgb, var(--text) 6%, transparent); color: var(--text); border: 0; }
.layout-preview:focus-visible { outline: 1px solid var(--text-dim); outline-offset: 2px; }
.layout-preview[aria-pressed="true"] { color: var(--text); }
.layout-preview[aria-pressed="true"] .layout-thumb { outline: 2px solid var(--accent); outline-offset: 1px; }
.layout-thumb {
  display: grid;
  width: 64px;
  height: 40px;
  padding: 5px;
  gap: 3px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface-raised);
}
.layout-thumb i { display: block; min-width: 0; min-height: 0; border-radius: 2px; background: color-mix(in srgb, var(--text-dim) 38%, transparent); }
/* Ledger: a heading line over two columns. */
.layout-thumb[data-thumb="ledger"] { grid-template-columns: 1fr 1fr; grid-template-rows: 4px 1fr 1fr; }
.layout-thumb[data-thumb="ledger"] i:nth-child(1) { grid-column: 1; }
.layout-thumb[data-thumb="ledger"] i:nth-child(2) { grid-column: 1; grid-row: 2 / 4; }
.layout-thumb[data-thumb="ledger"] i:nth-child(3) { grid-column: 2; grid-row: 2; }
.layout-thumb[data-thumb="ledger"] i:nth-child(4) { grid-column: 2; grid-row: 3; }
/* Billboard: a clock over a row of sites and a chip. */
.layout-thumb[data-thumb="billboard"] { grid-template-rows: 1fr 4px 4px; justify-items: center; }
.layout-thumb[data-thumb="billboard"] i:nth-child(1) { width: 26px; }
.layout-thumb[data-thumb="billboard"] i:nth-child(2) { width: 38px; }
.layout-thumb[data-thumb="billboard"] i:nth-child(3) { width: 18px; }
/* Shelf: a grid of cards. */
.layout-thumb[data-thumb="shelf"] { grid-template-columns: repeat(3, 1fr); grid-template-rows: 1fr 1fr; }
/* Tally: a list beside a chart. */
.layout-thumb[data-thumb="tally"] { grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; }
.layout-thumb[data-thumb="tally"] i:nth-child(1) { grid-column: 1; grid-row: 1; }
.layout-thumb[data-thumb="tally"] i:nth-child(2) { grid-column: 1; grid-row: 2; }
.layout-thumb[data-thumb="tally"] i:nth-child(3) { grid-column: 2; grid-row: 1 / 3; }
.customize-divider {
  height: 1px;
  margin: 12px 0 8px;
  border: 0;
  background: color-mix(in srgb, var(--border) 80%, transparent);
}
```

- [ ] **Step 6: Update the test hooks**

In `src/main/test-hook.js`, replace the body of `clickNewtabLayoutSwitcher(name)`'s `executeJavaScript` template with:

```js
      return tab.view.webContents.executeJavaScript(`(() => {
        const popover = document.getElementById('customizePopover');
        const opener = document.getElementById('customizeButton');
        if (!popover || !opener) return false;
        if (!popover.matches(':popover-open')) { opener.focus(); opener.click(); }
        if (!popover.matches(':popover-open')) return false;
        const button = popover.querySelector('[data-layout-pick="${String(name).replace(/[^a-z]/g, '')}"]');
        if (!button) return false;
        button.click();
        return true;
      })()`);
```

Add after it:

```js
    openStartCustomize() {
      const tab = tabs.get(getActiveTabId());
      const wc = tab && urlOf(tab).startsWith('blanc://newtab') ? liveContents(tab) : null;
      if (!wc) return false;
      return wc.executeJavaScript(`(() => {
        const popover = document.getElementById('customizePopover');
        const opener = document.getElementById('customizeButton');
        if (!popover || !opener) return false;
        if (!popover.matches(':popover-open')) { opener.focus(); opener.click(); }
        return popover.matches(':popover-open');
      })()`);
    },
    readStartCustomize() {
      const tab = tabs.get(getActiveTabId());
      const wc = tab && urlOf(tab).startsWith('blanc://newtab') ? liveContents(tab) : null;
      if (!wc) return null;
      return wc.executeJavaScript(`(() => ({
        open: document.getElementById('customizePopover')?.matches(':popover-open') ?? false,
        expanded: document.getElementById('customizeButton')?.getAttribute('aria-expanded') ?? null,
        focusedId: document.activeElement?.id ?? null,
        pressed: [...document.querySelectorAll('[data-layout-pick][aria-pressed="true"]')].map((b) => b.dataset.layoutPick),
      }))()`);
    },
    pressStartPageKey(keyCode) {
      const tab = tabs.get(getActiveTabId());
      const wc = tab && urlOf(tab).startsWith('blanc://newtab') ? liveContents(tab) : null;
      if (!wc) return false;
      wc.focus();
      wc.sendInputEvent({ type: 'keyDown', keyCode: String(keyCode) });
      wc.sendInputEvent({ type: 'keyUp', keyCode: String(keyCode) });
      return true;
    },
```

In `readStartPageFontUsage`, the sample selector `'.layout-switcher button'` still matches the preview buttons; leave it.

- [ ] **Step 7: Run the tests**

Run: `node --test test/unit/start-page-frame.test.js test/unit/newtab-layout-settings.test.js`
Expected: PASS. `newtab-layout-settings` still counts 4 `data-layout-pick` buttons.

Run: `npm run test:acceptance:dry 2>&1 | tail -2 && npx cucumber-js -c test/desktop/cucumber.mjs -p runnable --tags '@F35'`
Expected: all F35 scenarios pass, including F35-2 (choosing from the footer now goes through Customize), F35-4, F35-7 and F35-14.

If F35-14's Escape never reaches the page, check whether `main.js`'s tab `before-input-event` swallows Escape on `blanc://newtab`. Fix it there only if Escape is being consumed for no product reason; otherwise report back before changing main-process input handling.

- [ ] **Step 8: Look at it in the real app**

Relaunch `npm start`. Click Customize: the popover should sit centered above the button, inside the window. Pick each layout and confirm the popover stays open while the page changes behind it. Press Escape, then click outside, and confirm both close it. Check that it's legible in dark mode (Settings → Appearance).

- [ ] **Step 9: Commit**

```bash
git branch --show-current
git add src/renderer/pages/newtab.html src/renderer/pages/newtab.js src/renderer/pages/pages.css src/main/test-hook.js \
  test/unit/start-page-frame.test.js spec/acceptance/newtab-layouts.feature test/desktop/steps/newtab-layouts.steps.js test/desktop/cucumber.mjs
git commit -m "Move the layout picker and wallpaper switch into a Customize popover

The footer now holds the blocked count (Ledger only), the version,
Customize, Mahjong and the ⌘L hint. Customize opens a native popover with
small layout previews; picking one applies instantly and keeps it open.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Typography roles and sentence-case copy

**Files:**
- Modify: `src/renderer/pages/newtab.html` (label copy)
- Modify: `src/renderer/pages/newtab.js` (date casing, private date)
- Modify: `src/renderer/pages/pages.css` (type rules)
- Modify: `test/unit/start-page-fonts.test.js`, `test/unit/start-page-frame.test.js`

**Interfaces:**
- Produces: the type roles in the spec's table, applied through the selectors below. Task 9 adds `.ledger-where`.

- [ ] **Step 1: Write the failing tests**

Append to `test/unit/start-page-frame.test.js`:

```js
test('labels are sentence case without tracking, and the date keeps locale case', () => {
  const html = read('src/renderer/pages/newtab.html');
  const js = read('src/renderer/pages/newtab.js');
  for (const label of ['Favorites', 'Pick up where you left off', 'On your other devices', 'Blocked this week', 'Blocked']) {
    assert.match(html, new RegExp(`>${label}<`), `label "${label}"`);
  }
  assert.doesNotMatch(html, />(favorites|pick up where you left off|on your other devices|blocked this week|blocked)</);
  assert.match(js, /const dateText = isPrivate\s*\? 'Private tab'/);
  assert.doesNotMatch(js.match(/const dateText[\s\S]*?;\n/)[0], /toLowerCase/);
  const css = frameCss();
  assert.match(css, /\.ledger-label,\s*\.shelf-label \{[^}]*font: 600 12px\/1\.3 var\(--font-ui\);[^}]*letter-spacing: 0\.005em;[^}]*text-transform: none;/s);
  assert.match(css, /\.start-brand-date \{[^}]*font: 500 12px\/1\.3 var\(--font-ui\);[^}]*letter-spacing: 0;[^}]*text-transform: none;/s);
  assert.match(css, /\.shelf-count,\s*\.tally-count \{[^}]*letter-spacing: -0\.02em;[^}]*font-variant-numeric: tabular-nums;/s);
});
```

In `test/unit/start-page-fonts.test.js`, in the Newsreader test, change the `.bb-clock` assertion to also require optical sizing:

```js
  assert.match(pages, /\.bb-clock\s*\{[^}]*font-family:\s*var\(--font-display\)[^}]*font-size:\s*clamp\(80px, 12vw, 148px\)[^}]*font-weight:\s*650[^}]*font-optical-sizing:\s*auto/s);
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `node --test test/unit/start-page-frame.test.js test/unit/start-page-fonts.test.js`
Expected: FAIL on the label copy and on the `.bb-clock` optical sizing.

- [ ] **Step 3: Copy changes**

In `newtab.html`, change the label text (and only the text):
- `>favorites</a>` → `>Favorites</a>` (Ledger)
- `>pick up where you left off<` → `>Pick up where you left off<` (Ledger, Shelf, Tally)
- `>on your other devices<` → `>On your other devices<`
- Tally `>favorites<` → `>Favorites<`
- Shelf `>blocked<` → `>Blocked<`
- Tally `>blocked this week<` → `>Blocked this week<`

In `newtab.js`, replace the `dateText` declaration with:

```js
const dateText = isPrivate
  ? 'Private tab'
  : new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
```

- [ ] **Step 4: Type rules**

In the Sunrise section:
- Delete the rule `.ledger-label, .shelf-label { color: …; font-family: …; font-size: 10.5px; font-weight: 600; letter-spacing: 0.11em; text-transform: uppercase; }`.
- Delete `.start-brand-date { font: 500 11px/1.2 …; letter-spacing: 0.08em; text-transform: lowercase; }`.
- In `.bb-clock { … }`, add `font-optical-sizing: auto;` as the last declaration.
- In the footer rule (`.ledger-footer, body:not([data-layout="ledger"]) .ledger-footer { … }`), change `font-size: 10.5px;` to `font-size: 11px;` and add `line-height: 1.4; letter-spacing: 0.005em;`.

Append to the frame block:

```css
/* Type roles (spec table). Inter has no optical-size axis here, so its
   tracking is set per size; Newsreader roles opt in to optical sizing. */
.ledger-label,
.shelf-label {
  color: var(--text-dim);
  font: 600 12px/1.3 var(--font-ui);
  letter-spacing: 0.005em;
  text-transform: none;
}
.start-brand-date {
  font: 500 12px/1.3 var(--font-ui);
  letter-spacing: 0;
  text-transform: none;
}
.fav .name { font-size: 14px; line-height: 1.45; font-weight: 450; letter-spacing: 0; }
.fav .host,
.group-row .gcount,
.shelf-tile .host,
.shelf-unit,
.bb-blocked,
.tally-caption {
  font-size: 12px;
  line-height: 1.45;
  letter-spacing: 0.005em;
  font-variant-numeric: tabular-nums;
}
.shelf-count,
.tally-count {
  font-weight: 650;
  line-height: 1;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
}
.shelf-count { font-size: 32px; }
```

- [ ] **Step 5: Run the tests**

Run: `node --test test/unit/start-page-frame.test.js test/unit/start-page-fonts.test.js`
Expected: PASS.

Run: `npx cucumber-js -c test/desktop/cucumber.mjs -p runnable --tags '@F35-6 or @F35-10'`
Expected: PASS. F35-6's size audit catches any label that now clips at narrow widths.

- [ ] **Step 6: Commit**

```bash
git branch --show-current
git add src/renderer/pages/newtab.html src/renderer/pages/newtab.js src/renderer/pages/pages.css \
  test/unit/start-page-frame.test.js test/unit/start-page-fonts.test.js
git commit -m "Set start page type by role and drop uppercase tracked labels

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Surfaces, footer edge, accessibility fallbacks, corners and shadows

**Files:**
- Modify: `src/renderer/pages/newtab.js` (underflow observer)
- Modify: `src/renderer/pages/pages.css`
- Modify: `test/unit/start-page-frame.test.js`

**Interfaces:**
- Consumes: the `--start-*` properties (Task 2) and `#startContentEnd` (Task 2).
- Produces: `body.has-underflow` while content extends under the footer.

- [ ] **Step 1: Write the failing test**

Append to `test/unit/start-page-frame.test.js`:

```js
test('surfaces follow one weight ladder with accessibility fallbacks', () => {
  const css = frameCss();
  const all = read('src/renderer/pages/pages.css');
  const js = read('src/renderer/pages/newtab.js');
  assert.match(css, /\.shelf-tile,\s*\.shelf-card \{[^}]*background: var\(--start-card-fill\);[^}]*box-shadow: var\(--start-shadow-card\), var\(--start-card-highlight\);[^}]*backdrop-filter: blur\(12px\) saturate\(140%\);/s);
  assert.match(css, /\.group-chip \{[^}]*background: transparent;[^}]*backdrop-filter: none;/s);
  assert.match(css, /\.ledger-footer,\s*body:not\(\[data-layout="ledger"\]\) \.ledger-footer \{ border-top: 0; \}/);
  assert.match(css, /\.ledger-footer::before \{[^}]*height: 24px;[^}]*opacity: 0;/s);
  assert.match(css, /body\.has-underflow \.ledger-footer::before \{ opacity: 1; \}/);
  assert.match(js, /new IntersectionObserver\(/);
  assert.match(css, /@media \(prefers-reduced-transparency: reduce\) \{[\s\S]*?backdrop-filter: none;/);
  assert.match(css, /@media \(prefers-contrast: more\) \{[\s\S]*?border-color: var\(--text-dim\);/);
  assert.match(css, /@media \(prefers-color-scheme: dark\) \{\s*\.bb-clock \{ text-shadow: none; \}/);
  assert.match(css, /:root\[data-theme="private"\] \.bb-clock \{ text-shadow: none; \}/);
  assert.match(css, /\.fav \.tile,\s*\.shelf-tile \.tile,\s*\.bb-fav \.tile \{[^}]*border-radius: 6px;[^}]*box-shadow: var\(--start-shadow-icon\);/s);
  assert.doesNotMatch(all, /\.bb-site-dismiss \{[^}]*box-shadow: 0 2px 8px/s, 'the dismiss button uses the icon shadow');
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `node --test test/unit/start-page-frame.test.js`
Expected: FAIL on the `.shelf-tile, .shelf-card` assertion.

- [ ] **Step 3: Remove the superseded surface declarations**

In the Sunrise section:
- From `.fav .tile, .shelf-tile .tile, .bb-fav .tile { … }`, delete the `box-shadow` line.
- From `.shelf-tile, .shelf-card { … }`, delete `background`, `box-shadow` and `backdrop-filter`.
- From the footer rule, delete `border-top: …;`.

In the base billboard section, in `.bb-site-dismiss { … }`, change `box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);` to `box-shadow: var(--start-shadow-icon);`. In the base `.fav .tile { … }`, change `border-radius: 5px;` to `border-radius: 6px;`.

- [ ] **Step 4: Add the surface rules**

Append to the frame block:

```css
/* Surface weight ladder. Level 0 sits on the landscape with no fill; level 1
   cards are translucent; level 2 floats (the popover and the compact
   checklist, defined above) and is near-opaque. */
.fav .tile,
.shelf-tile .tile,
.bb-fav .tile {
  border-radius: 6px;
  box-shadow: var(--start-shadow-icon);
}
.shelf-tile,
.shelf-card {
  border-radius: 10px;
  background: var(--start-card-fill);
  box-shadow: var(--start-shadow-card), var(--start-card-highlight);
  backdrop-filter: blur(12px) saturate(140%);
}
.group-chip {
  border-color: color-mix(in srgb, var(--border) 80%, transparent);
  border-radius: 999px;
  background: transparent;
  backdrop-filter: none;
}

/* Footer: no hard line. A soft fade appears only while content actually
   runs underneath (body.has-underflow, set by newtab.js). */
.ledger-footer,
body:not([data-layout="ledger"]) .ledger-footer { border-top: 0; }
.ledger-footer::before {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  bottom: 100%;
  height: 24px;
  background: linear-gradient(to bottom, transparent, var(--start-footer));
  opacity: 0;
  pointer-events: none;
  transition: opacity 160ms var(--start-ease);
}
body.has-underflow .ledger-footer::before { opacity: 1; }

/* The clock's glow helps it over the light landscape; in dark and private it
   reads as a halo. */
@media (prefers-color-scheme: dark) {
  .bb-clock { text-shadow: none; }
}
:root[data-theme="private"] .bb-clock { text-shadow: none; }

@media (prefers-reduced-transparency: reduce) {
  .ledger-body,
  :root[data-theme="private"] .ledger-body {
    --start-card-fill: var(--onboarding-surface);
    --start-float-fill: var(--onboarding-surface);
    --start-footer: var(--onboarding-surface);
  }
  .shelf-tile,
  .shelf-card,
  .start-customize-popover,
  .migration-checklist,
  .ledger-footer,
  body:not([data-layout="ledger"]) .ledger-footer { backdrop-filter: none; }
}
@media (prefers-contrast: more) {
  .ledger-body,
  :root[data-theme="private"] .ledger-body {
    --start-card-fill: var(--onboarding-surface);
    --start-float-fill: var(--onboarding-surface);
    --start-footer: var(--onboarding-surface);
  }
  .shelf-tile,
  .shelf-card,
  .start-customize-popover,
  .migration-checklist,
  .ledger-footer,
  body:not([data-layout="ledger"]) .ledger-footer { backdrop-filter: none; }
  .shelf-tile,
  .shelf-card,
  .group-chip,
  .start-customize,
  .start-customize-popover,
  .layout-thumb,
  .js-patron-callout a { border-color: var(--text-dim); }
}
```

`--start-footer` is set by the dark `@media` block and the private block earlier in the file. These overrides come later and repeat the private selector, so they win in all three themes.

- [ ] **Step 5: Add the underflow observer in `newtab.js`**

Append just before the `// The pill's caret says keystrokes land somewhere.` comment:

```js
// Footer edge: the fixed footer shows a soft fade only while content runs
// underneath it. The sentinel ends the content area; "under" means it sits
// below the band the footer leaves visible.
const startContentEnd = document.getElementById('startContentEnd');
const layoutFooter = document.getElementById('layoutFooter');
let underflowObserver = null;
function observeUnderflow() {
  underflowObserver?.disconnect();
  underflowObserver = new IntersectionObserver(([entry]) => {
    const under = !entry.isIntersecting && entry.boundingClientRect.top >= entry.rootBounds.bottom;
    document.body.classList.toggle('has-underflow', under);
  }, { rootMargin: `0px 0px -${layoutFooter.offsetHeight}px 0px` });
  underflowObserver.observe(startContentEnd);
}
observeUnderflow();
new ResizeObserver(observeUnderflow).observe(layoutFooter);
```

- [ ] **Step 6: Run the tests**

Run: `node --test test/unit/start-page-frame.test.js && npm run tokens:check && npm run lint`
Expected: PASS. The `.ledger-body` custom properties aren't `:root` tokens, so `tokens:check` ignores them.

- [ ] **Step 7: Look at it in the real app**

Relaunch `npm start`. On Ledger with a short page, there should be no line above the footer. Make the window short (about 500px tall) so content runs under the footer: the fade should appear, and disappear when scrolled to the end. Check Shelf cards in light and dark.

- [ ] **Step 8: Commit**

```bash
git branch --show-current
git add src/renderer/pages/newtab.js src/renderer/pages/pages.css test/unit/start-page-frame.test.js
git commit -m "Give start page surfaces one weight ladder and a soft footer edge

Cards, chips and floating surfaces now use one shared set of fills, corner
radii and shadows. Reduced-transparency and increased-contrast settings
get solid surfaces, and the clock drops its glow in dark and private.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Motion

**Files:**
- Modify: `src/renderer/pages/newtab.js` (`layout-ready`)
- Modify: `src/renderer/pages/pages.css`
- Modify: `test/unit/start-page-frame.test.js`

**Interfaces:**
- Consumes: `--start-ease`; `.start-customize-popover`; `.migration-checklist` (compact); `.start-content > main`.
- Produces: `body.layout-ready`, set once after the first `applyLayout` paint.

- [ ] **Step 1: Write the failing test**

Append to `test/unit/start-page-frame.test.js`:

```js
test('motion grows surfaces from their source and respects reduced motion', () => {
  const css = frameCss();
  const js = read('src/renderer/pages/newtab.js');
  assert.match(css, /\.start-customize-popover \{[^}]*transform-origin: bottom center;[^}]*transition:[^;]*opacity 150ms var\(--start-ease\)/s);
  assert.match(css, /\.start-customize-popover:popover-open \{[^}]*transition-duration: 200ms;/s);
  assert.match(css, /@starting-style \{\s*\.start-customize-popover:popover-open \{[^}]*scale\(0\.96\)/);
  assert.match(css, /body\.layout-ready \.start-content > main \{[^}]*transition: opacity 160ms var\(--start-ease\);/s);
  assert.match(css, /@starting-style \{\s*body\.layout-ready \.start-content > main \{ opacity: 0; \}/);
  assert.match(css, /:active \{[^}]*transform: scale\(0\.98\);/s);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\.start-customize-popover,[\s\S]*?transform: none;/);
  assert.match(js, /requestAnimationFrame\(\(\) => document\.body\.classList\.add\('layout-ready'\)\)/);
  assert.doesNotMatch(css, /cubic-bezier\([^)]*1\.[0-9]/, 'no overshooting curves');
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `node --test test/unit/start-page-frame.test.js`
Expected: FAIL on the popover `transform-origin` assertion.

- [ ] **Step 3: Implement the CSS**

In the Sunrise section, change `.shelf-tile:hover { border-color: var(--accent); transform: translateY(-1px); }` so it keeps only `border-color: var(--accent);`. Its lift moves below with a transition.

Append to the frame block:

```css
/* Motion: settle without overshoot, grow from the source, leave the frame
   still. CSS transitions reverse from the current value when toggled
   mid-flight, which is all the interruptibility this page needs. */
.start-customize-popover {
  opacity: 0;
  transform: translateY(4px) scale(0.96);
  transform-origin: bottom center;
  transition:
    opacity 150ms var(--start-ease),
    transform 150ms var(--start-ease),
    overlay 150ms allow-discrete,
    display 150ms allow-discrete;
}
.start-customize-popover:popover-open {
  opacity: 1;
  transform: none;
  transition-duration: 200ms;
}
@starting-style {
  .start-customize-popover:popover-open { opacity: 0; transform: translateY(4px) scale(0.96); }
}
@media (max-width: 960px), (max-height: 640px) {
  .migration-checklist {
    transform-origin: top right;
    transition: opacity 200ms var(--start-ease), transform 200ms var(--start-ease), display 200ms allow-discrete;
  }
  @starting-style {
    .migration-checklist-shell.is-expanded .migration-checklist { opacity: 0; transform: translateY(-4px) scale(0.96); }
  }
}

/* A layout change fades in only the new content; never on first paint. */
body.layout-ready .start-content > main { transition: opacity 160ms var(--start-ease); }
@starting-style {
  body.layout-ready .start-content > main { opacity: 0; }
}

/* Press feedback lands on pointer-down; release eases back. */
.fav,
.bb-fav,
.shelf-tile,
.group-chip,
.layout-preview,
.start-customize,
.js-patron-callout a { transition: transform 120ms var(--start-ease), border-color 120ms ease; }
.shelf-tile:hover { transform: translateY(-1px); }
.fav:active,
.bb-fav:active,
.shelf-tile:active,
.group-chip:active,
.layout-preview:active,
.start-customize:active,
.js-patron-callout a:active { transform: scale(0.98); transition-duration: 0ms; }

@media (prefers-reduced-motion: reduce) {
  .start-customize-popover,
  .start-customize-popover:popover-open,
  .migration-checklist {
    transform: none;
    transition: opacity 120ms linear, overlay 120ms allow-discrete, display 120ms allow-discrete;
  }
  body.layout-ready .start-content > main { transition: none; }
  .shelf-tile:hover,
  .fav:active,
  .bb-fav:active,
  .shelf-tile:active,
  .group-chip:active,
  .layout-preview:active,
  .start-customize:active,
  .js-patron-callout a:active { transform: none; }
  .ledger-footer::before { transition: none; }
}
@media (prefers-reduced-motion: reduce) {
  @starting-style {
    .start-customize-popover:popover-open { transform: none; }
  }
}
```

- [ ] **Step 4: Set `layout-ready` after the first paint**

In `newtab.js`, replace:

```js
Promise.all([favoritesReady, dataReady]).then(() => applyLayout(state.layout));
```

with:

```js
Promise.all([favoritesReady, dataReady]).then(() => {
  applyLayout(state.layout);
  // Layout changes fade in from now on; the first paint never does.
  requestAnimationFrame(() => document.body.classList.add('layout-ready'));
});
```

- [ ] **Step 5: Run the tests**

Run: `node --test test/unit/start-page-frame.test.js test/unit/migration-checklist-page.test.js`
Expected: PASS. The checklist reduced-motion assertion (`animation: none`) still holds.

- [ ] **Step 6: Look at it in the real app**

Relaunch `npm start`. Open Customize: it should grow out of the button, with no bounce. Click Customize twice quickly: it should reverse mid-flight without a jump. Switch layouts: only the content fades; the header and footer don't move. Open a new tab: no fade on load. Then turn on macOS System Settings → Accessibility → Display → Reduce motion, and confirm only fades remain.

- [ ] **Step 7: Commit**

```bash
git branch --show-current
git add src/renderer/pages/newtab.js src/renderer/pages/pages.css test/unit/start-page-frame.test.js
git commit -m "Grow start page popovers from their source and fade only new content

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Ledger as a centered two-column spread

**Files:**
- Modify: `src/renderer/pages/newtab.html` (`#layoutLedger`)
- Modify: `src/renderer/pages/pages.css`
- Modify: `src/main/test-hook.js` (`readStartPageFontUsage` approved selector)
- Modify: `test/desktop/steps/newtab-layouts.steps.js` (Newsreader count 8 → 9)
- Modify: `test/unit/start-page-fonts.test.js`, `test/unit/start-page-frame.test.js`

**Interfaces:**
- Consumes: the type roles (Task 6), the empty hint (Task 4), the Patron chip (Task 3).
- Produces: `.ledger-where`, `.ledger-spread`, `.ledger-col-primary`, `.ledger-col-secondary`.

- [ ] **Step 1: Write the failing tests**

In `test/unit/start-page-fonts.test.js`, delete the line `assert.doesNotMatch(newtab, /Where to\?/);` and add in its place:

```js
  assert.match(newtab, /<h2 class="ledger-where">Where to\?<\/h2>/, 'Ledger leads with one Newsreader line');
  assert.match(pages, /\.ledger-where \{[^}]*font-family: var\(--font-display\);[^}]*font-size: 32px;[^}]*font-weight: 400;[^}]*line-height: 1\.1;[^}]*letter-spacing: -0\.015em;[^}]*font-optical-sizing: auto;/s);
```

(The `<h1>` count of 6 stays: "Where to?" is an `<h2>`.)

Append to `test/unit/start-page-frame.test.js`:

```js
test('Ledger is a centered spread: Favorites left, groups and devices right', () => {
  const html = read('src/renderer/pages/newtab.html');
  const ledger = html.match(/<main class="ledger" id="layoutLedger">([\s\S]*?)<\/main>/)[1];
  assert.match(ledger, /<div class="ledger-spread">\s*<div class="ledger-col ledger-col-primary">[\s\S]*?id="favoritesList"[\s\S]*?<\/div>\s*<div class="ledger-col ledger-col-secondary">[\s\S]*?id="groupsSection"[\s\S]*?id="remoteSection"[\s\S]*?<\/div>\s*<\/div>/);
  const css = frameCss();
  assert.match(css, /body\[data-layout="ledger"\] \.ledger \{[^}]*max-width: 904px;[^}]*margin-inline: auto;/s);
  assert.match(css, /\.ledger-spread \{[^}]*grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\);[^}]*column-gap: 64px;/s);
  assert.match(css, /@media \(max-width: 900px\) \{[\s\S]*?\.ledger-spread \{ grid-template-columns: minmax\(0, 1fr\); \}/);
  assert.match(css, /\.group-row \.cluster \{[^}]*flex: 0 0 46px;/s, 'group names line up');
});
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `node --test test/unit/start-page-fonts.test.js test/unit/start-page-frame.test.js`
Expected: FAIL on the `ledger-where` and `ledger-spread` assertions.

- [ ] **Step 3: Ledger markup**

Replace everything inside `<main class="ledger" id="layoutLedger">` between `<h1 class="page-sr-only">Ledger start page</h1>` and the `<p id="patron-callout" …>` line with:

```html
    <h2 class="ledger-where">Where to?</h2>

    <div class="ledger-spread">
      <div class="ledger-col ledger-col-primary">
        <section class="ledger-section">
          <a class="ledger-label" href="blanc://bookmarks/">Favorites</a>
          <div id="favoritesList" class="ledger-list"></div>
        </section>
      </div>
      <div class="ledger-col ledger-col-secondary">
        <section id="groupsSection" class="ledger-section" hidden>
          <div class="ledger-label">Pick up where you left off</div>
          <div id="groupsList" class="ledger-list ledger-groups"></div>
        </section>

        <section id="remoteSection" class="ledger-section" hidden>
          <div class="ledger-label">On your other devices</div>
          <div id="remoteList" class="ledger-list"></div>
        </section>
      </div>
    </div>
```

- [ ] **Step 4: Ledger CSS**

Append to the frame block:

```css
/* Ledger: one Newsreader line over a centered two-column spread. With
   nothing on the right, Favorites centers alone. */
body[data-layout="ledger"] .ledger {
  width: 100%;
  max-width: 904px;
  margin-inline: auto;
  user-select: none;
}
body[data-layout="ledger"] .ledger:not(:has(.ledger-col-secondary > section:not([hidden]))) { max-width: 420px; }
.ledger-where {
  margin: 0 0 32px;
  color: var(--text);
  font-family: var(--font-display);
  font-size: 32px;
  font-weight: 400;
  line-height: 1.1;
  letter-spacing: -0.015em;
  font-optical-sizing: auto;
}
.ledger-spread {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  column-gap: 64px;
  row-gap: 34px;
  align-items: start;
}
.ledger-spread:not(:has(.ledger-col-secondary > section:not([hidden]))) { grid-template-columns: minmax(0, 1fr); }
.ledger-spread:not(:has(.ledger-col-secondary > section:not([hidden]))) .ledger-col-secondary { display: none; }
.ledger-col > .ledger-section:first-child,
.ledger-col > .ledger-section[hidden] + .ledger-section { margin-top: 0; }
.ledger-patron { margin-top: 34px; }
.group-row .cluster { flex: 0 0 46px; width: 46px; }
@media (max-width: 900px) {
  .ledger-spread { grid-template-columns: minmax(0, 1fr); }
}
```

In the Sunrise section, delete `body[data-layout="ledger"] .ledger-section:first-of-type { margin-top: 0; }` (the `.ledger-col` rules replace it).

- [ ] **Step 5: Update the font-usage hook and its step**

In `src/main/test-hook.js` `readStartPageFontUsage`, change
`const newsreaderSelector = '.bb-clock, .migration-checklist-heading h2, .ob-content h1';`
to
`const newsreaderSelector = '.bb-clock, .ledger-where, .migration-checklist-heading h2, .ob-content h1';`

In `test/desktop/steps/newtab-layouts.steps.js`, in the step "the start page uses Newsreader for the Billboard clock and invitation headings", change `assert.equal(usage.page.newsreader.length, 8);` to `assert.equal(usage.page.newsreader.length, 9);`. The approved Newsreader elements are now the clock, "Where to?", the checklist heading and the six onboarding titles.

- [ ] **Step 6: Run the tests**

Run: `node --test test/unit/start-page-fonts.test.js test/unit/start-page-frame.test.js`
Expected: PASS.

Run: `npx cucumber-js -c test/desktop/cucumber.mjs -p runnable --tags '@F35'`
Expected: all F35 scenarios pass (F35-6 typography fit at 640×480 included; F35-10 with the new Ledger).

- [ ] **Step 7: Look at it in the real app**

Relaunch `npm start`. Check Ledger with favorites and groups (two columns, centered), with no groups or devices (one centered column), and at 820px (stacked). Confirm the group names line up whether a group has 1 or 2 tabs.

- [ ] **Step 8: Commit**

```bash
git branch --show-current
git add src/renderer/pages/newtab.html src/renderer/pages/pages.css src/main/test-hook.js \
  test/desktop/steps/newtab-layouts.steps.js test/unit/start-page-fonts.test.js test/unit/start-page-frame.test.js
git commit -m "Center Ledger as a two-column spread under one Where to? line

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Docs

**Files:**
- Modify: `docs/brand-usage.md` (*Desktop Start Page Sunrise treatment*)
- Modify: `spec/features.md` (F35), `spec/parity-matrix.md` (F35 row)
- Modify: `CLAUDE.md` and `AGENTS.md` (the Start Page sentence; mirror verbatim)

**Interfaces:** none (docs only).

- [ ] **Step 1: `docs/brand-usage.md`**

Replace the second paragraph of *Desktop Start Page Sunrise treatment* (it starts "Use one straight, subtle footer divider.") with:

```markdown
All four layouts share one frame (owner decision, October 5, 2026): the
Sunrise mark and date on the left of an in-flow header row, the moving-in
checklist on its right, one centered content area, and a fixed footer. The
footer has no divider line; a soft fade appears above it only while content
runs underneath. Ledger leads with one 32px Newsreader "Where to?" line; no
other layout adds a heading. Labels are sentence case without letter-spacing.
Icon tiles use 6px corners, cards 10px, floating surfaces 14px, chips fully
rounded. The Patron upgrade is a quiet chip outlined in Sunrise gold with no
fill, always its layout's last item, never in private tabs. The four-layout
picker (same order) and the dynamic-wallpaper switch live behind the footer's
Customize button. Mahjong remains a standalone footer action and is never a
fifth layout. Visual explorations are not a source for new marketing claims or
replacement copy.
```

- [ ] **Step 2: `spec/features.md` F35**

- In the bullet starting "The choice is a synced setting", replace "from the start page's own footer switcher" with "from the start page's footer Customize popover".
- In the bullet starting "Every layout footer has a separate Mahjong link, outside the centered layout switcher", replace "outside the centered layout switcher" with "beside the Customize button".
- In the bullet starting "No layout may ever scroll horizontally", replace the sentence "Empty feeds remove their section — row, label, and card — with no placeholder copy on the three newer layouts." with "Empty feeds remove their section — row, label, and card — except Favorites: Ledger, Shelf, and Tally show "Favorite a page with ♥ to pin it here" when there are none. Billboard, which shows recent sites, shows no hint. Private start pages show no Patron upgrade and no blocked counts."
- Replace the moving-in checklist bullet's middle sentences ("It stays lower-right on ledger, shelf, and tally, and moves upper-right on Billboard to preserve the recent-site row and its dismissal actions.") with "It sits in the start page header's right corner on every layout, in normal flow, so it never covers content." Replace its final sentence ("Tight windows collapse it…") with "Tight windows collapse it to a progress-ring trigger in that same corner, opening downward."

- [ ] **Step 3: `spec/parity-matrix.md`**

In the F35 row, replace "with an in-page switcher" with "with an in-page Customize popover".

- [ ] **Step 4: `CLAUDE.md` and `AGENTS.md`**

In both files, in the `blanc://` internal pages paragraph, replace the sentence that begins `The newtab page is the **"ledger" start page**` and ends `… a footer with the weekly blocked count + ⌘L hint.` with:

```markdown
The newtab page offers four layouts (Ledger, Billboard, Shelf, Tally — `newtabLayout`) inside one shared frame: an in-flow header (Sunrise mark + date left, moving-in checklist right), one centered content area, and a fixed footer (Ledger's weekly blocked count, version, a **Customize** popover holding the layout picker and dynamic wallpaper, Mahjong, ⌘L hint). Ledger is a centered spread under one "Where to?" line: favorites left; tab groups ("Pick up where you left off" — clicking one focuses that group) and other devices right. Design: `docs/superpowers/specs/2026-10-05-start-page-layouts-polish-design.md`.
```

Run: `diff <(sed -n '/^\*\*`blanc:\/\/` internal pages\*\*/p' CLAUDE.md) <(sed -n '/^\*\*`blanc:\/\/` internal pages\*\*/p' AGENTS.md) && echo identical`
Expected: `identical`.

- [ ] **Step 5: Record the site follow-up (don't edit `site/`)**

`site/src/components/guides/sync.astro:162` and `site/src/pages/features/sync.astro:58` quote the lowercase label "on your other devices". They describe released v1.27.0, so they stay as they are until this ships. Add a line to the PR description's "After release" section: "Update the two sync pages' quoted label to 'On your other devices'."

- [ ] **Step 6: Commit**

```bash
git branch --show-current
git add docs/brand-usage.md spec/features.md spec/parity-matrix.md CLAUDE.md AGENTS.md
git commit -m "Document the shared start page frame and Customize popover

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Full verification and before/after proof

**Files:**
- Create (gitignored): `output/start-page-pr1/after/*.png`, `output/start-page-pr1/proof/*.png`

**Interfaces:**
- Consumes: the harness from Task 1.

- [ ] **Step 1: Run every gate**

Run: `npm run test:unit 2>&1 | tail -5 && npm run lint && npm run substrate:check 2>&1 | tail -3 && npm run browser-api:check && npm run test:acceptance:dry 2>&1 | tail -2`
Expected: all pass. Compare any failure against the Task 1 baseline. A failure that's new is yours to fix.

Run: `npx cucumber-js -c test/desktop/cucumber.mjs -p runnable --tags '@F35 or @F40'`
Expected: all pass. (`@F40` is the migration checklist and tab-import family that shares the start page.)

- [ ] **Step 2: Capture "after"**

Run (outside the sandbox):
`REPO="$PWD" OUT=output/start-page-pr1/after EXTRAS=1 node output/start-page-handoff-2026-10-05/capture-start.js`
Expected: 20 `wrote …` lines.

- [ ] **Step 3: Build the stacked proof crops**

```bash
mkdir -p output/start-page-pr1/proof
for f in output/start-page-pr1/before/*.png; do
  n=$(basename "$f")
  magick "$f" "output/start-page-pr1/after/$n" -background '#888' -splice 0x8 -append "output/start-page-pr1/proof/$n"
done
```

Expected: 16 stacked images (before on top, after below, at full resolution). For the four EXTRAS images there's no "before"; show them on their own.

- [ ] **Step 4: Inspect every proof image yourself**

Open each image in `proof/` and the four extras. For each, check for overlaps, clipped text, a Patron chip in private, popover placement, and legibility of the reduced-transparency and contrast captures. Fix anything wrong and re-capture before showing the owner.

- [ ] **Step 5: Show the owner before opening the PR**

Send the proof images and a numbered "where to look" list, for example:
1. Tally 1440: the checklist no longer covers the caption.
2. Private: no Patron chip, no blocked counts.
3. Ledger: centered spread under "Where to?".
4. The footer is down to five items, with Customize open (extras).
5. The Patron chip is outlined and last on every layout.
6. Labels and the date are sentence case.
7. Reduced transparency and increased contrast give solid surfaces.

Wait for explicit approval. **Do not open the PR until the owner approves the crops.** Then use `superpowers:finishing-a-development-branch`.

- [ ] **Step 6: Clean up**

After the PR is open: `rm -rf output/start-page-pr1 output/start-page-handoff-2026-10-05` in this worktree, and the same `output/start-page-handoff-2026-10-05` folder in the `blanc-non-island-surfaces-polish-c388a0` worktree.

# Non-island polish A1 — warm sheet shell, bugs, focus ring — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship PR A1 of the non-island polish: the shared Sunrise palette, warm utility sheets with a warm scrim, one sheet nav, one sheet width, the two confirmed sheet bugs, and the hairline focus ring on every `blanc://` page except Mahjong.

**Scope note:** row-list changes from spec §5.3 (icon column, reserved action column — finding 7) ship in A2 with the page-data changes they need; A1's shared components are the palette, buttons, scrim, nav and focus ring.

**Architecture:** A themed `sunrise-*` palette joins `tokens/tokens.json` (guarded in both stylesheets by `tokens:check`). `body.sheet` remaps the semantic tokens it already uses (`--bg`, `--text`, `--accent`…) to that palette, the same technique the Start Page's `.ledger-body` uses, so no component rule is duplicated. The two bug fixes are test-first: a lifted `formatAccelerator` table test and a pure `settings-nav-model.js` plus an acceptance scenario that scrolls the real sheet.

**Tech Stack:** Electron 44 renderer pages (plain JS, CSS custom properties), `node --test` unit tests, Cucumber + Playwright-Electron acceptance (`test/desktop/`), `tokens/build.mjs` substrate.

**Spec:** `docs/superpowers/specs/2026-09-26-non-island-surfaces-polish-design.md` (approved 2026-09-26). Read §4 findings 1–4 and 12, §5.1–§5.4, §7, §10 D1–D3 before starting.

## Global Constraints

- Start after PR #433 is merged; branch `claude/non-island-polish-a1` off current `origin/main`. Run `npm ci` in a fresh worktree first (it also regenerates the ignored `src/main/assets/adblock-engine-seed.bin`; without it seven unit tests fail with "missing asset").
- The Island and everything anchored to it (panel, palette, find, shield, capture popover), the strip, the vertical tabs rail, and the Glance header are **not touched**. `styles.css` changes in A1 are limited to adding the `--sunrise-*` tokens to its three `:root` blocks.
- Mahjong keeps its own focus styling (`mahjong.css:120–124`); do not edit `mahjong.css`.
- Token values are compared as exact strings by `tokens:check`: `rgba(128, 93, 40, 0.16)` with spaces, lowercase hex.
- Privacy, telemetry and Patron wording in Settings is a disclosure: A1 changes no copy.
- Policy tests change in the same commit as the policy they guard.
- Render proof (captures) goes to the owner and gets an explicit yes **before** the branch is pushed. A private Windows/Linux validation build (`gh workflow run release-windows-linux.yml --ref <branch> -f mode=validation -f platform=all`) passes before merge. No release.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## File map

| File | Change | Responsibility |
|---|---|---|
| `test/desktop/surface-captures.mjs` | create | Dev-only tool: photographs every utility sheet (light/dark, 1280×800 and 640×480) for design review |
| `src/main/main.js` (`formatAccelerator`, ~6786) | modify | Map `Command`/`Control` accelerator parts |
| `test/unit/shortcut-labels.test.js` | create | Accelerator → label table test |
| `src/renderer/pages/settings-nav-model.js` | create | Pure "which section is current" scorer (UMD, like `settings-verify-model.js`) |
| `src/renderer/pages/settings.js` (~1089–1165) | modify | Use the model; listen to the element that scrolls |
| `src/renderer/pages/settings.html` (~505) | modify | Load the model script |
| `test/unit/settings-nav-model.test.js` | create | Scorer behavior |
| `src/main/test-hook.js` (near `settingsProfileRows`, ~1841) | modify | `scrollSettingsSheetToEnd`, `settingsCurrentSection`, `utilitySheetPalette` hooks |
| `spec/acceptance/internal-pages.feature` | modify | `@F16-9`, `@F16-10` |
| `test/desktop/steps/runnable.steps.js` | modify | Steps for `@F16-9`, `@F16-10` |
| `test/desktop/cucumber.mjs` | modify | Add `@F16-9`, `@F16-10` to `RUNNABLE` |
| `src/renderer/pages/shortcuts.html`, `tab-import.html` | modify | One nav |
| `test/unit/utility-sheet-nav.test.js` | create | Every sheet's nav: same four links, same order |
| `tokens/tokens.json`, `tokens/generated/*` | modify | `sunrise-*` palette |
| `src/renderer/pages/pages.css`, `src/renderer/styles.css` | modify | Tokens; `body.sheet` scope; scrim; buttons; focus rings; Bring Your Tabs width |
| `src/renderer/pages/tab-handoff.css` | modify | Primary button in ink |
| `test/unit/sunrise-palette-contrast.test.js` | create | Every text/background pair ≥ 4.5:1 |
| `test/unit/page-focus-ring.test.js` | create | Every `:focus` outline in `pages.css` ≤ 1px |
| `docs/brand-usage.md`, `CLAUDE.md`, `AGENTS.md`, `spec/features.md`, `design-qa.md` | modify | Ratify the new rule |
| `docs/design-reviews/non-island-polish/a1/` | create | Before/after captures + README |

---

### Task 1: Surface capture tool and "before" captures

**Files:**
- Create: `test/desktop/surface-captures.mjs`
- Create: `docs/design-reviews/non-island-polish/a1/before/*.png`

**Interfaces:**
- Produces: `node test/desktop/surface-captures.mjs --out <dir>` writes `<sheet>-<scheme>-<size>-<nn>.png` for sheets `settings`, `bookmarks`, `history`, `downloads`, `shortcuts`, `tab-import`, schemes `light`/`dark`, sizes `1280x800`/`640x480`. Every later task uses it for before/after proof.

This is a dev tool, not a test; it has no test of its own. It opens a real, visible Blanc window for about two minutes (say so before running it) and needs macOS Screen Recording permission for the terminal.

- [ ] **Step 1: Create the tool**

```js
// Dev-only design-review tool: photographs every utility sheet on a throwaway
// test profile. Usage: node test/desktop/surface-captures.mjs --out <dir>
// macOS only (screencapture -l). A Blanc window opens and closes while it runs.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { _electron } from 'playwright';
import testHookCall from './support/test-hook-call.js';
import poll from './support/poll.js';

const { callTestHook } = testHookCall;
const { waitForValue } = poll;
if (process.platform !== 'darwin') throw new Error('surface-captures needs macOS screencapture');
const outIndex = process.argv.indexOf('--out');
const outDir = path.resolve(outIndex > 0 ? process.argv[outIndex + 1] : 'surface-captures');
fs.mkdirSync(outDir, { recursive: true });

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-surface-captures-'));
const userDataDir = path.join(root, 'profile');
const profile = `${userDataDir}-Dev`;
fs.mkdirSync(profile);
const write = (name, value) => fs.writeFileSync(path.join(profile, name), JSON.stringify(value));
const now = Date.now();
const DAY = 86_400_000;
write('settings.json', { onboardingVersion: 1, adblockEnabled: false, usagePing: false, searchSuggestions: false });
write('history.json', {
  entries: [
    ['https://news.ycombinator.com/', 'Hacker News', 0.1],
    ['https://github.com/bnfy/blanc', 'bnfy/blanc: A little less browser', 0.2],
    ['https://developer.mozilla.org/en-US/docs/Web/CSS', 'CSS: Cascading Style Sheets | MDN', 0.3],
    ['https://www.nytimes.com/', 'The New York Times', 1.2],
    ['https://en.wikipedia.org/wiki/Sunrise', 'Sunrise - Wikipedia', 1.4],
    ['https://www.youtube.com/watch?v=abc', 'A very long video title that keeps going to test how rows truncate in the history list - YouTube', 3.1],
  ].map(([url, title, daysAgo]) => ({ url, title, visitedAt: now - daysAgo * DAY })),
  siteIcons: [],
});
const download = (i, filename, state, totalBytes) => ({
  id: `seed-${i}`, url: `https://downloads.example.com/${filename}`, filename,
  savePath: `/Users/demo/Downloads/${filename}`, state,
  receivedBytes: state === 'completed' ? totalBytes : Math.floor(totalBytes / 3), totalBytes,
  startedAt: now - i * 3_600_000, finishedAt: now - i * 3_600_000 + 20_000, private: false,
});
write('downloads.json', { items: [
  download(1, 'annual-report-2026.pdf', 'completed', 2_400_000),
  download(2, 'Blanc-1.22.0-arm64.dmg', 'completed', 148_000_000),
  download(3, 'holiday-photos.zip', 'cancelled', 88_000_000),
  download(4, 'invoice_0931.pdf', 'interrupted', 310_000),
  download(5, 'a-really-long-file-name-that-keeps-going-for-layout-testing-final.tar.gz', 'completed', 5_000_000),
] });

const { ELECTRON_RUN_AS_NODE: ignored, ...env } = process.env;
void ignored;
const app = await _electron.launch({
  args: [path.resolve('.'), `--user-data-dir=${userDataDir}`],
  env: { ...env, BLANC_TEST: '1' },
});
const call = (method, ...args) => callTestHook(app, method, args);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
try {
  await waitForValue(() => call('startupReady'), Boolean, 'startup');
  for (const [url, title] of [['https://github.com/', 'GitHub'], ['https://news.ycombinator.com/', 'Hacker News'],
    ['https://developer.mozilla.org/', 'MDN Web Docs'], ['https://www.nytimes.com/', 'The New York Times']]) {
    await call('seedFavorite', url, title);
  }
  const windowNumber = await app.evaluate(({ BrowserWindow }) =>
    Number(BrowserWindow.getAllWindows().find((w) => w.isVisible()).getMediaSourceId().split(':')[1]));
  const shot = (name) => execFileSync('screencapture', [`-l${windowNumber}`, '-o', '-x', path.join(outDir, `${name}.png`)]);
  const setScheme = (scheme) => app.evaluate(async ({ webContents, nativeTheme }, value) => {
    nativeTheme.themeSource = value;
    for (const wc of webContents.getAllWebContents()) {
      try {
        if (!wc.debugger.isAttached()) wc.debugger.attach('1.3');
        await wc.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value }] });
      } catch { /* a view without a debugger target keeps its scheme */ }
    }
  }, scheme);
  const inSheet = (script) => app.evaluate(async ({ webContents }, code) => {
    const id = globalThis.__blanc.utilitySheetContentsId();
    return id ? webContents.fromId(id).executeJavaScript(code) : null;
  }, script);
  const open = {
    settings: () => call('openSettings'),
    bookmarks: () => call('openFavoritesSheet'),
    history: async () => { await call('openFavoritesSheet'); await sleep(900); await inSheet("location.href = 'blanc://history/'; 0"); },
    downloads: () => call('openDownloads'),
    shortcuts: async () => { await call('openFavoritesSheet'); await sleep(900); await inSheet("location.href = 'blanc://shortcuts/'; 0"); },
    'tab-import': () => call('openTabImport'),
  };
  for (const [width, height] of [[1280, 800], [640, 480]]) {
    await call('setWindowContentSize', width, height);
    await sleep(800);
    for (const scheme of ['light', 'dark']) {
      for (const [sheet, openSheet] of Object.entries(open)) {
        await call('closeUtilitySurface');
        await sleep(300);
        await openSheet();
        await sleep(1400);
        await call('closeOverlay'); // a blank tab's Island panel must not cover the sheet
        await setScheme(scheme);
        await sleep(400);
        const steps = await inSheet(`(() => { const p = document.querySelector('body.sheet .page');
          return Math.min(6, Math.max(1, Math.ceil(p.scrollHeight / Math.max(200, p.clientHeight - 80)))); })()`);
        for (let i = 0; i < steps; i += 1) {
          await inSheet(`(() => { const p = document.querySelector('body.sheet .page'); p.scrollTop = ${i} * (p.clientHeight - 80); return 0; })()`);
          await sleep(300);
          shot(`${sheet}-${scheme}-${width}x${height}-${String(i + 1).padStart(2, '0')}`);
        }
      }
    }
  }
  await call('closeUtilitySurface');
  console.log(`surface-captures: wrote ${fs.readdirSync(outDir).length} files to ${outDir}`);
} finally {
  await app.close();
  fs.rmSync(root, { recursive: true, force: true });
}
```

- [ ] **Step 2: Run it on the unchanged branch**

Run: `node test/desktop/surface-captures.mjs --out docs/design-reviews/non-island-polish/a1/before`
Expected: `surface-captures: wrote N files …` with N ≥ 24; open two files (e.g. `settings-light-1280x800-01.png`, `downloads-dark-640x480-01.png`) and confirm each shows the sheet over the page, not a bare window. If a file shows no sheet, the sheet had not finished opening: raise the 1400 ms wait and rerun.

- [ ] **Step 3: Lint and commit**

```bash
npm run lint
git add test/desktop/surface-captures.mjs docs/design-reviews/non-island-polish/a1/before
git commit -m "Add a utility-sheet capture tool and A1 before captures"
```

---

### Task 2: Shortcut labels show "⌘H", not "CommandH" (spec finding 2)

**Files:**
- Test: `test/unit/shortcut-labels.test.js` (create)
- Modify: `src/main/main.js` — `formatAccelerator` (~6786–6798)

**Interfaces:**
- Consumes: `formatAccelerator(accelerator: string): string` in `main.js` (reads `process.platform`).
- Produces: nothing new; same signature.

- [ ] **Step 1: Write the failing test**

```js
'use strict';

// Menu roles report accelerators like 'Command+H'; the Shortcuts sheet must
// show the platform glyphs, never the raw modifier names.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const main = fs.readFileSync(path.join(__dirname, '../../src/main/main.js'), 'utf8');
const start = main.indexOf('function formatAccelerator(');
const end = main.indexOf('\n}', start) + 2;
const source = start >= 0 ? main.slice(start, end) : null;

test('formatAccelerator is liftable from main.js', () => {
  assert.ok(source, 'formatAccelerator not found — update this test');
});

const label = (platform, accelerator) => {
  const sandbox = { process: { platform } };
  vm.createContext(sandbox);
  return vm.runInContext(`${source}; formatAccelerator(${JSON.stringify(accelerator)})`, sandbox);
};

test('macOS labels use glyphs in ⌃⌥⇧⌘ order for every modifier spelling', () => {
  for (const [accelerator, expected] of [
    ['Command+H', '⌘H'],
    ['Command+Alt+H', '⌥⌘H'],
    ['Control+Command+F', '⌃⌘F'],
    ['CmdOrCtrl+Shift+T', '⇧⌘T'],
    ['Alt+CmdOrCtrl+Left', '⌥⌘←'],
  ]) assert.equal(label('darwin', accelerator), expected, accelerator);
});

test('Windows and Linux labels spell Ctrl for every control spelling', () => {
  for (const [accelerator, expected] of [
    ['CmdOrCtrl+Shift+T', 'Ctrl+Shift+T'],
    ['Control+Tab', 'Ctrl+Tab'],
    ['Alt+CmdOrCtrl+Left', 'Alt+Ctrl+←'], // arrow glyphs apply on every platform
  ]) assert.equal(label('win32', accelerator), expected, accelerator);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node --test test/unit/shortcut-labels.test.js`
Expected: FAIL. macOS: `'CommandH'` does not equal `'⌘H'`. Windows: `'Control+Tab'` does not equal `'Ctrl+Tab'`.

- [ ] **Step 3: Minimal fix in `formatAccelerator`**

Replace the non-mac branch and the `MAC` map:

```js
  if (process.platform !== 'darwin') {
    const OTHER = { CmdOrCtrl: 'Ctrl', CommandOrControl: 'Ctrl', Control: 'Ctrl' };
    return [...parts.map((m) => OTHER[m] ?? m), label].join('+');
  }
  const MAC = {
    CmdOrCtrl: '⌘', CommandOrControl: '⌘', Command: '⌘', Cmd: '⌘',
    Control: '⌃', Ctrl: '⌃', Alt: '⌥', Option: '⌥', Shift: '⇧',
  };
```

- [ ] **Step 4: Run it and watch it pass**

Run: `node --test test/unit/shortcut-labels.test.js`
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add test/unit/shortcut-labels.test.js src/main/main.js
git commit -m "Show glyphs for Command and Control shortcuts on the Shortcuts sheet"
```

---

### Task 3: The Settings section marker follows scrolling (spec finding 1)

**Files:**
- Create: `src/renderer/pages/settings-nav-model.js`
- Test: `test/unit/settings-nav-model.test.js` (create)
- Modify: `src/renderer/pages/settings.js` (`initSettingsNav`, ~1089–1165), `src/renderer/pages/settings.html` (~505–508)
- Modify: `src/main/test-hook.js` (add two hooks beside `settingsProfileRows`, ~1841)
- Modify: `spec/acceptance/internal-pages.feature`, `test/desktop/steps/runnable.steps.js`, `test/desktop/cucumber.mjs`

**Interfaces:**
- Produces: `window.blancSettingsNavModel.currentSection(sections, view, anchoredId)` where `sections: Array<{ id: string, top: number, bottom: number }>` (viewport px), `view: { top: number, bottom: number }`, `anchoredId: string | null`; returns `{ id: string | null, anchored: boolean }`.
- Produces test hooks: `scrollSettingsSheetToEnd(): Promise<boolean>`, `settingsCurrentSection(): Promise<string | null>`.

- [ ] **Step 1: Write the failing acceptance scenario (the bug)**

Append to `spec/acceptance/internal-pages.feature` (confirm `@F16-9` is unused first: `grep -rn "F16-9" spec test`):

```gherkin
  @F16-9 @F16 @desktop
  Scenario: Scrolling Settings moves its section marker
    Given the settings page is open in the utility sheet
    When I scroll the settings sheet to its end
    Then the settings section marker is on Help
```

Add to `src/main/test-hook.js`, right after `settingsProfileRows`:

```js
    async scrollSettingsSheetToEnd() {
      const wc = getUtilitySheetWebContents();
      if (!wc) return false;
      return wc.executeJavaScript(`(() => {
        const page = document.querySelector('body.sheet .page');
        page.scrollTop = page.scrollHeight;
        return true;
      })()`);
    },
    async settingsCurrentSection() {
      const wc = getUtilitySheetWebContents();
      if (!wc) return null;
      return wc.executeJavaScript(`document.querySelector('.settings-nav a.current')?.dataset.group ?? null`);
    },
```

Add to `test/desktop/steps/runnable.steps.js`, beside the other utility-sheet steps (reuse `untilSurface` and `waitForValue`, already imported there):

```js
Given('the settings page is open in the utility sheet', async function () {
  await this.call('openSettings');
  await untilSurface(this, (s) => s.visible && s.ready, 'settings sheet to open');
});

When('I scroll the settings sheet to its end', async function () {
  assert.strictEqual(await this.call('scrollSettingsSheetToEnd'), true);
});

Then('the settings section marker is on Help', async function () {
  await waitForValue(() => this.call('settingsCurrentSection'), (value) => value === 'help',
    'settings section marker to reach Help');
});
```

(`runnable.steps.js` already imports `assert` from `node:assert` and `waitForValue` from `../support/poll`.) Add `'@F16-9'` to the `@F16-…` line of `RUNNABLE` in `test/desktop/cucumber.mjs`.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx cucumber-js -c test/desktop/cucumber.mjs -p runnable --tags '@F16-9'`
Expected: FAIL on "the settings section marker is on Help" (timed out; the marker stays on `general` because `settings.js` listens for scroll on `window`).

- [ ] **Step 3: Write the model test**

```js
'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { currentSection } = require('../../src/renderer/pages/settings-nav-model');

const view = { top: 100, bottom: 700 }; // the sheet's scrolling card, not the window

test('the section filling most of the view is current', () => {
  const sections = [{ id: 'general', top: -400, bottom: 150 }, { id: 'sync', top: 150, bottom: 650 }];
  assert.deepEqual(currentSection(sections, view, null), { id: 'sync', anchored: false });
});

test('sections are measured against the given view, not the window', () => {
  // Fully inside a window starting at 0, but above this view.
  const sections = [{ id: 'general', top: 0, bottom: 90 }, { id: 'sync', top: 90, bottom: 1400 }];
  assert.equal(currentSection(sections, view, null).id, 'sync');
});

test('two short trailing sections both fully visible: the later one wins', () => {
  const sections = [{ id: 'patron', top: 300, bottom: 450 }, { id: 'help', top: 450, bottom: 600 }];
  assert.equal(currentSection(sections, view, null).id, 'help');
});

test('nothing visible keeps the first section rather than the last', () => {
  const sections = [{ id: 'general', top: 800, bottom: 900 }, { id: 'help', top: 900, bottom: 1000 }];
  assert.equal(currentSection(sections, view, null).id, 'general');
});

test('a deep-linked section keeps the marker while its heading is in the upper part of the view', () => {
  const sections = [{ id: 'profiles', top: 150, bottom: 300 }, { id: 'privacy', top: 300, bottom: 1500 }];
  assert.deepEqual(currentSection(sections, view, 'profiles'), { id: 'profiles', anchored: true });
});

test('a deep-linked section whose heading scrolled away releases the marker', () => {
  const sections = [{ id: 'profiles', top: -200, bottom: 120 }, { id: 'privacy', top: 120, bottom: 600 }];
  assert.deepEqual(currentSection(sections, view, 'profiles'), { id: 'privacy', anchored: false });
});
```

Run: `node --test test/unit/settings-nav-model.test.js`
Expected: FAIL with "Cannot find module '../../src/renderer/pages/settings-nav-model'".

- [ ] **Step 4: Create the model**

`src/renderer/pages/settings-nav-model.js`:

```js
'use strict';
// Which Settings section the sidebar marks as current. Served flat to the
// settings page via a <script> tag AND require-able by node tests (same
// dual-environment pattern as settings-verify-model.js).
//
// Each section is scored by how much of ITSELF is inside the view — the box
// of the element that actually scrolls — highest wins. A fixed trigger line
// fails here: Privacy & Security is taller than the short trailing sections
// combined, so near the bottom their headers could never cross it. A positive
// tie goes to the later section so scrolling down keeps advancing; a zero tie
// stays on the first. A deep-linked section keeps the marker while its
// heading is in the upper 45% of the view.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.blancSettingsNavModel = api;
})(typeof self !== 'undefined' ? self : this, function () {
  function currentSection(sections, view, anchoredId) {
    const height = view.bottom - view.top;
    const anchored = sections.find((section) => section.id === anchoredId);
    if (anchored && anchored.top >= view.top && anchored.top < view.top + height * 0.45) {
      return { id: anchored.id, anchored: true };
    }
    let best = null;
    let bestRatio = -1;
    for (const section of sections) {
      const size = section.bottom - section.top;
      const visible = Math.max(0, Math.min(section.bottom, view.bottom) - Math.max(section.top, view.top));
      const ratio = size > 0 ? visible / size : 0;
      if (ratio > bestRatio || (ratio > 0 && ratio === bestRatio)) {
        bestRatio = ratio;
        best = section;
      }
    }
    return { id: best?.id ?? null, anchored: false };
  }

  return { currentSection };
});
```

Run: `node --test test/unit/settings-nav-model.test.js`
Expected: 6 tests pass.

- [ ] **Step 5: Wire the model into `settings.js` and listen to the right element**

In `initSettingsNav`, replace the whole `function updateCurrent() { … }` (the scorer with the `anchoredGroup` block and the `for (const group of activeGroups)` loop) with:

```js
    // In the utility sheet the card (.page) scrolls, not the window.
    const scroller = document.querySelector('body.sheet .page') ?? window;
    const viewBox = () => (scroller === window
      ? { top: 0, bottom: window.innerHeight }
      : scroller.getBoundingClientRect());

    function updateCurrent() {
      const sections = activeGroups.map((group) => {
        const rect = group.getBoundingClientRect();
        return { id: group.id.replace('group-', ''), top: rect.top, bottom: rect.bottom };
      });
      const anchoredId = anchoredGroup ? anchoredGroup.id.replace('group-', '') : null;
      const result = window.blancSettingsNavModel.currentSection(sections, viewBox(), anchoredId);
      if (!result.anchored) anchoredGroup = null;
      if (result.id) setCurrent(result.id);
    }
```

Keep the explanatory comment block above it only if it still describes the code; the scoring rationale now lives in `settings-nav-model.js`. Then replace:

```js
    window.addEventListener('scroll', scheduleUpdate);
```

with:

```js
    scroller.addEventListener('scroll', scheduleUpdate, { passive: true });
```

In `settings.html`, load the model before `settings.js`:

```html
  <script src="settings-sync-setup-model.js"></script>
  <script src="settings-nav-model.js"></script>
  <script src="settings.js"></script>
```

Packaging needs no change: `build.files` in `package.json` includes `src/**/*`.

- [ ] **Step 6: Run both tests and watch them pass**

Run: `node --test test/unit/settings-nav-model.test.js && npx cucumber-js -c test/desktop/cucumber.mjs -p runnable --tags '@F16-9 or @F16-7 or @F14-1 or @F14-2 or @F14-3 or @F14-4'`
Expected: unit 6/6; all listed scenarios pass (the neighbours prove Settings still loads and deep links still work).

- [ ] **Step 7: Commit**

```bash
git add src/renderer/pages/settings-nav-model.js src/renderer/pages/settings.js src/renderer/pages/settings.html \
  test/unit/settings-nav-model.test.js src/main/test-hook.js spec/acceptance/internal-pages.feature \
  test/desktop/steps/runnable.steps.js test/desktop/cucumber.mjs
git commit -m "Keep the Settings section marker in step with scrolling in the sheet"
```

---

### Task 4: One nav for every sheet (spec finding 3)

**Files:**
- Test: `test/unit/utility-sheet-nav.test.js` (create)
- Modify: `src/renderer/pages/shortcuts.html:12-17`, `src/renderer/pages/tab-import.html:12-15`

**Interfaces:** none.

- [ ] **Step 1: Write the failing policy test**

```js
'use strict';

// Every utility sheet carries the same four nav links in the same order, so
// the nav never shifts between sheets (spec 2026-09-26 §5.4). The tab
// handoff is a one-time security confirmation and deliberately has no links.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const PAGES = path.join(__dirname, '../../src/renderer/pages');
const ORDER = ['blanc://settings/', 'blanc://bookmarks/', 'blanc://history/', 'blanc://downloads/'];
const CURRENT = { settings: 'blanc://settings/', bookmarks: 'blanc://bookmarks/', history: 'blanc://history/',
  downloads: 'blanc://downloads/', shortcuts: null, 'tab-import': null };

function nav(page) {
  const html = fs.readFileSync(path.join(PAGES, `${page}.html`), 'utf8');
  const block = html.match(/<nav class="page-nav"[^>]*>([\s\S]*?)<\/nav>/)?.[1];
  assert.ok(block, `${page}.html has no .page-nav`);
  const links = [...block.matchAll(/<a href="([^"]+)"([^>]*)>/g)]
    .map(([, href, rest]) => ({ href, current: /class="current"/.test(rest) }));
  return { hrefs: links.map((l) => l.href), current: links.find((l) => l.current)?.href ?? null };
}

for (const [page, current] of Object.entries(CURRENT)) {
  test(`${page} shows the shared nav`, () => {
    const found = nav(page);
    assert.deepEqual(found.hrefs, ORDER);
    assert.equal(found.current, current);
  });
}

test('the tab handoff keeps its one-time label and no links', () => {
  const html = fs.readFileSync(path.join(PAGES, 'tab-handoff.html'), 'utf8');
  const block = html.match(/<nav class="page-nav"[^>]*>([\s\S]*?)<\/nav>/)[1];
  assert.doesNotMatch(block, /<a /);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node --test test/unit/utility-sheet-nav.test.js`
Expected: FAIL for `shortcuts` (order starts with Favorites) and `tab-import` (two links); the other five pass.

- [ ] **Step 3: Fix the markup**

`shortcuts.html` nav becomes:

```html
    <nav class="page-nav">
      <a href="blanc://settings/">Settings</a>
      <a href="blanc://bookmarks/">Favorites</a>
      <a href="blanc://history/">History</a>
      <a href="blanc://downloads/">Downloads</a>
    </nav>
```

`tab-import.html` nav becomes the same four links (no `class="current"`).

- [ ] **Step 4: Run it and watch it pass; check Bring Your Tabs still works**

Run: `node --test test/unit/utility-sheet-nav.test.js && npx cucumber-js -c test/desktop/cucumber.mjs -p runnable --tags '@F40-1 or @F40-2 or @F16-4 or @F16-5'`
Expected: 7 unit tests pass; listed scenarios pass.

- [ ] **Step 5: Commit**

```bash
git add test/unit/utility-sheet-nav.test.js src/renderer/pages/shortcuts.html src/renderer/pages/tab-import.html
git commit -m "Give every utility sheet the same nav in the same order"
```

---

### Task 5: The Sunrise palette as shared tokens

**Files:**
- Modify: `tokens/tokens.json` (insert after the `accent-dim` entry), `tokens/generated/*` (by build)
- Modify: `src/renderer/pages/pages.css` `:root` blocks (light ~35, dark ~63, private ~82) and the comment at ~46
- Modify: `src/renderer/styles.css` `:root` blocks (light ~21, dark ~57, private ~75)
- Test: `test/unit/sunrise-palette-contrast.test.js` (create)

**Interfaces:**
- Produces: CSS custom properties, themed per `:root` / dark / private: `--sunrise-bg`, `--sunrise-surface`, `--sunrise-surface-raised`, `--sunrise-border`, `--sunrise-text`, `--sunrise-text-dim`, `--sunrise-accent`, `--sunrise-accent-dim` — in both `pages.css` and `styles.css`.

- [ ] **Step 1: Write the failing contrast test**

```js
'use strict';

// Every Sunrise text colour must stay readable on every Sunrise background
// (WCAG 4.5:1), in all three themes. Values are read from the token source,
// so a later palette edit that breaks contrast fails here.
const assert = require('node:assert/strict');
const test = require('node:test');
const tokens = require('../../tokens/tokens.json');

const value = (name, theme) => tokens.tokens.find((t) => t.name === name)?.values?.[theme];
const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

for (const theme of ['light', 'dark', 'private']) {
  test(`Sunrise text is readable on every Sunrise background (${theme})`, () => {
    for (const fg of ['sunrise-text', 'sunrise-text-dim', 'sunrise-accent']) {
      for (const bg of ['sunrise-bg', 'sunrise-surface', 'sunrise-surface-raised']) {
        const [a, b] = [value(fg, theme), value(bg, theme)];
        assert.ok(a && b, `${fg} or ${bg} missing for ${theme}`);
        assert.ok(contrast(a, b) >= 4.5, `${fg} on ${bg} (${theme}) is ${contrast(a, b).toFixed(2)}:1`);
      }
    }
  });
}
```

Run: `node --test test/unit/sunrise-palette-contrast.test.js`
Expected: FAIL with "sunrise-text or sunrise-bg missing for light".

- [ ] **Step 2: Add the tokens to the source**

```bash
node -e '
const fs = require("fs");
const p = "tokens/tokens.json";
const t = JSON.parse(fs.readFileSync(p, "utf8"));
const tok = (name, light, dark, priv) => ({ name, group: "color", consumers: ["chrome", "pages"],
  values: { light, dark, private: priv } });
const sunrise = [
  tok("sunrise-bg", "#f7f0e5", "#17130f", "#100d0b"),
  tok("sunrise-surface", "#efe6d8", "#2d251d", "#251d17"),
  tok("sunrise-surface-raised", "#fffcf7", "#221d17", "#1a1511"),
  tok("sunrise-border", "#ddd2c2", "#4a3e31", "#594a39"),
  tok("sunrise-text", "#12100b", "#f7f0e5", "#f8f0e4"),
  tok("sunrise-text-dim", "#6b6257", "#b8aa98", "#b5a38f"),
  tok("sunrise-accent", "#805d28", "#d4ad66", "#d4ad66"),
  tok("sunrise-accent-dim", "rgba(128, 93, 40, 0.16)", "rgba(212, 173, 102, 0.2)", "rgba(212, 173, 102, 0.2)"),
];
t.tokens.splice(t.tokens.findIndex((x) => x.name === "accent-dim") + 1, 0, ...sunrise);
fs.writeFileSync(p, JSON.stringify(t, null, 2) + "\n");'
git diff --stat tokens/tokens.json
```

Expected: only insertions in `tokens/tokens.json`. If the diff shows whole-file churn, the file used different formatting: `git checkout tokens/tokens.json` and insert the eight entries by hand after `accent-dim`, matching its style.

Run: `node --test test/unit/sunrise-palette-contrast.test.js`
Expected: 3 tests pass (lowest pair is gold on the light surface, 4.83:1).

- [ ] **Step 3: Watch the guard fail, then add the CSS**

Run: `npm run tokens:check`
Expected: FAIL, "missing --sunrise-bg" (and the rest) for both `chrome` and `pages`.

In **each** stylesheet, add to the light `:root` block (in `pages.css` after `--patron-halo: rgba(128, 93, 40, 0.24);`; in `styles.css` after `--accent-dim: rgba(17, 17, 17, 0.08);`):

```css
  --sunrise-bg: #f7f0e5;
  --sunrise-surface: #efe6d8;
  --sunrise-surface-raised: #fffcf7;
  --sunrise-border: #ddd2c2;
  --sunrise-text: #12100b;
  --sunrise-text-dim: #6b6257;
  --sunrise-accent: #805d28;
  --sunrise-accent-dim: rgba(128, 93, 40, 0.16);
```

to the dark `:root` inside `@media (prefers-color-scheme: dark)` (indent to match that block):

```css
    --sunrise-bg: #17130f;
    --sunrise-surface: #2d251d;
    --sunrise-surface-raised: #221d17;
    --sunrise-border: #4a3e31;
    --sunrise-text: #f7f0e5;
    --sunrise-text-dim: #b8aa98;
    --sunrise-accent: #d4ad66;
    --sunrise-accent-dim: rgba(212, 173, 102, 0.2);
```

and to `:root[data-theme="private"]`:

```css
  --sunrise-bg: #100d0b;
  --sunrise-surface: #251d17;
  --sunrise-surface-raised: #1a1511;
  --sunrise-border: #594a39;
  --sunrise-text: #f8f0e4;
  --sunrise-text-dim: #b5a38f;
  --sunrise-accent: #d4ad66;
  --sunrise-accent-dim: rgba(212, 173, 102, 0.2);
```

In `pages.css`, replace the comment `/* Patron is the one product surface allowed to carry Sunrise warmth. */` with `/* Patron's own gold. Blanc's warm surfaces use the --sunrise-* palette. */`.

- [ ] **Step 4: Regenerate and check**

Run: `npm run tokens:build && npm run tokens:check`
Expected: `wrote tokens/generated/…` for three files, then `tokens:check OK`.

- [ ] **Step 5: Commit**

```bash
git add tokens/tokens.json tokens/generated src/renderer/pages/pages.css src/renderer/styles.css test/unit/sunrise-palette-contrast.test.js
git commit -m "Add the Sunrise palette as shared design tokens"
```

---

### Task 6: Warm utility sheets and scrim (D3)

**Files:**
- Modify: `src/renderer/pages/pages.css` — `body.sheet` rule (~1334), its dark override (~1466), `a.patron-checkout` (~224–236), `.link-button` neighbours, `.tab-import-primary` (~1722–1733)
- Modify: `src/renderer/pages/tab-handoff.css:47-48`
- Modify: `src/main/test-hook.js` (one hook), `spec/acceptance/internal-pages.feature`, `test/desktop/steps/runnable.steps.js`, `test/desktop/cucumber.mjs`

**Interfaces:**
- Consumes: the `--sunrise-*` tokens from Task 5.
- Produces: test hook `utilitySheetPalette(): Promise<{ text: string, card: string, currentNav: string, primary: string | null }>` (computed `rgb(...)` strings).

- [ ] **Step 1: Write the failing acceptance scenario**

Append to `spec/acceptance/internal-pages.feature` (confirm `@F16-10` is unused):

```gherkin
  @F16-10 @F16 @all
  Scenario: Utility pages wear the Sunrise palette
    Given the favorites page is open in the utility sheet
    Then the utility sheet uses the Sunrise palette
```

Hook in `src/main/test-hook.js` beside the Task 3 hooks:

```js
    async utilitySheetPalette() {
      const wc = getUtilitySheetWebContents();
      if (!wc) return null;
      return wc.executeJavaScript(`(() => ({
        text: getComputedStyle(document.body).color,
        card: getComputedStyle(document.querySelector('.page')).backgroundColor,
        currentNav: getComputedStyle(document.querySelector('.page-nav a.current')).color,
      }))()`);
    },
```

Step in `runnable.steps.js` (acceptance runs pin the light scheme, so light values are expected):

```js
Then('the utility sheet uses the Sunrise palette', async function () {
  const palette = await waitForValue(() => this.call('utilitySheetPalette'), Boolean, 'sheet palette');
  assert.deepStrictEqual(palette, {
    text: 'rgb(18, 16, 11)',          // --sunrise-text #12100b
    card: 'rgb(255, 252, 247)',       // --sunrise-surface-raised #fffcf7
    currentNav: 'rgb(128, 93, 40)',   // --sunrise-accent #805d28
  });
});
```

Add `'@F16-10'` to `RUNNABLE`.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx cucumber-js -c test/desktop/cucumber.mjs -p runnable --tags '@F16-10'`
Expected: FAIL, actual `text: 'rgb(14, 14, 14)'`, `card: 'rgb(255, 255, 255)'`, `currentNav: 'rgb(17, 17, 17)'`.

- [ ] **Step 3: Warm the sheet scope and scrim**

In `pages.css`, change the start of the `body.sheet` rule from

```css
body.sheet {
  background: rgba(14, 14, 14, 0.18);
```

to

```css
body.sheet {
  /* Sunrise pages, ink frame (spec 2026-09-26 §5.1): the sheet remaps the
     semantic tokens to the shared Sunrise palette — the Start Page's
     .ledger-body technique — so component rules stay theme-agnostic. The
     card is the raised surface; the scrim keeps its strength in warm ink. */
  --bg: var(--sunrise-surface-raised);
  --surface: var(--sunrise-surface);
  --surface-raised: var(--sunrise-surface-raised);
  --border: var(--sunrise-border);
  --text: var(--sunrise-text);
  --text-dim: var(--sunrise-text-dim);
  --accent: var(--sunrise-accent);
  --accent-dim: var(--sunrise-accent-dim);
  background: rgba(18, 16, 11, 0.18);
```

and the dark override `body.sheet { background: rgba(0, 0, 0, 0.35); }` to `body.sheet { background: rgba(18, 16, 11, 0.35); }`.

- [ ] **Step 4: Primary buttons in ink, secondary controls at full contrast**

With `--accent` now gold inside sheets, primary fills move to ink (`--text`), which is visually unchanged everywhere else because neutral `--text` and `--accent` are both near-black.

`a.patron-checkout`: `color: var(--bg); background: var(--text); border: 1px solid var(--text);`
`.tab-import-primary` and `.tab-import-primary:hover`: `background: var(--text); border-color: var(--text);` (keep `color: var(--bg)`).
`tab-handoff.css` `button.tab-handoff-primary` lines 47–48: `background: var(--text); border-color: var(--text);`

After the base `.link-button:hover` rule, add:

```css
/* Warm sheets: secondary controls read at full contrast, never dimmed
   (spec §5.3). :where() keeps element-level specificity so every class-level
   button colour (primary, danger hover, close) still wins. */
:where(body.sheet) button,
:where(body.sheet) .link-button { color: var(--text); }
```

- [ ] **Step 5: Run it and watch it pass; run the sheet neighbours**

Run: `npx cucumber-js -c test/desktop/cucumber.mjs -p runnable --tags '@F16 or @F14 or @F9 or @F10-2 or @F40-1 or @F40-2'`
Expected: all pass, including `@F16-10`.

- [ ] **Step 6: Capture and eyeball**

Run: `node test/desktop/surface-captures.mjs --out /tmp/a1-task6`
Check light and dark: ivory card on a warm scrim; gold current nav and toggles; ink Patron button with ivory text (Settings → Patron); ink Bring Your Tabs primary button; secondary buttons in full-contrast text; hover rows in the warm surface. Anything illegible → fix before committing.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/pages/pages.css src/renderer/pages/tab-handoff.css src/main/test-hook.js \
  spec/acceptance/internal-pages.feature test/desktop/steps/runnable.steps.js test/desktop/cucumber.mjs
git commit -m "Dress the utility sheets in the Sunrise palette over a warm scrim"
```

---

### Task 7: Hairline focus ring on every blanc:// page except Mahjong (D1)

**Files:**
- Test: `test/unit/page-focus-ring.test.js` (create)
- Modify: `src/renderer/pages/pages.css` — global focus rule (~203), `.icon-swatch` rings (~420–424), `.js-patron-callout a:focus-visible` (~892), migration focus rule (~986–991), `.bb-site-dismiss:focus-visible` (~2178), `#mahjongLink:focus-visible` (~2067)
- Modify: `src/main/test-hook.js:1537` (`@F36-1` audit threshold)

**Interfaces:** none.

- [ ] **Step 1: Write the failing policy test**

```js
'use strict';

// D1 (owner, 2026-09-26): keyboard focus on blanc:// pages is one 1px ring in
// --text-dim. Mahjong keeps its own rings in mahjong.css, which this test
// deliberately does not read. Selection rings (a chosen app icon, an open
// menu) are state, not focus, and live in selectors without :focus.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const css = fs.readFileSync(path.join(__dirname, '../../src/renderer/pages/pages.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '');
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => ({ selector: selector.trim(), body }));
const widthPx = (body) => {
  const declared = body.match(/outline-width:\s*([^;]+)/)?.[1] ?? body.match(/outline:\s*([^;]+)/)?.[1];
  if (!declared) return null;
  if (/^\s*(none|0)\b/.test(declared)) return 0;
  const keyword = declared.match(/\b(thin|medium|thick)\b/)?.[1];
  if (keyword) return { thin: 1, medium: 3, thick: 5 }[keyword];
  return Number(declared.match(/(\d+(?:\.\d+)?)px/)?.[1] ?? NaN);
};

test('every focus outline on blanc:// pages is a hairline', () => {
  const focus = rules.filter((r) => /:focus/.test(r.selector) && widthPx(r.body) !== null);
  assert.ok(focus.length >= 5, 'expected the page focus rules — update this test');
  const thick = focus.filter((r) => widthPx(r.body) > 1).map((r) => `${r.selector} → ${r.body.trim()}`);
  assert.deepEqual(thick, []);
});

test('the shared control ring is 1px --text-dim with no gap', () => {
  const shared = rules.find((r) => r.selector.startsWith('input:focus-visible, select:focus-visible'));
  assert.ok(shared, 'shared focus rule not found');
  assert.match(shared.body, /outline:\s*1px solid var\(--text-dim\);/);
  assert.match(shared.body, /outline-offset:\s*0;/);
});
```

Run: `node --test test/unit/page-focus-ring.test.js`
Expected: FAIL listing the 2px rules (shared control rule, icon swatch, patron callout, migration tasks, `#mahjongLink`).

- [ ] **Step 2: Change the rules**

- Shared rule: `outline: 1px solid var(--text-dim); outline-offset: 0;`
- Icon swatch — split selection from focus:

```css
.icon-swatch.active img {
  outline: 2px solid var(--accent);
  outline-offset: 3px;
}
.icon-swatch:focus-visible img {
  outline: 1px solid var(--text-dim);
  outline-offset: 3px;
}
```

  (replacing the `.icon-swatch:is(.active, :focus-visible) img` rule; keep `.icon-swatch:focus-visible { outline: none; }`).
- `.js-patron-callout a:focus-visible`, the migration rule (`.migration-task:focus-visible, …`), `#mahjongLink:focus-visible`, `.bb-site-dismiss:focus-visible`: set `outline: 1px solid var(--text-dim);`, keeping each rule's existing `outline-offset` (they surround unbordered text or pills, where a gap keeps the ring off the glyphs).
- Any other rule the failing test lists gets the same `outline: 1px solid var(--text-dim);`, keeping its offset.
- Leave `.settings-select.is-open .settings-select-trigger` unchanged (open-menu state, not focus).

- [ ] **Step 3: Relax the onboarding audit in the same commit**

`src/main/test-hook.js` ~1537:

```js
              focusOutline: focus.outlineStyle !== 'none' && parseFloat(focus.outlineWidth) >= 1,
```

- [ ] **Step 4: Run the tests**

Run: `node --test test/unit/page-focus-ring.test.js && npx cucumber-js -c test/desktop/cucumber.mjs -p runnable --tags '@F35 or @F36'`
Expected: 2 unit tests pass; 15 scenarios pass.

- [ ] **Step 5: Confirm Mahjong is unchanged**

Run: `git diff --stat -- src/renderer/pages/mahjong.css` → no output. Mahjong's own rule covers its buttons and links (`mahjong.css:120–124`); check whether it has inputs or selects that would fall back to the shared rule: `grep -n "<input\|<select" src/renderer/pages/mahjong.html`. If any exist, do not edit `mahjong.css`; list them in the PR as the one place D1 reaches Mahjong and ask the owner before merging.

- [ ] **Step 6: Commit**

```bash
git add test/unit/page-focus-ring.test.js src/renderer/pages/pages.css src/main/test-hook.js
git commit -m "Use one hairline focus ring on blanc:// pages"
```

---

### Task 8: One sheet width

**Files:**
- Modify: `src/renderer/pages/pages.css:1470`

**Interfaces:** none.

Bring Your Tabs uses flexible grids (`repeat(auto-fit, minmax(132px, 1fr))`, `minmax(0, 1fr)` columns) and already renders inside cards narrower than 960px in any window under ~1010px wide, down to 640×480 (#431's checks). A 900px card cannot introduce overflow those windows don't already show, so this is a CSS change verified by the existing scenarios and captures.

- [ ] **Step 1: Remove the wide override**

Change `body.sheet .tab-import-page { max-width: 960px; padding-bottom: 32px; }` to `body.sheet .tab-import-page { padding-bottom: 32px; }`.

- [ ] **Step 2: Verify**

Run: `npx cucumber-js -c test/desktop/cucumber.mjs -p runnable --tags '@F40'`
Expected: all runnable `@F40` scenarios pass.
Run the capture tool; compare `tab-import-light-1280x800-01.png` with the before capture: same left edge as the Favorites sheet, no clipped controls.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/pages/pages.css
git commit -m "Give Bring Your Tabs the same sheet width as the other utility sheets"
```

---

### Task 9: Ratify the rule in the docs

**Files:**
- Modify: `docs/brand-usage.md` lines ~72–78, ~88–91, ~163–164
- Modify: `CLAUDE.md:119`, `AGENTS.md:125` (identical text)
- Modify: `spec/features.md` F15 (~302) and F16 (~312)
- Modify: `design-qa.md` (append)
- Create: `docs/design-reviews/non-island-polish/a1/after/*.png`, `docs/design-reviews/non-island-polish/a1/README.md`

**Interfaces:** none (documentation; no tests).

- [ ] **Step 1: `docs/brand-usage.md`**

- In the website palette paragraph, replace "and product tokens are never warmed." with "and product surfaces are warmed only through the Sunrise palette described under *Desktop Sunrise surfaces* below."
- Replace "Never substitute website tokens for shared product `--accent`, `--bg`, or other product variables outside the explicitly scoped Start Page treatment below." with "Never substitute website tokens for shared product `--accent`, `--bg`, or other product variables; warm product surfaces use the product's own `--sunrise-*` tokens, described below."
- Replace "The treatment is scoped to the Start Page and does not warm the Island, Settings, or other utility pages." with "The Start Page keeps its landscape and translucent surfaces; the rest of the product's warm surfaces follow *Desktop Sunrise surfaces* below."
- Add a section after the Start Page one:

```markdown
### Desktop Sunrise surfaces

**Owner decision, September 26, 2026:** Sunrise dresses Blanc's own pages and
the questions Blanc asks you; the frame stays ink. Warm (utility sheets from
the A1 polish PR; the rest follows in PR B): the utility sheets
(Settings, Favorites, History, Downloads, Keyboard Shortcuts, Bring Your
Tabs, tab handoff), the error and certificate pages, the site permission
prompt, the 1Password capsule and the screen-share picker. Neutral: the
Island and everything that opens from it, the strip, the vertical tabs rail,
the Glance header and the window controls.

Warm surfaces use the shared `--sunrise-*` tokens (`tokens/tokens.json`) by
remapping the semantic tokens inside a scope class, never by hard-coding
colors. Gold marks state and navigation; primary buttons stay ink on ivory
(ivory on ink in dark mode). Inter remains the operating voice; Newsreader
stays limited to the invitation titles. Keyboard focus on `blanc://` pages is
one 1px ring in `--text-dim`; Mahjong keeps its own.
```

- [ ] **Step 2: `CLAUDE.md` and `AGENTS.md` Theming paragraph**

Append to the end of the **Theming** paragraph in both files, identically:

```
Warm surfaces (utility sheets today; see `docs/brand-usage.md` → *Desktop Sunrise surfaces*) remap these semantic tokens to the themed `--sunrise-*` palette inside a scope class such as `body.sheet`, the same technique the Start Page's `.ledger-body` uses; the Island and its frame stay neutral.
```

Run: `diff <(sed -n '/^\*\*Theming:/p' CLAUDE.md) <(sed -n '/^\*\*Theming:/p' AGENTS.md)` → no output.

- [ ] **Step 3: `spec/features.md`**

F15, after the "Token *names and values* are shared" bullet:

```markdown
- A second themed palette, `sunrise-*`, dresses Blanc's own pages and prompts
  (utility pages first); surfaces remap the semantic tokens to it rather than
  hard-coding colors. The frame around the Island stays on the neutral palette.
```

F16, extend the **Presentation split** bullet's last sentence with: "Utility pages share one nav (Settings, Favorites, History, Downloads, in that order) and wear the `sunrise-*` palette (F15)." Add to its **Acceptance** line: "; utility pages wear the Sunrise palette."

- [ ] **Step 4: After captures, README, design QA**

Run: `node test/desktop/surface-captures.mjs --out docs/design-reviews/non-island-polish/a1/after`

Write `docs/design-reviews/non-island-polish/a1/README.md`: one table row per sheet linking `before/…-light-1280x800-01.png` and `after/…`, plus one dark row and one 640×480 row, each with a one-line review point (use #431's `docs/design-reviews/desktop-surface-polish/README.md` as the format).

Append to `design-qa.md`:

```markdown
# Non-island polish A1 design QA — <date>

**Final result:** <passed | open findings>

## Scope
Utility sheets in light and dark at 1280×800 and 640×480; captures in
`docs/design-reviews/non-island-polish/a1/`.

## Findings
<each remaining P0–P2 finding, or "No remaining P0, P1, or P2 findings.">

## Verification
<commands and counts from Task 10>
```

Fill the placeholders from the actual run, then commit:

```bash
git add docs/brand-usage.md CLAUDE.md AGENTS.md spec/features.md design-qa.md docs/design-reviews/non-island-polish/a1
git commit -m "Record the Sunrise surfaces rule and A1 design review"
```

---

### Task 10: Verify, show the owner, open the PR

- [ ] **Step 1: Full local gate**

```bash
npm run test:unit
npm run lint
npm run substrate:check
npm run test:acceptance:desktop
```

Expected: unit, lint and substrate pass. Acceptance: all pass. If `@F33-2` or `@F38-3` fail, rerun the same `--tags` against a throwaway worktree of `origin/main`; they failed there too on 2026-09-26 on the owner's Mac. Report them as pre-existing only if they fail identically on `main`.

- [ ] **Step 2: Render proof to the owner**

Send the owner, via `SendUserFile`: Settings light and dark (1280×800), Favorites light, Downloads dark, Settings at 640×480, and a before/after pair for one sheet. State plainly what changed and anything that looked off. **Wait for an explicit yes.** Changes they ask for are made, re-captured and re-sent before pushing.

- [ ] **Step 3: Push, open the PR, start the platform build**

```bash
git push -u origin claude/non-island-polish-a1
gh pr create --base main --title "Warm the utility sheets and fix their nav and scrolling (A1)" --body-file <prepared body>
gh workflow run release-windows-linux.yml --ref claude/non-island-polish-a1 -f mode=validation -f platform=all
```

The PR body lists: what changed (tokens, warm sheets, scrim, one nav, one width, two bug fixes, hairline focus), the owner decisions it implements (D1, D3), tests added, verification counts, and the platform gate. Bind the PR with the `ccd_pr` tools and offer Auto-fix.

---

## Later PRs (planned at each boundary, not here)

- **A2 — sheet flows:** Settings section grammar and Privacy split, History day groups and icons (needs `pages:history:list` to return cached icons), Favorites icons, Downloads fixed columns (spec finding 7), Shortcuts keycaps, Bring Your Tabs empty state.
- **B — small views:** permission prompt, error page, 1Password capsule, screen-share picker on the Sunrise palette; D1 hairline for those chrome surfaces.
- **C — frame:** Glance eyebrow in Inter, rail and Glance state parity, Windows/Linux controls audited on a validation build. D1 there also updates `vertical-tabs.steps.js:1662`, which currently requires a 2px ring.

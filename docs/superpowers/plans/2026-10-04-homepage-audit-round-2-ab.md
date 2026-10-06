# Homepage audit round 2, milestone A+B — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give phone visitors a working "Send to my computer" path and land the seven small fixes from the Oct 4 audit.

**Architecture:** A new injected-globals module (`handheld-download.js`) enhances links marked with `data-handheld-share` on phones and tablets. It is loaded by `home.js` on the homepage and by a module `<script>` on `/download`. `site.js` stays a classic script (its test runs it in a VM, so it cannot `import`); the Windows/Linux label change goes inline there. The rest is markup, CSS, ledger and doc edits.

**Tech Stack:** Astro 7 site (`site/`), plain ES modules, `node --test` unit tests with hand-built DOM fakes, claims ledgers in `docs/*.json`.

**Spec:** `docs/superpowers/specs/2026-10-04-homepage-audit-round-2-design.md` §5 (A and B), §4 (delivery).

## Global Constraints

- Branch: `claude/homepage-audit-round-2`, worktree `.claude/worktrees/homepage-audit-round-2`, stacked on `claude/homepage-audit-fixes` (#513). Open the PR with base `claude/homepage-audit-fixes`; after #513 squash-merges, merge `main` into this branch (never rebase or force-push) and retarget to `main` if GitHub has not already.
- Phone or tablet = user agent matches `Android|iPhone|iPad|iPod`, **or** contains `Macintosh` with `navigator.maxTouchPoints > 1`.
- Share URL: `https://blancbrowser.com/download`. Button label: `Send to my computer`. Note: `Blanc is a desktop browser for macOS, Windows and Linux.` Copy confirmation: `Link copied`.
- The consent-gated `download_click` event must not fire on the share path. No new analytics events.
- Without JavaScript every changed link still works as a plain link.
- Desktop download behaviour (`os` in `site.js`) is unchanged except the B2 label.
- Every new visible string gets a claims-ledger entry in the same commit (`docs/website-revamp-claims-v1.27.json`, `verdict: "qualified"`, non-empty `evidenceGroups`).
- Use CSS, not inline `style` attributes.
- Keep the homepage background gradient: warm at the top to white at the bottom, vertically (`home-appearance.css:60`, light `#f8f2e8` → `#fff`; the dark counterpart at line 71 is unchanged too). New sections and notes sit on it with transparent backgrounds; nothing in A+B adds an opaque full-width band over it. Owner requirement, 2026-10-04.
- New visual choices (A note styling, B1 pill, B3 links) are shown to the owner as real-site captures and approved **before push**.
- Run the dev site from this worktree only: stop any other `site` preview first (Astro allows one dev server per project).
- Verification test set (115+ checks at #513): `node --test test/unit/site-*.test.js test/unit/website-*.test.js test/unit/public-truth.test.js test/unit/patron-checkout-cta.test.js`.

---

### Task 0: Worktree setup

**Files:** none.

- [ ] **Step 1: Install dependencies** (a fresh worktree needs real installs, never symlinked `node_modules`)

Run: `npm ci && npm ci --prefix site`
Expected: both finish with `added … packages`.

- [ ] **Step 2: Baseline the test set**

Run: `node --test test/unit/site-*.test.js test/unit/website-*.test.js test/unit/public-truth.test.js test/unit/patron-checkout-cta.test.js 2>&1 | grep -E "^# (tests|pass|fail)"`
Expected: `# fail 0` (119 tests at `3a682ded`).

- [ ] **Step 3: Move the dev server here.** Stop the `site` preview that serves `.claude/worktrees/homepage-audit-fixes`, then start the `site` launch config from this worktree. Expected: `http://localhost:4321/` loads.

---

### Task 1: Phone and tablet download module

**Files:**
- Create: `site/src/scripts/handheld-download.js`
- Test: `test/unit/website-handheld-download.test.js`

**Interfaces:**
- Produces: `isHandheld(nav) → boolean`; `initHandheldDownload({ document, view }) → boolean` (true when it enhanced the page). Markup contract used by Task 2:
  - `a[data-handheld-share="<status-id>"]` with `data-handheld-label` (new link text) and `data-handheld-text` (share text). `href` stays `/download`.
  - `[data-handheld-note]` elements start `hidden` and are revealed on phones.
  - `#<status-id>` is a `role="status"` element that receives `Link copied`.

- [ ] **Step 1: Write the failing test**

```js
// test/unit/website-handheld-download.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const load = () => import(pathToFileURL(path.resolve(__dirname, '../../site/src/scripts/handheld-download.js')));
const settle = () => new Promise(resolve => setImmediate(resolve));

function fixture({ userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', maxTouchPoints = 5, share, clipboard } = {}) {
  const status = { textContent: '' };
  const note = { hidden: true };
  const link = {
    href: 'https://blancbrowser.com/download', textContent: 'Download Blanc', events: {},
    dataset: { handheldShare: 'share-status', handheldLabel: 'Send to my computer', handheldText: 'Blanc is a desktop browser for macOS, Windows and Linux.', track: 'download_click' },
    addEventListener(type, handler) { this.events[type] = handler; },
  };
  const calls = { share: [], copy: [], assign: [] };
  const document = {
    querySelectorAll: selector => selector === 'a[data-handheld-share]' ? [link] : selector === '[data-handheld-note]' ? [note] : [],
    getElementById: id => (id === 'share-status' ? status : null),
  };
  const navigator = { userAgent, maxTouchPoints };
  if (share) navigator.share = async data => { calls.share.push(data); return share(data); };
  navigator.clipboard = { writeText: async text => { calls.copy.push(text); if (clipboard === 'fail') throw new Error('denied'); } };
  const view = { navigator, location: { assign: url => calls.assign.push(url) } };
  let prevented = 0;
  const click = async () => { await link.events.click({ preventDefault() { prevented++; } }); await settle(); };
  return { document, view, link, note, status, calls, click, prevented: () => prevented };
}

test('phones and tablets are recognised, including iPadOS with a desktop user agent', async () => {
  const { isHandheld } = await load();
  const cases = [
    [{ userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 9)', maxTouchPoints: 5 }, true],
    [{ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', maxTouchPoints: 5 }, true],
    [{ userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)', maxTouchPoints: 5 }, true],
    [{ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', maxTouchPoints: 5 }, true],
    [{ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', maxTouchPoints: 0 }, false],
    [{ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', maxTouchPoints: 10 }, false],
    [{ userAgent: 'Mozilla/5.0 (X11; Linux x86_64)', maxTouchPoints: 0 }, false],
    [{}, false],
  ];
  for (const [nav, expected] of cases) assert.equal(isHandheld(nav), expected, JSON.stringify(nav));
});

test('desktop pages are left exactly as they are', async () => {
  const { initHandheldDownload } = await load();
  const f = fixture({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', maxTouchPoints: 0 });
  assert.equal(initHandheldDownload(f), false);
  assert.equal(f.link.textContent, 'Download Blanc');
  assert.equal(f.link.dataset.track, 'download_click');
  assert.equal(f.link.events.click, undefined);
  assert.equal(f.note.hidden, true);
});

test('on a phone the link offers the share sheet and is not counted as a download', async () => {
  const { initHandheldDownload } = await load();
  const f = fixture({ share: () => undefined });
  assert.equal(initHandheldDownload(f), true);
  assert.equal(f.link.textContent, 'Send to my computer');
  assert.equal(f.link.dataset.track, undefined);
  assert.equal(f.note.hidden, false);
  await f.click();
  assert.equal(f.prevented(), 1);
  assert.deepEqual(f.calls.share, [{ title: 'Blanc Browser', text: 'Blanc is a desktop browser for macOS, Windows and Linux.', url: 'https://blancbrowser.com/download' }]);
  assert.deepEqual(f.calls.copy, []);
  assert.deepEqual(f.calls.assign, []);
});

test('cancelling the share sheet does nothing else', async () => {
  const { initHandheldDownload } = await load();
  const f = fixture({ share: () => { throw Object.assign(new Error('cancelled'), { name: 'AbortError' }); } });
  initHandheldDownload(f);
  await f.click();
  assert.deepEqual(f.calls.copy, []);
  assert.deepEqual(f.calls.assign, []);
  assert.equal(f.status.textContent, '');
});

test('a failed or missing share sheet copies the link and says so', async () => {
  const { initHandheldDownload } = await load();
  for (const share of [() => { throw new Error('not allowed'); }, undefined]) {
    const f = fixture({ share });
    initHandheldDownload(f);
    await f.click();
    assert.deepEqual(f.calls.copy, ['https://blancbrowser.com/download']);
    assert.equal(f.status.textContent, 'Link copied');
    assert.deepEqual(f.calls.assign, []);
  }
});

test('when copying also fails the visitor still reaches the download page', async () => {
  const { initHandheldDownload } = await load();
  const f = fixture({ clipboard: 'fail' });
  initHandheldDownload(f);
  await f.click();
  assert.deepEqual(f.calls.assign, ['https://blancbrowser.com/download']);
  assert.equal(f.status.textContent, '');
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test test/unit/website-handheld-download.test.js`
Expected: FAIL — `Cannot find module …/handheld-download.js`.

- [ ] **Step 3: Write the module**

```js
// site/src/scripts/handheld-download.js
// Blanc is desktop-only, so on a phone or tablet the download link sends the
// download page onward (share sheet, then clipboard) instead of opening it.
const DOWNLOAD_URL = 'https://blancbrowser.com/download';

export function isHandheld(nav) {
  const ua = String(nav?.userAgent || '');
  if (/Android|iPhone|iPad|iPod/i.test(ua)) return true;
  // iPadOS requests desktop sites with a Mac user agent; touch support gives it away.
  return /Macintosh/i.test(ua) && Number(nav?.maxTouchPoints) > 1;
}

export function initHandheldDownload({ document = window.document, view = window } = {}) {
  if (!isHandheld(view.navigator)) return false;
  document.querySelectorAll('[data-handheld-note]').forEach(note => { note.hidden = false; });
  document.querySelectorAll('a[data-handheld-share]').forEach(link => {
    const status = document.getElementById(link.dataset.handheldShare);
    link.textContent = link.dataset.handheldLabel;
    // Nothing is downloaded on this path, so it must not count as a download.
    delete link.dataset.track;
    link.addEventListener('click', async event => {
      event.preventDefault();
      if (typeof view.navigator.share === 'function') {
        try {
          await view.navigator.share({ title: 'Blanc Browser', text: link.dataset.handheldText, url: DOWNLOAD_URL });
          return;
        } catch (error) {
          if (error?.name === 'AbortError') return;
        }
      }
      try {
        await view.navigator.clipboard.writeText(DOWNLOAD_URL);
        if (status) status.textContent = 'Link copied';
      } catch {
        view.location.assign(link.href);
      }
    });
  });
  return true;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/unit/website-handheld-download.test.js`
Expected: `# pass 6`, `# fail 0`.

- [ ] **Step 5: Positive control.** Temporarily change `if (error?.name === 'AbortError') return;` to `return;` and rerun; expected: the "failed or missing share sheet" test fails. Restore the line and rerun to green.

- [ ] **Step 6: Commit**

```bash
git add site/src/scripts/handheld-download.js test/unit/website-handheld-download.test.js
git commit -m "Add the phone and tablet download module"
```

---

### Task 2: Wire the module into the homepage and /download

**Files:**
- Modify: `site/src/pages/index.astro:93-98` (hero actions)
- Modify: `site/src/pages/download.astro:26-30` (after the download hero)
- Modify: `site/src/scripts/home.js:1-5` (import) and its init block near line 391
- Modify: `site/src/styles/home.css` (append), `site/src/styles/site.css` (append, download page)
- Modify: `docs/website-revamp-claims-v1.27.json`
- Test: `test/unit/website-handheld-download.test.js` (markup contract test)

**Interfaces:**
- Consumes: `initHandheldDownload` and the markup contract from Task 1.

- [ ] **Step 1: Write the failing markup-contract test** (append to `website-handheld-download.test.js`)

```js
const fs = require('node:fs');
const read = file => fs.readFileSync(path.resolve(__dirname, '../..', file), 'utf8');

test('the homepage hero and /download carry the phone markup and load the module', () => {
  const home = read('site/src/pages/index.astro');
  const hero = home.match(/<a class="planned-action"[^>]*data-cta-position="hero"[^>]*>/)[0];
  assert.match(hero, /href="\/download"/);
  assert.match(hero, /data-handheld-share="hero-share-status"/);
  assert.match(hero, /data-handheld-label="Send to my computer"/);
  assert.match(home, /<p class="handheld-note" data-handheld-note hidden>/);
  assert.match(home, /id="hero-share-status" role="status"/);
  assert.match(read('site/src/scripts/home.js'), /import \{ initHandheldDownload \} from "\.\/handheld-download\.js"/);
  assert.match(read('site/src/scripts/home.js'), /initHandheldDownload\(\);/);

  const download = read('site/src/pages/download.astro');
  assert.match(download, /<aside class="download-handheld" data-handheld-note hidden/);
  assert.match(download, /data-handheld-share="download-share-status"/);
  assert.match(download, /id="download-share-status" role="status"/);
  assert.match(download, /import \{ initHandheldDownload \} from '\.\.\/scripts\/handheld-download\.js';/);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test test/unit/website-handheld-download.test.js`
Expected: the new test FAILS on the first `data-handheld-share` match.

- [ ] **Step 3: Homepage hero markup.** Replace the hero actions block in `index.astro` (lines 93–98) with:

```astro
          </p><div class="actions">
            <a class="planned-action" href="/download" data-download-cta data-track="download_click" data-cta-position="hero" data-handheld-share="hero-share-status" data-handheld-label="Send to my computer" data-handheld-text="Blanc is a desktop browser for macOS, Windows and Linux.">Download Blanc</a><a
              class="planned-link"
              href="#island">See the Island in action</a>
          </div><p class="handheld-note" data-handheld-note hidden>
            Blanc is a desktop browser for macOS, Windows and Linux.
            <span id="hero-share-status" role="status" aria-live="polite"></span>
          </p><p class="hero-offer">
```

- [ ] **Step 4: Homepage loader.** In `site/src/scripts/home.js`, add after line 5:

```js
import { initHandheldDownload } from "./handheld-download.js";
```

and add `initHandheldDownload();` on the line before `initHomeAppearance({ onChange: …` (currently line 391).

- [ ] **Step 5: /download notice.** In `download.astro`, insert after the closing `</section>` of `.download-hero` (line 30):

```astro
  <aside class="download-handheld" data-handheld-note hidden aria-labelledby="handheld-title">
    <h2 id="handheld-title">On a phone or tablet?</h2>
    <p>Blanc is a desktop browser for macOS, Windows and Linux.</p>
    <a class="download-handheld-action" href="/download" data-handheld-share="download-share-status" data-handheld-label="Send to my computer" data-handheld-text="Blanc is a desktop browser for macOS, Windows and Linux.">Send to my computer</a>
    <p id="download-share-status" role="status" aria-live="polite"></p>
  </aside>
```

and before `</BaseLayout>` at the end of the file:

```astro
<script>
  import { initHandheldDownload } from '../scripts/handheld-download.js';
  initHandheldDownload();
</script>
```

- [ ] **Step 6: Styles.** Append to `site/src/styles/home.css`:

```css
/* Shown only on phones and tablets by handheld-download.js. */
.home-revamp .handheld-note {
  margin-top: 14px;
  font-size: 13px;
  color: var(--dim);
}
.home-revamp .handheld-note [role="status"]:not(:empty) {
  display: block;
  margin-top: 6px;
  color: var(--ink);
  font-weight: 500;
}
```

Append to `site/src/styles/site.css` (find the `.download-hero` rules and place it after them; use the page's existing tokens):

```css
.download-handheld {
  max-width: 560px;
  margin: 0 auto 32px;
  padding: 24px;
  border: 1px solid var(--site-line, #d8d2c8);
  border-radius: 20px;
  text-align: center;
}
.download-handheld[hidden] { display: none; }
.download-handheld h2 { font-size: 24px; }
.download-handheld p { margin-top: 8px; }
.download-handheld-action {
  display: inline-flex;
  align-items: center;
  min-height: 48px;
  margin-top: 16px;
  padding: 0 24px;
  border-radius: 999px;
  background: var(--ink);
  color: var(--paper);
  text-decoration: none;
}
.download-handheld [role="status"]:empty { display: none; }
```

Before writing, check that `--site-line`, `--ink` and `--paper` exist in `site.css` (`grep -n -- "--ink:\|--paper:\|--site-line" site/src/styles/site.css`) and substitute the real token names if they differ.

- [ ] **Step 7: Ledger entries.** Add to `claims` in `docs/website-revamp-claims-v1.27.json` (script edit, keep 2-space JSON + trailing newline):

| id | source | exactWording | evidenceGroups |
|---|---|---|---|
| `handheld-home-label` | `site/src/pages/index.astro` | `Send to my computer` | `releaseAuthentication` |
| `handheld-home-note` | `site/src/pages/index.astro` | `Blanc is a desktop browser for macOS, Windows and Linux.` | `navigation`, `releaseAuthentication` |
| `handheld-download-heading` | `site/src/pages/download.astro` | `On a phone or tablet?` | `releaseAuthentication` |
| `handheld-download-note` | `site/src/pages/download.astro` | `Blanc is a desktop browser for macOS, Windows and Linux.` | `navigation`, `releaseAuthentication` |
| `handheld-copied` | `site/src/scripts/handheld-download.js` | `Link copied` | `releaseAuthentication` |

Each with `"subject": "Blanc"` and `"verdict": "qualified"`.

- [ ] **Step 8: Run the tests**

Run: the verification test set from Global Constraints.
Expected: `# fail 0`.

- [ ] **Step 9: Check it in the browser.** With the dev server from this worktree, set the Browser pane to `mobile` (375×812, Android UA) and reload `/`. In the page, run JavaScript to confirm: the hero link reads `Send to my computer`, has no `data-track`, and the note is visible. Then delete `navigator.share` (`Object.defineProperty(navigator, 'share', { value: undefined })`), click the link, and confirm the status reads `Link copied` and the URL did not change. Repeat on `/download`. Reset to `desktop` and confirm the hero reads `Download Blanc` and both notes are hidden.

- [ ] **Step 10: Commit**

```bash
git add site/src/pages/index.astro site/src/pages/download.astro site/src/scripts/home.js site/src/styles/home.css site/src/styles/site.css docs/website-revamp-claims-v1.27.json test/unit/website-handheld-download.test.js
git commit -m "Send phone visitors' download link to their computer"
```

---

### Task 3 (B2): Say "Download for Windows/Linux" when the hero downloads directly

**Files:**
- Modify: `site/src/scripts/site.js:136-141`
- Modify: `test/unit/site-attribution-consent.test.js` (harness options + new test)
- Modify: `docs/website-revamp-claims-v1.27.json`

- [ ] **Step 1: Extend the harness.** In `page()` add an option `userAgent = 'Macintosh'` and a `ctas` fixture; use them:

```js
function page(choice, { unavailable = false, writeFails = false, href = 'https://blancbrowser.com/download?oppref=offline-fixture', userAgent = 'Macintosh' } = {}) {
```

```js
  const ctas = [{ href: 'https://blancbrowser.com/download', textContent: 'Download Blanc', dataset: { track: 'download_click', ctaPosition: 'hero' }, closest() { return this; } }];
```

In `querySelectorAll`, return `ctas` for `'[data-download-cta]'` before the existing checks:

```js
    querySelectorAll(selector) {
      if (selector === '[data-download-cta]') return ctas;
      return selector.includes('data-download-link') ? links : selector === '[data-consent-open]' ? [choiceButton] : [];
    },
```

Pass `navigator: { userAgent }` into the context, and add `ctas` to the returned object.

- [ ] **Step 2: Write the failing test**

```js
test('the hero names the platform only when it downloads directly', () => {
  assert.equal(page(null, { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }).ctas[0].textContent, 'Download for Windows');
  assert.equal(page(null, { userAgent: 'Mozilla/5.0 (X11; Linux x86_64)' }).ctas[0].textContent, 'Download for Linux');
  const mac = page(null, { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' }).ctas[0];
  assert.equal(mac.textContent, 'Download Blanc');
  assert.equal(new URL(mac.href).pathname, '/download');
  const phone = page(null, { userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 9)' }).ctas[0];
  assert.equal(phone.textContent, 'Download Blanc');
  assert.equal(new URL(phone.href).pathname, '/download');
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `node --test test/unit/site-attribution-consent.test.js`
Expected: the new test FAILS (`'Download Blanc' !== 'Download for Windows'`); the existing tests still pass.

- [ ] **Step 4: Implement.** In `site.js`, replace the CTA loop (lines 136–141) with:

```js
  if (os && os !== 'mac') {
    const label = os === 'win' ? 'Download for Windows' : 'Download for Linux';
    ctas.forEach((cta) => {
      cta.href = '/dl/' + os;
      cta.dataset.platform = os;
      // This link now downloads the installer directly, so say which one.
      cta.textContent = label;
    });
  }
```

- [ ] **Step 5: Run the tests**

Run: `node --test test/unit/site-attribution-consent.test.js`
Expected: `# fail 0`.

- [ ] **Step 6: Ledger.** Add `b2-download-windows` (`Download for Windows`) and `b2-download-linux` (`Download for Linux`), source `site/src/scripts/site.js`, `evidenceGroups: ["releaseAuthentication"]`, `subject: "Blanc"`, `verdict: "qualified"`. Run the verification test set; expected `# fail 0`.

- [ ] **Step 7: Commit**

```bash
git add site/src/scripts/site.js test/unit/site-attribution-consent.test.js docs/website-revamp-claims-v1.27.json
git commit -m "Name the platform when the hero downloads directly"
```

---

### Task 4 (B1): Header "Download" as a pill on desktop

**Files:**
- Modify: `site/src/styles/revamp.css:201-215` and the `@media (max-width: 760px)` block (~line 387)
- Modify: `site/src/styles/home-appearance.css:139-142`

- [ ] **Step 1: Desktop pill.** In `revamp.css`, after the shared `.revamp-nav .revamp-nav-link, .revamp-nav .site-nav-cta { … }` rule, add:

```css
/* The one action in the bar reads as a button at every width. */
.revamp-nav .site-nav-cta {
  min-height: 32px;
  padding: 0 14px;
  border-radius: 18px;
  background: var(--ink);
  color: var(--paper);
}
.revamp-nav .site-nav-cta:hover {
  color: var(--paper);
  background: #000;
}
```

Then delete the now-duplicate `min-height`, `padding`, `border-radius`, `background` and `color` lines from `.revamp-nav .site-nav-cta` inside the 760px media block (keep anything else in it).

- [ ] **Step 2: Dark mode at every width.** In `home-appearance.css`, move the two `.site-nav-cta` dark rules out of the `@media (max-width: 760px)` wrapper so they apply at all widths, and delete the empty media block:

```css
html[data-home-appearance="dark"] .revamp-nav .site-nav-cta,
html[data-home-appearance="dark"] .revamp-nav .site-nav-cta:hover { color: var(--home-on-selected); }
```

Check the pill's dark background: in the browser, confirm `getComputedStyle(document.querySelector('.site-nav-cta')).backgroundColor` in dark mode is the light "selected" colour the 760px rule already relied on. If it is still ink, add `background: var(--home-selected);` to the dark rule.

- [ ] **Step 3: Check layout.** At 1440, 1024, 768, 761, 390 and 320px, light and dark, on `/` and `/download`: the header must not wrap (Download and the toggle on one row), no horizontal overflow, and the pill's text contrast ≥ 4.5:1 (compute from `getComputedStyle` colours).

- [ ] **Step 4: Run the verification test set.** Expected: `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add site/src/styles/revamp.css site/src/styles/home-appearance.css
git commit -m "Show the header Download as a button on desktop"
```

---

### Task 5 (B3): Closing platform labels become links

**Files:**
- Modify: `site/src/pages/index.astro:626-628`
- Modify: `site/src/styles/home.css` (`.home-revamp .platforms span` rules, ~line 533)

- [ ] **Step 1: Markup.** Replace the three `<span>` items with links (keep the `aria-label` on the container):

```astro
            <a href="/download#download-options"><PlatformLogo platform="apple" />macOS</a><a
              href="/download#dl-win"><PlatformLogo platform="windows" />Windows</a
            ><a href="/download#dl-linux"><PlatformLogo platform="linux" />Linux</a>
```

- [ ] **Step 2: Styles.** Change the selector `.home-revamp .platforms span` to `.home-revamp .platforms a` and add:

```css
.home-revamp .platforms a {
  min-height: 24px;
  color: inherit;
  text-decoration: none;
}
.home-revamp .platforms a:hover,
.home-revamp .platforms a:focus-visible {
  text-decoration: underline;
  text-underline-offset: 3px;
}
```

- [ ] **Step 3: Check.** Each link resolves to an existing id on `/download` (`download-options`, `dl-win`, `dl-linux`); keyboard Tab reaches all three; the row still wraps cleanly at 320px.

- [ ] **Step 4: Run the verification test set and commit**

```bash
git add site/src/pages/index.astro site/src/styles/home.css
git commit -m "Link the closing platform labels to their downloads"
```

---

### Task 6 (B4, B6, B7): Theme colour, dead script, header doc

**Files:**
- Modify: `site/src/layouts/BaseLayout.astro:37`
- Delete: `site/src/scripts/hero-wallpaper.js`
- Modify: `site/CLAUDE.md` (first paragraph, "island (index: the masthead starts transparent over the hero and raises on scroll, rich OG)")
- Test: `test/unit/website-home-appearance.test.js`

- [ ] **Step 1: Write the failing test** (append to `website-home-appearance.test.js`)

```js
test('the served theme colour matches the light header before any script runs', () => {
  const fs = require('node:fs');
  const layout = fs.readFileSync(path.resolve(__dirname, '../../site/src/layouts/BaseLayout.astro'), 'utf8');
  assert.match(layout, /<meta name="theme-color" content="#ffffff">/);
});

test('the homepage background stays a vertical warm-to-white gradient', () => {
  const fs = require('node:fs');
  const css = fs.readFileSync(path.resolve(__dirname, '../../site/src/styles/home-appearance.css'), 'utf8');
  const light = css.match(/html\[data-home-appearance\] \.home-revamp \{[^}]*?background: (linear-gradient\([^;]+\));/)[1];
  assert.match(light, /^linear-gradient\(to bottom, #f8f2e8 0%/);
  assert.match(light, /#fff 100%\)$/);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test test/unit/website-home-appearance.test.js`
Expected: the theme-colour test FAILS (layout still has `#F8F2E8`); the gradient guard PASSES already (it protects existing behaviour). Positive control for the guard: temporarily change `to bottom` to `to right` in `home-appearance.css:60`, confirm the guard fails, and restore.

- [ ] **Step 3: Fix.** In `BaseLayout.astro` change `<meta name="theme-color" content="#F8F2E8">` to `<meta name="theme-color" content="#ffffff">`. (Every page profile has the white header — `.site-header .revamp-nav { background: #fff; }` in `revamp.css` — and only the homepage has a dark mode, which the prepaint script already handles.)

- [ ] **Step 4: Delete the unused script.** Confirm nothing imports it, then delete:

Run: `grep -rn "hero-wallpaper\.js\|scripts/hero-wallpaper" site/src test || echo unused`
Expected: `unused`. Then `git rm site/src/scripts/hero-wallpaper.js`.

- [ ] **Step 5: Header doc.** In `site/CLAUDE.md`, replace `island (index: the masthead starts transparent over the hero and raises on scroll, rich OG)` with `island (index: the masthead is solid from the start and hides on scroll down, rich OG)`. Verify the scroll behaviour first in the browser (scroll down, check `.site-header` gains `is-scroll-hidden`); if it differs, describe what it actually does.

- [ ] **Step 6: Run the verification test set and the site build**

Run: the verification test set, then `npm run site:build 2>&1 | grep -E "error|Complete!|SEO verification"`.
Expected: `# fail 0`; `Complete!`; `SEO verification passed`.

- [ ] **Step 7: Commit**

```bash
git add site/src/layouts/BaseLayout.astro site/CLAUDE.md test/unit/website-home-appearance.test.js
git commit -m "Match the theme colour to the header and drop an unused script"
```

---

### Task 7 (B5): 24px targets for standalone links

**Files:**
- Modify: `site/src/styles/revamp.css` (`.website-footer a`, ~line 27 and ~260)
- Modify: `site/src/styles/home.css` (`.trust-summary a`, `.closing-links a`, `.trust-links a`, `.frame-link`)

- [ ] **Step 1: Measure first.** On `/` and `/download` at 1440 and 390px, run in the page:

```js
[...document.querySelectorAll('a')].filter(a => {
  const r = a.getBoundingClientRect();
  const inText = a.closest('p, li') && a.parentElement.childNodes.length > 1 && [...a.parentElement.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
  return r.width && r.height < 24 && !inText;
}).map(a => `${a.textContent.trim().slice(0, 30)} ${Math.round(a.getBoundingClientRect().height)}px ${a.className}`)
```

Record the list; it is the target set (links inside running text are exempt under WCAG 2.5.8).

- [ ] **Step 2: Fix.** For each selector that owns a listed link, add:

```css
  display: inline-flex;
  align-items: center;
  min-height: 24px;
```

Start with `.website-footer a`, `.home-revamp .trust-summary a`, `.home-revamp .closing-links a` and `.home-revamp .trust-links a`; extend to anything else the measurement listed.

- [ ] **Step 3: Re-measure.** Expected: the Step 1 snippet returns `[]` on both pages at both widths; no layout shifts beyond the taller rows (compare page height before/after; footer rows may grow a few px).

- [ ] **Step 4: Run the verification test set and commit**

```bash
git add site/src/styles/revamp.css site/src/styles/home.css
git commit -m "Give standalone links a 24px target"
```

---

### Task 8: Owner capture approval, review note, finish

**Files:**
- Modify: `docs/website-revamp-review.md` (append a dated section)

- [ ] **Step 1: Full checks.** `npm run test:unit` (expect `# fail 0`), `npm run lint`, `npm run substrate:check` (exit 0), `npm run site:build` (Complete + SEO passed).

- [ ] **Step 2: Layout sweep.** At 1440, 1024, 768, 761, 390, 380, 360, 340 and 320px, light and dark on `/`, and 1440/390 on `/download`: no horizontal overflow, header on one row, the toggle beside Download. On `/`, confirm `getComputedStyle(document.querySelector('.home-revamp')).backgroundImage` still starts `linear-gradient(rgb(248, 242, 232) 0%` and ends `rgb(255, 255, 255) 100%)` in light mode, and that a full-page capture visibly runs warm at the top to white at the bottom.

- [ ] **Step 3: Captures for the owner** (Playwright, saved under gitignored `output/`, copied to the scratchpad, then `output/` deleted):
  - 1440 light and dark: header with the Download pill.
  - 390 mobile-emulated: hero with `Send to my computer` and the note; the `Link copied` state.
  - 390 mobile-emulated: `/download` notice.
  - 1440: closing block with linked platform labels.
  Send them and **wait for an explicit yes** before pushing.

- [ ] **Step 4: Review note.** Append `## Phones and small fixes (October 4)` to `docs/website-revamp-review.md`: what changed, the phone detection rule (including iPadOS), that the share path is not counted as a download, the B fixes, and the verification results with real numbers. Commit with the other docs.

- [ ] **Step 5: Before committing code, run `/verify` and `/simplify`** (owner rule). Then re-check `git branch --show-current` is `claude/homepage-audit-round-2` and read `git log --oneline -3` after the commit.

- [ ] **Step 6: Push and open the PR** after the owner's capture approval:

```bash
git fetch origin
git push -u origin claude/homepage-audit-round-2
gh pr create --repo bnfy/blanc --base claude/homepage-audit-fixes --head claude/homepage-audit-round-2 --title "Homepage audit round 2: phone visitors and small fixes" --body-file <scratchpad>/pr-body.md
```

The PR body states it is stacked on #513, lists the spec and plan, the checks run, and that merging does not deploy. Bind it with the PR tools.

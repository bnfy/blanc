# Blubird in the Desktop App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Start Page, onboarding and internal utility pages use Blubird (Display for 32px+ headlines, Text for smaller headings and copy). The font files never enter git, and no public release can ship without them.

**Architecture:** The four licensed WOFF2 files sit git-ignored and flat in `src/renderer/pages/`, pinned by SHA-256 in a committed `fonts/blubird/pinned.json`. A single tool, `scripts/blubird-fonts.js`, installs them (from the zip locally, from 1Password in `release.sh`, from base64 Actions secrets in CI) and verifies them in a checkout or inside a packaged `app.asar`. `pages.css` gains `--font-text` and repoints `--font-display`. The chrome's `styles.css`, Mahjong and uBO keep Inter.

**Tech Stack:** Electron 44, plain CSS custom properties, Node built-ins (`node:test`, `crypto`, `child_process`), `@electron/asar`, Cucumber + Playwright acceptance, GitHub Actions, 1Password CLI.

**Spec:** `docs/superpowers/specs/2026-10-15-blubird-app-typography-design.md`

## Merge gate (read first)

Work on branch `claude/blanc-browser-font-replacement-485da8`. **Do not merge, and do not run Task 7's secret and 1Password steps, until Rajesh Rajput's written app license has arrived and the owner confirms its scope.** Until then the branch can be built and reviewed on the owner's Mac with the Blubird files the owner already holds (`~/Downloads/Blubird.zip`). That is local use with nothing redistributed. Task 6's `docs/brand-usage.md` edits build on #836's Blubird section, so rebase onto `main` after #836 merges and before Task 6.

## Global Constraints

- The licensed files are exactly these, taken unmodified from `Blubird/Web-PS/` in the zip:
  - `Blubird-RegularDisplay.woff2`: 20976 bytes, `4f78df47701588c3a30dba18df7beb297410e330f33a3ba42668eb25620c5571`
  - `Blubird-RegularText.woff2`: 20988 bytes, `5a1e5e1f5b26455f3cb71972cdfddbfd649201252c86991fbe7fd27329cad4b9`
  - `Blubird-MediumText.woff2`: 21456 bytes, `0d738eb8374fdc67f8fcd9e05d681ddb7f5ee89d08e61eb85e291dd7d3437966`
  - `Blubird-SemiBoldText.woff2`: 21572 bytes, `20abf16c70f54283bea269f7c966f189446d5a648c65a1d7d906b961ad982ea8`
- Never `git add` a Blubird font file. Never convert, subset or rename the font data.
- CSS family names match #836: `"Blubird Display"` (400) and `"Blubird Text"` (400, 500, and 600–700 from the SemiBold file).
- Every Blubird stack falls back to the Inter stack: `"Inter", -apple-system, "Segoe UI Variable", "Segoe UI", system-ui, sans-serif`.
- Display cut only at 32px and up. Smaller headings use Blubird Text. Blubird is set at 0 letter-spacing: remove the Newsreader-tuned negative tracking and `font-optical-sizing` from the converted heading rules.
- Inter stays for:
  - `src/renderer/styles.css` (Island, overlay, permission prompt, fill capsule), `mahjong.css`, and the uBO popup and dashboard;
  - rules that set `tabular-nums` (Blubird has no `tnum`) and `kbd` (Blubird lacks ⌘ ⌥ ⇧ ⌃ and arrows).
- Pages that change: Start Page with onboarding, the five utility sheets, the error page, Tab import and Tab handoff (spec review point 2, accepted).
- `pages.js` serves only flat files from `src/renderer/pages/`; no subfolders.
- Public releases fail closed without the exact pinned files. Contributor, fork and CI test builds fall back to Inter with a warning.
- Copy: user-visible strings are unchanged. Docs say "Blubird", "Display cut" and "Text cut".

## Review Focus

1. **A build without the fonts** (contributor, fork, CI acceptance). Pages must render fully in Inter with no layout failure. Task 3's acceptance assertions are font-agnostic and run in CI without the fonts. Task 2's unit test pins every Blubird stack to end in the Inter stack.
2. **A partial install** (one secret unset, one file deleted). Dev builds warn and name the missing file; release builds fail. Covered by Task 1's `--require` exit-code tests and Task 5's workflow wiring test.
3. **A different or corrupted file** (a future Blubird update, a truncated secret). The check must fail even without `--require`, and installing must write nothing. Covered by Task 1's mismatch tests.
4. **Long translated strings** (de, fr, it) in a font with different widths. Sheet controls must not truncate or overflow. Covered by Task 8 Step 3 (i18n desktop run and sheet crops with the fonts installed).
5. **Characters Blubird lacks** (⌘ ⌥ ⇧ ⌃, arrows, ẞ) in sheet copy and key caps. They must draw from Inter or the system font, never as tofu. Covered by Task 2's keep-list test (`kbd` stays Inter) and Task 8 Step 2 (Shortcuts sheet crop).

---

### Task 1: Pinned manifest and the font tool

**Files:**
- Create: `fonts/blubird/pinned.json`
- Create: `scripts/blubird-fonts.js`
- Create: `test/unit/blubird-fonts.test.js`
- Modify: `.gitignore` (append)
- Modify: `package.json` (`scripts`: add `fonts:install` and `fonts:check`; append the check to `predist` and `predist:dir`)

**Interfaces:**
- Produces (CommonJS exports of `scripts/blubird-fonts.js`):
  - `readPinned(root?) → { sourceFolder: string, files: Array<{ name: string, env: string, bytes: number, sha256: string }> }`
  - `sha256(bytes: Buffer) → string`
  - `verifyBytes(entry, bytes: Buffer) → void`, which throws `Error` on a size or digest mismatch
  - `installFromSource(source: string, { pinned?, targetDir? }) → string[]`, the installed names
  - `installFromEnv(env: object, { pinned?, targetDir? }) → { installed: string[], missing: string[] }`
  - `checkDirectory(dir?, { pinned? }) → { present: string[], missing: string[] }`, which throws on a mismatch
  - `checkAsar(asarPath: string, { pinned? }) → { present: string[], missing: string[] }`, which throws on a mismatch
  - `main(argv: string[], { env?, pinned?, pagesDir?, log?, warn?, error? }) → number`, the exit code
- Produces (CLI): `node scripts/blubird-fonts.js install <zip|dir>`, `install-env [--require]`, `check [--require] [--asar <path>]`

- [ ] **Step 1: Write the failing tests**

Create `test/unit/blubird-fonts.test.js`:

```js
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  sha256, verifyBytes, installFromSource, installFromEnv, checkDirectory, checkAsar, main, readPinned,
} = require('../../scripts/blubird-fonts');

const root = path.join(__dirname, '../..');
const A = Buffer.from('abc');
const B = Buffer.from('xyz');
const FAKE = {
  sourceFolder: 'Blubird/Web-PS',
  files: [
    { name: 'Blubird-A.woff2', env: 'BLUBIRD_A_WOFF2', bytes: 3, sha256: sha256(A) },
    { name: 'Blubird-B.woff2', env: 'BLUBIRD_B_WOFF2', bytes: 3, sha256: sha256(B) },
  ],
};
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'blubird-'));
const quiet = { log() {}, warn() {}, error() {} };

test('the pinned manifest names the four licensed Web-PS files', () => {
  const pinned = readPinned();
  assert.equal(pinned.sourceFolder, 'Blubird/Web-PS');
  assert.deepEqual(pinned.files.map((entry) => entry.name), [
    'Blubird-RegularDisplay.woff2', 'Blubird-RegularText.woff2',
    'Blubird-MediumText.woff2', 'Blubird-SemiBoldText.woff2',
  ]);
  for (const entry of pinned.files) {
    assert.match(entry.sha256, /^[0-9a-f]{64}$/);
    assert.match(entry.env, /^BLUBIRD_[A-Z_]+_WOFF2$/);
    assert.ok(entry.bytes > 10000);
  }
});

test('verifyBytes rejects a different size or digest', () => {
  verifyBytes(FAKE.files[0], A);
  assert.throws(() => verifyBytes(FAKE.files[0], B), /Blubird-A\.woff2/);
  assert.throws(() => verifyBytes(FAKE.files[0], Buffer.from('abcd')), /pinned 3 bytes/);
});

test('installFromSource copies verified files from a folder', () => {
  const source = tmp();
  const target = tmp();
  fs.writeFileSync(path.join(source, 'Blubird-A.woff2'), A);
  fs.writeFileSync(path.join(source, 'Blubird-B.woff2'), B);
  assert.deepEqual(installFromSource(source, { pinned: FAKE, targetDir: target }), ['Blubird-A.woff2', 'Blubird-B.woff2']);
  assert.deepEqual(fs.readFileSync(path.join(target, 'Blubird-B.woff2')), B);
});

test('installFromSource writes nothing when any file does not match', () => {
  const source = tmp();
  const target = tmp();
  fs.writeFileSync(path.join(source, 'Blubird-A.woff2'), A);
  fs.writeFileSync(path.join(source, 'Blubird-B.woff2'), A);
  assert.throws(() => installFromSource(source, { pinned: FAKE, targetDir: target }), /Blubird-B\.woff2/);
  assert.deepEqual(fs.readdirSync(target), []);
});

test('installFromEnv installs present secrets, reports missing ones, and tolerates wrapped base64', () => {
  const target = tmp();
  const wrapped = A.toString('base64').replace(/(.{2})/, '$1\n');
  const result = installFromEnv({ BLUBIRD_A_WOFF2: wrapped }, { pinned: FAKE, targetDir: target });
  assert.deepEqual(result, { installed: ['Blubird-A.woff2'], missing: ['Blubird-B.woff2'] });
  assert.deepEqual(fs.readFileSync(path.join(target, 'Blubird-A.woff2')), A);
});

test('installFromEnv rejects a secret holding different bytes', () => {
  assert.throws(
    () => installFromEnv({ BLUBIRD_A_WOFF2: B.toString('base64') }, { pinned: FAKE, targetDir: tmp() }),
    /Blubird-A\.woff2/,
  );
});

test('checkDirectory reports missing files and throws on an altered one', () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'Blubird-A.woff2'), A);
  assert.deepEqual(checkDirectory(dir, { pinned: FAKE }), { present: ['Blubird-A.woff2'], missing: ['Blubird-B.woff2'] });
  fs.writeFileSync(path.join(dir, 'Blubird-B.woff2'), A);
  assert.throws(() => checkDirectory(dir, { pinned: FAKE }), /Blubird-B\.woff2/);
});

test('checkAsar reads the fonts from inside a packaged app.asar', async () => {
  const asar = require('@electron/asar');
  const app = tmp();
  fs.mkdirSync(path.join(app, 'src/renderer/pages'), { recursive: true });
  fs.writeFileSync(path.join(app, 'src/renderer/pages/Blubird-A.woff2'), A);
  fs.writeFileSync(path.join(app, 'package.json'), '{}');
  const archive = path.join(tmp(), 'app.asar');
  await asar.createPackage(app, archive);
  assert.deepEqual(checkAsar(archive, { pinned: FAKE }), { present: ['Blubird-A.woff2'], missing: ['Blubird-B.woff2'] });
});

test('check exits 0 with a warning when fonts are absent, 1 with --require, 1 on a mismatch', () => {
  const dir = tmp();
  const warnings = [];
  const options = { pinned: FAKE, pagesDir: dir, ...quiet, warn: (line) => warnings.push(line) };
  assert.equal(main(['check'], options), 0);
  assert.match(warnings.join('\n'), /fall back to Inter/);
  assert.equal(main(['check', '--require'], { ...options, warn() {} }), 1);
  fs.writeFileSync(path.join(dir, 'Blubird-A.woff2'), B);
  assert.equal(main(['check'], { ...options, warn() {} }), 1);
});

test('install-env --require fails when a secret is missing', () => {
  const options = { pinned: FAKE, pagesDir: tmp(), ...quiet };
  assert.equal(main(['install-env', '--require'], { ...options, env: { BLUBIRD_A_WOFF2: A.toString('base64') } }), 1);
  assert.equal(main(['install-env'], { ...options, env: { BLUBIRD_A_WOFF2: A.toString('base64') } }), 0);
});

test('Blubird files are git-ignored, untracked, and declared in pages.css', () => {
  const { execFileSync } = require('node:child_process');
  const pinned = readPinned();
  const gitignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
  assert.match(gitignore, /^\/src\/renderer\/pages\/Blubird-\*\.woff2$/m);
  const tracked = execFileSync('git', ['ls-files', 'src/renderer/pages'], { cwd: root, encoding: 'utf8' });
  assert.doesNotMatch(tracked, /Blubird/i, 'no Blubird file may be committed');
  const scripts = require('../../package.json').scripts;
  assert.equal(scripts['fonts:install'], 'node scripts/blubird-fonts.js install');
  assert.equal(scripts['fonts:check'], 'node scripts/blubird-fonts.js check');
  assert.match(scripts.predist, /node scripts\/blubird-fonts\.js check$/);
  assert.match(scripts['predist:dir'], /node scripts\/blubird-fonts\.js check$/);
  assert.ok(pinned.files.length === 4);
});
```

Task 2 adds the `pages.css` `@font-face` assertions to `test/unit/start-page-fonts.test.js`.

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `node --test test/unit/blubird-fonts.test.js`
Expected: FAIL with `Cannot find module '../../scripts/blubird-fonts'`

- [ ] **Step 3: Create the pinned manifest**

Create `fonts/blubird/pinned.json`:

```json
{
  "family": "Blubird",
  "author": "Rajesh Rajput",
  "note": "Commercially licensed; never commit the font files. Digests only. See docs/superpowers/specs/2026-10-15-blubird-app-typography-design.md.",
  "sourceFolder": "Blubird/Web-PS",
  "files": [
    { "name": "Blubird-RegularDisplay.woff2", "env": "BLUBIRD_REGULAR_DISPLAY_WOFF2", "bytes": 20976, "sha256": "4f78df47701588c3a30dba18df7beb297410e330f33a3ba42668eb25620c5571" },
    { "name": "Blubird-RegularText.woff2", "env": "BLUBIRD_REGULAR_TEXT_WOFF2", "bytes": 20988, "sha256": "5a1e5e1f5b26455f3cb71972cdfddbfd649201252c86991fbe7fd27329cad4b9" },
    { "name": "Blubird-MediumText.woff2", "env": "BLUBIRD_MEDIUM_TEXT_WOFF2", "bytes": 21456, "sha256": "0d738eb8374fdc67f8fcd9e05d681ddb7f5ee89d08e61eb85e291dd7d3437966" },
    { "name": "Blubird-SemiBoldText.woff2", "env": "BLUBIRD_SEMIBOLD_TEXT_WOFF2", "bytes": 21572, "sha256": "20abf16c70f54283bea269f7c966f189446d5a648c65a1d7d906b961ad982ea8" }
  ]
}
```

- [ ] **Step 4: Write the tool**

Create `scripts/blubird-fonts.js`:

```js
'use strict';

// Blubird (Rajesh Rajput) is commercially licensed for Blanc's official builds
// and must never be committed: this repository is public. This tool installs
// the four licensed WOFF2 files, flat and git-ignored, into
// src/renderer/pages/ (pages.js serves no subfolders) and verifies them, in a
// checkout or inside a packaged app.asar, against fonts/blubird/pinned.json.
// Without them every Blubird stack falls back to Inter; public releases run
// the checks with --require and fail closed.
//
//   node scripts/blubird-fonts.js install <Blubird.zip | folder>
//   node scripts/blubird-fonts.js install-env [--require]   (CI: base64 secrets)
//   node scripts/blubird-fonts.js check [--require] [--asar <app.asar>]

const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const PAGES_DIR = path.join(ROOT, 'src/renderer/pages');
const ASAR_PAGES = 'src/renderer/pages';
const INSTALL_HINT = 'Install the licensed files: npm run fonts:install -- /path/to/Blubird.zip';

function readPinned(root = ROOT) {
  return JSON.parse(fs.readFileSync(path.join(root, 'fonts/blubird/pinned.json'), 'utf8'));
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function verifyBytes(entry, bytes) {
  const actual = sha256(bytes);
  if (bytes.length !== entry.bytes || actual !== entry.sha256) {
    throw new Error(`${entry.name}: ${bytes.length} bytes, SHA-256 ${actual}; pinned ${entry.bytes} bytes, ${entry.sha256}`);
  }
}

function readSource(source, entry, pinned) {
  if (fs.statSync(source).isDirectory()) return fs.readFileSync(path.join(source, entry.name));
  return execFileSync('unzip', ['-p', source, `${pinned.sourceFolder}/${entry.name}`], { maxBuffer: 8 * 1024 * 1024 });
}

function installFromSource(source, { pinned = readPinned(), targetDir = PAGES_DIR } = {}) {
  // Verify every file before writing any, so a bad source never half-installs.
  const verified = pinned.files.map((entry) => {
    const bytes = readSource(source, entry, pinned);
    verifyBytes(entry, bytes);
    return [entry, bytes];
  });
  for (const [entry, bytes] of verified) fs.writeFileSync(path.join(targetDir, entry.name), bytes);
  return verified.map(([entry]) => entry.name);
}

function installFromEnv(env, { pinned = readPinned(), targetDir = PAGES_DIR } = {}) {
  const installed = [];
  const missing = [];
  for (const entry of pinned.files) {
    const encoded = String(env[entry.env] || '').replace(/\s+/g, '');
    if (!encoded) {
      missing.push(entry.name);
      continue;
    }
    const bytes = Buffer.from(encoded, 'base64');
    verifyBytes(entry, bytes);
    fs.writeFileSync(path.join(targetDir, entry.name), bytes);
    installed.push(entry.name);
  }
  return { installed, missing };
}

function checkFiles(readFile, pinned) {
  const present = [];
  const missing = [];
  for (const entry of pinned.files) {
    const bytes = readFile(entry.name);
    if (!bytes) {
      missing.push(entry.name);
      continue;
    }
    verifyBytes(entry, bytes);
    present.push(entry.name);
  }
  return { present, missing };
}

function checkDirectory(dir = PAGES_DIR, { pinned = readPinned() } = {}) {
  return checkFiles((name) => {
    const file = path.join(dir, name);
    return fs.existsSync(file) ? fs.readFileSync(file) : null;
  }, pinned);
}

function checkAsar(asarPath, { pinned = readPinned() } = {}) {
  const asar = require('@electron/asar');
  const listed = new Set(asar.listPackage(asarPath).map((entry) => entry.replace(/\\/g, '/').replace(/^\//, '')));
  return checkFiles((name) => {
    const inner = `${ASAR_PAGES}/${name}`;
    return listed.has(inner) ? asar.extractFile(asarPath, inner) : null;
  }, pinned);
}

function main(argv, options = {}) {
  const {
    env = process.env, pinned = readPinned(), pagesDir = PAGES_DIR,
    log = console.log, warn = console.warn, error = console.error,
  } = options;
  const [command, ...rest] = argv;
  const requireAll = rest.includes('--require');
  try {
    if (command === 'install' && rest[0]) {
      for (const name of installFromSource(rest[0], { pinned, targetDir: pagesDir })) log(`Installed src/renderer/pages/${name}`);
      return 0;
    }
    if (command === 'install-env') {
      const { installed, missing } = installFromEnv(env, { pinned, targetDir: pagesDir });
      for (const name of installed) log(`Installed src/renderer/pages/${name}`);
      if (missing.length) {
        (requireAll ? error : warn)(`Blubird secrets missing for: ${missing.join(', ')}. Internal pages would fall back to Inter.`);
        return requireAll ? 1 : 0;
      }
      return 0;
    }
    if (command === 'check') {
      const asarIndex = rest.indexOf('--asar');
      const where = asarIndex >= 0 ? rest[asarIndex + 1] : pagesDir;
      const { missing } = asarIndex >= 0 ? checkAsar(where, { pinned }) : checkDirectory(where, { pinned });
      if (missing.length) {
        (requireAll ? error : warn)(`Blubird is missing from ${where}: ${missing.join(', ')}. Internal pages fall back to Inter. ${INSTALL_HINT}`);
        return requireAll ? 1 : 0;
      }
      log(`Blubird fonts present and verified in ${where}.`);
      return 0;
    }
  } catch (failure) {
    error(failure.message);
    return 1;
  }
  error('Usage: blubird-fonts.js install <zip|dir> | install-env [--require] | check [--require] [--asar <path>]');
  return 1;
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));

module.exports = {
  readPinned, sha256, verifyBytes, installFromSource, installFromEnv, checkDirectory, checkAsar, main,
};
```

- [ ] **Step 5: Ignore the files and add the npm scripts**

Append to `.gitignore`:

```
# Blubird is commercially licensed; never commit its files (see fonts/blubird/pinned.json).
/src/renderer/pages/Blubird-*.woff2
```

In `package.json` `scripts`, add:
- `"fonts:install": "node scripts/blubird-fonts.js install"`
- `"fonts:check": "node scripts/blubird-fonts.js check"`

Append ` && node scripts/blubird-fonts.js check` to the end of both `predist` and `predist:dir`.

- [ ] **Step 6: Run the tests and confirm they pass**

Run: `node --test test/unit/blubird-fonts.test.js`
Expected: PASS (11 tests)

- [ ] **Step 7: Install the owner's copy locally and check it**

Run: `npm run fonts:install -- ~/Downloads/Blubird.zip && npm run fonts:check && git status --short`
Expected: four `Installed …` lines, then `Blubird fonts present and verified`. `git status` lists none of the font files.

- [ ] **Step 8: Commit**

```bash
git add fonts/blubird/pinned.json scripts/blubird-fonts.js test/unit/blubird-fonts.test.js .gitignore package.json
git commit -m "Pin the licensed Blubird files and add a tool to install and verify them

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Type roles in the internal pages; retire Newsreader from the app

**Files:**
- Modify: `src/renderer/pages/pages.css`:
  - `@font-face` blocks at :4-33 and `:root` tokens at :61-62
  - heading rules at :979-990, :1350-1358, :1784-1791, :2927-2933, :2972-2978, :3604-3612, :3712-3721
  - the keep-list rules named in Step 5
- Modify: `src/renderer/pages/tab-handoff.css:6`
- Modify: `tokens/tokens.json:38-39`; regenerate `tokens/generated/*` and `ios/Blanc/Tokens.swift` via `npm run tokens:build`
- Delete: `src/renderer/pages/newsreader-condensed-latin-opsz-normal.woff2`, `src/renderer/pages/newsreader-OFL.txt`
- Modify: `compliance/policy.json` (remove the `newsreader-font` asset), `scripts/compliance-model.js:360` (drop `'asset:newsreader-font'`), `test/unit/compliance-model.test.js:39-43`, and regenerate with `npm run compliance:build`
- Modify: `THIRD-PARTY-NOTICES.md:46-64` (drop the Newsreader bullet; the heading becomes "Inter, JetBrains Mono, and Caveat fonts — SIL OFL 1.1"; "All four font files" becomes "All three font files")
- Test: `test/unit/start-page-fonts.test.js` (rewrite its second test), `test/unit/migration-checklist-page.test.js:83-95`

**Interfaces:**
- Consumes: the four file names from Task 1's `fonts/blubird/pinned.json`
- Produces: CSS tokens `--font-text` and `--font-display` (both pages-only), used by Task 3's acceptance assertions; token `font-text` in `tokens.json`

- [ ] **Step 1: Write the failing tests**

In `test/unit/start-page-fonts.test.js`, replace the whole second test (`'Newsreader is bundled for …'`) with:

```js
function cssRules(css) {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...stripped.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map(([, selector, body]) => ({ selector: selector.trim().replace(/\s+/g, ' '), body }));
}
const rulesFor = (css, selector) => cssRules(css).filter((rule) => rule.selector === selector);
const INTER_STACK = '"Inter", -apple-system, "Segoe UI Variable", "Segoe UI", system-ui, sans-serif';
// Blubird has no tabular figures and lacks ⌘ ⌥ ⇧ ⌃ and arrows, so these keep Inter.
const KEEP_INTER = [
  '.settings-content #patronKey', '.migration-progress-ring', '.folder-count',
  '.shelf-count', '.tally-count', '.tally-caption',
  'body.sheet kbd', '.shortcut-row kbd', '.ob-kbd',
];

test('Blubird sets headings and page copy; Inter keeps figures, keys, the chrome and Mahjong', () => {
  const pages = read('src/renderer/pages/pages.css');
  const handoff = read('src/renderer/pages/tab-handoff.css');
  const chrome = read('src/renderer/styles.css');
  const mahjong = read('src/renderer/pages/mahjong.css');
  const pinned = JSON.parse(read('fonts/blubird/pinned.json'));

  for (const [family, file, weight] of [
    ['Blubird Display', 'Blubird-RegularDisplay.woff2', '400'],
    ['Blubird Text', 'Blubird-RegularText.woff2', '400'],
    ['Blubird Text', 'Blubird-MediumText.woff2', '500'],
    ['Blubird Text', 'Blubird-SemiBoldText.woff2', '600 700'],
  ]) {
    assert.ok(pinned.files.some((entry) => entry.name === file), `${file} is pinned`);
    assert.ok(cssRules(pages).some((rule) => rule.selector === '@font-face'
      && rule.body.includes(`font-family: "${family}";`)
      && rule.body.includes(`src: url("${file}") format("woff2");`)
      && rule.body.includes(`font-weight: ${weight};`)), `${family} ${weight} from ${file}`);
  }
  assert.ok(pages.includes(`--font-text: "Blubird Text", ${INTER_STACK};`));
  assert.ok(pages.includes(`--font-display: "Blubird Display", ${INTER_STACK};`));
  assert.ok(pages.includes(`--font-ui: ${INTER_STACK};`));
  assert.doesNotMatch(pages, /Newsreader/);
  assert.equal(fs.existsSync(path.join(root, 'src/renderer/pages/newsreader-condensed-latin-opsz-normal.woff2')), false);

  // Display only at 32px and up; smaller headings use the Text cut. No tracking.
  const headings = {
    'body.sheet .group-title, body.sheet .shortcut-section .section-title': 'text',
    '.migration-checklist-heading h2': 'text',
    'body.sheet .page h1': 'text',
    '.ob-content h1': 'text',
    '.ledger-where': 'display',
  };
  for (const [selector, role] of Object.entries(headings)) {
    const rules = rulesFor(pages, selector);
    assert.ok(rules.length > 0, `${selector} exists`);
    assert.ok(rules.some((rule) => rule.body.includes(`font-family: var(--font-${role})`)), `${selector} uses --font-${role}`);
    for (const rule of rules) assert.doesNotMatch(rule.body, /letter-spacing|font-optical-sizing/, `${selector} carries no Newsreader tuning`);
  }
  const clock = rulesFor(pages, '.bb-clock').find((rule) => rule.body.includes('var(--font-display)'));
  assert.ok(clock, 'the Billboard clock uses the Display cut');
  assert.match(clock.body, /font-weight: 400;/);
  assert.doesNotMatch(clock.body, /letter-spacing|font-optical-sizing/);

  // Every remaining Inter rule is on the keep-list, and every keep-list rule uses Inter.
  for (const rule of [...cssRules(pages), ...cssRules(handoff)]) {
    if (rule.body.includes('var(--font-ui)')) assert.ok(KEEP_INTER.includes(rule.selector), `${rule.selector} should use --font-text`);
  }
  for (const selector of KEEP_INTER) {
    const rules = rulesFor(pages, selector);
    assert.ok(rules.some((rule) => rule.body.includes('var(--font-ui)')), `${selector} keeps Inter`);
    for (const rule of rules) {
      if (/(?:^|[\s;])font(?:-family)?:/.test(rule.body)) assert.match(rule.body, /var\(--font-ui\)/, `every ${selector} rule that sets a family keeps Inter`);
    }
  }
  assert.match(rulesFor(pages, 'html, body')[0].body, /font-family: var\(--font-text\);/);

  assert.doesNotMatch(chrome, /Blubird|--font-text|--font-display|Newsreader/);
  assert.doesNotMatch(mahjong, /Blubird|--font-text|--font-display/);
});
```

In `test/unit/migration-checklist-page.test.js`, rename the test to `'moving-in checklist uses Blubird Text without handwritten styling'` and change its first assertion's `var\(--font-display\)` to `var\(--font-text\)`. Its second assertion (`.migration-task-label` … `var\(--font-ui\)`) changes to `var\(--font-text\)`.

In `test/unit/compliance-model.test.js`:
- Delete the `asset:newsreader-font` assertion and the `.version === '5.3.0'` assertion (lines 39-43).
- Change both runtime component counts, `sbom.components.length` at line 31 and the packaged `runtime-sbom.cdx.json` count at line 199, from `44` to `43`. Task 4 brings both back to 44.

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `node --test test/unit/start-page-fonts.test.js test/unit/migration-checklist-page.test.js test/unit/compliance-model.test.js`
Expected: FAIL. The `@font-face` assertions fail, and the component count is still 44.

- [ ] **Step 3: Replace the `@font-face` blocks and the tokens**

In `pages.css`, delete the Newsreader comment and `@font-face` (lines 11-21). After the Inter `@font-face`, insert:

```css
/* Blubird (Rajesh Rajput) is commercially licensed and never committed. The
   four files are installed flat beside this stylesheet by
   `npm run fonts:install` and pinned in fonts/blubird/pinned.json. Without
   them every Blubird stack falls back to Inter. Same faces as the website. */
@font-face {
  font-family: "Blubird Display";
  src: url("Blubird-RegularDisplay.woff2") format("woff2");
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: "Blubird Text";
  src: url("Blubird-RegularText.woff2") format("woff2");
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: "Blubird Text";
  src: url("Blubird-MediumText.woff2") format("woff2");
  font-weight: 500;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: "Blubird Text";
  src: url("Blubird-SemiBoldText.woff2") format("woff2");
  font-weight: 600 700;
  font-style: normal;
  font-display: swap;
}
```

Replace the `--font-display` line in `:root` (and add `--font-text`) with:

```css
  --font-text: "Blubird Text", "Inter", -apple-system, "Segoe UI Variable", "Segoe UI", system-ui, sans-serif;
  --font-display: "Blubird Display", "Inter", -apple-system, "Segoe UI Variable", "Segoe UI", system-ui, sans-serif;
```

- [ ] **Step 4: Move page copy to `--font-text`**

Run: `perl -pi -e 's/var\(--font-ui\)/var(--font-text)/g' src/renderer/pages/pages.css src/renderer/pages/tab-handoff.css`

The `:root` token definitions are literal stacks, so this only touches usages.

- [ ] **Step 5: Restore Inter on the keep-list**

Change `var(--font-text)` back to `var(--font-ui)` in **every** rule for these selectors that declares a family. Several selectors have more than one rule; the later ones win, so miss none. Line numbers are from `main` at e2dcc6a6:
- `.settings-content #patronKey` (~845)
- `.migration-progress-ring` (~1368, the `font:` shorthand)
- `.folder-count` (~1621)
- `.shelf-count` (~2731 and ~2954)
- `.tally-count` (~2752 and ~2963)
- `.tally-caption` (~2787 and ~2970)
- `.shortcut-row kbd` (~1582)
- `.ob-kbd` (~3724)

Check: `grep -nE '^\.(shelf-count|tally-count|tally-caption|folder-count)\b' src/renderer/pages/pages.css` lists every rule. Each one either uses `var(--font-ui)` or declares no family.

`body.sheet kbd` sets no family today, so give it one:

```css
body.sheet kbd { font-family: var(--font-ui); font-variant-numeric: tabular-nums; }
```

- [ ] **Step 6: Convert the heading rules**

Apply each change. Then delete `letter-spacing` and `font-optical-sizing` from every rule with that exact selector, including any inside `@media` blocks:
- `body.sheet .group-title, body.sheet .shortcut-section .section-title`: `font-family: var(--font-text);`
- `.migration-checklist-heading h2` (first rule): `font-family: var(--font-text);`
- The later override `.migration-checklist-heading h2 { font-size: 27px; letter-spacing: -0.045em; }` becomes `.migration-checklist-heading h2 { font-size: 27px; }`. Its comment becomes `/* Migration checklist: a Blubird Text title over the same controls. The former handwritten underline is intentionally gone. */`
- `body.sheet .page h1`: `font-family: var(--font-text);`
- The Billboard `.bb-clock` (the rule after `.bb-clock-row`): keep `var(--font-display)`, set `font-weight: 400;`, keep `font-variant-numeric: proportional-nums;`
- `.ledger-where`: keep `var(--font-display)`
- `.ob-content h1`: `font-family: var(--font-text);`

`font-optical-sizing` is meaningless for these static files, and 0 tracking is the brand setting.

- [ ] **Step 7: Update the tokens and regenerate**

In `tokens/tokens.json`, replace line 39 and add `font-text` after it:

```json
    { "name": "font-display",   "group": "type", "consumers": ["pages"], "values": { "common": "\"Blubird Display\", \"Inter\", -apple-system, \"Segoe UI Variable\", \"Segoe UI\", system-ui, sans-serif" } },
    { "name": "font-text",      "group": "type", "consumers": ["pages"], "values": { "common": "\"Blubird Text\", \"Inter\", -apple-system, \"Segoe UI Variable\", \"Segoe UI\", system-ui, sans-serif" } },
```

Run: `npm run tokens:build && npm run tokens:check`
Expected: the generated files change; check passes.

- [ ] **Step 8: Retire Newsreader from the app**

```bash
git rm src/renderer/pages/newsreader-condensed-latin-opsz-normal.woff2 src/renderer/pages/newsreader-OFL.txt
```

Then:
- Remove the `newsreader-font` object from `compliance/policy.json` `assets`.
- Remove `'asset:newsreader-font',` from `scripts/compliance-model.js:360`.
- Edit `THIRD-PARTY-NOTICES.md` as listed under Files.
- Run: `npm run compliance:build && npm run compliance:check`
- Run: `git grep -n "src/renderer/pages/newsreader\|newsreader-font" -- ':!site' ':!docs/superpowers'`

Expected: compliance passes; grep prints nothing. (The website keeps its own Newsreader under `site/`.)

- [ ] **Step 9: Run the tests and confirm they pass**

Run: `node --test test/unit/start-page-fonts.test.js test/unit/migration-checklist-page.test.js test/unit/compliance-model.test.js test/unit/blubird-fonts.test.js && npm run substrate:check`
Expected: PASS. `substrate:check` may fail only on the known local adblock-seed environment issue. Compare with `main` before blaming this change.

- [ ] **Step 10: Look at it**

Relaunch: kill any running dev Blanc, then `npm start`. Open a new tab (Ledger and Billboard), Settings and Shortcuts.
Expected: Blubird headings and copy; Inter in the Island and on key caps.
Leave the dev app running.

- [ ] **Step 11: Commit**

```bash
git add -A src/renderer/pages/pages.css src/renderer/pages/tab-handoff.css tokens ios/Blanc/Tokens.swift compliance scripts/compliance-model.js THIRD-PARTY-NOTICES.md test/unit/start-page-fonts.test.js test/unit/migration-checklist-page.test.js test/unit/compliance-model.test.js
git commit -m "Set the internal pages in Blubird and retire Newsreader from the app

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(`git rm` in Step 8 already staged the deletions. Check `git status` shows no Blubird file staged.)

---

### Task 3: Font-agnostic acceptance checks

**Files:**
- Modify: `src/main/test-hook.js:1108-1144` (`readStartPageFontUsage`), `:1320-1323` (`readMahjongDom`'s `newsreader` field), `:1871` (onboarding audit `fontLoaded`)
- Modify: `test/desktop/steps/newtab-layouts.steps.js:138-155` and `:226`
- Modify: `test/desktop/steps/onboarding.steps.js:21-50`
- Modify: `spec/acceptance/newtab-layouts.feature:71`, `spec/acceptance/onboarding.feature:11`

**Interfaces:**
- Consumes: Task 2's families (`"Blubird Display"`, `"Blubird Text"`) and keep-list (`.shelf-count`, `.tally-count`, `.tally-caption` stay Inter)
- Produces: hook fields `page.headings[{selector,family}]`, `page.blubirdLoaded`, `page.newsreader` (expected `[]`), `page.jetbrains`, `readMahjongDom().blubird`; onboarding audit `fontLoaded` now reports Blubird Text. Env switch `BLANC_EXPECT_BLUBIRD=1` makes the steps also require the fonts to have loaded.

- [ ] **Step 1: Reword the scenarios (the steps now fail to resolve)**

- `newtab-layouts.feature:71`: `Then the start page uses Blubird for the Billboard clock and invitation headings`
- `onboarding.feature:11`: `And every onboarding title fits in Blubird in light and dark themes`

Run: `npm run test:acceptance:dry`
Expected: FAIL, two undefined steps.

- [ ] **Step 2: Update the start-page hook**

In `readStartPageFontUsage`, replace the in-page script body from `await document.fonts.load(...)` through the returned object with:

```js
        await Promise.all([
          document.fonts.load('22px "Blubird Text"'),
          document.fonts.load('32px "Blubird Display"'),
        ]).catch(() => []);
        const selectors = [
          '.start-brand-date', '.ledger-label', '.bb-clock',
          '.bb-blocked', '.shelf-label', '.shelf-count', '.tally-count',
          '.tally-caption', '.ledger-footer', '.layout-switcher button',
          '.ob-step-label', '.ob-content p'
        ];
        if (selectors.some((selector) => !document.querySelector(selector))) return null;
        const headingSelector = '.bb-clock, .ledger-where, .migration-checklist-heading h2, .ob-content h1';
        const everything = [...document.querySelectorAll('body, body *')];
        const label = (element) => element.id || element.className || element.tagName;
        return {
          samples: selectors.map((selector) => ({
            selector,
            family: getComputedStyle(document.querySelector(selector)).fontFamily,
          })),
          headings: [...document.querySelectorAll(headingSelector)].map((element) => ({
            selector: element.className || 'onboarding h1',
            family: getComputedStyle(element).fontFamily,
          })),
          blubirdLoaded: document.fonts.check('22px "Blubird Text"') && document.fonts.check('32px "Blubird Display"'),
          newsreader: everything
            .filter((element) => getComputedStyle(element).fontFamily.includes('Newsreader'))
            .slice(0, 20).map(label),
          jetbrains: everything
            .filter((element) => getComputedStyle(element).fontFamily.includes('JetBrains Mono'))
            .slice(0, 20).map(label),
        };
```

In `readMahjongDom` (around line 1320), rename the `newsreader:` field to `blubird:`, filtering on `fontFamily.includes('Blubird')`.

In the onboarding audit (line 1871), change `fontLoaded` to `document.fonts.check('22px "Blubird Text"')`.

- [ ] **Step 3: Update the steps**

Replace the newtab step (lines 138-155) with:

```js
Then('the start page uses Blubird for the Billboard clock and invitation headings', async function () {
  const usage = await waitForValue(
    () => this.call('readStartPageFontUsage'),
    (value) => value?.page?.samples?.length === 12,
    'the new-tab document to expose its computed fonts',
  );
  // CI builds have no licensed files, so the stacks are asserted, not the
  // loaded faces; BLANC_EXPECT_BLUBIRD=1 adds that check where they are installed.
  if (process.env.BLANC_EXPECT_BLUBIRD === '1') assert.equal(usage.page.blubirdLoaded, true);
  assert.deepEqual(usage.page.jetbrains, []);
  assert.deepEqual(usage.page.newsreader, []);
  assert.equal(usage.page.headings.length, 9);
  for (const heading of usage.page.headings) {
    const expected = /bb-clock|ledger-where/.test(heading.selector) ? /^"?Blubird Display"?,/ : /^"?Blubird Text"?,/;
    assert.match(heading.family, expected, `${heading.selector} resolved to ${heading.family}`);
  }
  const keepInter = new Set(['.shelf-count', '.tally-count', '.tally-caption']);
  for (const sample of usage.page.samples) {
    const expected = sample.selector === '.bb-clock' ? /^"?Blubird Display"?,/
      : keepInter.has(sample.selector) ? /^"?Inter"?,/ : /^"?Blubird Text"?,/;
    assert.match(sample.family, expected, `${sample.selector} resolved to ${sample.family}`);
  }
});
```

At line 226: `assert.deepEqual(game.blubird, [], 'Mahjong keeps Inter and its tile font');`

In `onboarding.steps.js`:
- Rename the step to `'every onboarding title fits in Blubird in light and dark themes'`.
- Replace `assert.equal(result.fontLoaded, true);` with `if (process.env.BLANC_EXPECT_BLUBIRD === '1') assert.equal(result.fontLoaded, true);`.
- Replace `assert.match(step.font, /Newsreader Condensed/, context);` with `assert.match(step.font, /^"?Blubird Text"?,/, context);`.
- Replace `assert.equal(step.tracking, '-0.77px', context);` with `assert.ok(['normal', '0px'].includes(step.tracking), \`${context}: tracking ${step.tracking}\`);`.

Size, weight, line height and the `auto` optical-sizing default stay as they are.

- [ ] **Step 4: Dry run, then run the two scenarios without the fonts (as CI does)**

Run: `npm run test:acceptance:dry`
Expected: PASS (no undefined steps)

The affected scenarios:
- `@F35-6`: "Every start-page layout uses the approved typography roles"
- `@F36-1`: the onboarding walkthrough
- `@F35-3`: "Mahjong opens as a playable managed tab", which runs the Mahjong font check

Run: `mkdir -p "$TMPDIR/blubird-off" && mv src/renderer/pages/Blubird-*.woff2 "$TMPDIR/blubird-off/" && npm run test:acceptance:desktop -- --tags "@F35-6 or @F36-1 or @F35-3"; mv "$TMPDIR/blubird-off/"Blubird-*.woff2 src/renderer/pages/`
Expected: all three PASS on the Inter fallback, and the files are moved back.

- [ ] **Step 5: Run them with the fonts (positive control for the env switch)**

Run: `BLANC_EXPECT_BLUBIRD=1 npm run test:acceptance:desktop -- --tags "@F35-6 or @F36-1 or @F35-3"`
Expected: PASS. Then remove one file temporarily and rerun with `BLANC_EXPECT_BLUBIRD=1`. Expected: FAIL on `blubirdLoaded`/`fontLoaded`. Restore the file with `npm run fonts:install -- ~/Downloads/Blubird.zip`.

- [ ] **Step 6: Commit**

```bash
git add src/main/test-hook.js test/desktop/steps/newtab-layouts.steps.js test/desktop/steps/onboarding.steps.js spec/acceptance/newtab-layouts.feature spec/acceptance/onboarding.feature
git commit -m "Check the Blubird type roles in acceptance without needing the licensed files

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: License notices and the runtime SBOM

**Files:**
- Create: `compliance/evidence/blubird-NOTICE.txt`
- Modify: `compliance/policy.json` (add the asset and the license exception)
- Modify: `scripts/compliance-model.js:38-42` (`licenseChoice`) and `:355-361` (root dependencies)
- Modify: `THIRD-PARTY-NOTICES.md` (new section after the OFL fonts section)
- Regenerate: `compliance/THIRD_PARTY_NOTICES.txt`, `compliance/runtime-sbom.cdx.json` via `npm run compliance:build`
- Test: `test/unit/compliance-model.test.js`

**Interfaces:**
- Consumes: `fonts/blubird/pinned.json` (Task 1). The SBOM hashes this committed manifest, which pins the four file digests, because the font bytes are not in the repository.
- Produces: SBOM component `asset:blubird-font` with license `{ name: 'LicenseRef-Blubird-Commercial' }`

- [ ] **Step 1: Write the failing test**

In `test/unit/compliance-model.test.js`, set both runtime component counts (lines 31 and 199) back to `44`, and in the first test add:

```js
  const blubird = sbom.components.find((component) => component['bom-ref'] === 'asset:blubird-font');
  assert.ok(blubird, 'Blubird is listed');
  assert.deepEqual(blubird.licenses, [{ license: { name: 'LicenseRef-Blubird-Commercial' } }]);
  assert.equal(blubird.version, '1.000');
  assert.ok(blubird.properties.some((property) => property.value === 'fonts/blubird/pinned.json'));
  assert.ok(sbom.dependencies.find((entry) => entry.ref.startsWith('application:runtime:')).dependsOn.includes('asset:blubird-font'));
```

Add a test:

```js
test('Blubird is notice-listed as a commercial license outside MIT', () => {
  const generated = createComplianceArtifacts();
  const notice = generated.files['compliance/THIRD_PARTY_NOTICES.txt'];
  assert.match(notice, /Blubird webfonts 1\.000 — LicenseRef-Blubird-Commercial/);
  assert.match(notice, /Full text: ThirdPartyLicenses\/blubird-NOTICE\.txt/);
  const markdown = fs.readFileSync(path.join(ROOT, 'THIRD-PARTY-NOTICES.md'), 'utf8');
  assert.match(markdown, /## Blubird fonts — commercial license/);
});
```

(Use the file's existing imports; add `fs`, `path` and `ROOT` only if it lacks them.)

- [ ] **Step 2: Run it and confirm it fails**

Run: `node --test test/unit/compliance-model.test.js`
Expected: FAIL with `Blubird is listed`.

- [ ] **Step 3: Write the notice text**

Create `compliance/evidence/blubird-NOTICE.txt`:

```
Blubird typeface
Copyright (c) 2026 Rajesh Rajput. All rights reserved.

Official Blanc builds embed four Blubird webfont files (Regular Display;
Regular, Medium and SemiBold Text) under a commercial license granted to
Bananify Creative by Rajesh Rajput. Blubird is not covered by Blanc's MIT
license or by any open-source license. The font files are not part of Blanc's
public source code, and they may not be extracted from Blanc, modified, or
redistributed separately.

Builds made from the public source code do not include Blubird and use Inter
instead.
```

- [ ] **Step 4: Register the asset**

In `compliance/policy.json`:
- add `"blubird-font": "LicenseRef-Blubird-Commercial"` to `runtimeAssetLicenseExceptions`;
- add to `assets`, after `caveat-font`:

```json
    {
      "id": "blubird-font",
      "name": "Blubird webfonts",
      "version": "1.000",
      "type": "file",
      "file": "fonts/blubird/pinned.json",
      "license": "LicenseRef-Blubird-Commercial",
      "licenseFile": "compliance/evidence/blubird-NOTICE.txt",
      "attribution": "Rajesh Rajput"
    },
```

In `scripts/compliance-model.js`, make `licenseChoice` name non-SPDX references:

```js
function licenseChoice(expression) {
  if (expression.startsWith('LicenseRef-')) return { license: { name: expression } };
  return /\s(?:AND|OR|WITH)\s|[()]/.test(expression)
    ? { expression }
    : { license: { id: expression } };
}
```

and add `'asset:blubird-font',` to `rootDeps` after `'asset:caveat-font',`.

- [ ] **Step 5: Add the human-readable section**

In `THIRD-PARTY-NOTICES.md`, after the "Inter, JetBrains Mono, and Caveat fonts" section, insert:

```markdown
## Blubird fonts — commercial license

Official builds embed `Blubird-RegularDisplay.woff2`, `Blubird-RegularText.woff2`,
`Blubird-MediumText.woff2` and `Blubird-SemiBoldText.woff2` — Copyright (c) 2026
Rajesh Rajput, all rights reserved — under a commercial license granted to
Bananify Creative. Blubird is not covered by Blanc's MIT grant or any open-source
license, and the files are not in this repository; their SHA-256 digests are
pinned in [fonts/blubird/pinned.json](fonts/blubird/pinned.json). Builds made
from this repository fall back to Inter. Notice text:
[compliance/evidence/blubird-NOTICE.txt](compliance/evidence/blubird-NOTICE.txt).
```

- [ ] **Step 6: Regenerate and run the tests**

Run: `npm run compliance:build && node --test test/unit/compliance-model.test.js && npm run compliance:check`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add compliance scripts/compliance-model.js THIRD-PARTY-NOTICES.md test/unit/compliance-model.test.js
git commit -m "List Blubird in the notices and runtime SBOM as a commercial license

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Release gate on every platform

**Files:**
- Modify: `scripts/release.sh` (font install before the macOS build at :315-321; a new `fonts` resume step after `blocker-payloads` at :348-354; `RESUME_STEPS` at :270)
- Modify: `.github/workflows/release-windows-linux.yml`:
  - install before "Build Windows installer" (:138) and before Linux "Build" (:440)
  - verify after "Verify packaged blocker payload" (:187) and after the Linux blocker payload check (:470)
- Modify: `test/unit/release-manifest.test.js:372`
- Modify: `.claude/skills/releasing-blanc/SKILL.md:148`, `docs/release-verification.md:73`
- Test: `test/unit/blubird-release-gate.test.js` (new)

**Interfaces:**
- Consumes: CLI `install`, `install-env [--require]`, `check --require --asar <path>` (Task 1); secret names from `pinned.json` `env`
- Produces: 1Password document item **"Blubird fonts"** (vault Dev) holding `Blubird.zip`; four repository secrets `BLUBIRD_REGULAR_DISPLAY_WOFF2`, `BLUBIRD_REGULAR_TEXT_WOFF2`, `BLUBIRD_MEDIUM_TEXT_WOFF2`, `BLUBIRD_SEMIBOLD_TEXT_WOFF2` (created in Task 7)

- [ ] **Step 1: Write the failing test**

Create `test/unit/blubird-release-gate.test.js`:

```js
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const pinned = JSON.parse(read('fonts/blubird/pinned.json'));

test('release.sh installs Blubird from 1Password before building and verifies both Mac apps', () => {
  const script = read('scripts/release.sh');
  const install = script.indexOf('op document get "Blubird fonts" --vault Dev');
  const build = script.indexOf('npx electron-builder --mac');
  assert.ok(install > 0 && install < build, 'fonts are installed before the macOS build');
  assert.ok(script.indexOf('node scripts/blubird-fonts.js check --require') > install);
  const gate = script.slice(script.indexOf('if should_run fonts; then'));
  // The script wraps these lines with a trailing backslash continuation.
  assert.match(gate, /blubird-fonts\.js check --require --asar\s*\\?\s*"dist\/mac-arm64\/Blanc\.app\/Contents\/Resources\/app\.asar"/);
  assert.match(gate, /blubird-fonts\.js check --require --asar\s*\\?\s*"dist\/mac\/Blanc\.app\/Contents\/Resources\/app\.asar"/);
});

test('the Windows/Linux workflow installs Blubird before each build and verifies release packages', () => {
  const workflow = read('.github/workflows/release-windows-linux.yml');
  const installs = [...workflow.matchAll(/node scripts\/blubird-fonts\.js install-env \$\{\{ inputs\.mode == 'release' && '--require' \|\| '' \}\}/g)];
  assert.equal(installs.length, 2, 'one install per platform job');
  const winBuild = workflow.indexOf('name: Build Windows installer');
  const linuxBuild = workflow.indexOf('run: npx electron-builder --linux');
  assert.ok(installs[0].index < winBuild && installs[1].index > winBuild && installs[1].index < linuxBuild);
  for (const entry of pinned.files) {
    assert.equal(workflow.split(`${entry.env}: \${{ secrets.${entry.env} }}`).length - 1, 2, `${entry.env} reaches both jobs`);
  }
  for (const dir of ['win-unpacked', 'linux-unpacked']) {
    assert.match(workflow, new RegExp(`if: \\$\\{\\{ inputs\\.mode == 'release' \\}\\}\\s+run: node scripts/blubird-fonts\\.js check --require --asar dist/${dir}/resources/app\\.asar`));
  }
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `node --test test/unit/blubird-release-gate.test.js`
Expected: FAIL on `fonts are installed before the macOS build`.

- [ ] **Step 3: Install in `release.sh`**

In the `else` branch, insert directly before `echo "==> Cleaning and building notarized macOS artifacts"`:

```bash
  echo "==> Installing the licensed Blubird fonts from 1Password"
  BLUBIRD_ZIP_DIR="$(mktemp -d)"
  OP_BIOMETRIC_UNLOCK_ENABLED=true op document get "Blubird fonts" --vault Dev \
    --out-file "$BLUBIRD_ZIP_DIR/Blubird.zip" --force
  node scripts/blubird-fonts.js install "$BLUBIRD_ZIP_DIR/Blubird.zip"
  rm -rf "$BLUBIRD_ZIP_DIR"
  node scripts/blubird-fonts.js check --require
```

Change `RESUME_STEPS` to `(fuses blocker-payloads fonts compliance first-run regressions workspaces favicons-primary favicons-additional migration)`. After the `blocker-payloads` block, add:

```bash
if should_run fonts; then
  echo "==> Verifying the licensed Blubird fonts in packaged apps"
  $HAS_MAC_ARM64 && node scripts/blubird-fonts.js check --require --asar \
    "dist/mac-arm64/Blanc.app/Contents/Resources/app.asar"
  $HAS_MAC_X64 && node scripts/blubird-fonts.js check --require --asar \
    "dist/mac/Blanc.app/Contents/Resources/app.asar"
fi
```

Update `test/unit/release-manifest.test.js:372` to the new list (`'fonts'` after `'blocker-payloads'`). Add `fonts` after `blocker-payloads` in `.claude/skills/releasing-blanc/SKILL.md:148` and `docs/release-verification.md:73`.

- [ ] **Step 4: Install and verify in the workflow**

Insert immediately before `- name: Build Windows installer`, and again before the Linux `- name: Build` step:

```yaml
      - name: Install licensed Blubird fonts
        shell: bash
        env:
          BLUBIRD_REGULAR_DISPLAY_WOFF2: ${{ secrets.BLUBIRD_REGULAR_DISPLAY_WOFF2 }}
          BLUBIRD_REGULAR_TEXT_WOFF2: ${{ secrets.BLUBIRD_REGULAR_TEXT_WOFF2 }}
          BLUBIRD_MEDIUM_TEXT_WOFF2: ${{ secrets.BLUBIRD_MEDIUM_TEXT_WOFF2 }}
          BLUBIRD_SEMIBOLD_TEXT_WOFF2: ${{ secrets.BLUBIRD_SEMIBOLD_TEXT_WOFF2 }}
        run: node scripts/blubird-fonts.js install-env ${{ inputs.mode == 'release' && '--require' || '' }}
```

After `- name: Verify packaged blocker payload` (Windows), add:

```yaml
      - name: Verify packaged licensed fonts
        if: ${{ inputs.mode == 'release' }}
        run: node scripts/blubird-fonts.js check --require --asar dist/win-unpacked/resources/app.asar
```

and after the Linux `verify-packaged-adblock.js dist/linux-unpacked/...` step, add the same with `dist/linux-unpacked/resources/app.asar`.

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `node --test test/unit/blubird-release-gate.test.js test/unit/release-manifest.test.js && bash -n scripts/release.sh && npm run lint`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add scripts/release.sh .github/workflows/release-windows-linux.yml test/unit/blubird-release-gate.test.js test/unit/release-manifest.test.js .claude/skills/releasing-blanc/SKILL.md docs/release-verification.md
git commit -m "Require the pinned Blubird files in every public release build

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Docs (after rebasing onto #836)

**Files:**
- Modify: `docs/brand-usage.md`:
  - *System v2* paragraph (about lines 240–253 on `main`): Blubird roles in the app, Inter for the chrome, figures and keys, and the 32px Display/Text rule
  - #836's **License** paragraph: add the app license's scope and date, and say the signed permission is kept privately
- Modify: `CLAUDE.md` and `AGENTS.md` (*Commands*): one paragraph on `npm run fonts:install` and the release requirement
- Modify: `docs/repository-inventory.md` via `npm run audit-inventory:write`

- [ ] **Step 1: Rebase**

Run: `git fetch origin && git rebase origin/main`
Expected: clean, or resolve conflicts in `docs/brand-usage.md` in favour of #836's text plus this branch's additions.

- [ ] **Step 2: Write the brand rule**

Replace the System v2 sentences that name Inter and Newsreader for the app with:

```markdown
**System v3, October 2026 (Blubird):** the app's internal pages — the Start
Page and onboarding, the utility sheets, the error page, Tab import and Tab
handoff — use Blubird, matching the website. Headlines 32px and larger use
Blubird Display (the Billboard clock, Ledger's "Where to?"); smaller headings
and all copy use Blubird Text. Blubird is set at 0 letter-spacing. Inter stays
the operating face of the Island and everything else drawn by `blanc-chrome://`,
and of figures that must line up and keyboard keys, because Blubird has no
tabular figures and no ⌘ ⌥ ⇧ ⌃ or arrow glyphs. Mahjong keeps Inter and its
JetBrains Mono tile faces. Builds without the licensed files fall back to Inter.
```

Append the app license's scope, as the owner confirms it, to the License paragraph.

- [ ] **Step 3: Add the developer note to CLAUDE.md and AGENTS.md**

Under *Commands*, after the `npm run lint` paragraph:

```markdown
The internal pages use Blubird, a commercially licensed typeface whose files are never committed. `npm run fonts:install -- /path/to/Blubird.zip` copies the four pinned files (`fonts/blubird/pinned.json`) flat into `src/renderer/pages/`, where `.gitignore` keeps them out of git; without them the pages fall back to Inter and `predist` warns. `release.sh` installs them from the 1Password document "Blubird fonts" (vault Dev), the Windows/Linux workflow from four `BLUBIRD_*_WOFF2` secrets, and every public build fails unless `blubird-fonts.js check --require --asar` finds the exact pinned bytes. Never `git add` them.
```

- [ ] **Step 4: Refresh the inventory and run the docs guards**

Run: `npm run audit-inventory:write && npm run audit-inventory:check && node --test test/unit/*.test.js`
Expected: PASS, apart from known local-environment failures identical on `main`.

- [ ] **Step 5: Commit**

```bash
git add docs/brand-usage.md CLAUDE.md AGENTS.md docs/repository-inventory.md
git commit -m "Document Blubird in the app and how builds get the licensed files

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Owner setup (only after the written license)

These steps write to 1Password and GitHub, so each needs the owner's explicit yes in chat.

- [ ] **Step 1: Record the license.** The owner confirms the permission covers the spec's checklist items 1–4. Note its date and scope for Task 6 Step 2.
- [ ] **Step 2: Store the zip in 1Password.**

```bash
op document create ~/Downloads/Blubird.zip --title "Blubird fonts" --vault Dev
```

- [ ] **Step 3: Set the four repository secrets** (from the verified local install):

```bash
for pair in RegularDisplay:REGULAR_DISPLAY RegularText:REGULAR_TEXT MediumText:MEDIUM_TEXT SemiBoldText:SEMIBOLD_TEXT; do base64 -i "src/renderer/pages/Blubird-${pair%%:*}.woff2" | gh secret set "BLUBIRD_${pair##*:}_WOFF2" --repo bnfy/blanc; done
```

- [ ] **Step 4: Confirm** with `gh secret list --repo bnfy/blanc | grep BLUBIRD`
Expected: four names.

---

### Task 8: Verification before merge

- [ ] **Step 1: Full local gates.** Run `node --test test/unit/*.test.js && npm run lint && npm run substrate:check && npm run test:acceptance:dry`. Expected: PASS, except known environment failures that also fail on `main`. Record any such failure.
- [ ] **Step 2: Visual review with the fonts installed.**
  - Take before/after crops (`main` vs branch) of: the four Start Page layouts with onboarding; Favorites, History, Downloads, Settings and Shortcuts; the error page; Tab import.
  - Cover light, dark and private.
  - Format: full-resolution crop of the changed surface, before over after.
  - Confirm on the Shortcuts sheet that ⌘ ⌥ ⇧ draw in Inter, not as boxes.
  - Show the owner, who confirms review points 1 and 2 by looking at the crops.
- [ ] **Step 3: Languages.** Run `npm run test:i18n:desktop`. Then open Settings and Shortcuts in de, fr and it (Settings → Language, relaunch) and check for truncation or overflow. Fix any rule that clips; add its selector to a test if the fix is non-obvious.
- [ ] **Step 4: Packaged Mac.** Run `npm run dist:dir`, then `node scripts/blubird-fonts.js check --require --asar dist/mac-arm64/Blanc.app/Contents/Resources/app.asar` (Expected: verified). Launch the packaged app with a scratch profile and confirm Blubird renders.
- [ ] **Step 5: Positive controls for the gate.**
  - Copy the packaged `app.asar` aside. Repack it with one font's last byte flipped, using `npx @electron/asar extract` / `pack` into `$TMPDIR`, and run `check --require --asar` on it. Expected: exit 1, naming the file.
  - Repeat with one font deleted. Expected: exit 1, listing it as missing.
- [ ] **Step 6: Windows and Linux.** After Task 7, run `gh workflow run release-windows-linux.yml --ref claude/blanc-browser-font-replacement-485da8 -f mode=validation -f platform=windows`, and the same with `platform=linux`.
  - Install each artifact in its VM.
  - Compare 13px Blubird Text against a Web-TT build of the same page. To make the Web-TT build, install the four `Blubird/Web-TT/` WOFF2 files locally with `pinned.json` temporarily repointed; never commit that.
  - Keep Web-PS unless Web-TT is clearly sharper. If Web-TT wins, update `pinned.json` (`sourceFolder`, sizes, digests), the four secrets and the 1Password zip together.
- [ ] **Step 7: Merge readiness.** The license is on record (Task 7 Step 1), every check run on the head SHA passes, and the owner merges. After the next release, follow up separately: website Start Page and sheet captures, the Design System `typography.css` sync (approval before push), and the FAQ/Terms sentence (spec review point 4, website-only PR).

---

## Spec review points: how this plan resolves them

1. Headings under 32px use Blubird Text. Implemented in Task 2; the owner confirms visually in Task 8 Step 2.
2. The error page, Tab import and Tab handoff are included. Implemented in Task 2; confirmed in Task 8 Step 2.
3. The Billboard clock: the effective rule (`pages.css` after `.bb-clock-row`) already sets `font-variant-numeric: proportional-nums`, so moving to Blubird adds no new width shifting. No decision needed.
4. FAQ/Terms sentence: the owner decides before the release that ships this. That is a website-only PR, out of this branch.

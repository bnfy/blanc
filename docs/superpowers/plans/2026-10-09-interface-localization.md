# Interface Localization (F44) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The owner prefers inline execution (superpowers:executing-plans).

**Goal:** Build Blanc's interface-localization machinery (catalog, formatter, guards, language setting, delivery to every document) and ship German as the pilot language once 100% of Blanc-authored strings are translated.

**Architecture:** `copy/messages/en.json` is the single source of every Blanc-authored string. `copy/build.mjs` checks the catalogs and generates one data-only runtime file per locale (`src/renderer/pages/strings.<locale>.js`) plus mobile resources. Every `blanc-chrome://` and `blanc://` document loads `/strings.js` (the active locale's file, chosen by the protocol handler) and `/i18n.js` (an in-house ICU-subset formatter and DOM applier), and main `require`s the same files. The resolved language is frozen per process, so a change applies on relaunch.

**Tech Stack:** Node `node:test`, plain UMD JavaScript (no bundler), Electron 44 protocol handlers, `Intl.PluralRules`/`Intl.NumberFormat`, Playwright-Electron smokes, Cucumber feature files in `spec/acceptance/`.

**Spec:** `docs/superpowers/specs/2026-10-09-interface-localization-design.md` (revision 3, which includes the plan-time amendments listed below). Executors read both.

## Global Constraints

- Pilot language `de`. It stays `"status": "hidden"` until Task 15 (phase 10). Only `en` is selectable before then.
- `uiLanguage` is `"system"` or a locale code; default `"system"`; device-local (never in `SYNCED_KEYS`); written only by `settings.setUiLanguage()`; never admitted by `sanitize()`.
- Resolution order: selectable setting → that locale; `"system"` → first preferred language whose primary subtag is selectable, else `en`; any other stored value → `en` (`source: "unavailable"`), stored value untouched.
- Formatting locale = UI language + OS region (`de` + `AT` → `de-AT`).
- Fixed terms (never translated): Blanc, Blanc Blocker, Blanc Patron, Patron, uBlock Origin, 1Password, every `/command`, ⌘ ⌥ ⇧ ⌃. Windows/Linux key words (Ctrl, Shift, Alt) **are** translated.
- German uses the informal **du** form throughout (plan-time amendment; see below).
- Translated text reaches the DOM only through `textContent`/`setAttribute`. Never `innerHTML` a message.
- Messages: `{name}`, `{n, plural, one {…} other {…}}` (+ `=N`), `#`, numbered non-nesting tags `<0>…</0>`, `''` for a literal apostrophe. At most one `plural` per message. Nothing else.
- `source` hashes advance only through `npm run copy:ack -- <locale> <key…>`. `copy:build` and `copy:check` never write them.
- `maxLength` is a lint on literal text (placeholders count 0), not a fit guarantee.
- No `--lang`, no `Accept-Language` change, no `electronLanguages` restriction, no network access for translations.
- Test-only env (`BLANC_TEST_SYSTEM_LANGUAGES`, `BLANC_TEST_LOCALE_STATUS`) is honored only when `!app.isPackaged && process.env.BLANC_TEST === '1'`.
- Every boundary-file edit runs `npm run audit-inventory:write`. Every preload/bridge edit runs `npm run browser-api:build`. Run targeted tests per task; the full acceptance suite runs only when the owner asks.
- `CLAUDE.md` and `AGENTS.md` are edited together and compared with `cmp`.
- No marketing or site copy changes anywhere in this plan.

## Plan-time amendments to the spec

The spec moves to revision 3 in the same commit as this plan, recording these changes found while reading the code:

1. **`uiLanguage` is a desktop-only internal default, not a schema enum.** D27 gives mobile the OS per-app language screen, so mobile has no in-app setting to generate. `settings-schema/schema.json` lists `uiLanguage` in `internalDefaults`; the selectable list comes from the generated `src/main/i18n-locales.json`.
2. **Script order is `strings.js` then `i18n.js`.** `i18n.js` bootstraps synchronously from `self.blancStrings`, so the data must load first.
3. **The formatting locale is appended by the protocol handler.** It depends on the OS region at runtime, so it cannot live in the static generated file. Both handlers serve `strings.js` as the generated file plus one line: `self.blancStrings.formatLocale="de-AT";self.blancStrings.strict=false;`.
4. **The "no flash" hide uses CSSOM, not a stylesheet rule.** `i18n.js` sets `document.documentElement.style.visibility = 'hidden'` (allowed under `style-src 'self'`, unlike inline style attributes) and restores it after applying, with a 1 s safety timeout. No CSS file changes.
5. **`data-i18n-ignore` marks containers of user or page data** (tab titles, URLs, hostnames, favorite names). The pseudo-locale sweep skips them, and the source scanner treats them as data.
6. **Legacy `copy/generated/SlashCommands.strings` and `slash_commands.xml` stay generated.** `ios/Blanc/Blanc/SlashCommand.swift` reads table `SlashCommands` with keys `slash_new`/`slash_close`; retiring them is a mobile change, out of scope. The new per-locale outputs are added beside them.
7. **`copy/slash-commands.json` stays as the command registry** (order, command names, `doc.command` spellings, `platforms`). Hint text moves to `en.json` as `slash.<name>.hint` / `slash.<name>.doc`.
8. **F44 scenarios are bound by a standalone smoke** (`test/desktop/interface-language-smoke.mjs`). Each scenario needs a fresh launch with different env and settings, which the shared-app Cucumber harness cannot provide. The `.feature` file documents them, untagged from `RUNNABLE`.
9. **German uses informal "du".** It matches Blanc's casual lowercase voice; recorded in `copy/glossary.json` as `style.de`. Owner may reverse it before Task 15.

## File Structure

**Created**

| File | Responsibility |
|---|---|
| `src/renderer/pages/i18n.js` | UMD. Parser, formatter, translator, DOM applier, browser bootstrap. No IPC, no Electron. |
| `src/renderer/pages/strings.<locale>.js` | GENERATED. `{ locale, dir, messages, fallback }` per locale (`en`, `de`, `en-XA`). |
| `src/renderer/pages/settings-language-model.js` | UMD. Pure model for the Settings language row. |
| `src/main/i18n.js` | Pure (no `require('electron')`). Resolution, formatting locale, test overrides, `strings.js` script text, the main translator, `changeUiLanguage`. |
| `src/main/i18n-locales.json` | GENERATED. `[{ code, endonym, dir, status }]`. |
| `copy/messages/en.json` | Source catalog. |
| `copy/messages/de.json` | German catalog. |
| `copy/glossary.json` | Fixed terms, patterns, translated terms, `sameAsSource`, style. |
| `copy/i18n-scope.json` | Every string-bearing desktop file: `pending` or `guarded`, plus the scanner allowlist. |
| `copy/lib/catalog.mjs` | Pure catalog validation, hashing, reports, pseudo-localization, runtime catalog assembly. |
| `copy/lib/mobile.mjs` | Pure iOS `.xcstrings` and Android resource generation. |
| `copy/lib/scan-source.mjs` | Pure hard-coded-English scanner for guarded files. |
| `copy/lib/cli.mjs` | `runBuild`, `runCheck`, `runStatus`, `runAck` over a repo root (testable on fixture roots). |
| `test/unit/i18n-format.test.js` | Formatter and translator tests. |
| `test/unit/i18n-dom.test.js` | Applier and bootstrap tests with a fake DOM. |
| `test/unit/i18n-catalog.test.js` | Catalog validation and positive controls. |
| `test/unit/i18n-cli.test.js` | Build/check/status/ack behavior on fixture roots. |
| `test/unit/i18n-scan.test.js` | Source-scanner positive controls. |
| `test/unit/i18n-main.test.js` | Resolution, overrides, transition service. |
| `test/unit/i18n-settings.test.js` | `uiLanguage` storage rules. |
| `test/unit/i18n-protocol.test.js` | `strings.js`/`i18n.js` serving in both handlers. |
| `test/unit/i18n-documents.test.js` | Every HTML document loads the two scripts first. |
| `test/unit/settings-language-model.test.js` | Picker model. |
| `test/desktop/support/pseudo-sweep.js` | Pure classifier for the pseudo-locale sweep. |
| `test/unit/pseudo-sweep.test.js` | Classifier tests. |
| `test/desktop/i18n-pseudo-sweep.mjs` | `npm run test:i18n:desktop`. |
| `test/desktop/interface-language-smoke.mjs` | F44 scenarios. |
| `spec/acceptance/interface-language.feature` | F44 scenarios (documentation + mobile reference). |

**Modified**

`copy/build.mjs`, `copy/slash-commands.json`, `copy/README.md`, `package.json` (scripts), `src/main/settings.js`, `settings-schema/schema.json`, `src/main/chrome-protocol.js`, `src/main/pages.js`, `src/main/main.js`, `src/main/test-hook.js`, `src/main/tab-preload.js`, `browser-api/bridges.json` (+ generated vectors), `security/audit-surface-inventory.json` (via script), all 15 HTML documents, `src/renderer/pages/settings.html`/`settings.js`, the standalone-format call sites (Task 11), `spec/features.md`, `spec/parity-matrix.md`, `spec/divergence-register.md`, `spec/shared-substrate.md`, `CLAUDE.md`, `AGENTS.md`.

---

# Phase 1 — Foundation

Phase 1 lands as one PR. Users see no change: only `en` is selectable, so the language row stays hidden.

### Task 1: Formatter and translator (`i18n.js`, pure part)

**Files:**
- Create: `src/renderer/pages/i18n.js`
- Test: `test/unit/i18n-format.test.js`

**Interfaces:**
- Produces (CommonJS when `require`d, `self.blancI18n` in a browser):
  - `parseMessage(source: string) → Node[]` (throws `SyntaxError`)
  - `analyzeMessage(nodes) → { args: string[], plurals: { [name]: string[] }, tags: number[], pluralCount: number }`
  - `maxLiteralLength(nodes) → number`
  - `stringifyMessage(nodes) → string` (round-trips `parseMessage`)
  - `createTranslator({ locale, formatLocale?, messages, fallback?, onMissing? }) → t` where `t(key, params?) → string`, `t.parts(key, params?) → Array<{ text } | { tag: number, text }>`, `t.has(key) → boolean`
  - Node shapes: `{type:'text', value}`, `{type:'arg', name}`, `{type:'pound'}`, `{type:'plural', name, branches: { [selector]: Node[] }}`, `{type:'tag', index, children}`

- [ ] **Step 1: Write the failing tests**

```js
// test/unit/i18n-format.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseMessage, analyzeMessage, maxLiteralLength, stringifyMessage, createTranslator,
} = require('../../src/renderer/pages/i18n');

const tr = (messages, extra = {}) => createTranslator({ locale: 'en', messages, ...extra });

test('plain text and placeholders', () => {
  const t = tr({ hello: 'Hi {name}, you have {count} new' });
  assert.equal(t('hello', { name: 'Ada', count: 3 }), 'Hi Ada, you have 3 new');
});

test('a missing placeholder value stays visible instead of vanishing', () => {
  assert.equal(tr({ a: 'Open {site}' })('a'), 'Open {site}');
});

test("'' is a literal apostrophe and a single ' stays as typed", () => {
  assert.equal(tr({ a: "Blanc''s tabs aren't lost" })('a'), "Blanc's tabs aren't lost");
});

test('English plural categories and # formatting', () => {
  const t = tr({ n: '{count, plural, one {# tab} other {# tabs}}' });
  assert.equal(t('n', { count: 1 }), '1 tab');
  assert.equal(t('n', { count: 2 }), '2 tabs');
  assert.equal(t('n', { count: 1200 }), '1,200 tabs');
});

test('German plural categories and German number formatting', () => {
  const t = createTranslator({ locale: 'de', formatLocale: 'de-DE',
    messages: { n: '{count, plural, one {# Tab} other {# Tabs}}' } });
  assert.equal(t('n', { count: 1 }), '1 Tab');
  assert.equal(t('n', { count: 1200 }), '1.200 Tabs');
});

test('an exact =0 branch wins over the category', () => {
  const t = tr({ n: '{count, plural, =0 {no tabs} one {# tab} other {# tabs}}' });
  assert.equal(t('n', { count: 0 }), 'no tabs');
});

test('tags render as plain text through t() and as parts through t.parts()', () => {
  const t = tr({ a: 'Turn on <0>Fill logins</0> in Settings' });
  assert.equal(t('a'), 'Turn on Fill logins in Settings');
  assert.deepEqual(t.parts('a'), [
    { text: 'Turn on ' }, { tag: 0, text: 'Fill logins' }, { text: ' in Settings' },
  ]);
});

test('fallback is used for keys the locale lacks, with English plural rules', () => {
  const t = createTranslator({ locale: 'de', messages: {},
    fallback: { n: '{count, plural, one {# tab} other {# tabs}}' } });
  assert.equal(t('n', { count: 1 }), '1 tab');
});

test('a missing key reports once and renders the key', () => {
  const missing = [];
  const t = tr({}, { onMissing: (key) => missing.push(key) });
  assert.equal(t('nope'), 'nope');
  assert.equal(t('nope'), 'nope');
  assert.deepEqual(missing, ['nope']);
});

test('onMissing may throw (strict test mode)', () => {
  const t = tr({}, { onMissing: (key) => { throw new Error(`missing ${key}`); } });
  assert.throws(() => t('nope'), /missing nope/);
});

test('syntax errors are rejected', () => {
  for (const bad of [
    'Unclosed {name', 'Stray } brace', '{n, plural, one {x}}', '{n, plural, other {a} other {b}}',
    '<0>open', '<0>a <1>b</1></0>', '<0>a</0> and <0>b</0>', '{n, select, a {x} other {y}}',
    '{a, plural, other {#}} {b, plural, other {#}}',
  ]) assert.throws(() => parseMessage(bad), SyntaxError, bad);
});

test('analyzeMessage reports args, plural selectors, tags and plural count', () => {
  assert.deepEqual(
    analyzeMessage(parseMessage('{host} has <0>{count, plural, =0 {none} one {# tab} other {# tabs}}</0>')),
    { args: ['count', 'host'], plurals: { count: ['=0', 'one', 'other'] }, tags: [0], pluralCount: 1 },
  );
});

test('maxLiteralLength counts literal text only, taking the longest branch', () => {
  assert.equal(maxLiteralLength(parseMessage('{count, plural, one {# tab} other {# tabs}}')), 5);
  assert.equal(maxLiteralLength(parseMessage('Open {site}')), 5);
});

test('stringifyMessage round-trips', () => {
  for (const s of [
    "Blanc''s {name}", '{count, plural, =0 {none} one {# tab} other {# tabs}}', 'A <0>b {c}</0> d',
  ]) assert.equal(stringifyMessage(parseMessage(s)), s);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/unit/i18n-format.test.js`
Expected: FAIL with `Cannot find module '../../src/renderer/pages/i18n'`.

- [ ] **Step 3: Implement the formatter**

```js
// src/renderer/pages/i18n.js
'use strict';
// Blanc interface strings: an ICU MessageFormat subset (placeholders, one
// plural per message, numbered non-nesting tags) plus the DOM applier.
// Served flat to every blanc-chrome:// and blanc:// document AND required by
// main and by node tests. Output is always plain text: callers assign it with
// textContent/setAttribute, never innerHTML.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else {
    root.blancI18n = api;
    if (root.document && root.blancStrings) api.bootstrap(root);
  }
})(typeof self !== 'undefined' ? self : this, function () {
  const SELECTOR = /^\s*(=\d+|zero|one|two|few|many|other)\s*\{/;
  const ARG_HEAD = /^\s*([A-Za-z_]\w*)\s*(?:,\s*(plural)\s*,)?\s*/;

  function parseMessage(source) {
    const text = String(source);
    let i = 0;
    let pluralCount = 0;
    const seenTags = new Set();
    const fail = (why) => { throw new SyntaxError(`${why} at ${i} in ${JSON.stringify(text)}`); };

    function parseArgument(ctx) {
      i += 1; // '{'
      const head = ARG_HEAD.exec(text.slice(i));
      if (!head) fail('Expected an argument name');
      i += head[0].length;
      if (!head[2]) {
        if (text[i] !== '}') fail('Expected }');
        i += 1;
        return { type: 'arg', name: head[1] };
      }
      pluralCount += 1;
      if (pluralCount > 1) fail('Only one plural per message');
      const branches = {};
      for (;;) {
        const sel = SELECTOR.exec(text.slice(i));
        if (!sel) break;
        i += sel[0].length;
        if (branches[sel[1]]) fail(`Duplicate branch ${sel[1]}`);
        branches[sel[1]] = parseNodes({ inPlural: true, tag: ctx.tag });
        if (text[i] !== '}') fail('Expected } after a plural branch');
        i += 1;
      }
      const tail = /^\s*\}/.exec(text.slice(i));
      if (!tail) fail('Expected } after the plural');
      i += tail[0].length;
      if (!branches.other) fail('A plural needs an other branch');
      return { type: 'plural', name: head[1], branches };
    }

    function parseNodes(ctx) {
      const nodes = [];
      let buffer = '';
      const flush = () => { if (buffer) { nodes.push({ type: 'text', value: buffer }); buffer = ''; } };
      while (i < text.length) {
        const ch = text[i];
        if (ch === "'" && text[i + 1] === "'") { buffer += "'"; i += 2; continue; }
        if (ch === '}') { if (ctx.inPlural) break; fail('Unexpected }'); }
        if (ch === '{') { flush(); nodes.push(parseArgument(ctx)); continue; }
        if (ch === '#' && ctx.inPlural) { flush(); nodes.push({ type: 'pound' }); i += 1; continue; }
        if (ch === '<') {
          const close = /^<\/(\d+)>/.exec(text.slice(i));
          if (close) {
            if (ctx.tag === Number(close[1])) break;
            fail('Unexpected closing tag');
          }
          const open = /^<(\d+)>/.exec(text.slice(i));
          if (open) {
            if (ctx.tag !== undefined) fail('Tags cannot nest');
            const index = Number(open[1]);
            if (seenTags.has(index)) fail(`Tag <${index}> used twice`);
            seenTags.add(index);
            flush();
            i += open[0].length;
            const children = parseNodes({ inPlural: ctx.inPlural, tag: index });
            const end = `</${index}>`;
            if (!text.startsWith(end, i)) fail(`Missing ${end}`);
            i += end.length;
            nodes.push({ type: 'tag', index, children });
            continue;
          }
        }
        buffer += ch;
        i += 1;
      }
      flush();
      return nodes;
    }

    const nodes = parseNodes({ inPlural: false, tag: undefined });
    if (i < text.length) fail('Unexpected input');
    if (/\{\s*\w+\s*,\s*(select|selectordinal|number|date|time)\b/.test(text)) fail('Unsupported argument type');
    return nodes;
  }

  function walk(nodes, visit) {
    for (const node of nodes) {
      visit(node);
      if (node.type === 'tag') walk(node.children, visit);
      if (node.type === 'plural') for (const branch of Object.values(node.branches)) walk(branch, visit);
    }
  }

  function analyzeMessage(nodes) {
    const args = new Set();
    const plurals = {};
    const tags = new Set();
    let pluralCount = 0;
    walk(nodes, (node) => {
      if (node.type === 'arg') args.add(node.name);
      if (node.type === 'plural') {
        pluralCount += 1;
        args.add(node.name);
        plurals[node.name] = Object.keys(node.branches).sort();
      }
      if (node.type === 'tag') tags.add(node.index);
    });
    return { args: [...args].sort(), plurals, tags: [...tags].sort((a, b) => a - b), pluralCount };
  }

  function maxLiteralLength(nodes) {
    let total = 0;
    for (const node of nodes) {
      if (node.type === 'text') total += node.value.length;
      else if (node.type === 'tag') total += maxLiteralLength(node.children);
      else if (node.type === 'plural') {
        total += Math.max(...Object.values(node.branches).map(maxLiteralLength));
      }
    }
    return total;
  }

  function stringifyMessage(nodes) {
    return nodes.map((node) => {
      if (node.type === 'text') return node.value.replace(/'/g, "''");
      if (node.type === 'arg') return `{${node.name}}`;
      if (node.type === 'pound') return '#';
      if (node.type === 'tag') return `<${node.index}>${stringifyMessage(node.children)}</${node.index}>`;
      const branches = Object.entries(node.branches)
        .map(([selector, branch]) => `${selector} {${stringifyMessage(branch)}}`).join(' ');
      return `{${node.name}, plural, ${branches}}`;
    }).join('');
  }

  function render(nodes, ctx, out, tag) {
    const push = (value) => {
      const last = out[out.length - 1];
      if (last && last.tag === tag) last.text += value;
      else out.push(tag === undefined ? { text: value } : { tag, text: value });
    };
    for (const node of nodes) {
      if (node.type === 'text') push(node.value);
      else if (node.type === 'arg') {
        push(Object.prototype.hasOwnProperty.call(ctx.params, node.name)
          ? String(ctx.params[node.name]) : `{${node.name}}`);
      } else if (node.type === 'pound') push(ctx.number.format(ctx.count));
      else if (node.type === 'tag') render(node.children, ctx, out, node.index);
      else if (node.type === 'plural') {
        const count = Number(ctx.params[node.name]);
        const branch = node.branches[`=${count}`]
          ?? node.branches[ctx.plural.select(count)]
          ?? node.branches.other;
        render(branch, { ...ctx, count }, out, tag);
      }
    }
    return out;
  }

  function createTranslator({ locale, formatLocale = locale, messages, fallback = {}, onMissing } = {}) {
    const own = Object.prototype.hasOwnProperty;
    const number = new Intl.NumberFormat(formatLocale);
    const pluralFor = { own: new Intl.PluralRules(locale), fallback: new Intl.PluralRules('en') };
    const cache = new Map();
    const reported = new Set();

    function lookup(key) {
      if (cache.has(key)) return cache.get(key);
      let entry = null;
      if (own.call(messages, key)) entry = { nodes: parseMessage(messages[key]), plural: pluralFor.own };
      else if (own.call(fallback, key)) entry = { nodes: parseMessage(fallback[key]), plural: pluralFor.fallback };
      if (entry) cache.set(key, entry);
      return entry;
    }

    function parts(key, params = {}) {
      const entry = lookup(key);
      if (!entry) {
        if (!reported.has(key)) { reported.add(key); onMissing?.(key); }
        return [{ text: key }];
      }
      return render(entry.nodes, { params, number, plural: entry.plural, count: 0 }, [], undefined);
    }

    const t = (key, params) => parts(key, params).map((part) => part.text).join('');
    t.parts = parts;
    t.has = (key) => own.call(messages, key) || own.call(fallback, key);
    t.locale = locale;
    t.formatLocale = formatLocale;
    return t;
  }

  return { parseMessage, analyzeMessage, maxLiteralLength, stringifyMessage, createTranslator };
});
```

Note: Task 2 adds `applyDocument` and `bootstrap` to the returned object; the UMD wrapper already calls `api.bootstrap` only in a browser with `self.blancStrings` present.

- [ ] **Step 4: Run tests**

Run: `node --test test/unit/i18n-format.test.js`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/pages/i18n.js test/unit/i18n-format.test.js
git commit -m "Add the interface-string formatter and translator"
```

---

### Task 2: DOM applier and browser bootstrap

**Files:**
- Modify: `src/renderer/pages/i18n.js` (add to the returned API)
- Test: `test/unit/i18n-dom.test.js`

**Interfaces:**
- Consumes: `createTranslator` (Task 1).
- Produces on the API object: `applyDocument(root, t)`, `applyElement(el, t)`, `bootstrap(globalScope) → t`. After `bootstrap`, the API also has `t`, `parts`, and `formatLocale()` (returns `blancStrings.formatLocale ?? blancStrings.locale`).
- Attribute contract: `data-i18n` (text or rich text), `data-i18n-title`, `data-i18n-aria-label`, `data-i18n-placeholder`, `data-i18n-alt`, `data-i18n-tooltip` (→ `data-tooltip`). `data-i18n-ignore` is a marker only (no effect here).

- [ ] **Step 1: Write the failing tests**

```js
// test/unit/i18n-dom.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const i18n = require('../../src/renderer/pages/i18n');

// Minimal fake DOM: just what the applier touches.
function element(tag, { dataset = {}, children = [], text = '' } = {}) {
  const el = {
    tagName: tag, dataset, attributes: {}, children, ownerDocument: null, _text: text, _nodes: null,
    setAttribute(name, value) { this.attributes[name] = String(value); },
    get textContent() { return this._nodes ? this._nodes.map((n) => n.textContent ?? n.data).join('') : this._text; },
    set textContent(value) { this._text = String(value); this._nodes = null; },
    replaceChildren(...nodes) { this._nodes = nodes; },
  };
  return el;
}
function documentWith(elements, { readyState = 'complete' } = {}) {
  const listeners = {};
  const doc = {
    readyState,
    documentElement: { lang: 'en', dir: '', style: { visibility: '' } },
    querySelectorAll: () => elements,
    createTextNode: (data) => ({ data }),
    addEventListener: (type, fn) => { listeners[type] = fn; },
    fire: (type) => listeners[type]?.(),
  };
  for (const el of elements) el.ownerDocument = doc;
  return doc;
}

test('applyDocument sets text and every supported attribute', () => {
  const t = i18n.createTranslator({ locale: 'de', messages: {
    'a.label': 'Sprache', 'a.title': 'Titel', 'a.aria': 'Bezeichnung', 'a.ph': 'Suchen', 'a.alt': 'Bild', 'a.tip': 'Tipp',
  } });
  const el = element('span', { dataset: {
    i18n: 'a.label', i18nTitle: 'a.title', i18nAriaLabel: 'a.aria', i18nPlaceholder: 'a.ph', i18nAlt: 'a.alt', i18nTooltip: 'a.tip',
  }, text: 'Language' });
  i18n.applyDocument(documentWith([el]), t);
  assert.equal(el.textContent, 'Sprache');
  assert.deepEqual(el.attributes, {
    title: 'Titel', 'aria-label': 'Bezeichnung', placeholder: 'Suchen', alt: 'Bild', 'data-tooltip': 'Tipp',
  });
});

test('rich messages map numbered tags onto existing children, keeping the elements', () => {
  const link = element('a', { text: 'Fill logins' });
  const p = element('p', { dataset: { i18n: 'rich' }, children: [link] });
  const t = i18n.createTranslator({ locale: 'de', messages: { rich: 'Aktiviere <0>Logins ausfüllen</0> in den Einstellungen' } });
  i18n.applyDocument(documentWith([p]), t);
  assert.equal(link.textContent, 'Logins ausfüllen');
  assert.equal(p._nodes[1], link, 'the same child element is reused');
  assert.equal(p.textContent, 'Aktiviere Logins ausfüllen in den Einstellungen');
});

test('a rich message naming a missing child throws', () => {
  const p = element('p', { dataset: { i18n: 'rich' }, children: [] });
  const t = i18n.createTranslator({ locale: 'en', messages: { rich: 'a <0>b</0>' } });
  assert.throws(() => i18n.applyDocument(documentWith([p]), t), /no child element/);
});

test('bootstrap sets lang and dir, hides non-English documents until applied, then reveals', () => {
  const el = element('span', { dataset: { i18n: 'k' }, text: 'Language' });
  const doc = documentWith([el], { readyState: 'loading' });
  const scope = {
    document: doc, console: { warn() {} }, setTimeout: () => {},
    blancStrings: { locale: 'de', dir: 'ltr', formatLocale: 'de-AT', messages: { k: 'Sprache' }, fallback: {} },
  };
  const api = require('../../src/renderer/pages/i18n');
  api.bootstrap(scope);
  assert.equal(doc.documentElement.lang, 'de');
  assert.equal(doc.documentElement.dir, 'ltr');
  assert.equal(doc.documentElement.style.visibility, 'hidden');
  assert.equal(el.textContent, 'Language', 'nothing applied before DOMContentLoaded');
  doc.fire('DOMContentLoaded');
  assert.equal(el.textContent, 'Sprache');
  assert.equal(doc.documentElement.style.visibility, '');
  assert.equal(api.formatLocale(), 'de-AT');
  assert.equal(api.t('k'), 'Sprache');
});

test('bootstrap never hides an English document', () => {
  const doc = documentWith([]);
  require('../../src/renderer/pages/i18n').bootstrap({
    document: doc, setTimeout: () => {},
    blancStrings: { locale: 'en', dir: 'ltr', messages: {}, fallback: {} },
  });
  assert.equal(doc.documentElement.style.visibility, '');
});

test('bootstrap reveals the document even when applying throws', () => {
  const p = element('p', { dataset: { i18n: 'rich' }, children: [] });
  const doc = documentWith([p]);
  const api = require('../../src/renderer/pages/i18n');
  assert.throws(() => api.bootstrap({
    document: doc, setTimeout: () => {},
    blancStrings: { locale: 'de', dir: 'ltr', messages: { rich: 'a <0>b</0>' }, fallback: {} },
  }));
  assert.equal(doc.documentElement.style.visibility, '');
});

test('strict mode turns a missing key into an exception', () => {
  const el = element('span', { dataset: { i18n: 'absent' } });
  const api = require('../../src/renderer/pages/i18n');
  assert.throws(() => api.bootstrap({
    document: documentWith([el]), setTimeout: () => {},
    blancStrings: { locale: 'en', dir: 'ltr', messages: {}, fallback: {}, strict: true },
  }), /missing interface string: absent/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/unit/i18n-dom.test.js`
Expected: FAIL with `i18n.applyDocument is not a function`.

- [ ] **Step 3: Add the applier and bootstrap**

In `src/renderer/pages/i18n.js`, replace the final `return { … };` with:

```js
  const ATTRIBUTES = [
    ['i18nTitle', 'title'],
    ['i18nAriaLabel', 'aria-label'],
    ['i18nPlaceholder', 'placeholder'],
    ['i18nAlt', 'alt'],
    ['i18nTooltip', 'data-tooltip'],
  ];
  const SELECTOR_ALL = '[data-i18n],[data-i18n-title],[data-i18n-aria-label],[data-i18n-placeholder],[data-i18n-alt],[data-i18n-tooltip]';

  function applyElement(el, t) {
    const key = el.dataset.i18n;
    if (key) {
      const parts = t.parts(key);
      if (!parts.some((part) => part.tag !== undefined)) {
        el.textContent = parts.map((part) => part.text).join('');
      } else {
        const children = Array.from(el.children);
        el.replaceChildren(...parts.map((part) => {
          if (part.tag === undefined) return el.ownerDocument.createTextNode(part.text);
          const child = children[part.tag];
          if (!child) throw new Error(`data-i18n="${key}": tag <${part.tag}> has no child element`);
          child.textContent = part.text;
          return child;
        }));
      }
    }
    for (const [prop, attribute] of ATTRIBUTES) {
      if (el.dataset[prop]) el.setAttribute(attribute, t(el.dataset[prop]));
    }
  }

  function applyDocument(root, t) {
    for (const el of root.querySelectorAll(SELECTOR_ALL)) applyElement(el, t);
  }

  const api = { parseMessage, analyzeMessage, maxLiteralLength, stringifyMessage, createTranslator, applyElement, applyDocument };

  api.bootstrap = function bootstrap(scope) {
    const data = scope.blancStrings;
    const doc = scope.document;
    const t = createTranslator({
      locale: data.locale,
      formatLocale: data.formatLocale ?? data.locale,
      messages: data.messages,
      fallback: data.fallback ?? {},
      onMissing: (key) => {
        if (data.strict) throw new Error(`missing interface string: ${key}`);
        scope.console?.warn?.(`missing interface string: ${key}`);
      },
    });
    api.t = t;
    api.parts = t.parts;
    api.formatLocale = () => data.formatLocale ?? data.locale;
    doc.documentElement.lang = data.locale;
    doc.documentElement.dir = data.dir ?? 'ltr';
    // Hide a translated document until its static text is applied, so it never
    // flashes English. CSSOM (not a style attribute) is allowed by style-src 'self'.
    const hide = data.locale !== 'en';
    const reveal = () => { if (hide) doc.documentElement.style.visibility = ''; };
    if (hide) doc.documentElement.style.visibility = 'hidden';
    scope.setTimeout?.(reveal, 1000);
    const run = () => { try { applyDocument(doc, t); } finally { reveal(); } };
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', run, { once: true });
    else run();
    return t;
  };

  return api;
```

- [ ] **Step 4: Run tests**

Run: `node --test test/unit/i18n-format.test.js test/unit/i18n-dom.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/pages/i18n.js test/unit/i18n-dom.test.js
git commit -m "Add the interface-string DOM applier and bootstrap"
```

---

### Task 3: Catalog validation library

**Files:**
- Create: `copy/lib/catalog.mjs`
- Test: `test/unit/i18n-catalog.test.js`

**Interfaces:**
- Consumes: `parseMessage`, `analyzeMessage`, `maxLiteralLength`, `stringifyMessage` (Task 1) via `createRequire`.
- Produces (ESM):
  - `KEY_PATTERN` (`/^[a-z][A-Za-z0-9]*(\.[a-z0-9][A-Za-z0-9]*)+$/`)
  - `entryHash(enEntry) → 'sha256:<hex>'` over `message + '\u0000' + note`
  - `validateSource(en) → string[]`
  - `checkTranslation({ key, enEntry, trEntry, glossary, locale }) → string[]`
  - `catalogReport({ en, translations, glossary }) → { sourceProblems: string[], locales: { [code]: { status, total, covered, missing: string[], stale: string[], invalid: string[], orphans: string[] } } }`
  - `reportFailures(report) → { failures: string[], warnings: string[] }`
  - `pseudoLocalize(message) → string`
  - `runtimeCatalog({ locale, dir, en, tr }) → { locale, dir, messages, fallback }`

- [ ] **Step 1: Write the failing tests (one per rule — these are the positive controls)**

```js
// test/unit/i18n-catalog.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

let lib;
test.before(async () => { lib = await import('../../copy/lib/catalog.mjs'); });

const glossary = {
  fixed: ['Blanc', '1Password'],
  fixedPatterns: ['(?<![\\w/:])/[a-z][a-z0-9-]*', '⌘'],
  terms: { 'Quiet Tabs': { de: { form: 'Ruhende Tabs', stem: 'uhend' } } },
  sameAsSource: { de: ['ok.same'] },
};
const en = (message, extra = {}) => ({ message, note: 'n', ...extra });
const fresh = (enEntry, message) => ({ message, source: lib.entryHash(enEntry) });
const problemsFor = (enEntry, message, key = 'k.x') =>
  lib.checkTranslation({ key, enEntry, trEntry: fresh(enEntry, message), glossary, locale: 'de' });

test('entryHash covers the message and the note', () => {
  const a = lib.entryHash(en('Open'));
  assert.match(a, /^sha256:[0-9a-f]{64}$/);
  assert.notEqual(a, lib.entryHash(en('Open', { note: 'other context' })));
  assert.notEqual(a, lib.entryHash(en('Open it')));
});

test('validateSource rejects bad keys, missing notes, unparseable messages and English over maxLength', () => {
  const problems = lib.validateSource({
    'Bad Key': en('x'),
    'a.noNote': { message: 'x' },
    'a.broken': en('{oops'),
    'a.long': en('Far too long', { maxLength: 3 }),
    'a.fine': en('Fine'),
  });
  assert.equal(problems.length, 4, problems.join('\n'));
});

test('a correct translation has no problems', () => {
  assert.deepEqual(problemsFor(en('Open {site} in Blanc'), '{site} in Blanc öffnen'), []);
});

test('dropped placeholder fails', () => {
  assert.match(problemsFor(en('Open {site}'), 'Öffnen').join(), /placeholders/);
});

test('missing other branch fails (parse error)', () => {
  assert.match(problemsFor(en('{n, plural, one {# tab} other {# tabs}}'), '{n, plural, one {# Tab}}').join(), /other/);
});

test('different exact branches fail', () => {
  assert.match(problemsFor(en('{n, plural, =0 {none} other {# tabs}}'), '{n, plural, other {# Tabs}}').join(), /exact/);
});

test('tag mismatch fails', () => {
  assert.match(problemsFor(en('Turn on <0>Fill</0>'), 'Aktiviere Ausfüllen').join(), /tags/);
});

test('missing fixed term fails', () => {
  assert.match(problemsFor(en('Fill from 1Password'), 'Aus dem Passwortmanager ausfüllen').join(), /1Password/);
});

test('missing fixed pattern (slash command) fails, but a URL path does not count', () => {
  assert.match(problemsFor(en('Type /sleep'), 'Tippe /ruhe').join(), /\/sleep/);
  assert.deepEqual(problemsFor(en('Open blanc://settings'), 'blanc://settings öffnen'), []);
});

test('missing glossary stem fails (case-insensitive term match in English)', () => {
  assert.match(problemsFor(en('Turn off quiet tabs'), 'Schlafende Tabs ausschalten').join(), /uhend/);
  assert.deepEqual(problemsFor(en('Turn off quiet tabs'), 'Ruhende Tabs ausschalten'), []);
});

test('maxLength overflow fails, placeholders count as zero', () => {
  assert.match(problemsFor(en('Close', { maxLength: 6 }), 'Schließen').join(), /maxLength/);
  assert.deepEqual(problemsFor(en('{a}', { maxLength: 1 }), '{a}'), []);
});

test('identical to English fails unless exempt', () => {
  assert.match(problemsFor(en('Download'), 'Download').join(), /identical/);
  assert.deepEqual(problemsFor(en('{site} · ⌘'), '{site} · ⌘'), []);
  assert.deepEqual(problemsFor(en('Blanc'), 'Blanc'), []);
  assert.deepEqual(problemsFor(en('System'), 'System', 'ok.same'), []);
});

test('catalogReport classifies missing, stale, invalid and orphan entries', () => {
  const enCat = { 'a.one': en('One'), 'a.two': en('Two'), 'a.three': en('Three {x}'), 'a.four': en('Four') };
  const report = lib.catalogReport({
    en: enCat,
    glossary,
    translations: { de: {
      $meta: { locale: 'de', endonym: 'Deutsch', dir: 'ltr', status: 'hidden' },
      'a.one': fresh(enCat['a.one'], 'Eins'),
      'a.two': { message: 'Zwei', source: 'sha256:old' },
      'a.three': fresh(enCat['a.three'], 'Drei'),
      'a.gone': { message: 'Weg', source: 'sha256:x' },
      'a.four': { message: 'Vier' },
    } },
  });
  const de = report.locales.de;
  assert.deepEqual(de.missing, ['a.four']);
  assert.deepEqual(de.stale, ['a.two']);
  assert.equal(de.invalid.length, 1);
  assert.deepEqual(de.orphans, ['a.gone']);
  assert.equal(de.covered, 1);
  assert.equal(de.total, 4);
});

test('hidden locales only warn on missing/stale; selectable locales fail; invalid and orphans always fail', () => {
  const base = { sourceProblems: [], locales: { de: { status: 'hidden', total: 2, covered: 1, missing: ['a'], stale: [], invalid: [], orphans: [] } } };
  assert.deepEqual(lib.reportFailures(base).failures, []);
  assert.equal(lib.reportFailures(base).warnings.length, 1);
  base.locales.de.status = 'selectable';
  assert.match(lib.reportFailures(base).failures.join(), /below 100%/);
  base.locales.de = { status: 'hidden', total: 1, covered: 0, missing: [], stale: [], invalid: ['a.x: bad'], orphans: ['a.y'] };
  assert.equal(lib.reportFailures(base).failures.length, 2);
});

test('pseudoLocalize accents, expands and brackets text and every tag, keeping syntax intact', () => {
  const out = lib.pseudoLocalize('Open <0>{count, plural, one {# tab} other {# tabs}}</0>');
  assert.match(out, /^⟦Öþéñ /);
  assert.match(out, /<0>⟦\{count, plural, one \{# ţáƀ\} other \{# ţáƀš\}\}⟧<\/0>/);
  assert.match(out, /~+⟧$/);
});

test('runtimeCatalog uses current and stale translations, and falls back to English for missing ones', () => {
  const enCat = { 'a.one': en('One'), 'a.two': en('Two') };
  const runtime = lib.runtimeCatalog({ locale: 'de', dir: 'ltr', en: enCat, tr: {
    $meta: {}, 'a.one': { message: 'Eins', source: 'sha256:stale' },
  } });
  assert.deepEqual(runtime, { locale: 'de', dir: 'ltr', messages: { 'a.one': 'Eins' }, fallback: { 'a.two': 'Two' } });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test test/unit/i18n-catalog.test.js`
Expected: FAIL with `Cannot find module '…/copy/lib/catalog.mjs'`.

- [ ] **Step 3: Implement `copy/lib/catalog.mjs`**

```js
// copy/lib/catalog.mjs — pure catalog rules for the interface-string substrate.
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { parseMessage, analyzeMessage, maxLiteralLength, stringifyMessage } =
  require('../../src/renderer/pages/i18n.js');

export const KEY_PATTERN = /^[a-z][A-Za-z0-9]*(\.[a-z0-9][A-Za-z0-9]*)+$/;
const isEntryKey = (key) => !key.startsWith('$');

export function entryHash(enEntry) {
  return 'sha256:' + createHash('sha256').update(`${enEntry.message}\u0000${enEntry.note ?? ''}`).digest('hex');
}

function tryParse(message) {
  try { return { nodes: parseMessage(message) }; } catch (error) { return { error: error.message }; }
}

export function validateSource(en) {
  const problems = [];
  for (const [key, entry] of Object.entries(en).filter(([k]) => isEntryKey(k))) {
    if (!KEY_PATTERN.test(key)) problems.push(`${key}: key must be dotted lowerCamel segments`);
    if (typeof entry?.message !== 'string') { problems.push(`${key}: message must be a string`); continue; }
    if (typeof entry.note !== 'string' || !entry.note.trim()) problems.push(`${key}: note is required`);
    const parsed = tryParse(entry.message);
    if (parsed.error) { problems.push(`${key}: ${parsed.error}`); continue; }
    if (entry.maxLength !== undefined) {
      if (!Number.isInteger(entry.maxLength) || entry.maxLength < 1) problems.push(`${key}: maxLength must be a positive integer`);
      else if (maxLiteralLength(parsed.nodes) > entry.maxLength) problems.push(`${key}: English exceeds maxLength ${entry.maxLength}`);
    }
  }
  return problems;
}

const patternsOf = (glossary) => (glossary.fixedPatterns ?? []).map((source) => new RegExp(source, 'gu'));
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function strippedOfExempt(message, glossary) {
  let text = message.replace(/\{[^{}]*\}/g, '').replace(/<\/?\d+>/g, '');
  for (const term of glossary.fixed ?? []) text = text.split(term).join('');
  for (const pattern of patternsOf(glossary)) text = text.replace(pattern, '');
  return text;
}

export function checkTranslation({ key, enEntry, trEntry, glossary, locale }) {
  const problems = [];
  const enParsed = tryParse(enEntry.message);
  const trParsed = tryParse(trEntry.message);
  if (enParsed.error) return [`${key}: English does not parse`];
  if (trParsed.error) return [`${key}: ${trParsed.error}`];
  const a = analyzeMessage(enParsed.nodes);
  const b = analyzeMessage(trParsed.nodes);
  if (a.args.join() !== b.args.join()) problems.push(`${key}: placeholders differ (${a.args} vs ${b.args})`);
  for (const [name, selectors] of Object.entries(a.plurals)) {
    const exact = (list) => (list ?? []).filter((s) => s.startsWith('=')).join();
    if (!b.plurals[name]) continue; // reported as a placeholder difference
    if (exact(selectors) !== exact(b.plurals[name])) problems.push(`${key}: exact plural branches differ`);
  }
  if (a.tags.join() !== b.tags.join()) problems.push(`${key}: tags differ (${a.tags} vs ${b.tags})`);
  for (const term of glossary.fixed ?? []) {
    if (enEntry.message.includes(term) && !trEntry.message.includes(term)) problems.push(`${key}: fixed term "${term}" missing`);
  }
  for (const pattern of patternsOf(glossary)) {
    for (const match of enEntry.message.matchAll(pattern)) {
      if (!trEntry.message.includes(match[0])) problems.push(`${key}: fixed "${match[0]}" missing`);
    }
  }
  for (const [term, perLocale] of Object.entries(glossary.terms ?? {})) {
    const rule = perLocale[locale];
    if (!rule) continue;
    if (new RegExp(`\\b${escapeRegExp(term)}\\b`, 'i').test(enEntry.message)
      && !trEntry.message.toLowerCase().includes(rule.stem.toLowerCase())) {
      problems.push(`${key}: glossary term "${term}" needs "${rule.form}" (stem "${rule.stem}")`);
    }
  }
  if (enEntry.maxLength !== undefined && maxLiteralLength(trParsed.nodes) > enEntry.maxLength) {
    problems.push(`${key}: exceeds maxLength ${enEntry.maxLength}`);
  }
  const exempt = (glossary.sameAsSource?.[locale] ?? []).includes(key)
    || !/\p{L}/u.test(strippedOfExempt(enEntry.message, glossary));
  if (!exempt && trEntry.message === enEntry.message) problems.push(`${key}: identical to English`);
  return problems;
}

export function catalogReport({ en, translations, glossary }) {
  const keys = Object.keys(en).filter(isEntryKey);
  const report = { sourceProblems: validateSource(en), locales: {} };
  for (const [code, tr] of Object.entries(translations)) {
    const entry = { status: tr.$meta?.status ?? 'hidden', total: keys.length, covered: 0, missing: [], stale: [], invalid: [], orphans: [] };
    for (const key of keys) {
      const trEntry = tr[key];
      if (!trEntry || typeof trEntry.message !== 'string' || !trEntry.source) { entry.missing.push(key); continue; }
      const problems = checkTranslation({ key, enEntry: en[key], trEntry, glossary, locale: code });
      if (problems.length) { entry.invalid.push(...problems); continue; }
      if (trEntry.source !== entryHash(en[key])) { entry.stale.push(key); continue; }
      entry.covered += 1;
    }
    entry.orphans = Object.keys(tr).filter((key) => isEntryKey(key) && !Object.hasOwn(en, key));
    report.locales[code] = entry;
  }
  return report;
}

export function reportFailures(report) {
  const failures = [...report.sourceProblems];
  const warnings = [];
  for (const [code, r] of Object.entries(report.locales)) {
    failures.push(...r.invalid.map((p) => `${code}: ${p}`));
    failures.push(...r.orphans.map((k) => `${code}: ${k} is not in en.json`));
    const gap = r.missing.length + r.stale.length;
    if (r.status === 'selectable' && gap) {
      failures.push(`${code}: selectable but below 100% (${r.missing.length} missing, ${r.stale.length} stale)`);
    } else if (gap) {
      warnings.push(`${code} (hidden): ${r.covered}/${r.total} current, ${r.missing.length} missing, ${r.stale.length} stale`);
    }
  }
  return { failures, warnings };
}

const ACCENTS = {
  a: 'á', b: 'ƀ', c: 'ç', d: 'ð', e: 'é', f: 'ƒ', g: 'ĝ', h: 'ĥ', i: 'î', j: 'ĵ', k: 'ķ', l: 'ļ', n: 'ñ', o: 'ö', p: 'þ',
  r: 'ŕ', s: 'š', t: 'ţ', u: 'ü', w: 'ŵ', y: 'ý', z: 'ž',
  A: 'Å', C: 'Ç', D: 'Ð', E: 'É', G: 'Ĝ', H: 'Ĥ', I: 'Î', L: 'Ļ', N: 'Ñ', O: 'Ö', R: 'Ŕ', S: 'Š', T: 'Ţ', U: 'Ü', Y: 'Ý', Z: 'Ž',
};
const accent = (text) => text.replace(/[A-Za-z]/g, (ch) => ACCENTS[ch] ?? ch);

function pseudoNodes(nodes) {
  return nodes.map((node) => {
    if (node.type === 'text') return { ...node, value: accent(node.value) };
    if (node.type === 'tag') return { ...node, children: [{ type: 'text', value: '⟦' }, ...pseudoNodes(node.children), { type: 'text', value: '⟧' }] };
    if (node.type === 'plural') {
      return { ...node, branches: Object.fromEntries(Object.entries(node.branches).map(([s, b]) => [s, pseudoNodes(b)])) };
    }
    return node;
  });
}

export function pseudoLocalize(message) {
  const nodes = parseMessage(message);
  const padding = '~'.repeat(Math.max(1, Math.ceil(maxLiteralLength(nodes) * 0.4)));
  return `⟦${stringifyMessage(pseudoNodes(nodes))}${padding}⟧`;
}

export function runtimeCatalog({ locale, dir, en, tr }) {
  const messages = {};
  const fallback = {};
  for (const key of Object.keys(en).filter(isEntryKey)) {
    if (tr && typeof tr[key]?.message === 'string' && tr[key].source) messages[key] = tr[key].message;
    else fallback[key] = en[key].message;
  }
  return { locale, dir, messages, fallback };
}
```

Note for the pseudo test: `ţáƀ` comes from `tab`. Inside a plural branch, `#` is preserved because `pseudoNodes` leaves `pound` nodes untouched.

- [ ] **Step 4: Run tests**

Run: `node --test test/unit/i18n-catalog.test.js`
Expected: PASS. If the pseudo regex fails only because a literal accent differs, fix the test's expected characters to match `ACCENTS`, never the other way round.

- [ ] **Step 5: Commit**

```bash
git add copy/lib/catalog.mjs test/unit/i18n-catalog.test.js
git commit -m "Add interface-catalog validation rules with positive controls"
```

---

### Task 4: Hard-coded-English source scanner

**Files:**
- Create: `copy/lib/scan-source.mjs`
- Test: `test/unit/i18n-scan.test.js`

**Interfaces:**
- Produces:
  - `scanHtml(html, { en, allow }) → { problems: string[], scanned: number }`
  - `scanJs(js, { allow, kind, en }) → { problems: string[], scanned: number }` where `kind` is `'renderer' | 'main'`
  - `scanFile(relPath, text, { en, allow }) → { problems, scanned }` (dispatch by extension)
- `allow` is the per-file list from `i18n-scope.json`: exact literal strings that are reviewed non-user-visible or symbol-only text.
- Rules (from the spec):
  - **HTML:** every non-whitespace text node containing a letter must sit in an element carrying `data-i18n`, or inside `data-i18n-ignore`, `<script>`, `<style>` or `<svg>`. Every `title`, `aria-label`, `placeholder`, `alt`, `data-tooltip` attribute with a letter needs its `data-i18n-*` counterpart. An element with `data-i18n` whose inline text (tags stripped, whitespace collapsed) differs from `en.json`'s rendered English (`t(key)` with no params) is a problem.
  - **JS:** a string or template literal containing a letter, assigned to `.textContent`, `.title`, `.placeholder`, `.ariaLabel`, `.innerText`, or passed to `setAttribute('title'|'aria-label'|'placeholder'|'alt', …)`; in `main` files additionally a literal as the value of `label:`, `message:`, `detail:`, `title:`, `buttons: [`, `checkboxLabel:`. Every literal key passed to `t('…')`, `blancI18n.t('…')`, `mainI18n.t('…')` or `.parts('…')` must exist in `en.json` (strict test runs would otherwise throw at runtime). `scanned` counts every candidate site found, so tests can assert the scanner actually saw the fixture.

- [ ] **Step 1: Write the failing tests**

```js
// test/unit/i18n-scan.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

let scan;
test.before(async () => { scan = await import('../../copy/lib/scan-source.mjs'); });
const en = { 'a.title': { message: 'Settings', note: 'n' }, 'a.rich': { message: 'Turn on <0>Fill</0> now', note: 'n' } };

test('HTML: untagged text node fails; tagged, ignored, svg and symbol-only text pass', () => {
  const bad = scan.scanHtml('<p>Hello there</p>', { en, allow: [] });
  assert.equal(bad.problems.length, 1);
  assert.ok(bad.scanned >= 1);
  const good = scan.scanHtml([
    '<h1 data-i18n="a.title">Settings</h1>',
    '<span data-i18n-ignore>example.com</span>',
    '<svg><title>icon</title></svg>',
    '<button>✕</button>',
    '<p data-i18n="a.rich">Turn on <a href="#">Fill</a> now</p>',
  ].join(''), { en, allow: [] });
  assert.deepEqual(good.problems, []);
  assert.ok(good.scanned >= 4);
});

test('HTML: attribute without data-i18n counterpart fails', () => {
  const r = scan.scanHtml('<button aria-label="Close tab">✕</button>', { en, allow: [] });
  assert.match(r.problems.join(), /aria-label/);
});

test('HTML: inline English that differs from en.json fails', () => {
  const r = scan.scanHtml('<h1 data-i18n="a.title">Preferences</h1>', { en, allow: [] });
  assert.match(r.problems.join(), /differs from en.json/);
});

test('HTML: unknown data-i18n key fails', () => {
  assert.match(scan.scanHtml('<h1 data-i18n="a.nope">x</h1>', { en, allow: [] }).problems.join(), /unknown key/);
});

test('JS renderer: literal assignments fail, t() calls and allowlisted literals pass', () => {
  const bad = scan.scanJs([
    "el.textContent = 'Close tab';",
    'el.title = `Open ${name}`;',
    "el.setAttribute('aria-label', 'Back');",
  ].join('\n'), { allow: [], kind: 'renderer' });
  assert.equal(bad.problems.length, 3);
  const good = scan.scanJs([
    "el.textContent = blancI18n.t('a.title');",
    "el.textContent = '✕';",
    "el.textContent = 'internal';",
    'el.textContent = value;',
  ].join('\n'), { allow: ['internal'], kind: 'renderer' });
  assert.deepEqual(good.problems, []);
  assert.equal(good.scanned, 4);
});

test('JS main: menu/dialog literals fail', () => {
  const r = scan.scanJs("{ label: 'Reload', click }\ndialog.showMessageBox({ message: 'Update ready', buttons: ['Restart Now'] })",
    { allow: [], kind: 'main' });
  assert.equal(r.problems.length, 3);
});

test('JS: a t() call naming a key missing from en.json fails', () => {
  const r = scan.scanJs("el.textContent = blancI18n.t('a.missing');\nx = mainI18n.t('a.title');", { allow: [], kind: 'renderer', en });
  assert.equal(r.problems.length, 1);
  assert.match(r.problems[0], /a\.missing/);
});

test('JS: commented-out code is not scanned', () => {
  const r = scan.scanJs("// el.textContent = 'Close tab';\n/* el.title = 'x y' */", { allow: [], kind: 'renderer' });
  assert.deepEqual(r.problems, []);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test test/unit/i18n-scan.test.js`
Expected: FAIL with `Cannot find module`.

- [ ] **Step 3: Implement `copy/lib/scan-source.mjs`**

```js
// copy/lib/scan-source.mjs — heuristic, line-anchored hard-coded-English scan
// for files i18n-scope.json marks "guarded". The pseudo-locale sweep is the
// runtime backstop for anything this misses.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createTranslator } = require('../../src/renderer/pages/i18n.js');
const LETTER = /\p{L}/u;
const ATTRS = { title: 'data-i18n-title', 'aria-label': 'data-i18n-aria-label', placeholder: 'data-i18n-placeholder', alt: 'data-i18n-alt', 'data-tooltip': 'data-i18n-tooltip' };
const SKIP_CONTENT = new Set(['script', 'style', 'svg']);
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const decode = (s) => s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'");
const collapse = (s) => decode(s).replace(/\s+/g, ' ').trim();

function parseAttrs(source) {
  const attrs = {};
  for (const m of source.matchAll(/([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
    attrs[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? '';
  }
  return attrs;
}

export function scanHtml(html, { en, allow = [] }) {
  const t = createTranslator({ locale: 'en', messages: Object.fromEntries(Object.entries(en).map(([k, v]) => [k, v.message])) });
  const problems = [];
  let scanned = 0;
  const stack = []; // { tag, attrs, translated, ignored, skip, textStart }
  const tokens = /<!--[\s\S]*?-->|<![^>]*>|<\/?([a-zA-Z][\w-]*)([^>]*)>|([^<]+)/g;
  const translatedAncestor = () => stack.some((f) => f.translated || f.ignored || f.skip);
  let m;
  while ((m = tokens.exec(html))) {
    if (m[0].startsWith('<!')) continue;
    if (m[3] !== undefined) {
      const text = collapse(m[3]);
      if (!text || !LETTER.test(text)) continue;
      scanned += 1;
      if (!translatedAncestor() && !allow.includes(text)) problems.push(`text "${text}" has no data-i18n`);
      continue;
    }
    const tag = m[1].toLowerCase();
    if (m[0].startsWith('</')) {
      const index = stack.map((f) => f.tag).lastIndexOf(tag);
      if (index === -1) continue;
      const frame = stack[index];
      stack.length = index;
      if (frame.translated && frame.key) {
        const inline = collapse(html.slice(frame.textStart, m.index).replace(/<[^>]+>/g, ''));
        if (!t.has(frame.key)) problems.push(`data-i18n="${frame.key}": unknown key`);
        else if (inline !== collapse(t(frame.key))) problems.push(`data-i18n="${frame.key}": inline "${inline}" differs from en.json "${t(frame.key)}"`);
      }
      continue;
    }
    const attrs = parseAttrs(m[2]);
    for (const [attr, counterpart] of Object.entries(ATTRS)) {
      if (attrs[attr] === undefined || !LETTER.test(attrs[attr])) continue;
      scanned += 1;
      if (attrs[counterpart] === undefined && !allow.includes(attrs[attr]) && !translatedAncestor()) {
        problems.push(`<${tag} ${attr}="${attrs[attr]}"> has no ${counterpart}`);
      } else if (attrs[counterpart] !== undefined && !t.has(attrs[counterpart])) {
        problems.push(`${counterpart}="${attrs[counterpart]}": unknown key`);
      }
    }
    if (VOID.has(tag) || m[0].endsWith('/>')) continue;
    stack.push({
      tag,
      key: attrs['data-i18n'],
      translated: attrs['data-i18n'] !== undefined,
      ignored: attrs['data-i18n-ignore'] !== undefined,
      skip: SKIP_CONTENT.has(tag),
      textStart: m.index + m[0].length,
    });
  }
  return { problems, scanned };
}

const STRING = String.raw`('(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|\`(?:[^\`\\]|\\.)*\`)`;
const RENDERER_SITES = [
  new RegExp(String.raw`\.(?:textContent|innerText|title|placeholder|ariaLabel)\s*=\s*` + STRING, 'g'),
  new RegExp(String.raw`setAttribute\(\s*['"](?:title|aria-label|placeholder|alt)['"]\s*,\s*` + STRING, 'g'),
];
const MAIN_SITES = [
  new RegExp(String.raw`(?:^|[\s{,])(?:label|message|detail|title|checkboxLabel)\s*:\s*` + STRING, 'gm'),
  new RegExp(String.raw`buttons\s*:\s*\[\s*` + STRING, 'g'),
];
const ANY_SITE = new RegExp(String.raw`\.(?:textContent|innerText|title|placeholder|ariaLabel)\s*=|setAttribute\(\s*['"](?:title|aria-label|placeholder|alt)['"]`, 'g');

function stripComments(js) {
  return js.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/.*$/gm, '$1');
}

const KEY_CALL = /(?:\bt|\.t|\.parts)\(\s*'([a-z][A-Za-z0-9]*(?:\.[a-z0-9][A-Za-z0-9]*)+)'/g;

export function scanJs(js, { allow = [], kind = 'renderer', en = null }) {
  const source = stripComments(js);
  const problems = [];
  if (en) for (const m of source.matchAll(KEY_CALL)) if (!Object.hasOwn(en, m[1])) problems.push(`unknown key '${m[1]}'`);
  const literal = (raw) => raw.slice(1, -1);
  const report = (raw) => {
    const value = literal(raw);
    if (LETTER.test(value.replace(/\$\{[^}]*\}/g, '')) && !allow.includes(value)) problems.push(`literal ${raw}`);
  };
  for (const pattern of RENDERER_SITES) for (const m of source.matchAll(pattern)) report(m[1]);
  if (kind === 'main') for (const pattern of MAIN_SITES) for (const m of source.matchAll(pattern)) report(m[1]);
  let scanned = [...source.matchAll(ANY_SITE)].length;
  if (kind === 'main') for (const pattern of MAIN_SITES) scanned += [...source.matchAll(pattern)].length;
  return { problems, scanned };
}

export function scanFile(relPath, text, { en, allow }) {
  if (relPath.endsWith('.html')) return scanHtml(text, { en, allow });
  return scanJs(text, { allow, en, kind: relPath.startsWith('src/main/') ? 'main' : 'renderer' });
}
```

- [ ] **Step 4: Run tests**

Run: `node --test test/unit/i18n-scan.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add copy/lib/scan-source.mjs test/unit/i18n-scan.test.js
git commit -m "Add the hard-coded-English source scanner for guarded files"
```

---

### Task 5: Catalog files, CLI (`build`/`check`/`status`/`ack`) and generated outputs

**Files:**
- Create: `copy/messages/en.json`, `copy/messages/de.json`, `copy/glossary.json`, `copy/i18n-scope.json`, `copy/lib/mobile.mjs`, `copy/lib/cli.mjs`
- Modify: `copy/build.mjs` (rewrite as a dispatcher), `copy/slash-commands.json` (registry only), `package.json`
- Generated (committed): `src/renderer/pages/strings.en.js`, `strings.de.js`, `strings.en-XA.js`, `src/main/i18n-locales.json`, `copy/generated/ios/Localizable.xcstrings`, `copy/generated/android/values/strings.xml`, `copy/generated/android/values-de/strings.xml`, `copy/generated/SlashCommands.strings`, `copy/generated/slash_commands.xml`
- Test: `test/unit/i18n-cli.test.js`

**Interfaces:**
- Consumes: Task 3 (`entryHash`, `catalogReport`, `reportFailures`, `pseudoLocalize`, `runtimeCatalog`), Task 4 (`scanFile`).
- Produces (`copy/lib/cli.mjs`, all take `root` = repo root):
  - `loadCatalog(root) → { en, translations: { [code]: object }, glossary, scope, registry }`
  - `generate(root) → { [relPath]: string }` (pure; no writes)
  - `runBuild(root) → string[]` (writes `generate()` output; never touches `copy/messages/`)
  - `runCheck(root) → { failures: string[], warnings: string[] }`
  - `runStatus(root, locale) → string` (human-readable worklist)
  - `runAck(root, locale, keys) → void` (throws on unknown key, unknown locale, empty key list, or a key with no translation)
  - `slashKey(command, field) → string`, e.g. `slashKey('/close-group', 'hint') === 'slash.closeGroup.hint'`
- `src/main/i18n-locales.json` shape: `[{ "code": "en", "endonym": "English", "dir": "ltr", "status": "selectable" }, { "code": "de", …, "status": "hidden" }, { "code": "en-XA", "endonym": "Pseudo", "dir": "ltr", "status": "pseudo" }]`.
- `i18n-scope.json` shape: `{ "$note": "…", "files": { "<relPath>": { "state": "pending" | "guarded", "allow": ["…"] } } }`.

- [ ] **Step 1: Write the failing CLI tests**

```js
// test/unit/i18n-cli.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

let cli, catalog;
test.before(async () => {
  cli = await import('../../copy/lib/cli.mjs');
  catalog = await import('../../copy/lib/catalog.mjs');
});

function fixtureRoot(t, { de = {}, scope = {} } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-i18n-cli-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (rel, value) => {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), typeof value === 'string' ? value : JSON.stringify(value, null, 2));
  };
  const en = {
    $note: 'fixture',
    'slash.new.hint': { message: 'Open a new tab', note: 'slash hint' },
    'demo.count': { message: '{count, plural, one {# tab} other {# tabs}}', note: 'count' },
  };
  write('copy/messages/en.json', en);
  write('copy/messages/de.json', { $meta: { locale: 'de', endonym: 'Deutsch', dir: 'ltr', status: 'hidden' }, ...de });
  write('copy/glossary.json', { fixed: [], fixedPatterns: [], terms: {}, sameAsSource: {} });
  write('copy/i18n-scope.json', { files: scope });
  write('copy/slash-commands.json', { sources: {}, commands: [{ command: '/new' }] });
  return { root, en };
}

test('build never advances a translation hash, so stale stays stale', (t) => {
  const { root } = fixtureRoot(t, { de: { 'slash.new.hint': { message: 'Neuen Tab öffnen', source: 'sha256:old' } } });
  const before = fs.readFileSync(path.join(root, 'copy/messages/de.json'), 'utf8');
  cli.runBuild(root);
  cli.runCheck(root);
  assert.equal(fs.readFileSync(path.join(root, 'copy/messages/de.json'), 'utf8'), before);
  assert.deepEqual(catalog.catalogReport(cli.loadCatalog(root)).locales.de.stale, ['slash.new.hint']);
});

test('ack advances only the named keys and refuses unknown or untranslated ones', (t) => {
  const { root, en } = fixtureRoot(t, { de: {
    'slash.new.hint': { message: 'Neuen Tab öffnen', source: 'sha256:old' },
    'demo.count': { message: '{count, plural, one {# Tab} other {# Tabs}}', source: 'sha256:old' },
  } });
  cli.runAck(root, 'de', ['slash.new.hint']);
  const de = JSON.parse(fs.readFileSync(path.join(root, 'copy/messages/de.json'), 'utf8'));
  assert.equal(de['slash.new.hint'].source, catalog.entryHash(en['slash.new.hint']));
  assert.equal(de['demo.count'].source, 'sha256:old');
  assert.throws(() => cli.runAck(root, 'de', ['nope.key']), /unknown key/);
  assert.throws(() => cli.runAck(root, 'de', []), /at least one key/);
  assert.throws(() => cli.runAck(root, 'fr', ['slash.new.hint']), /unknown locale/);
});

test('changing only an English note makes the translation stale', (t) => {
  const { root } = fixtureRoot(t, { de: { 'slash.new.hint': { message: 'Neuen Tab öffnen' } } });
  cli.runAck(root, 'de', ['slash.new.hint']);
  const enPath = path.join(root, 'copy/messages/en.json');
  const enJson = JSON.parse(fs.readFileSync(enPath, 'utf8'));
  enJson['slash.new.hint'].note = 'changed context';
  fs.writeFileSync(enPath, JSON.stringify(enJson));
  const loaded = cli.loadCatalog(root);
  assert.deepEqual(catalog.catalogReport(loaded).locales.de.stale, ['slash.new.hint']);
});

test('check fails on stale generated files and passes after build', (t) => {
  const { root } = fixtureRoot(t);
  assert.match(cli.runCheck(root).failures.join('\n'), /STALE/);
  cli.runBuild(root);
  assert.deepEqual(cli.runCheck(root).failures, []);
});

test('check fails a guarded file with hard-coded English and passes a pending one', (t) => {
  const { root } = fixtureRoot(t, { scope: {
    'src/renderer/guarded.js': { state: 'guarded', allow: [] },
    'src/renderer/pending.js': { state: 'pending', allow: [] },
  } });
  fs.mkdirSync(path.join(root, 'src/renderer'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src/renderer/guarded.js'), "el.textContent = 'Close tab';");
  fs.writeFileSync(path.join(root, 'src/renderer/pending.js'), "el.textContent = 'Close tab';");
  cli.runBuild(root);
  const { failures } = cli.runCheck(root);
  assert.equal(failures.filter((f) => f.includes('guarded.js')).length, 1);
  assert.equal(failures.filter((f) => f.includes('pending.js')).length, 0);
});

test('check fails when a scoped file does not exist (renames cannot silently pass)', (t) => {
  const { root } = fixtureRoot(t, { scope: { 'src/renderer/renamed.js': { state: 'guarded', allow: [] } } });
  cli.runBuild(root);
  assert.match(cli.runCheck(root).failures.join(), /renamed\.js.*missing/);
});

test('status lists missing and stale keys with English and note', (t) => {
  const { root } = fixtureRoot(t);
  const out = cli.runStatus(root, 'de');
  assert.match(out, /slash\.new\.hint/);
  assert.match(out, /Open a new tab/);
  assert.match(out, /slash hint/);
});

test('generated runtime files and locale registry have the expected shape', (t) => {
  const { root } = fixtureRoot(t);
  const files = cli.generate(root);
  const registry = JSON.parse(files['src/main/i18n-locales.json']);
  assert.deepEqual(registry.map((l) => [l.code, l.status]), [['en', 'selectable'], ['de', 'hidden'], ['en-XA', 'pseudo']]);
  const sandbox = { self: {} };
  vm.runInNewContext(files['src/renderer/pages/strings.de.js'], sandbox);
  assert.equal(sandbox.self.blancStrings.locale, 'de');
  assert.equal(sandbox.self.blancStrings.fallback['slash.new.hint'], 'Open a new tab');
  assert.equal(cli.slashKey('/close-group', 'hint'), 'slash.closeGroup.hint');
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test test/unit/i18n-cli.test.js`
Expected: FAIL with `Cannot find module '…/copy/lib/cli.mjs'`.

- [ ] **Step 3: Implement `copy/lib/mobile.mjs`**

```js
// copy/lib/mobile.mjs — per-locale mobile string resources from the catalog.
// One plural per message (enforced by the parser) lets each plural message
// become one full string per category.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { parseMessage } = require('../../src/renderer/pages/i18n.js');

// Argument order = first appearance in the English message.
function argOrder(nodes, out = []) {
  for (const n of nodes) {
    if ((n.type === 'arg' || n.type === 'plural') && !out.includes(n.name)) out.push(n.name);
    if (n.type === 'tag') argOrder(n.children, out);
    if (n.type === 'plural') for (const b of Object.values(n.branches)) argOrder(b, out);
  }
  return out;
}

function flatten(nodes, order, platform, pluralName = null, branch = null) {
  return nodes.map((n) => {
    const pos = (name) => order.indexOf(name) + 1;
    if (n.type === 'text') return n.value.replace(/%/g, '%%');
    if (n.type === 'arg') return `%${pos(n.name)}$${platform === 'android' ? 's' : '@'}`;
    if (n.type === 'pound') return platform === 'android' ? `%${pos(pluralName)}$d` : `%${pos(pluralName)}$lld`;
    if (n.type === 'tag') return `<${n.index}>${flatten(n.children, order, platform, pluralName, branch)}</${n.index}>`;
    return flatten(n.branches[branch] ?? n.branches.other, order, platform, n.name, branch);
  }).join('');
}

const pluralOf = (nodes) => {
  for (const n of nodes) {
    if (n.type === 'plural') return n;
    if (n.type === 'tag') { const inner = pluralOf(n.children); if (inner) return inner; }
  }
  return null;
};

export const androidName = (key) => key.replace(/([A-Z])/g, '_$1').replace(/\./g, '_').toLowerCase();

export function xcstrings({ en, locales }) {
  const strings = {};
  for (const [key, entry] of Object.entries(en).filter(([k]) => !k.startsWith('$'))) {
    const order = argOrder(parseMessage(entry.message));
    const localizations = {};
    for (const [code, messages] of Object.entries(locales)) {
      if (typeof messages[key] !== 'string') continue;
      const nodes = parseMessage(messages[key]);
      const plural = pluralOf(nodes);
      if (!plural) {
        localizations[code] = { stringUnit: { state: 'translated', value: flatten(nodes, order, 'ios') } };
      } else {
        const variations = {};
        for (const category of Object.keys(plural.branches).filter((s) => !s.startsWith('='))) {
          variations[category] = { stringUnit: { state: 'translated', value: flatten(nodes, order, 'ios', null, category) } };
        }
        localizations[code] = { variations: { plural: variations } };
      }
    }
    strings[key] = { comment: entry.note, extractionState: 'manual', localizations };
  }
  return JSON.stringify({ sourceLanguage: 'en', strings, version: '1.0' }, null, 2) + '\n';
}

const xmlEsc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '\\"').replace(/'/g, "\\'");

export function androidStrings({ en, messages }) {
  let out = '<?xml version="1.0" encoding="utf-8"?>\n<!-- GENERATED by copy/build.mjs from copy/messages — do not edit by hand. -->\n<resources>\n';
  for (const key of Object.keys(en).filter((k) => !k.startsWith('$'))) {
    if (typeof messages[key] !== 'string') continue;
    const order = argOrder(parseMessage(en[key].message));
    const nodes = parseMessage(messages[key]);
    const plural = pluralOf(nodes);
    const name = androidName(key);
    if (!plural) {
      out += `    <string name="${name}">${xmlEsc(flatten(nodes, order, 'android'))}</string>\n`;
    } else {
      out += `    <plurals name="${name}">\n`;
      for (const category of Object.keys(plural.branches).filter((s) => !s.startsWith('='))) {
        out += `        <item quantity="${category}">${xmlEsc(flatten(nodes, order, 'android', null, category))}</item>\n`;
      }
      out += '    </plurals>\n';
    }
  }
  return out + '</resources>\n';
}
```

- [ ] **Step 4: Implement `copy/lib/cli.mjs`**

```js
// copy/lib/cli.mjs — build/check/status/ack for the interface-string substrate.
// Every function takes the repo root so tests can run on fixture roots.
import fs from 'node:fs';
import path from 'node:path';
import { entryHash, catalogReport, reportFailures, pseudoLocalize, runtimeCatalog } from './catalog.mjs';
import { scanFile } from './scan-source.mjs';
import { xcstrings, androidStrings, androidName } from './mobile.mjs';

const read = (root, rel) => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
const camel = (s) => s.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
export const slashKey = (command, field) => `slash.${camel(command.replace(/^\//, ''))}.${field}`;
const entryKeys = (obj) => Object.keys(obj).filter((k) => !k.startsWith('$'));

export function loadCatalog(root) {
  const dir = path.join(root, 'copy', 'messages');
  const translations = {};
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'en.json').sort()) {
    translations[file.replace(/\.json$/, '')] = read(root, `copy/messages/${file}`);
  }
  return {
    en: read(root, 'copy/messages/en.json'),
    translations,
    glossary: read(root, 'copy/glossary.json'),
    scope: read(root, 'copy/i18n-scope.json'),
    registry: read(root, 'copy/slash-commands.json'),
  };
}

const runtimeFile = (data) =>
  '// GENERATED by copy/build.mjs from copy/messages — do not edit by hand.\n'
  + "(function (root, data) { if (typeof module !== 'undefined' && module && module.exports) module.exports = data; else root.blancStrings = data; })"
  + `(typeof self !== 'undefined' ? self : this, ${JSON.stringify(data)});\n`;

export function generate(root) {
  const { en, translations, registry } = loadCatalog(root);
  const files = {};
  const pseudoTr = Object.fromEntries(entryKeys(en).map((k) => [k, { message: pseudoLocalize(en[k].message), source: 'pseudo' }]));
  const locales = [
    { code: 'en', endonym: 'English', dir: 'ltr', status: 'selectable', tr: null },
    ...Object.entries(translations).map(([code, tr]) => ({ code, endonym: tr.$meta.endonym, dir: tr.$meta.dir, status: tr.$meta.status, tr })),
    { code: 'en-XA', endonym: 'Pseudo', dir: 'ltr', status: 'pseudo', tr: pseudoTr },
  ];
  for (const l of locales) {
    files[`src/renderer/pages/strings.${l.code}.js`] = runtimeFile(runtimeCatalog({ locale: l.code, dir: l.dir, en, tr: l.tr }));
  }
  files['src/main/i18n-locales.json'] = JSON.stringify(locales.map(({ code, endonym, dir, status }) => ({ code, endonym, dir, status })), null, 2) + '\n';

  const mobileLocales = { en: Object.fromEntries(entryKeys(en).map((k) => [k, en[k].message])) };
  for (const [code, tr] of Object.entries(translations)) {
    mobileLocales[code] = runtimeCatalog({ locale: code, dir: tr.$meta.dir, en, tr }).messages;
  }
  files['copy/generated/ios/Localizable.xcstrings'] = xcstrings({ en, locales: mobileLocales });
  for (const [code, messages] of Object.entries(mobileLocales)) {
    files[`copy/generated/android/values${code === 'en' ? '' : `-${code}`}/strings.xml`] = androidStrings({ en, messages });
  }

  // Legacy English slash resources read by ios/Blanc/Blanc/SlashCommand.swift.
  const legacyKey = (command) => 'slash_' + command.replace(/^\//, '').replace(/-/g, '_');
  const mobileCommands = registry.commands.filter((c) => !c.platforms);
  files['copy/generated/SlashCommands.strings'] = '/* GENERATED by copy/build.mjs from copy/messages/en.json — do not edit by hand. */\n'
    + mobileCommands.map((c) => `"${legacyKey(c.command)}" = ${JSON.stringify(en[slashKey(c.command, 'hint')].message)};\n`).join('');
  const xmlEsc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  files['copy/generated/slash_commands.xml'] = '<!-- GENERATED by copy/build.mjs from copy/messages/en.json — do not edit by hand. -->\n<resources>\n'
    + mobileCommands.map((c) => `    <string name="${legacyKey(c.command)}">${xmlEsc(en[slashKey(c.command, 'hint')].message)}</string>\n`).join('')
    + '</resources>\n';
  return files;
}

export function runBuild(root) {
  const written = [];
  for (const [rel, content] of Object.entries(generate(root))) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), content);
    written.push(rel);
  }
  return written;
}

function slashDrift(root, { en, registry }) {
  // Desktop copies stay hand-synced until phase 3 replaces them with t() calls.
  const problems = [];
  const parseTuples = (rel) => {
    if (!rel || !fs.existsSync(path.join(root, rel))) return null;
    const js = fs.readFileSync(path.join(root, rel), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const block = js.match(/const SLASH_COMMANDS = \[([\s\S]*?)\];/)?.[1];
    return block ? [...block.matchAll(/^\s*\['([^']+)',\s*'([^']*)'\]/gm)].map((m) => ({ command: m[1], hint: m[2] })) : null;
  };
  const overlayRel = registry.sources?.overlay;
  const expectedOverlay = registry.commands.map((c) => ({ command: c.command, hint: en[slashKey(c.command, 'hint')]?.message }));
  const expectedDoc = registry.commands.map((c) => ({
    command: c.doc?.command ?? c.command,
    hint: en[slashKey(c.command, en[slashKey(c.command, 'doc')] ? 'doc' : 'hint')]?.message,
  }));
  const compare = (name, actual, expected) => {
    if (!actual) return;
    const n = Math.max(actual.length, expected.length);
    for (let i = 0; i < n; i++) {
      const a = actual[i], e = expected[i];
      if (!a || !e || a.command !== e.command || a.hint !== e.hint) {
        problems.push(`${name} #${i}: got ${JSON.stringify(a)}, catalog says ${JSON.stringify(e)}`);
      }
    }
  };
  if (overlayRel && fs.existsSync(path.join(root, overlayRel))) {
    const js = fs.readFileSync(path.join(root, overlayRel), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    compare('overlay.js', [...js.matchAll(/^\s*\{\s*cmd:\s*'([^']+)',\s*hint:\s*'([^']*)'/gm)].map((m) => ({ command: m[1], hint: m[2] })), expectedOverlay);
  }
  compare('shortcuts.js', parseTuples(registry.sources?.shortcuts), expectedDoc);
  compare('main.js', parseTuples(registry.sources?.main), expectedDoc);
  for (const c of registry.commands) if (!en[slashKey(c.command, 'hint')]) problems.push(`${slashKey(c.command, 'hint')} missing from en.json`);
  return problems;
}

export function runCheck(root) {
  const loaded = loadCatalog(root);
  const { failures, warnings } = reportFailures(catalogReport(loaded));
  for (const [rel, content] of Object.entries(generate(root))) {
    const p = path.join(root, rel);
    if (!fs.existsSync(p) || fs.readFileSync(p, 'utf8') !== content) failures.push(`STALE: ${rel} — run \`npm run copy:build\``);
  }
  const names = new Map();
  for (const key of entryKeys(loaded.en)) {
    const name = androidName(key);
    if (names.has(name)) failures.push(`Android name collision: ${key} and ${names.get(name)} → ${name}`);
    names.set(name, key);
  }
  failures.push(...slashDrift(root, loaded));
  for (const [rel, { state, allow = [] }] of Object.entries(loaded.scope.files ?? {})) {
    const p = path.join(root, rel);
    if (!fs.existsSync(p)) { failures.push(`i18n-scope: ${rel} is missing — update copy/i18n-scope.json`); continue; }
    if (state !== 'guarded') continue;
    const { problems } = scanFile(rel, fs.readFileSync(p, 'utf8'), { en: loaded.en, allow });
    failures.push(...problems.map((problem) => `${rel}: ${problem}`));
  }
  return { failures, warnings };
}

export function runStatus(root, locale) {
  const loaded = loadCatalog(root);
  const r = catalogReport(loaded).locales[locale];
  if (!r) throw new Error(`unknown locale ${locale}`);
  const line = (key) => `  ${key}\n    en:   ${JSON.stringify(loaded.en[key].message)}\n    note: ${loaded.en[key].note}`;
  return [
    `${locale} (${r.status}): ${r.covered}/${r.total} current`,
    `missing (${r.missing.length}):`, ...r.missing.map(line),
    `stale (${r.stale.length}):`, ...r.stale.map((key) => `${line(key)}\n    was:  ${JSON.stringify(loaded.translations[locale][key].message)}`),
    `invalid (${r.invalid.length}):`, ...r.invalid.map((p) => `  ${p}`),
  ].join('\n');
}

export function runAck(root, locale, keys) {
  if (!keys.length) throw new Error('copy:ack needs at least one key (there is deliberately no all-keys mode)');
  const rel = `copy/messages/${locale}.json`;
  if (!fs.existsSync(path.join(root, rel))) throw new Error(`unknown locale ${locale}`);
  const { en } = loadCatalog(root);
  const tr = read(root, rel);
  for (const key of keys) {
    if (!Object.hasOwn(en, key) || key.startsWith('$')) throw new Error(`unknown key ${key}`);
    if (typeof tr[key]?.message !== 'string') throw new Error(`${key} has no ${locale} message to acknowledge`);
  }
  for (const key of keys) tr[key].source = entryHash(en[key]);
  fs.writeFileSync(path.join(root, rel), JSON.stringify(tr, null, 2) + '\n');
}
```

- [ ] **Step 5: Rewrite `copy/build.mjs` as the dispatcher**

```js
// Blanc interface-string substrate (S3): catalog in copy/messages/.
//
//   node copy/build.mjs                    regenerate runtime catalogs, locale registry, mobile resources
//   node copy/build.mjs --check            fail on catalog, translation, scope or freshness problems
//   node copy/build.mjs --status <locale>  list missing/stale keys with English and note
//   node copy/build.mjs --ack <locale> <key…>  acknowledge exactly these translations as current
//
// Building never changes a translation's source hash. Only --ack does.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runBuild, runCheck, runStatus, runAck } from './lib/cli.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);

if (args[0] === '--check') {
  const { failures, warnings } = runCheck(ROOT);
  for (const w of warnings) console.warn(`warning: ${w}`);
  if (failures.length) {
    console.error(failures.map((f) => `  ${f}`).join('\n'));
    console.error('\ncopy:check failed.');
    process.exit(1);
  }
  console.log('copy:check OK');
} else if (args[0] === '--status') {
  console.log(runStatus(ROOT, args[1]));
} else if (args[0] === '--ack') {
  runAck(ROOT, args[1], args.slice(2));
  console.log(`acknowledged ${args.length - 2} ${args[1]} entr${args.length === 3 ? 'y' : 'ies'}`);
} else {
  for (const rel of runBuild(ROOT)) console.log(`wrote ${rel}`);
}
```

- [ ] **Step 6: Add the npm scripts**

In `package.json` `scripts`, after `"copy:check"`:

```json
    "copy:status": "node copy/build.mjs --status",
    "copy:ack": "node copy/build.mjs --ack",
```

- [ ] **Step 7: Create the real catalog files**

1. `copy/slash-commands.json`: keep `$note` (rewritten to say hints live in `copy/messages/en.json` under `slash.<name>.hint`/`.doc`), `sources`, and for each command only `command`, `doc: { command }` where present, and `platforms` where present. Remove every `hint` field.
2. `copy/messages/en.json`: `{ "$note": "Source of every Blanc-authored interface string. Edit here, translate in the same PR, run copy:ack for the keys you translated, then copy:build." }` plus, for each of the 26 commands, `slash.<name>.hint` with the exact current hint text and the note `"Slash command hint shown in the ⌘L palette for <command>."`, and `slash.<name>.doc` for `/save`, `/group`, `/theme` with their current `doc.hint` text and the note `"Reference description of <command> on blanc://shortcuts and in Help → Slash Commands."`. Add the four Settings language keys:

```json
  "settings.language.label": { "message": "Language", "note": "Settings → General row label and the language menu's accessible name.", "maxLength": 24 },
  "settings.language.hint": { "message": "Translations are machine-generated.", "note": "Disclosure under the language menu; translations are AI-generated without human review." },
  "settings.language.system": { "message": "System ({language})", "note": "Menu option that follows the OS language; {language} is the endonym it currently resolves to, e.g. Deutsch.", "maxLength": 12 },
  "settings.language.relaunch": { "message": "Relaunch to apply", "note": "Button that restarts Blanc so a new interface language takes effect.", "maxLength": 28 }
```

3. `copy/messages/de.json`: `$meta` `{ "locale": "de", "endonym": "Deutsch", "dir": "ltr", "status": "hidden" }` and these messages (each as `{ "message": "…" }`, `source` added by `copy:ack` in Step 8):

| Key | German |
|---|---|
| `slash.favorites.hint` | Favoriten öffnen |
| `slash.bringTabs.hint` | Offene Tabs aus einem anderen Browser übernehmen |
| `slash.save.hint` | Diese Seite zu den Favoriten hinzufügen – mit Ordnernamen direkt einsortieren |
| `slash.save.doc` | Diese Seite zu den Favoriten hinzufügen, in einen Ordner, wenn du einen nennst |
| `slash.history.hint` | Verlauf öffnen |
| `slash.downloads.hint` | Downloads öffnen |
| `slash.settings.hint` | Einstellungen öffnen |
| `slash.sync.hint` | Synchronisierung einrichten oder verwalten |
| `slash.clear.hint` | Verlauf löschen |
| `slash.new.hint` | Neuen Tab öffnen |
| `slash.private.hint` | Privaten Tab öffnen (der Verlauf bleibt unberührt) |
| `slash.close.hint` | Diesen Tab schließen |
| `slash.reopen.hint` | Zuletzt geschlossenen Tab wieder öffnen |
| `slash.pin.hint` | Diesen Tab anheften oder lösen |
| `slash.mute.hint` | Diesen Tab stummschalten oder den Ton wieder einschalten |
| `slash.sleep.hint` | Hintergrund-Tabs ruhen lassen und ihren Speicher freigeben |
| `slash.group.hint` | Leerzeichen, dann einen Gruppennamen eingeben – z. B. „arbeit“ |
| `slash.group.doc` | Diesen Tab in eine Gruppe verschieben (wird beim ersten Mal angelegt) |
| `slash.ungroup.hint` | Diesen Tab aus seiner Gruppe nehmen |
| `slash.closeGroup.hint` | Alle Tabs dieser Gruppe schließen |
| `slash.find.hint` | Auf der Seite suchen |
| `slash.blockAds.hint` | Werbung hier blockieren oder das Blockieren überall umschalten |
| `slash.allowAds.hint` | Werbung auf dieser Website erlauben |
| `slash.darkSite.hint` | Diese Website abdunkeln oder so lassen, wie sie gestaltet ist |
| `slash.1password.hint` | Anmeldedaten aus 1Password ausfüllen |
| `slash.theme.hint` | Darstellung wechseln oder system / light / dark wählen |
| `slash.theme.doc` | Darstellung wechseln oder direkt zu system, light oder dark wechseln |
| `slash.patron.hint` | Blanc mit einem Patron-Abo unterstützen |
| `slash.workspace.hint` | Zu einem benannten Arbeitsbereich wechseln oder einen neuen Namen eingeben, um dieses Fenster zu speichern |
| `settings.language.label` | Sprache |
| `settings.language.hint` | Übersetzungen werden maschinell erstellt. |
| `settings.language.system` | System ({language}) |
| `settings.language.relaunch` | Zum Übernehmen neu starten |

The key for `/1password` is `slash.1password.hint` (the segment after `slash.` may start with a digit per `KEY_PATTERN`).

4. `copy/glossary.json`:

```json
{
  "$note": "Fixed terms appear verbatim in every language. Translated terms pin one form per language, checked by stem. Changing this file changes every language: record why in the commit message.",
  "style": { "de": "Informal du throughout; sentence case; typographic quotes „…“ and – dashes." },
  "fixed": ["Blanc", "Blanc Blocker", "Blanc Patron", "Patron", "uBlock Origin", "1Password"],
  "fixedPatterns": ["(?<![\\w/:])/[a-z][a-z0-9-]*", "⌘", "⌥", "⇧", "⌃"],
  "terms": {
    "Quiet Tabs": { "de": { "form": "Ruhende Tabs", "stem": "uhend" } },
    "Favorites": { "de": { "form": "Favoriten", "stem": "Favorit" } },
    "Profile Sync": { "de": { "form": "Profil-Synchronisierung", "stem": "Synchronisier" } },
    "Named Workspaces": { "de": { "form": "Benannte Arbeitsbereiche", "stem": "Arbeitsbereich" } },
    "Quick Switcher": { "de": { "form": "Schnellwechsler", "stem": "Schnellwechsl" } }
  },
  "pendingOwnerDecision": ["Island", "Glance"],
  "sameAsSource": { "de": ["settings.language.system"] }
}
```

5. `copy/i18n-scope.json`: `$note` explaining the lifecycle, and `files` listing every string-bearing desktop file as `{ "state": "pending", "allow": [] }`. The list is exactly:

```
src/renderer/index.html  src/renderer/renderer.js  src/renderer/vertical-tabs.js  src/renderer/workspace-ui.js
src/renderer/tab-drag.js  src/renderer/overlay.html  src/renderer/overlay.js  src/renderer/permission.html
src/renderer/permission.js  src/renderer/fill-status.html  src/renderer/fill-status.js  src/renderer/fill-status-copy.js
src/renderer/display-capture-helper.html  src/renderer/display-capture-helper.js
src/renderer/pages/settings.html  src/renderer/pages/settings.js  src/renderer/pages/settings-sync-setup-model.js
src/renderer/pages/settings-verify-model.js  src/renderer/pages/settings-nav-model.js
src/renderer/pages/settings-language-model.js
src/renderer/pages/newtab.html  src/renderer/pages/newtab.js  src/renderer/pages/onboarding.js
src/renderer/pages/error.html  src/renderer/pages/error.js
src/renderer/pages/bookmarks.html  src/renderer/pages/bookmarks.js  src/renderer/pages/history.html
src/renderer/pages/history.js  src/renderer/pages/history-groups.js  src/renderer/pages/downloads.html
src/renderer/pages/downloads.js  src/renderer/pages/shortcuts.html  src/renderer/pages/shortcuts.js
src/renderer/pages/tab-import.html  src/renderer/pages/tab-import-open-tabs.js  src/renderer/pages/tab-handoff.html
src/renderer/pages/tab-handoff.js  src/renderer/pages/sheet.js
src/renderer/pages/mahjong.html  src/renderer/pages/mahjong.js  src/renderer/pages/mahjong-state.js
src/main/main.js  src/main/context-menu.js  src/main/tab-context-menu-model.js  src/main/address-menu-model.js
src/main/dock-menu.js  src/main/workspace-context-menu-model.js  src/main/browser-shortcuts.js
src/main/updater.js  src/main/site-security.js  src/main/shield-model.js  src/main/about-panel.js
src/main/external-protocols.js  src/main/linux-sandbox-launch.js  src/main/webauthn.js  src/main/pages.js
src/main/browser-data-import.js  src/main/ublock-popup-mainworld.js  src/main/ublock-dashboard-mainworld.js
```

Before committing, run the step below to catch any file in this list that does not exist (the scope check fails on missing files) and any string-bearing file the list misses:

```bash
node -e "const s=require('./copy/i18n-scope.json');const fs=require('fs');for(const f of Object.keys(s.files))if(!fs.existsSync(f))console.log('MISSING',f)"
grep -rlE "textContent\s*=\s*['\"\`]|label:\s*'[A-Z]|showMessageBox|aria-label=\"[A-Za-z]" src/main src/renderer --include='*.js' --include='*.html' | grep -v -e ublock/upstream -e '/strings\.' | sort
```

Add every file the grep prints that is not in the list (as `pending`) and remove or rename any `MISSING` entry. Files the sync, Patron, and import dialogs live in (e.g. `src/main/sync.js`, `src/main/patron*.js`) are expected additions.

- [ ] **Step 8: Acknowledge the German entries, build, and check**

```bash
npm run copy:ack -- de $(node -e "const d=require('./copy/messages/de.json');console.log(Object.keys(d).filter(k=>!k.startsWith('$')).join(' '))")
npm run copy:build
npm run copy:check
npm run copy:status -- de
```

Expected: `copy:check OK` with no warnings, because German covers all 33 current keys. `copy:status -- de` prints `de (hidden): 33/33 current` with empty missing, stale and invalid lists. (Acknowledging German here is correct: this task wrote these translations.)

- [ ] **Step 9: Run tests and the substrate check**

Run: `node --test test/unit/i18n-cli.test.js test/unit/i18n-catalog.test.js test/unit/i18n-scan.test.js && npm run lint && npm run substrate:check`
Expected: PASS. If `npm run lint` reports problems only inside the generated `src/renderer/pages/strings.*.js` files, add `src/renderer/pages/strings.*.js` to the ignore list in `eslint.config.mjs` with a comment saying they are generated by `copy/build.mjs`, and re-run. If `audit-inventory:check` fails, run `npm run audit-inventory:write` and re-run.

- [ ] **Step 10: Commit**

```bash
git add copy package.json src/renderer/pages/strings.*.js src/main/i18n-locales.json test/unit/i18n-cli.test.js security
git commit -m "Move slash copy into the interface catalog and add build, check, status and ack"
```

---

### Task 6: `uiLanguage` storage rules

**Files:**
- Modify: `src/main/settings.js`, `settings-schema/schema.json`
- Test: `test/unit/i18n-settings.test.js`

**Interfaces:**
- Produces: `settings.setUiLanguage(code: string, selectable: string[]) → boolean` (true when stored and flushed; false when rejected or the flush failed, in which case the previous value is restored). `getSettings().uiLanguage` always a string.
- Rule: `sanitize()` never admits `uiLanguage`. Load-time normalization keeps `"system"` or any value matching `^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$`; anything else reads back as `"system"`.

- [ ] **Step 1: Write the failing test**

```js
// test/unit/i18n-settings.test.js
'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('fs');
const os = require('os');
const path = require('path');

const electronId = require.resolve('electron');
const originalElectron = require.cache[electronId];
let activeUserData = null;
require.cache[electronId] = { id: electronId, filename: electronId, loaded: true,
  exports: { app: { getPath: () => activeUserData, on: () => {} } } };

const loaded = [];
function loadSettings(userData) {
  activeUserData = userData;
  delete require.cache[require.resolve('../../src/main/settings')];
  delete require.cache[require.resolve('../../src/main/store')];
  const settings = require('../../src/main/settings');
  loaded.push({ userData, settings });
  return settings;
}
function tempUserData(t, initial) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-ui-language-'));
  if (initial) fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify(initial));
  t.after(() => {
    for (const entry of loaded) if (entry.userData === dir) entry.settings.flushSettings();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return dir;
}
test.after(() => {
  delete require.cache[require.resolve('../../src/main/settings')];
  delete require.cache[require.resolve('../../src/main/store')];
  if (originalElectron) require.cache[electronId] = originalElectron; else delete require.cache[electronId];
});

test('uiLanguage defaults to system and never syncs', (t) => {
  const settings = loadSettings(tempUserData(t));
  assert.equal(settings.getSettings().uiLanguage, 'system');
  assert.equal('uiLanguage' in settings.exportForSync().values, false);
});

test('generic setSettings cannot change uiLanguage', (t) => {
  const settings = loadSettings(tempUserData(t));
  settings.setSettings({ uiLanguage: 'de', theme: 'dark' });
  assert.equal(settings.getSettings().uiLanguage, 'system');
  assert.equal(settings.getSettings().theme, 'dark');
});

test('setUiLanguage accepts system and selectable codes only, and persists immediately', (t) => {
  const dir = tempUserData(t);
  const settings = loadSettings(dir);
  assert.equal(settings.setUiLanguage('de', ['en']), false);
  assert.equal(settings.setUiLanguage('xx-<script>', ['en']), false);
  assert.equal(settings.setUiLanguage('de', ['en', 'de']), true);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'settings.json'), 'utf8')).uiLanguage, 'de');
  assert.equal(settings.setUiLanguage('system', ['en']), true);
  assert.equal(settings.getSettings().uiLanguage, 'system');
});

test('a stored hidden language survives load; a malformed value reads as system', (t) => {
  assert.equal(loadSettings(tempUserData(t, { uiLanguage: 'fr' })).getSettings().uiLanguage, 'fr');
  assert.equal(loadSettings(tempUserData(t, { uiLanguage: 'en-XA' })).getSettings().uiLanguage, 'en-XA');
  assert.equal(loadSettings(tempUserData(t, { uiLanguage: 'DE!!' })).getSettings().uiLanguage, 'system');
  assert.equal(loadSettings(tempUserData(t, { uiLanguage: 42 })).getSettings().uiLanguage, 'system');
});

test('a failed flush restores the previous value and reports false', (t) => {
  const settings = loadSettings(tempUserData(t));
  const store = require('../../src/main/store');
  const original = store.JsonStore.prototype.flush;
  store.JsonStore.prototype.flush = () => false;
  t.after(() => { store.JsonStore.prototype.flush = original; });
  assert.equal(settings.setUiLanguage('de', ['en', 'de']), false);
  assert.equal(settings.getSettings().uiLanguage, 'system');
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test test/unit/i18n-settings.test.js`
Expected: FAIL (`uiLanguage` is `undefined`; `setUiLanguage is not a function`).

- [ ] **Step 3: Implement in `src/main/settings.js`**

Add after `const TAB_SLEEP_DELAYS = …`:

```js
// Interface language: 'system' or a BCP 47 language code. Device-local (never
// in SYNCED_KEYS) and written ONLY by setUiLanguage(): the generic whitelist
// has no entry, so pages:settings:set cannot bypass the relaunch flow.
const UI_LANGUAGE_CODE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;
const isUiLanguageValue = (value) => value === 'system' || (typeof value === 'string' && UI_LANGUAGE_CODE.test(value));
```

In `DEFAULTS`, after `tabSleep: '1h',`:

```js
  // 'system' follows the OS; a stored code that is no longer selectable is kept
  // and renders English (see src/main/i18n.js). Device-local, not Profile Synced.
  uiLanguage: 'system',
```

In `getSettings()`, after the `tabSleep` line:

```js
  if (!isUiLanguageValue(data.uiLanguage)) data.uiLanguage = DEFAULTS.uiLanguage;
```

After `setSupporter`:

```js
/** The language-transition service's private write path (src/main/i18n.js
 * changeUiLanguage). Flushes synchronously so a relaunch reads the new value;
 * a failed flush restores the previous value. */
function setUiLanguage(code, selectable) {
  if (code !== 'system' && !(Array.isArray(selectable) && selectable.includes(code))) return false;
  if (!isUiLanguageValue(code)) return false;
  const s = ensureStore();
  const previous = s.data.uiLanguage;
  s.update((data) => { data.uiLanguage = code; });
  if (!s.flush()) {
    s.data.uiLanguage = previous;
    return false;
  }
  for (const fn of listeners) fn(getSettings());
  return true;
}
```

Add `setUiLanguage,` to `module.exports` after `setSupporter,`.

- [ ] **Step 4: Register it in the schema**

In `settings-schema/schema.json`, append `"uiLanguage"` to `internalDefaults` and add to `$internalDefaults` (the explanatory string) the sentence: `uiLanguage is desktop-only: mobile uses the OS per-app language setting (D27).`

- [ ] **Step 5: Run tests and the schema guard**

Run: `node --test test/unit/i18n-settings.test.js test/unit/tab-sleep-settings.test.js && npm run settings:check`
Expected: PASS and `settings:check OK`.

- [ ] **Step 6: Commit**

```bash
git add src/main/settings.js settings-schema/schema.json test/unit/i18n-settings.test.js
git commit -m "Add the device-local uiLanguage setting with a single writer"
```

---

### Task 7: Main-process i18n (resolution, translator, transition service)

**Files:**
- Create: `src/main/i18n.js`
- Test: `test/unit/i18n-main.test.js`

**Interfaces:**
- Consumes: `createTranslator` (Task 1), `src/main/i18n-locales.json` (Task 5), `settings.setUiLanguage`/`getSettings` (Task 6).
- Produces:
  - `resolveLocale({ setting, preferred, selectable }) → { locale, source: 'setting' | 'system' | 'unavailable' }`
  - `formattingLocale(locale, systemLocale) → string`
  - `selectableCodes(locales, statusOverrides) → string[]`
  - `testOverrides({ isPackaged, env }) → { preferred?: string[], status: { [code]: string } }`
  - `stringsScriptFor({ source, formatLocale, strict }) → string`
  - `createMainI18n({ locales, settings, getPreferredSystemLanguages, getSystemLocale, restartApp, overrides, loadStrings }) → { init(), state(), t(key, params), parts(key, params), languagesInfo(), changeUiLanguage(code, { restart }), stringsScript() }`
    - `state() → { locale, formatLocale, dir, source }`
    - `languagesInfo() → { active, system, options: [{ code, endonym }] }`
    - `changeUiLanguage` → `Promise<boolean> | boolean` (returns `restartApp()`'s promise when it restarts)

- [ ] **Step 1: Write the failing tests**

```js
// test/unit/i18n-main.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  resolveLocale, formattingLocale, selectableCodes, testOverrides, stringsScriptFor, createMainI18n,
} = require('../../src/main/i18n');

const LOCALES = [
  { code: 'en', endonym: 'English', dir: 'ltr', status: 'selectable' },
  { code: 'de', endonym: 'Deutsch', dir: 'ltr', status: 'selectable' },
  { code: 'en-XA', endonym: 'Pseudo', dir: 'ltr', status: 'pseudo' },
];

test('an explicit selectable setting wins', () => {
  assert.deepEqual(resolveLocale({ setting: 'de', preferred: ['en-US'], selectable: ['en', 'de'] }), { locale: 'de', source: 'setting' });
});

test('system follows the first preferred language with a selectable primary subtag', () => {
  const selectable = ['en', 'de'];
  assert.equal(resolveLocale({ setting: 'system', preferred: ['de-AT'], selectable }).locale, 'de');
  assert.equal(resolveLocale({ setting: 'system', preferred: ['de_CH'], selectable }).locale, 'de');
  assert.equal(resolveLocale({ setting: 'system', preferred: ['fr-FR', 'de'], selectable }).locale, 'de');
  assert.deepEqual(resolveLocale({ setting: 'system', preferred: [], selectable }), { locale: 'en', source: 'system' });
});

test('a stored unavailable language renders English, never the OS language', () => {
  assert.deepEqual(
    resolveLocale({ setting: 'fr', preferred: ['de-DE'], selectable: ['en', 'de'] }),
    { locale: 'en', source: 'unavailable' },
  );
});

test('formatting locale combines UI language with the OS region', () => {
  assert.equal(formattingLocale('de', 'de-AT'), 'de-AT');
  assert.equal(formattingLocale('en', 'en-GB'), 'en-GB');
  assert.equal(formattingLocale('en', 'de-DE'), 'en-DE');
  assert.equal(formattingLocale('de', ''), 'de');
  assert.equal(formattingLocale('de', 'en_US.UTF-8'), 'de-US');
  assert.equal(formattingLocale('en-XA', 'de-DE'), 'en');
});

test('selectable codes honour status overrides', () => {
  const hidden = LOCALES.map((l) => (l.code === 'de' ? { ...l, status: 'hidden' } : l));
  assert.deepEqual(selectableCodes(hidden, {}), ['en']);
  assert.deepEqual(selectableCodes(hidden, { de: 'selectable', 'en-XA': 'selectable' }), ['en', 'de', 'en-XA']);
});

test('test overrides apply only to unpackaged BLANC_TEST=1 runs', () => {
  const env = { BLANC_TEST: '1', BLANC_TEST_SYSTEM_LANGUAGES: 'de-DE, fr', BLANC_TEST_LOCALE_STATUS: 'de=selectable,en-XA=selectable' };
  assert.deepEqual(testOverrides({ isPackaged: false, env }), { preferred: ['de-DE', 'fr'], status: { de: 'selectable', 'en-XA': 'selectable' } });
  assert.deepEqual(testOverrides({ isPackaged: true, env }), { status: {} });
  assert.deepEqual(testOverrides({ isPackaged: false, env: { ...env, BLANC_TEST: 'true' } }), { status: {} });
});

test('strings script appends a validated formatting locale and strict flag', () => {
  const script = stringsScriptFor({ source: 'X;', formatLocale: 'de-AT', strict: true });
  assert.equal(script, 'X;\nself.blancStrings.formatLocale="de-AT";self.blancStrings.strict=true;\n');
  assert.throws(() => stringsScriptFor({ source: 'X;', formatLocale: '"};alert(1)//', strict: false }), /invalid/);
});

function service({ setting = 'system', preferred = ['de-DE'], status = {}, flushOk = true } = {}) {
  const calls = { restarts: 0, writes: [] };
  const stored = { uiLanguage: setting };
  const settings = {
    getSettings: () => ({ ...stored }),
    setUiLanguage: (code, selectable) => {
      calls.writes.push([code, selectable]);
      if (!flushOk) return false;
      stored.uiLanguage = code;
      return true;
    },
  };
  const i18n = createMainI18n({
    locales: LOCALES, settings,
    getPreferredSystemLanguages: () => preferred,
    getSystemLocale: () => 'de-DE',
    restartApp: () => { calls.restarts += 1; return Promise.resolve(true); },
    overrides: { status },
    loadStrings: (code) => ({ locale: code, dir: 'ltr', messages: { 'a.b': code === 'de' ? 'Hallo' : 'Hello' }, fallback: {} }),
  });
  i18n.init();
  return { i18n, calls, stored };
}

test('init resolves once and freezes the state', () => {
  const { i18n, stored } = service();
  assert.deepEqual(i18n.state(), { locale: 'de', formatLocale: 'de-DE', dir: 'ltr', source: 'system' });
  stored.uiLanguage = 'en';
  assert.equal(i18n.state().locale, 'de');
  assert.equal(i18n.t('a.b'), 'Hallo');
});

test('languagesInfo reports the active, system-resolved and selectable languages', () => {
  const { i18n } = service({ setting: 'en' });
  assert.deepEqual(i18n.languagesInfo(), {
    active: 'en', system: 'de',
    options: [{ code: 'en', endonym: 'English' }, { code: 'de', endonym: 'Deutsch' }],
  });
});

test('changeUiLanguage validates, writes through setUiLanguage, and restarts only when asked and needed', async () => {
  const { i18n, calls } = service({ setting: 'system' });
  assert.equal(i18n.changeUiLanguage('fr', { restart: true }), false);
  assert.equal(i18n.changeUiLanguage('de', { restart: 'yes' }), false);
  assert.equal(calls.writes.length, 0);
  assert.equal(i18n.changeUiLanguage('de', { restart: true }), true, 'de resolves to the active language: no restart');
  assert.equal(calls.restarts, 0);
  assert.equal(i18n.changeUiLanguage('en', { restart: false }), true);
  assert.equal(calls.restarts, 0);
  assert.equal(await i18n.changeUiLanguage('en', { restart: true }), true);
  assert.equal(calls.restarts, 1);
});

test('a failed write returns false and never restarts', () => {
  const { i18n, calls } = service({ flushOk: false });
  assert.equal(i18n.changeUiLanguage('en', { restart: true }), false);
  assert.equal(calls.restarts, 0);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test test/unit/i18n-main.test.js`
Expected: FAIL with `Cannot find module '../../src/main/i18n'`.

- [ ] **Step 3: Implement `src/main/i18n.js`**

```js
'use strict';
// Interface language for the main process. Pure: no require('electron') — main.js
// injects the OS and settings accessors. The resolved language is frozen at
// init() for the life of the process, which is what makes relaunch-to-apply
// sound: nothing re-resolves it.
const { createTranslator } = require('../renderer/pages/i18n');

const LOCALE_TAG = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;

function selectableCodes(locales, statusOverrides = {}) {
  return locales
    .filter((l) => (statusOverrides[l.code] ?? l.status) === 'selectable')
    .map((l) => l.code);
}

function resolveLocale({ setting, preferred = [], selectable }) {
  if (selectable.includes(setting)) return { locale: setting, source: 'setting' };
  if (setting === 'system') {
    for (const tag of preferred) {
      const primary = String(tag).toLowerCase().split(/[-_]/)[0];
      if (selectable.includes(primary)) return { locale: primary, source: 'system' };
    }
    return { locale: 'en', source: 'system' };
  }
  return { locale: 'en', source: 'unavailable' };
}

function formattingLocale(locale, systemLocale) {
  if (locale === 'en-XA') return 'en';
  const region = /^[A-Za-z]{2,3}(?:[-_][A-Za-z]{4})?[-_]([A-Za-z]{2}|\d{3})(?![A-Za-z0-9])/
    .exec(String(systemLocale ?? ''))?.[1];
  const candidate = region ? `${locale}-${region.toUpperCase()}` : locale;
  try { return Intl.getCanonicalLocales(candidate)[0]; } catch { return locale; }
}

function testOverrides({ isPackaged, env }) {
  if (isPackaged || env.BLANC_TEST !== '1') return { status: {} };
  const out = { status: {} };
  if (env.BLANC_TEST_SYSTEM_LANGUAGES) {
    out.preferred = env.BLANC_TEST_SYSTEM_LANGUAGES.split(',').map((s) => s.trim()).filter(Boolean);
  }
  for (const pair of String(env.BLANC_TEST_LOCALE_STATUS ?? '').split(',')) {
    const [code, status] = pair.split('=').map((s) => s?.trim());
    if (code && status) out.status[code] = status;
  }
  return out;
}

function stringsScriptFor({ source, formatLocale, strict }) {
  if (!LOCALE_TAG.test(formatLocale)) throw new Error(`invalid formatting locale ${formatLocale}`);
  return `${source}\nself.blancStrings.formatLocale=${JSON.stringify(formatLocale)};self.blancStrings.strict=${strict === true};\n`;
}

function createMainI18n({
  locales, settings, getPreferredSystemLanguages, getSystemLocale, restartApp,
  overrides = { status: {} }, loadStrings, loadStringsSource, strict = false,
}) {
  let state = null;
  let translator = null;
  const selectable = () => selectableCodes(locales, overrides.status);
  const preferred = () => overrides.preferred ?? getPreferredSystemLanguages();
  const localeEntry = (code) => locales.find((l) => l.code === code);

  function init() {
    if (state) return state;
    const resolved = resolveLocale({ setting: settings.getSettings().uiLanguage, preferred: preferred(), selectable: selectable() });
    state = Object.freeze({
      locale: resolved.locale,
      formatLocale: formattingLocale(resolved.locale, getSystemLocale()),
      dir: localeEntry(resolved.locale)?.dir ?? 'ltr',
      source: resolved.source,
    });
    const data = loadStrings(state.locale);
    translator = createTranslator({
      locale: state.locale, formatLocale: state.formatLocale, messages: data.messages, fallback: data.fallback,
      onMissing: (key) => { if (strict) throw new Error(`missing interface string: ${key}`); console.warn(`missing interface string: ${key}`); },
    });
    return state;
  }

  const requireState = () => state ?? init();

  return {
    init,
    state: () => requireState(),
    t: (key, params) => { requireState(); return translator(key, params); },
    parts: (key, params) => { requireState(); return translator.parts(key, params); },
    languagesInfo() {
      const current = requireState();
      return {
        active: current.locale,
        system: resolveLocale({ setting: 'system', preferred: preferred(), selectable: selectable() }).locale,
        options: selectable().map((code) => ({ code, endonym: localeEntry(code).endonym })),
      };
    },
    changeUiLanguage(code, { restart } = {}) {
      if (typeof restart !== 'boolean') return false;
      const allowed = selectable();
      if (code !== 'system' && !allowed.includes(code)) return false;
      if (!settings.setUiLanguage(code, allowed)) return false;
      const next = resolveLocale({ setting: code, preferred: preferred(), selectable: allowed }).locale;
      if (restart && next !== requireState().locale) return restartApp();
      return true;
    },
    stringsScript() {
      const current = requireState();
      return stringsScriptFor({ source: loadStringsSource(current.locale), formatLocale: current.formatLocale, strict });
    },
  };
}

module.exports = { resolveLocale, formattingLocale, selectableCodes, testOverrides, stringsScriptFor, createMainI18n };
```

- [ ] **Step 4: Run tests**

Run: `node --test test/unit/i18n-main.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/i18n.js test/unit/i18n-main.test.js
git commit -m "Add main-process language resolution and the language-transition service"
```

---

### Task 8: Serve `strings.js` and `i18n.js` from both protocol handlers

**Files:**
- Modify: `src/main/chrome-protocol.js`, `src/main/pages.js`
- Test: `test/unit/i18n-protocol.test.js`, and extend `test/unit/chrome-protocol.test.js` only if an existing assertion enumerates `SHARED_ASSETS` (update it to include the two names)

**Interfaces:**
- Consumes: `stringsScript()` from Task 7 (injected; never required here).
- Produces:
  - `chrome-protocol.js`: exports `STRINGS_VIRTUAL_PATH` (absolute path `src/renderer/pages/strings.js`, which must never exist on disk); `chromeResourcePath('blanc-chrome://<host>/strings.js') === STRINGS_VIRTUAL_PATH` for every known host; `/i18n.js` → `src/renderer/pages/i18n.js`. `createChromeProtocolHandler({ net, developmentBrandMarkPath, stringsScript })` and `setupChromeProtocol({ …, stringsScript })`.
  - `pages.js`: exports `resolvePagesAsset(host, pathname) → { kind: 'strings' } | { kind: 'file', name } | null`. `setupPages(hooks)` reads `hooks.stringsScript`.
  - Both handlers answer a strings request with `new Response(stringsScript(), { headers: { 'content-type': 'text/javascript; charset=utf-8' } })`. When no `stringsScript` hook is given (the display-capture broker processes), they serve `strings.en.js` plus `formatLocale "en"`.

- [ ] **Step 1: Write the failing tests**

```js
// test/unit/i18n-protocol.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromeResourcePath, createChromeProtocolHandler, STRINGS_VIRTUAL_PATH } = require('../../src/main/chrome-protocol');

const pages = path.resolve(__dirname, '../../src/renderer/pages');

test('chrome hosts map strings.js to the virtual path and i18n.js to the shared formatter', () => {
  for (const host of ['index', 'overlay', 'permission', 'fill-status', 'display-capture-helper']) {
    assert.equal(chromeResourcePath(`blanc-chrome://${host}/strings.js`), STRINGS_VIRTUAL_PATH);
    assert.equal(chromeResourcePath(`blanc-chrome://${host}/i18n.js`), path.join(pages, 'i18n.js'));
  }
  assert.equal(STRINGS_VIRTUAL_PATH, path.join(pages, 'strings.js'));
  assert.equal(fs.existsSync(STRINGS_VIRTUAL_PATH), false, 'the virtual strings path must never exist on disk');
});

test('query strings, hashes, unknown hosts and generated-file paths around strings.js fail', () => {
  for (const url of [
    'blanc-chrome://index/strings.js?x=1', 'blanc-chrome://index/strings.js#x',
    'blanc-chrome://index/pages/strings.de.js', 'blanc-chrome://nope/strings.js',
  ]) assert.equal(chromeResourcePath(url), null, url);
  // The URL parser removes dot segments, so this is the same safe virtual path.
  assert.equal(chromeResourcePath('blanc-chrome://index/../strings.js'), STRINGS_VIRTUAL_PATH);
});

test('the chrome handler serves the injected strings script as JavaScript', async () => {
  const handler = createChromeProtocolHandler({ net: { fetch: () => { throw new Error('unexpected file fetch'); } }, stringsScript: () => 'S;' });
  const response = await handler({ url: 'blanc-chrome://overlay/strings.js' });
  assert.equal(await response.text(), 'S;');
  assert.match(response.headers.get('content-type'), /^text\/javascript/);
});

test('without a hook the chrome handler serves English with an en formatting locale', async () => {
  const handler = createChromeProtocolHandler({ net: { fetch: () => { throw new Error('unexpected'); } } });
  const text = await (await handler({ url: 'blanc-chrome://display-capture-helper/strings.js' })).text();
  assert.match(text, /"locale":"en"/);
  assert.match(text, /self\.blancStrings\.formatLocale="en";/);
});

test('blanc:// pages resolve strings.js specially and every other name as before', () => {
  const { resolvePagesAsset } = require('../../src/main/pages-assets');
  assert.deepEqual(resolvePagesAsset('settings', '/'), { kind: 'file', name: 'settings.html' });
  assert.deepEqual(resolvePagesAsset('settings', '/strings.js'), { kind: 'strings' });
  assert.deepEqual(resolvePagesAsset('settings', '/nested/strings.js'), { kind: 'strings' });
  assert.deepEqual(resolvePagesAsset('settings', '/i18n.js'), { kind: 'file', name: 'i18n.js' });
  assert.deepEqual(resolvePagesAsset('settings', '/strings.de.js'), { kind: 'file', name: 'strings.de.js' });
  assert.equal(resolvePagesAsset('settings', '/bad name.js'), null);
  assert.equal(resolvePagesAsset('not-a-page', '/strings.js'), null);
});
```

Note: the existing `serveBlanc` already reduces every path to `path.basename()`, so `/nested/strings.js` and `/../strings.js` collapse to `strings.js` exactly as `pages.css` does today. `resolvePagesAsset` lives in a new tiny module so the test does not load `pages.js` (which requires Electron).

- [ ] **Step 2: Run to verify failure**

Run: `node --test test/unit/i18n-protocol.test.js`
Expected: FAIL (`STRINGS_VIRTUAL_PATH` undefined).

- [ ] **Step 3: Implement in `chrome-protocol.js`**

Add near the top (after `RENDERER_DIR` is defined):

```js
// Interface strings: /strings.js is virtual — the handler answers it with the
// active language's generated catalog plus the runtime formatting locale. This
// path must never exist on disk; /i18n.js is the shared formatter.
const STRINGS_VIRTUAL_PATH = path.join(RENDERER_DIR, 'pages', 'strings.js');
const SHARED_ALIASES = new Map([
  ['/strings.js', STRINGS_VIRTUAL_PATH],
  ['/i18n.js', path.join(RENDERER_DIR, 'pages', 'i18n.js')],
]);
const ENGLISH_STRINGS_PATH = path.join(RENDERER_DIR, 'pages', 'strings.en.js');
```

In `chromeResourcePath`, replace the two lines computing `relative` with:

```js
  const alias = SHARED_ALIASES.get(parsed.pathname);
  if (alias) return alias;
  const relative = hostAssets.get(parsed.pathname)
    ?? (SHARED_ASSETS.has(parsed.pathname) ? parsed.pathname.slice(1) : null);
```

(`hostAssets` is already checked non-null above this point, so the alias applies to every known host and to no other.)

Replace `createChromeProtocolHandler` and `setupChromeProtocol` with:

```js
function englishStringsScript() {
  const source = fs.readFileSync(ENGLISH_STRINGS_PATH, 'utf8');
  return `${source}\nself.blancStrings.formatLocale="en";self.blancStrings.strict=false;\n`;
}

function createChromeProtocolHandler({ net, developmentBrandMarkPath = null, stringsScript = englishStringsScript }) {
  return (request) => {
    const defaultPath = chromeResourcePath(request.url);
    if (!defaultPath) return new Response('Not found', { status: 404 });
    if (defaultPath === STRINGS_VIRTUAL_PATH) {
      return new Response(stringsScript(), { headers: { 'content-type': 'text/javascript; charset=utf-8' } });
    }
    const resource = developmentBrandAssetPath({
      name: path.basename(defaultPath),
      defaultPath,
      brandMarkPath: developmentBrandMarkPath,
    });
    return net.fetch(pathToFileURL(resource).href);
  };
}

function setupChromeProtocol({ session, net, developmentBrandMarkPath = null, stringsScript }) {
  session.protocol.handle(CHROME_SCHEME, createChromeProtocolHandler({
    net,
    developmentBrandMarkPath,
    ...(stringsScript ? { stringsScript } : {}),
  }));
}
```

Add `const fs = require('node:fs');` to the requires if absent, and `STRINGS_VIRTUAL_PATH` to `module.exports`.

- [ ] **Step 4: Implement `src/main/pages-assets.js` and use it in `pages.js`**

```js
// src/main/pages-assets.js
'use strict';
// Pure blanc:// asset resolution (no Electron): a page's root serves
// <host>.html; any deeper path is a flat file in PAGES_DIR, except the
// virtual strings.js answered with the active language's catalog.
const path = require('path');
const { KNOWN_PAGES } = require('./utility-pages');

function resolvePagesAsset(host, pathname) {
  if (!KNOWN_PAGES.has(host)) return null;
  const name = pathname === '/' ? `${host}.html` : path.basename(pathname);
  if (name === 'strings.js') return { kind: 'strings' };
  if (!/^[\w.-]+$/.test(name)) return null;
  return { kind: 'file', name };
}

module.exports = { resolvePagesAsset };
```

`src/main/utility-pages.js` does not require Electron, so the test loads it directly.

In `pages.js`, add `const { resolvePagesAsset } = require('./pages-assets');` and replace the body of `serveBlanc` after the `branding` early return with:

```js
    const { host, pathname } = new URL(request.url);
    const asset = resolvePagesAsset(host, pathname);
    if (!asset) return new Response(KNOWN_PAGES.has(host) ? 'Bad request' : 'Not found', { status: KNOWN_PAGES.has(host) ? 400 : 404 });
    if (asset.kind === 'strings') {
      return new Response(stringsScript(), { headers: { 'content-type': 'text/javascript; charset=utf-8' } });
    }
    const name = asset.name;
    const defaultPath = path.join(PAGES_DIR, name);
```

(keeping the existing `developmentBrandAssetPath` and `net.fetch` lines that follow). Inside `setupPages`, before `serveBlanc`, add:

```js
  const stringsScript = hooks.stringsScript ?? (() =>
    `${fs.readFileSync(path.join(PAGES_DIR, 'strings.en.js'), 'utf8')}\nself.blancStrings.formatLocale="en";self.blancStrings.strict=false;\n`);
```

- [ ] **Step 5: Run tests**

Run: `node --test test/unit/i18n-protocol.test.js test/unit/chrome-protocol.test.js test/unit/utility-pages.test.js test/unit/pages-ipc-trust.test.js`
Expected: PASS.

- [ ] **Step 6: Update the audit inventory and commit**

```bash
npm run audit-inventory:write
git add src/main/chrome-protocol.js src/main/pages.js src/main/pages-assets.js test/unit/i18n-protocol.test.js security
git commit -m "Serve the active interface catalog as strings.js from both internal schemes"
```

---

### Task 9: Load the catalog in every document and wire main

**Files:**
- Modify: the 15 HTML documents, `src/main/main.js`, `src/main/test-hook.js`
- Test: `test/unit/i18n-documents.test.js`

**Interfaces:**
- Consumes: Tasks 2, 7, 8.
- Produces: `mainI18n` in `main.js` (an instance of `createMainI18n`), passed as `stringsScript` to `setupChromeProtocol` and `setupPages`, and as `i18n` to `setupPages` hooks (Task 10 uses it). Test hook method `i18nState()`.

- [ ] **Step 1: Write the failing test**

```js
// test/unit/i18n-documents.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const renderer = path.resolve(__dirname, '../../src/renderer');
const documents = [
  ...fs.readdirSync(renderer).filter((f) => f.endsWith('.html')).map((f) => path.join(renderer, f)),
  ...fs.readdirSync(path.join(renderer, 'pages')).filter((f) => f.endsWith('.html')).map((f) => path.join(renderer, 'pages', f)),
];

test('every chrome and internal document exists in the expected count', () => {
  assert.equal(documents.length, 15, documents.join('\n'));
});

for (const file of documents) {
  test(`${path.relative(renderer, file)} loads strings.js then i18n.js before any other script`, () => {
    const html = fs.readFileSync(file, 'utf8');
    const head = html.slice(0, html.indexOf('</head>'));
    const scripts = [...html.matchAll(/<script\b[^>]*src="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(scripts.slice(0, 2), ['strings.js', 'i18n.js']);
    assert.ok(head.includes('<script src="strings.js"></script>'), 'in <head>');
    assert.match(html, /<html lang="en">/, 'source keeps lang="en"; i18n.js sets the runtime language');
  });
}
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test test/unit/i18n-documents.test.js`
Expected: FAIL for every document.

- [ ] **Step 3: Add the two scripts to every document**

In each of the 15 files, immediately after the `<meta http-equiv="Content-Security-Policy" …>` line, insert (matching the file's indentation):

```html
  <script src="strings.js"></script>
  <script src="i18n.js"></script>
```

No CSP change is needed: every document allows `'self'` scripts (`newtab.html` and `error.html` through `default-src 'self'`).

- [ ] **Step 4: Wire `main.js`**

Near the other top-level requires:

```js
const { createMainI18n, testOverrides: i18nTestOverrides } = require('./i18n');
const I18N_LOCALES = require('./i18n-locales.json');
```

After `restartApp` is defined (around the existing `const restartApp = createAppRestarter(…)`), add:

```js
// Interface language: resolved once at whenReady (first statement) and frozen
// for this process; a change applies on relaunch through changeUiLanguage().
const mainI18n = createMainI18n({
  locales: I18N_LOCALES,
  settings,
  getPreferredSystemLanguages: () => app.getPreferredSystemLanguages(),
  getSystemLocale: () => app.getSystemLocale(),
  restartApp: () => restartApp(),
  overrides: i18nTestOverrides({ isPackaged: app.isPackaged, env: process.env }),
  strict: acceptanceTestMode,
  loadStrings: (code) => require(`../renderer/pages/strings.${code}.js`),
  loadStringsSource: (code) => fs.readFileSync(path.join(__dirname, `../renderer/pages/strings.${code}.js`), 'utf8'),
});
```

`acceptanceTestMode` is defined at `main.js:326`, well before this point; `fs` and `path` are already required at the top of `main.js`. `code` is always an entry of `I18N_LOCALES` (resolution only returns registry codes), so the dynamic `require` path is bounded.

Make `mainI18n.init();` the first statement inside `app.whenReady().then(bindWindowRuntime(primaryRuntime, async () => {`.

Change `setupChromeProtocol({ session: chromeSes, net, developmentBrandMarkPath });` to:

```js
  setupChromeProtocol({ session: chromeSes, net, developmentBrandMarkPath, stringsScript: () => mainI18n.stringsScript() });
```

In the `setupPages({` hooks object add:

```js
    stringsScript: () => mainI18n.stringsScript(),
    i18n: mainI18n,
```

In the `require('./test-hook').install({` refs add `i18nState: () => mainI18n.state(),`. In `src/main/test-hook.js`'s `globalThis.__blanc = {` object add:

```js
    i18nState() { return refs.i18nState(); },
```

- [ ] **Step 5: Run unit tests, launch the app, and check one document**

Run: `node --test test/unit/i18n-documents.test.js test/unit/i18n-main.test.js test/unit/i18n-protocol.test.js`
Expected: PASS.

Then relaunch dev (`npm start`) and confirm in DevTools for the chrome strip and Settings: `document.documentElement.lang === 'en'`, `typeof blancI18n.t === 'function'`, no console errors, and the UI looks unchanged. Leave the dev app running.

- [ ] **Step 6: Commit**

```bash
npm run audit-inventory:write
git add src/renderer src/main/main.js src/main/test-hook.js test/unit/i18n-documents.test.js security
git commit -m "Load the interface catalog in every document and resolve the language at startup"
```

---

### Task 10: Settings language bridge and picker

**Files:**
- Create: `src/renderer/pages/settings-language-model.js`
- Modify: `src/main/pages.js`, `src/main/tab-preload.js`, `browser-api/bridges.json`, `src/renderer/pages/settings.html`, `src/renderer/pages/settings.js`
- Test: `test/unit/settings-language-model.test.js`, plus regenerated `browser-api/generated/vectors.json`

**Interfaces:**
- Consumes: `mainI18n.languagesInfo()`, `mainI18n.changeUiLanguage()` (Task 7) via `hooks.i18n`; `blancI18n.t` (Task 2).
- Produces:
  - `pages:settings:get` result gains `languages: { active, system, options: [{ code, endonym }] }`.
  - New invoke channel `pages:settings:language` (host `settings`), params `(code, restart)`, returns `boolean | Promise<boolean>`.
  - `window.bowserPages.settings.language(code, restart)`.
  - `blancSettingsLanguage.languageRow({ uiLanguage, languages, t }) → { visible, selected?, options: [{ value, label }] }` and `needsRelaunch(value, languages) → boolean`.

- [ ] **Step 1: Write the failing model test**

```js
// test/unit/settings-language-model.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { languageRow, needsRelaunch } = require('../../src/renderer/pages/settings-language-model');

const t = (key, params) => (key === 'settings.language.system' ? `System (${params.language})` : key);
const two = { active: 'de', system: 'de', options: [{ code: 'en', endonym: 'English' }, { code: 'de', endonym: 'Deutsch' }] };

test('hidden while only one language is selectable', () => {
  assert.deepEqual(languageRow({ uiLanguage: 'system', languages: { active: 'en', system: 'en', options: [{ code: 'en', endonym: 'English' }] }, t }),
    { visible: false, options: [] });
});

test('options: System naming what it resolves to, then endonyms', () => {
  const row = languageRow({ uiLanguage: 'system', languages: two, t });
  assert.equal(row.visible, true);
  assert.equal(row.selected, 'system');
  assert.deepEqual(row.options, [
    { value: 'system', label: 'System (Deutsch)' },
    { value: 'en', label: 'English' },
    { value: 'de', label: 'Deutsch' },
  ]);
});

test('a stored unavailable language shows English selected with no relaunch prompt', () => {
  const languages = { active: 'en', system: 'de', options: two.options };
  const row = languageRow({ uiLanguage: 'fr', languages, t });
  assert.equal(row.selected, 'en');
  assert.equal(needsRelaunch('en', languages), false);
});

test('relaunch is needed only when the choice resolves differently from this launch', () => {
  assert.equal(needsRelaunch('system', two), false);
  assert.equal(needsRelaunch('de', two), false);
  assert.equal(needsRelaunch('en', two), true);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test test/unit/settings-language-model.test.js`
Expected: FAIL with `Cannot find module`.

- [ ] **Step 3: Implement the model**

```js
// src/renderer/pages/settings-language-model.js
'use strict';
// Settings → General → Language row. Served flat to the settings page via a
// <script> tag AND require-able by node tests (same pattern as
// settings-nav-model.js). Endonyms are never translated.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.blancSettingsLanguage = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const resolvedFor = (value, languages) => (value === 'system' ? languages.system : value);

  function languageRow({ uiLanguage, languages, t }) {
    const options = languages?.options ?? [];
    if (options.length < 2) return { visible: false, options: [] };
    const endonym = new Map(options.map((o) => [o.code, o.endonym]));
    const selected = uiLanguage === 'system' || endonym.has(uiLanguage) ? uiLanguage : 'en';
    return {
      visible: true,
      selected,
      options: [
        { value: 'system', label: t('settings.language.system', { language: endonym.get(languages.system) ?? endonym.get('en') }) },
        ...options.map((o) => ({ value: o.code, label: o.endonym })),
      ],
    };
  }

  function needsRelaunch(value, languages) {
    return resolvedFor(value, languages) !== languages.active;
  }

  return { languageRow, needsRelaunch };
});
```

- [ ] **Step 4: Main and preload**

In `pages.js` `pages:settings:get` result, after `appIcons: settings.APP_ICON_LABELS,` add:

```js
    languages: hooks.i18n?.languagesInfo() ?? { active: 'en', system: 'en', options: [] },
```

After the `pages:settings:set` handler add:

```js
  // The only renderer write path for uiLanguage: sanitize() has no entry for
  // it, so pages:settings:set drops it like any unknown key.
  handle('pages:settings:language', 'settings', (code, restart) =>
    hooks.i18n?.changeUiLanguage(code, { restart }) ?? false);
```

In `src/main/tab-preload.js`, in the settings bridge after `set: (partial) => invoke('pages:settings:set', partial),` add:

```js
        language: (code, restart) => invoke('pages:settings:language', code, restart),
```

In `browser-api/bridges.json`, after the `settings.set` member add:

```json
{ "name": "settings.language", "kind": "invoke", "channel": "pages:settings:language", "hosts": ["settings"],
  "params": [{ "name": "code", "type": "unknown" }, { "name": "restart", "type": "unknown" }],
  "returns": "unknown", "doc": "Choose the interface language; optionally relaunch to apply it." }
```

(format it to match the surrounding entries' one-line style).

- [ ] **Step 5: Settings page**

In `settings.html`, after the `tabSleepSetting` block (before `mouseGesturesSetting`):

```html
            <div class="setting" id="uiLanguageSetting" hidden>
              <div class="label">
                <span data-i18n="settings.language.label">Language</span>
                <span class="hint" data-i18n="settings.language.hint">Translations are machine-generated.</span>
              </div>
              <select id="uiLanguage" aria-label="Language" data-i18n-aria-label="settings.language.label"></select>
              <button id="uiLanguageRelaunch" type="button" hidden data-i18n="settings.language.relaunch">Relaunch to apply</button>
            </div>
```

Add `<script src="settings-language-model.js"></script>` before `<script src="settings.js"></script>`.

In `settings.js`, destructure `languages` from `await window.bowserPages.settings.get()` alongside `settings`, and after the `tabSleep` block add:

```js
  if (supports('uiLanguage')) {
    const languageSetting = document.getElementById('uiLanguageSetting');
    const row = blancSettingsLanguage.languageRow({ uiLanguage: settings.uiLanguage, languages, t: blancI18n.t });
    if (!row.visible) {
      languageSetting.remove();
    } else {
      const select = document.getElementById('uiLanguage');
      const relaunch = document.getElementById('uiLanguageRelaunch');
      select.replaceChildren(...row.options.map((option) => {
        const el = document.createElement('option');
        el.value = option.value;
        el.textContent = option.label;
        return el;
      }));
      select.value = row.selected;
      let committed = row.selected;
      const syncRelaunch = () => { relaunch.hidden = !blancSettingsLanguage.needsRelaunch(select.value, languages); };
      select.addEventListener('change', async () => {
        if (await window.bowserPages.settings.language(select.value, false)) committed = select.value;
        else select.value = committed;
        syncRelaunch();
      });
      relaunch.addEventListener('click', () => window.bowserPages.settings.language(select.value, true));
      languageSetting.hidden = false;
      syncRelaunch();
    }
  }
```

Note: if the existing layout needs the select and button grouped, wrap them in the same container element other two-control rows use (inspect the `mouseGesturesSetting` markup); do not add new CSS for this row unless the relaunched dev app shows a layout problem.

- [ ] **Step 6: Contracts, inventory, tests**

```bash
npm run browser-api:build
npm run audit-inventory:write
npm run copy:build
node --test test/unit/settings-language-model.test.js test/unit/pages-ipc-trust.test.js
npm run browser-api:check
npm run copy:check
```

Expected: all PASS. (`settings.get` returns `"unknown"` in `bridges.json`, so the new `languages` field needs no contract edit; the new `settings.language` member does, and Step 4 adds it.)

- [ ] **Step 7: Verify in the running app**

Relaunch with German made selectable (test override, dev only):

```bash
BLANC_TEST=1 BLANC_TEST_LOCALE_STATUS=de=selectable BLANC_TEST_SYSTEM_LANGUAGES=de-DE npm start
```

Open Settings → General. Expected: a "Sprache" row with options "System (Deutsch)", "English", "Deutsch"; the hint "Übersetzungen werden maschinell erstellt."; the document's `lang` is `de`; choosing English shows "Zum Übernehmen neu starten". Take a screenshot of the row for the PR. Then relaunch with plain `npm start` and confirm the row is absent. (With `BLANC_TEST=1` the blocker is disabled; this launch is for UI inspection only.)

- [ ] **Step 8: Commit**

```bash
git add src/main/pages.js src/main/tab-preload.js browser-api src/renderer/pages/settings.html src/renderer/pages/settings.js src/renderer/pages/settings-language-model.js test/unit/settings-language-model.test.js security
git commit -m "Add the Settings language picker with relaunch-to-apply"
```

---

### Task 11: Pass the formatting locale to standalone date and number formatting

**Files:**
- Modify: `src/renderer/overlay.js:1391-1392`, `src/renderer/pages/newtab.js:51,611,647,697`, `src/renderer/pages/history.js` (the two calls into `history-groups.js`), `src/renderer/pages/error.js:25`, `src/renderer/pages/bookmarks.js:265`, `src/renderer/pages/settings-sync-setup-model.js:144`, `src/renderer/pages/settings.js:753`, `src/renderer/pages/mahjong.js:309,1292,1663`
- Test: extend `test/unit/i18n-documents.test.js`

Sites that build a sentence around a number (`newtab.js:506,826`, `mahjong-state.js:533`, `mahjong.js:1249,1314,1334,1687`, `ublock-popup-mainworld.js:76,78`, `tab-import-open-tabs.js:375`) are **not** changed here; their extraction phases turn them into messages.

- [ ] **Step 1: Write the failing guard**

Append to `test/unit/i18n-documents.test.js`:

```js
test('standalone formatting sites pass the runtime formatting locale', () => {
  const sites = {
    'overlay.js': 2, 'pages/newtab.js': 4, 'pages/error.js': 1, 'pages/bookmarks.js': 1,
    'pages/settings-sync-setup-model.js': 1, 'pages/settings.js': 1, 'pages/mahjong.js': 3,
  };
  for (const [rel, count] of Object.entries(sites)) {
    const js = fs.readFileSync(path.join(renderer, rel), 'utf8');
    const found = (js.match(/formatLocale\??\.?\(\)/g) ?? []).length;
    assert.ok(found >= count, `${rel}: expected ${count} formatting-locale uses, found ${found}`);
    assert.doesNotMatch(js, /toLocaleDateString\(\)|Intl\.(DateTimeFormat|NumberFormat)\(undefined|Intl\.NumberFormat\(\)/, rel);
  }
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test test/unit/i18n-documents.test.js`
Expected: FAIL on `overlay.js`.

- [ ] **Step 3: Make the changes**

Call `blancI18n.formatLocale()` inline at each site. Do **not** declare a shared top-level helper: these are classic scripts that share one global scope per document (e.g. `mahjong.js` is a top-level `'use strict'` script), so two files declaring the same `const` would throw. `i18n.js` always loads first, so `blancI18n` exists.

- `overlay.js:1391-1392`: `.toLocaleDateString()` → `.toLocaleDateString(blancI18n.formatLocale())`.
- `newtab.js:51`: `toLocaleDateString(undefined, {…})` → `toLocaleDateString(blancI18n.formatLocale(), {…})`; `:611`, `:647`: `.toLocaleString()` → `.toLocaleString(blancI18n.formatLocale())`; `:697`: `new Intl.DateTimeFormat(undefined, …)` → `new Intl.DateTimeFormat(blancI18n.formatLocale(), …)`.
- `history.js`: pass `blancI18n.formatLocale()` as the `locale` argument it currently omits when calling `history-groups.js`.
- `error.js:25`, `bookmarks.js:265`, `settings.js:753`: `.toLocaleDateString()` → `.toLocaleDateString(blancI18n.formatLocale())`.
- `settings-sync-setup-model.js:144` is dual-environment (required by node tests): use `new Date(timestamp).toLocaleDateString(typeof self !== 'undefined' ? self.blancI18n?.formatLocale?.() : undefined)` and keep its existing tests green.
- `mahjong.js:309`, `:1663`: `.toLocaleString()` → `.toLocaleString(blancI18n.formatLocale())`; `:1292`: `new Intl.NumberFormat()` → `new Intl.NumberFormat(blancI18n.formatLocale())`.

- [ ] **Step 4: Run tests**

Run: `node --test test/unit/i18n-documents.test.js test/unit/settings-sync-setup-model.test.js test/unit/start-page-frame.test.js && npm run lint`
Expected: PASS.

- [ ] **Step 5: Run the start-page smoke (newtab changed) and commit**

Run: `npm run test:wallpaper:desktop`
Expected: PASS.

```bash
git add src/renderer test/unit/i18n-documents.test.js
git commit -m "Format standalone dates and numbers with the interface formatting locale"
```

---

### Task 12: Pseudo-locale sweep harness

**Files:**
- Create: `test/desktop/support/pseudo-sweep.js`, `test/unit/pseudo-sweep.test.js`, `test/desktop/i18n-pseudo-sweep.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces:
  - `classifyTextEntries(entries, { allow }) → string[]` (offending texts). Each entry: `{ text: string, ignored: boolean }`. A text passes if it contains `⟦` or `⟧`, has no letter, is `ignored`, or is in `allow`.
  - `collectTextEntries` source string (a function body evaluated in the page) returning entries for every visible text node and every `title`/`aria-label`/`placeholder`/`alt` attribute on a visible element.
  - `SURFACES`: array of `{ name, files: string[], open: async ({ app, chrome }) => page }`, consulted against `copy/i18n-scope.json`; a surface runs only when all its files are `guarded`, unless `--include-pending`.
  - `npm run test:i18n:desktop` (`node test/desktop/i18n-pseudo-sweep.mjs`).

- [ ] **Step 1: Write the failing classifier test**

```js
// test/unit/pseudo-sweep.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyTextEntries } = require('../desktop/support/pseudo-sweep');

test('pseudo-marked, symbol-only, ignored and allowlisted text passes; plain English fails', () => {
  assert.deepEqual(classifyTextEntries([
    { text: '⟦Öþéñ ţáƀ~~⟧', ignored: false },
    { text: '⟦Ţüŕñ öñ ', ignored: false },
    { text: ' îñ Šéţţîñĝš~~⟧', ignored: false },
    { text: '✕', ignored: false },
    { text: '12', ignored: false },
    { text: 'example.com', ignored: true },
    { text: 'Blanc', ignored: false },
    { text: 'Close tab', ignored: false },
  ], { allow: ['Blanc'] }), ['Close tab']);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test test/unit/pseudo-sweep.test.js`
Expected: FAIL with `Cannot find module`.

- [ ] **Step 3: Implement `test/desktop/support/pseudo-sweep.js`**

```js
'use strict';
// Pseudo-locale (en-XA) sweep: in en-XA every Blanc-authored string carries
// ⟦ or ⟧, so any visible letter-bearing text without them is unextracted.

const LETTER = /\p{L}/u;

function classifyTextEntries(entries, { allow = [] } = {}) {
  return entries
    .filter(({ text, ignored }) => {
      const value = text.trim();
      if (!value || !LETTER.test(value) || ignored) return false;
      if (value.includes('⟦') || value.includes('⟧')) return false;
      return !allow.includes(value);
    })
    .map(({ text }) => text.trim());
}

// A function body evaluated in the page as page.evaluate(`(() => {${COLLECT}})()`).
const COLLECT = String.raw`
  const out = [];
  const visible = (el) => el && el.checkVisibility?.({ checkOpacity: true, checkVisibilityCSS: true }) !== false
    && el.getClientRects().length > 0;
  const ignored = (el) => !!el?.closest?.('[data-i18n-ignore], script, style, svg');
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const el = node.parentElement;
    if (!visible(el)) continue;
    out.push({ text: node.data, ignored: ignored(el) });
  }
  for (const el of document.querySelectorAll('[title],[aria-label],[placeholder],[alt]')) {
    if (!visible(el)) continue;
    for (const attr of ['title', 'aria-label', 'placeholder', 'alt']) {
      const value = el.getAttribute(attr);
      if (value) out.push({ text: value, ignored: ignored(el) });
    }
  }
  out.push({ text: document.title, ignored: false });
  return out;
`;

module.exports = { classifyTextEntries, COLLECT };
```

- [ ] **Step 4: Implement the sweep script**

```js
// test/desktop/i18n-pseudo-sweep.mjs — npm run test:i18n:desktop [-- --include-pending]
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { _electron } from 'playwright';
import poll from './support/poll.js';
import sweep from './support/pseudo-sweep.js';

const { waitForValue } = poll;
const { classifyTextEntries, COLLECT } = sweep;
const includePending = process.argv.includes('--include-pending');
const scope = JSON.parse(fs.readFileSync('copy/i18n-scope.json', 'utf8')).files;
const allow = ['Blanc', 'Blanc Blocker', 'Blanc Patron', 'Patron', 'uBlock Origin', '1Password'];

const findPage = (app, prefix, label) =>
  waitForValue(async () => (await app.windows()).find((p) => p.url().startsWith(prefix)), Boolean, label);

// Each extraction phase adds its surfaces here (Phase recipe, step 7).
const SURFACES = [
  {
    name: 'start page',
    files: ['src/renderer/pages/newtab.html', 'src/renderer/pages/newtab.js', 'src/renderer/pages/onboarding.js'],
    open: ({ app }) => findPage(app, 'blanc://newtab/', 'new tab'),
  },
  {
    name: 'settings',
    files: ['src/renderer/pages/settings.html', 'src/renderer/pages/settings.js', 'src/renderer/pages/settings-language-model.js'],
    open: async ({ app, chrome }) => {
      await chrome.evaluate(() => window.browserAPI.createTab('blanc://settings/'));
      return findPage(app, 'blanc://settings', 'settings sheet');
    },
  },
];

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-pseudo-sweep-'));
const profile = path.join(root, 'profile');
fs.mkdirSync(`${profile}-Dev`);
fs.writeFileSync(path.join(`${profile}-Dev`, 'settings.json'), JSON.stringify({
  onboardingVersion: 1, presentationDefaultsResetVersion: 1, adblockEnabled: false, usagePing: false,
  searchSuggestions: false, uiLanguage: 'en-XA',
}));
const { ELECTRON_RUN_AS_NODE: _ignored, ...env } = process.env;
let app;
const failures = [];
try {
  app = await _electron.launch({ chromiumSandbox: true, args: [path.resolve('.'), `--user-data-dir=${profile}`],
    env: { ...env, BLANC_TEST: '1', BLANC_TEST_LOCALE_STATUS: 'en-XA=selectable', BLANC_TEST_UNCAUGHT_LOG: path.join(root, 'uncaught.log') } });
  const chrome = await findPage(app, 'blanc-chrome://index/', 'chrome strip');
  const state = await app.evaluate(() => globalThis.__blanc.i18nState());
  assert.equal(state.locale, 'en-XA', 'the sweep runs in the pseudo-locale');
  for (const surface of SURFACES) {
    const pending = surface.files.filter((f) => scope[f]?.state !== 'guarded');
    if (pending.length && !includePending) { console.log(`skip ${surface.name} (pending: ${pending.join(', ')})`); continue; }
    const page = await surface.open({ app, chrome });
    await page.waitForLoadState('domcontentloaded');
    const offending = classifyTextEntries(await page.evaluate(`(() => {${COLLECT}})()`), { allow });
    if (offending.length) failures.push(`${surface.name}:\n    ${offending.join('\n    ')}`);
    else console.log(`ok   ${surface.name}`);
  }
} finally {
  await app?.close().catch(() => {});
  fs.rmSync(root, { recursive: true, force: true });
}
if (failures.length) {
  console.error(`Untranslated text in the pseudo-locale:\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log('i18n pseudo sweep OK');
```

Add to `package.json` scripts: `"test:i18n:desktop": "node test/desktop/i18n-pseudo-sweep.mjs",` and `"pretest:i18n:desktop": "npm run runtime:check",` (matching the other desktop smokes).

- [ ] **Step 5: Prove the sweep detects failures (positive control), then run normally**

Run: `node --test test/unit/pseudo-sweep.test.js`
Expected: PASS.

Run: `npm run test:i18n:desktop -- --include-pending`
Expected: **FAIL**, listing plain English from the start page and Settings (they are still `pending`). This proves the sweep can see unextracted text. Record the first few offending lines in the PR description.

Run: `npm run test:i18n:desktop`
Expected: PASS with both surfaces skipped as pending.

- [ ] **Step 6: Commit**

```bash
git add test/desktop/support/pseudo-sweep.js test/desktop/i18n-pseudo-sweep.mjs test/unit/pseudo-sweep.test.js package.json
git commit -m "Add the pseudo-locale sweep that proves interface coverage at runtime"
```

---

### Task 13: F44 scenarios and the interface-language smoke

**Files:**
- Create: `spec/acceptance/interface-language.feature`, `test/desktop/interface-language-smoke.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: test hook `i18nState()` (Task 9), `bowserPages.settings.language` (Task 10).
- Produces: `npm run test:interface-language:desktop`.

- [ ] **Step 1: Write the feature file**

```gherkin
# spec/acceptance/interface-language.feature
@F44
Feature: Interface language
  Blanc's own interface text comes from one catalog. Users can follow the OS
  language or pin a supported one; brand names and slash commands never change;
  websites see the same language signals whatever the interface language is.
  Desktop binding: test/desktop/interface-language-smoke.mjs (each scenario needs
  a fresh launch, which the shared-app Cucumber harness cannot provide).

  @F44-1
  Scenario: System resolves to a supported OS language
    Given the OS prefers "de-DE"
    And German is selectable
    And the interface language is "System"
    When Blanc starts
    Then the interface language is "de"

  @F44-2
  Scenario: A pinned language wins over the OS
    Given the OS prefers "de-DE"
    And German is selectable
    And the interface language is "English"
    When Blanc starts
    Then the interface language is "en"

  @F44-3
  Scenario: Choosing a language asks to relaunch and applies after it
    Given the OS prefers "en-US"
    And German is selectable
    When the user chooses "Deutsch" in Settings
    Then Settings offers to relaunch to apply
    And after a relaunch the interface language is "de"

  @F44-4
  Scenario: A pinned language that is no longer available renders English
    Given the OS prefers "de-DE"
    And German is selectable
    And the stored interface language is "fr"
    When Blanc starts
    Then the interface language is "en"
    And the stored interface language is still "fr"

  @F44-5
  Scenario: Websites are unaffected by the interface language
    Given the OS prefers "de-DE"
    When a page is loaded with the interface language "English" and again with "Deutsch"
    Then the Accept-Language header is the same both times
```

- [ ] **Step 2: Write the smoke**

```js
// test/desktop/interface-language-smoke.mjs — binds spec/acceptance/interface-language.feature.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { _electron } from 'playwright';
import poll from './support/poll.js';

const { waitForValue } = poll;
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-interface-language-'));
const { ELECTRON_RUN_AS_NODE: _ignored, ...baseEnv } = process.env;
const findPage = (app, prefix, label) =>
  waitForValue(async () => (await app.windows()).find((p) => p.url().startsWith(prefix)), Boolean, label);

function profileWith(name, settings) {
  const profile = path.join(root, name);
  fs.mkdirSync(`${profile}-Dev`, { recursive: true });
  fs.writeFileSync(path.join(`${profile}-Dev`, 'settings.json'), JSON.stringify({
    onboardingVersion: 1, presentationDefaultsResetVersion: 1, adblockEnabled: false, usagePing: false,
    searchSuggestions: false, ...settings,
  }));
  return profile;
}
const storedSettings = (profile) => JSON.parse(fs.readFileSync(path.join(`${profile}-Dev`, 'settings.json'), 'utf8'));

async function withApp(profile, { preferred, german = true }, run) {
  const app = await _electron.launch({ chromiumSandbox: true, args: [path.resolve('.'), `--user-data-dir=${profile}`], env: {
    ...baseEnv, BLANC_TEST: '1', BLANC_TEST_SYSTEM_LANGUAGES: preferred,
    ...(german ? { BLANC_TEST_LOCALE_STATUS: 'de=selectable' } : {}),
    BLANC_TEST_UNCAUGHT_LOG: path.join(root, 'uncaught.log'),
  } });
  try {
    await app.evaluate(() => new Promise((resolve) => {
      const timer = setInterval(() => { if (globalThis.__blanc?.startupReady?.()) { clearInterval(timer); resolve(); } }, 50);
    }));
    return await run(app);
  } finally {
    await app.close().catch(() => {});
  }
}
const locale = (app) => app.evaluate(() => globalThis.__blanc.i18nState().locale);
const chromeLang = async (app) => (await findPage(app, 'blanc-chrome://index/', 'chrome')).evaluate(() => document.documentElement.lang);

const seen = [];
const server = http.createServer((req, res) => {
  if (req.url === '/') seen.push(req.headers['accept-language']); // ignore /favicon.ico
  res.end('<title>ok</title>ok');
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const pageUrl = `http://127.0.0.1:${server.address().port}/`;

try {
  // F44-1
  await withApp(profileWith('f44-1', { uiLanguage: 'system' }), { preferred: 'de-DE' }, async (app) => {
    assert.equal(await locale(app), 'de');
    assert.equal(await chromeLang(app), 'de');
  });
  console.log('ok F44-1');

  // F44-2
  await withApp(profileWith('f44-2', { uiLanguage: 'en' }), { preferred: 'de-DE' }, async (app) => {
    assert.equal(await locale(app), 'en');
    assert.equal(await chromeLang(app), 'en');
  });
  console.log('ok F44-2');

  // F44-3
  const p3 = profileWith('f44-3', { uiLanguage: 'system' });
  await withApp(p3, { preferred: 'en-US' }, async (app) => {
    assert.equal(await locale(app), 'en');
    const chrome = await findPage(app, 'blanc-chrome://index/', 'chrome');
    await chrome.evaluate(() => window.browserAPI.createTab('blanc://settings/'));
    const sheet = await findPage(app, 'blanc://settings', 'settings');
    await sheet.waitForSelector('#uiLanguage');
    await sheet.selectOption('#uiLanguage', 'de');
    await sheet.waitForSelector('#uiLanguageRelaunch:not([hidden])');
  });
  assert.equal(storedSettings(p3).uiLanguage, 'de');
  await withApp(p3, { preferred: 'en-US' }, async (app) => assert.equal(await locale(app), 'de'));
  console.log('ok F44-3');

  // F44-4
  const p4 = profileWith('f44-4', { uiLanguage: 'fr' });
  await withApp(p4, { preferred: 'de-DE' }, async (app) => {
    assert.deepEqual(await app.evaluate(() => globalThis.__blanc.i18nState()).then((s) => [s.locale, s.source]), ['en', 'unavailable']);
  });
  assert.equal(storedSettings(p4).uiLanguage, 'fr');
  console.log('ok F44-4');

  // F44-5
  for (const uiLanguage of ['en', 'de']) {
    await withApp(profileWith(`f44-5-${uiLanguage}`, { uiLanguage }), { preferred: 'de-DE' }, async (app) => {
      const chrome = await findPage(app, 'blanc-chrome://index/', 'chrome');
      await chrome.evaluate((url) => window.browserAPI.createTab(url), pageUrl);
      await waitForValue(async () => seen.length >= (uiLanguage === 'en' ? 1 : 2), Boolean, 'page request');
    });
  }
  assert.equal(seen[0], seen[1], `Accept-Language changed: ${seen[0]} vs ${seen[1]}`);
  console.log('ok F44-5');
} finally {
  server.close();
  fs.rmSync(root, { recursive: true, force: true });
}
console.log('interface-language smoke OK');
```

Note on F44-3: the relaunch button itself is not clicked, because `app.relaunch()` would detach Playwright. The scenario's "after a relaunch" is a fresh launch on the same profile, which is what `app.relaunch()` does. The restart call path is unit-tested in Task 7.

Add `"test:interface-language:desktop": "node test/desktop/interface-language-smoke.mjs",` and `"pretest:interface-language:desktop": "npm run runtime:check",` to `package.json`.

- [ ] **Step 3: Run**

Run: `npm run test:interface-language:desktop && npm run test:acceptance:dry`
Expected: five `ok F44-n` lines and `interface-language smoke OK`; the dry run stays green (F44 is not in `RUNNABLE`).

- [ ] **Step 4: Commit**

```bash
git add spec/acceptance/interface-language.feature test/desktop/interface-language-smoke.mjs package.json
git commit -m "Add F44 interface-language scenarios and their desktop smoke"
```

---

### Task 14: Spec, parity and repository documentation

**Files:**
- Modify: `spec/features.md`, `spec/parity-matrix.md`, `spec/divergence-register.md`, `spec/shared-substrate.md`, `copy/README.md`, `CLAUDE.md`, `AGENTS.md`, `spec/acceptance/index.md` (if it lists feature files)

- [ ] **Step 1: `spec/features.md`** — append after F42:

```markdown
## F44 — Interface language

**Contract.** Every Blanc-authored interface string comes from the shared
catalog (`copy/messages/`). Brand names, slash command names and macOS modifier
symbols are never translated. A missing translation falls back to English text,
never to a key. The user can use a supported language different from the OS
language. The interface language never changes the language signals websites
receive (`Accept-Language`, Chromium's in-page widgets).

**Desktop.** Settings → General → Language (System, then supported languages by
endonym); a change applies after a relaunch. Device-local, never Profile Synced.
A pinned language that is no longer available renders English and stays stored.

**Mobile.** The OS per-app language screen chooses the language (D27). Same
catalog, same fixed terms, same fallback, same selectable set.

**Acceptance.** `spec/acceptance/interface-language.feature` (F44-1 … F44-5).
```

- [ ] **Step 2: `spec/parity-matrix.md`** — add the row after F42:

```markdown
| F44 | Interface language | PLANNED | PLANNED | PLANNED | All Blanc-authored UI text from the shared catalog; fixed brand/command terms; English fallback; user may pin a supported language other than the OS's; web-facing language signals unaffected. Desktop: in-app picker + relaunch; mobile: OS per-app language. | D27 |
```

- [ ] **Step 3: `spec/divergence-register.md`** — append:

```markdown
## D27 — Interface-language picker location
**Features:** F44

**Why:** iOS and Android already provide a per-app language screen that also
applies to the system UI the app shows; an in-app picker there would duplicate
it and disagree with it. Desktop has no such OS facility for Electron apps.

- **Desktop:** Settings → General → Language with System plus supported
  languages by endonym; the choice is device-local and applies after a relaunch.
- **iOS:** Settings → Blanc → Language (the system per-app language screen).
- **Android 13+:** per-app language preferences (`LocaleManager`).

**Parity contract that still holds:** the same catalog, the same fixed terms,
the same English fallback and the same selectable set on every platform.
```

- [ ] **Step 4: `spec/shared-substrate.md` S3** — replace the "Status — first slice built" paragraph with:

```markdown
**Status — full message catalog (F44).** `copy/messages/en.json` holds every
Blanc-authored interface string under stable keys; `de.json` (and later
languages) carry translations with per-entry source hashes that only
`npm run copy:ack` advances. `npm run copy:build` emits the desktop runtime
catalogs (`src/renderer/pages/strings.<locale>.js`), the locale registry, iOS
`Localizable.xcstrings` and Android per-locale resources; the legacy English
`SlashCommands.strings`/`slash_commands.xml` stay for the existing iOS consumer.
`npm run copy:check` guards translations, glossary terms, the files
`copy/i18n-scope.json` marks guarded, and the hand-synced slash copies until
they move to `t()`. See `copy/README.md`.
```

- [ ] **Step 5: `copy/README.md`** — rewrite to cover: files (`messages/`, `glossary.json`, `i18n-scope.json`, `slash-commands.json` as registry, `lib/`, `generated/`); message format (with the plural and tag examples from the spec); the workflow (add key with `note` → write German in the same PR → `npm run copy:ack -- de <keys>` → `npm run copy:build` → `npm run copy:check`); `copy:status`; why there is no ack-all mode; `data-i18n*` attributes and `data-i18n-ignore`; the pseudo-locale and `npm run test:i18n:desktop`; the unhide gate (Task 15 checklist).

- [ ] **Step 6: `CLAUDE.md` and `AGENTS.md`** — add this paragraph after the **Theming** paragraph in both files, identically:

```markdown
**Interface language** (F44; `copy/messages/`, `src/main/i18n.js`, `src/renderer/pages/i18n.js`): every Blanc-authored string lives in `copy/messages/en.json` under a stable key; translations (`de.json`, hidden until 100% coverage) carry a per-entry source hash that only `npm run copy:ack -- <locale> <keys>` advances — `copy:build`/`copy:check` never do, so a stale translation cannot be cleared by building. A PR that changes English updates every language in the same PR. `copy:build` generates `src/renderer/pages/strings.<locale>.js` (never hand-edit), which every `blanc-chrome://` and `blanc://` document loads as `strings.js` (the handlers map that name to the active language and append the formatting locale) followed by `i18n.js`; main requires the same files. Static HTML keeps its English inline with `data-i18n*` keys; JS calls `blancI18n.t(key, params)`; never `innerHTML` a message. `uiLanguage` (`system` or a code) is device-local, written only by `settings.setUiLanguage()` through `changeUiLanguage()` (never `pages:settings:set`), resolved once at `whenReady` and frozen, so a change applies after a relaunch; a stored unavailable language renders English. `Accept-Language`, search suggestions, Chromium's in-page widgets and spellcheck stay on the OS language; Blanc never passes `--lang`. `copy/i18n-scope.json` marks each string-bearing file `pending` or `guarded`; guarded files fail `copy:check` on hard-coded English, and `npm run test:i18n:desktop` (pseudo-locale `en-XA`) is the runtime check.
```

The two files differ today only in their title and intro lines. Save `diff CLAUDE.md AGENTS.md > /tmp/before.diff` before editing and confirm `diff CLAUDE.md AGENTS.md` is byte-identical to it afterwards, so the new paragraph matches exactly.

- [ ] **Step 7: Check and commit**

Run: `npm run substrate:check && npm run test:acceptance:dry`
Expected: PASS.

```bash
git add spec copy/README.md CLAUDE.md AGENTS.md
git commit -m "Document interface localization: F44, D27, the S3 catalog and the workflow"
```

- [ ] **Step 8: Foundation PR verification**

Run: `npm run lint && npm run test:unit && npm run substrate:check && npm run test:i18n:desktop && npm run test:interface-language:desktop && npm run test:wallpaper:desktop`
Expected: all PASS. Rebase onto `origin/main`, push, open the PR (foundation only; users see no change), and run `/verify` and `/simplify` before the final commit per repository rules.

---

# Phases 2–9 — Extraction (one recipe, eight scopes)

Each phase is one or more PRs. German stays hidden. Apply this recipe to each phase's file list; a large phase may split into several PRs, each leaving its files `guarded`.

### Extraction recipe (repeat per PR)

**Files:** the phase's files below, `copy/messages/en.json`, `copy/messages/de.json`, `copy/i18n-scope.json`, `test/desktop/i18n-pseudo-sweep.mjs`, and the tests that cover those files.

- [ ] **Step 1: Mark the files guarded and see the worklist**

Set each file's `state` to `"guarded"` in `copy/i18n-scope.json`, then run `npm run copy:check`. The failures are the worklist for this PR. Revert the state flip only if you stop partway; never commit a guarded file that fails.

- [ ] **Step 2: Add English keys**

For each finding, add an `en.json` entry: key `<surface>.<area>.<slot>` naming the slot, not the text; the exact current English as `message`; a `note` that says where it appears and what any placeholder holds; `maxLength` for buttons, menu items, pill words and other static slots (current English length + 40%, rounded up). Rules:
- Turn every hand-built plural (`n === 1 ? 'tab' : 'tabs'`, `plural()` helpers) into one `{count, plural, one {…} other {…}}` message.
- Turn every sentence assembled from fragments into one message per grammatical variant (e.g. `permission.prompt.camera`, `permission.prompt.microphone` instead of `` `${host} wants to ${verb}` ``).
- Numbers inside sentences use `#` or a placeholder whose value the caller formats with `blancI18n.formatLocale()`; never `toLocaleString()` with no argument.
- Keyboard shortcut text built by hand takes Ctrl/Shift/Alt from `key.ctrl`/`key.shift`/`key.alt`/`key.enter`/… entries; macOS symbols stay literal.

- [ ] **Step 3: Replace the hard-coded text**

- HTML: add `data-i18n="key"` to the element whose text is the message (keep the English inline, exactly equal to `en.json`); add `data-i18n-title`/`-aria-label`/`-placeholder`/`-alt`/`-tooltip` beside each such attribute; wrap user/page data (titles, URLs, hostnames, names) in or mark it with `data-i18n-ignore`.
- Rich text: one `data-i18n` on the parent, numbered tags mapping to its existing child elements in order.
- Renderer JS: `el.textContent = blancI18n.t('key', { … })`; attributes via `setAttribute(name, blancI18n.t(…))`.
- Main: `mainI18n.t('key', { … })` (pass `mainI18n` or a `t` function into the module the way other dependencies are injected; modules that are pure and unit-tested take `t` as a parameter and tests pass an English translator built from `strings.en.js`). For text main sends to a renderer, choose per channel between sending a key plus params or already-translated text, and record the choice in the channel's `browser-api` contract doc; then `npm run browser-api:build`.
- `role:` menu items: add an explicit `label: mainI18n.t('menu.<role>')` wherever Electron accepts one.

- [ ] **Step 4: Translate**

Run `npm run copy:status -- de`, write German for every missing key into `de.json` following `copy/glossary.json` (informal du, pinned terms, fixed terms verbatim), then `npm run copy:ack -- de <exactly the keys you translated>` and `npm run copy:build`.

- [ ] **Step 5: Check**

Run `npm run copy:check` (must pass with this phase's files guarded) and the unit tests for every touched module. Run `npm run lint`. For any boundary file run `npm run audit-inventory:write`.

- [ ] **Step 6: Inspect German and pseudo layouts**

Relaunch dev with `BLANC_TEST=1 BLANC_TEST_LOCALE_STATUS=de=selectable,en-XA=selectable` and `uiLanguage` set to `de`, then `en-XA` (edit the dev profile's `settings.json`). Look at every touched surface for clipping, overlap and truncation; fix with ellipsis + full-text `title`, or wrapping. Never shrink type. Touched CSS uses logical properties. Attach one German screenshot per touched surface to the PR.

- [ ] **Step 7: Add the surface to the sweep**

Add each surface this PR completes to `SURFACES` in `test/desktop/i18n-pseudo-sweep.mjs` with an `open` function, then run `npm run test:i18n:desktop`. Expected: the new surface prints `ok`.

- [ ] **Step 8: Run the surface's existing smokes, then commit**

Run the desktop smokes that cover the touched surface (listed per phase below). Commit with a message naming the surface, e.g. `Localize the chrome strip and permission prompts`.

### Phase 2 — Chrome

Files: `src/renderer/index.html`, `renderer.js`, `vertical-tabs.js`, `workspace-ui.js`, `tab-drag.js`, `permission.html`, `permission.js`, `fill-status.html`, `fill-status.js`, `fill-status-copy.js`, `display-capture-helper.html`, `display-capture-helper.js`.
Specifics:
- `FILL_COPY` moves into `en.json` as `fill.<kind>.title|body|primaryLabel|cancelLabel`; `fill-status-copy.js` becomes a thin adapter returning the same object shape built from `t()` (main's native fallback at `main.js:3893` uses `mainI18n.t`), keeping its "fixed strings only" rule.
- Permission prompts: one message per permission type; re-measure `permissionViewBounds()` (`main.js:2963`) with the longest German prompt and a 60-character host; truncate the host with an ellipsis and full host in `title`, or derive the height from the rendered prompt.
- The display-capture broker processes call `setupChromeProtocol` without `stringsScript`; pass the active locale's `stringsScript` into each broker so its helper matches the app language.
Smokes: `npm run test:browser-shortcuts:desktop`, `npm run test:acceptance:desktop -- --tags "@F1-1 or @F28-1"` only if the owner asks for acceptance.

### Phase 3 — Overlay

Files: `src/renderer/overlay.html`, `overlay.js`.
Specifics: the slash table reads hints from `blancI18n.t(slashKey)`; then delete the overlay branch of `slashDrift` in `copy/lib/cli.mjs` and its source entry in `slash-commands.json` (the catalog is now the only copy). Do the same for `pages/shortcuts.js` and `main.js` `SLASH_COMMANDS` in their phases. `overlay.js:1003` ("recently closed" in `innerHTML`) becomes `textContent`.
Smokes: `npm run test:browser-shortcuts:desktop`.

### Phase 4 — Main process

Files: `src/main/main.js`, `context-menu.js`, `tab-context-menu-model.js`, `address-menu-model.js`, `dock-menu.js`, `workspace-context-menu-model.js`, `browser-shortcuts.js`, `updater.js`, `site-security.js`, `shield-model.js`, `about-panel.js`, `external-protocols.js`, `linux-sandbox-launch.js`, `webauthn.js`, `pages.js` (dialog titles), `browser-data-import.js`, plus any sync/Patron dialog files Task 5 Step 7 added.
Specifics: `formatAccelerator` (`main.js:7627`) takes key words from `key.*`; the "New Tab" fallback title (`main.js:5669`) becomes `tab.untitled`. `linux-sandbox-launch.js` runs before `whenReady`: resolve it with English if `mainI18n.init()` has not run, and note that in its comment.
Smokes: `npm run test:browser-shortcuts:desktop`, `npm run test:modified-links:desktop`.

### Phase 5 — Settings page

Files: `settings.html`, `settings.js`, `settings-sync-setup-model.js`, `settings-verify-model.js`, `settings-nav-model.js`, `settings-language-model.js`.
Specifics: relative times ("N minutes ago") become plural messages; search-engine and app-icon labels stay their brand names (they are owned by S5 and are proper names).
Smokes: `node test/desktop/settings-help-smoke.mjs`, `npm run test:interface-language:desktop`.

### Phase 6 — Start page

Files: `newtab.html`, `newtab.js`, `onboarding.js`, `error.html`, `error.js` (and the wallpaper copy wherever it lives).
Specifics: "N ads blocked this week" lines become plural messages with `#`.
Smokes: `npm run test:wallpaper:desktop`, `npm run test:favorites-picker:desktop`.

### Phase 7 — Utility pages

Files: `bookmarks.html`, `bookmarks.js`, `history.html`, `history.js`, `history-groups.js`, `downloads.html`, `downloads.js`, `shortcuts.html`, `shortcuts.js`, `tab-import.html`, `tab-import-open-tabs.js`, `tab-handoff.html`, `tab-handoff.js`, `sheet.js`.
Specifics: "Today"/"Yesterday" become `history.day.today`/`history.day.yesterday`; `Intl.ListFormat('en', …)` uses `blancI18n.formatLocale()`.
Smokes: `npm run test:favorites-picker:desktop`, `node test/desktop/tab-handoff-smoke.mjs`.

### Phase 8 — Mahjong

Files: `mahjong.html`, `mahjong.js`, `mahjong-state.js`. Tile faces stay glyphs (JetBrains Mono 800, untouched).
Smokes: `node test/desktop/mahjong-standalone-smoke.mjs`.

### Phase 9 — uBO shims

Files: `src/main/ublock-popup-mainworld.js`, `src/main/ublock-dashboard-mainworld.js` (Blanc-authored strings only). These run in uBO's page main world without `blancStrings`: pass the already-translated strings from main through the existing data path those shims use, and never edit `ublock/upstream/`.
Smokes: `node test/desktop/shield-provider.mjs` (uBO targets only; skip where uBO is unavailable and say so).

---

# Phase 10 — Unhide German

### Task 15: The unhide gate

**Files:** `copy/messages/de.json` (`$meta.status`), generated files, `spec/parity-matrix.md`, `glossary.json` (`pendingOwnerDecision` resolved), release notes draft.

- [ ] **Step 1: Owner decisions recorded**

Confirm with the owner: "Island"/"Glance" fixed or translated (move them from `pendingOwnerDecision` into `fixed` or `terms`, then re-translate affected keys), and the du-form (or switch to Sie and re-translate). Do not proceed without both answers.

- [ ] **Step 2: Coverage proof**

Run:
```bash
node -e "const s=require('./copy/i18n-scope.json').files;const p=Object.entries(s).filter(([,v])=>v.state!=='guarded');console.log(p.length?p:'all guarded');process.exit(p.length?1:0)"
npm run copy:status -- de
npm run test:i18n:desktop
```
Expected: `all guarded`; `de (hidden): N/N current` with no missing, stale or invalid; sweep `ok` for every surface and `i18n pseudo sweep OK`.

- [ ] **Step 3: Flip the status and build**

Set `copy/messages/de.json` `$meta.status` to `"selectable"`, run `npm run copy:build && npm run copy:check`. Expected: PASS (a selectable language below 100% would fail here).

- [ ] **Step 4: German screenshots for fit**

In a dev run with `uiLanguage: "de"` (no test overrides needed now), capture: resting pill, ⌘L panel with two groups, shield popover, a camera permission prompt with a long host, Settings (General and Privacy), the start page in all four layouts, a utility sheet (History), the app menu (macOS) and a context menu. Inspect each for truncation, overlap and clipping only. Fix and repeat. Attach all captures to the PR.

- [ ] **Step 5: Spec status and release notes**

`spec/parity-matrix.md` F44 desktop → SHIPPED (it ships with the next release; the release record confirms it). Draft `docs/press/release-notes/<next-tag>.md` lines: "Blanc's interface is available in German (machine-translated). If your system language is German, Blanc now follows it; choose English any time in Settings → General → Language." No marketing or site copy until that release is public (`docs/marketing-claims.md`).

- [ ] **Step 6: Full verification and commit**

Run: `npm run lint && npm run test:unit && npm run substrate:check && npm run test:i18n:desktop && npm run test:interface-language:desktop`
Expected: all PASS.

```bash
git add copy src/renderer/pages/strings.*.js src/main/i18n-locales.json spec docs/press/release-notes
git commit -m "Make German selectable: every interface string is translated and guarded"
```

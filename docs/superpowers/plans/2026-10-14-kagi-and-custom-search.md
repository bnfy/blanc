# Kagi and Custom Search Engines Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Kagi as a built-in search engine, plus a **Custom…** choice that takes the user's own search address with `%s` (SearXNG, Startpage, and others).

**Architecture:** A new pure module, `src/main/search-engine-template.js`, owns the custom-address rules, the URL builder, the display name and the cross-field write rule. `settings.js` gains the `kagi` and `custom` ids, a synced `searchEngineTemplate` key and one resolver, `currentSearchEngine()`, that every search path in `main.js` uses. The Settings page reuses the Encrypted DNS custom-provider pattern: write, read back, show an error when refused.

**Tech Stack:** Electron 44 main process (CommonJS), `node --test`, Cucumber + Playwright-Electron acceptance, the `settings-schema`, `browser-api` and `copy` substrates.

**Spec:** `docs/superpowers/specs/2026-10-14-kagi-and-custom-search-design.md`

## Global Constraints

- Placeholder: lowercase `%s`, exactly once, after the host and port. `%S` and `{searchTerms}` are refused.
- Maximum address length: 2,048 characters after trimming.
- Schemes: `https:` for any host; `http:` only when `isLocalNetworkHost()` from `src/main/site-security.js` is true. No `user:password@`.
- Kagi search: `https://kagi.com/search?q=…`. Kagi suggestions: `https://kagi.com/api/autosuggest?q=…`. Custom engines get no suggestion provider.
- Engine order everywhere: `duckduckgo`, `google`, `bing`, `brave`, `kagi`, `custom`.
- `searchEngineTemplate` default `""`, synced (in `SYNCED_KEYS`); `searchSuggestions` stays device-local.
- Read rule: an unknown id, or `custom` without a valid address, reads as `duckduckgo`.
- A PR that changes English updates `de`, `es`, `fr`, `pt-BR` and `it` in the same PR, then `npm run copy:ack -- <locale> <keys>`; never hand-edit `strings.*.js` or `*/generated/*`.
- After editing `src/main/main.js` or `src/main/test-hook.js`, run `npm run audit-inventory:write` and commit `security/audit-surface-inventory.json`.
- Do not touch `ios/` (its `BlancSettings.swift` is a separate snapshot), the website (`site/`), claims ledgers, or the Reddit thread. Those wait for a public release.
- In this worktree, run each `git` command on its own (no `&&` chains, heredocs or loops around git).

## Review Focus

1. **An engine id naming an Object property** (`constructor`, `toString`, `__proto__`) from a settings write or a sync blob must be refused, not stored. Today `SEARCH_ENGINES[id]` is truthy for those, and search then crashes. Pinned in Task 2.
2. **Query text with `$&`, `$1`, `%s`, `&`, `#`, `/` or non-ASCII** must be encoded literally into the custom address. `String.replace` would otherwise expand `$&`. Pinned in Task 1.
3. **An address pasted with spaces or a trailing newline** must be accepted and stored trimmed, so the Settings read-back doesn't flag a false error. Pinned in Tasks 1 and 2.
4. **An OpenSearch-style `{searchTerms}` or `%S` address** (what a SearXNG `opensearch.xml` shows) must be refused with the visible error, never saved as a literal search. Pinned in Task 1.
5. **Sync from a mixed set of devices.** A payload without `searchEngineTemplate` (an older Blanc) keeps the local address. A payload delivering `custom` with an address this device refuses reads as DuckDuckGo. Pinned in Task 2.

---

### Task 1: Custom address rules module

**Files:**
- Create: `src/main/search-engine-template.js`
- Test: `test/unit/search-engine-template.test.js`

**Interfaces:**
- Consumes: `isLocalNetworkHost(hostname: string): boolean` from `src/main/site-security.js` (already exported).
- Produces:
  - `MAX_TEMPLATE_LENGTH: number` (2048)
  - `isValidSearchTemplate(value: unknown): boolean`
  - `searchUrlFromTemplate(template: string, query: string): string | null`
  - `searchTemplateLabel(template: string): string` (`''` when invalid)
  - `reconcileSearchEngineWrite(prev: {searchEngine, searchEngineTemplate}, incoming: object): object`. It returns only the keys to write, or `{}` when the change is refused or touches neither key.

- [ ] **Step 1: Prepare the worktree**

Run: `npm ci`
Expected: installs cleanly (a fresh worktree's `node_modules` may predate the lockfile).

- [ ] **Step 2: Write the failing test**

Create `test/unit/search-engine-template.test.js`:

```js
const assert = require('node:assert/strict');
const test = require('node:test');

const {
  MAX_TEMPLATE_LENGTH,
  isValidSearchTemplate,
  searchUrlFromTemplate,
  searchTemplateLabel,
  reconcileSearchEngineWrite,
} = require('../../src/main/search-engine-template');

const SEARX = 'https://searx.example.org/search?q=%s';

test('accepts https addresses and http addresses on this computer or the home network', () => {
  const base = 'https://example.com/?q=%s';
  const longest = base.replace('?q=', `${'a'.repeat(MAX_TEMPLATE_LENGTH - base.length)}?q=`);
  assert.equal(longest.length, MAX_TEMPLATE_LENGTH);
  for (const template of [
    SEARX,
    'https://kagi.com/search?token=abc123&q=%s',
    'https://www.startpage.com/sp/search?query=%s',
    `  ${SEARX} \n`,
    'https://example.com/%s',
    'https://example.com/#q=%s',
    'https://example.com/search?q=%s&lang=en%20US',
    'http://localhost:8888/search?q=%s',
    'http://127.0.0.1:8080/search?q=%s',
    'http://[::1]:8888/search?q=%s',
    'http://192.168.1.5/search?q=%s',
    'http://10.0.0.2/search?q=%s',
    'http://100.101.102.103/search?q=%s',
    'http://searx/search?q=%s',
    'http://searx.local/search?q=%s',
    'http://searx.home.arpa/search?q=%s',
    longest,
  ]) {
    assert.equal(isValidSearchTemplate(template), true, template);
  }
});

test('refuses addresses that are malformed, ambiguous, or would leak the query', () => {
  for (const template of [
    '', '   ', null, undefined, 42, {},
    'https://example.com/search?q=',
    'https://example.com/search?q=%s&r=%s',
    'https://example.com/search?q=%S',
    'https://example.com/search?q={searchTerms}',
    'https://%s.example.com/',
    'https://ex%sample.com/',
    'https://example.com:%s/',
    'http://searx.example.org/search?q=%s',
    'http://8.8.8.8/search?q=%s',
    'http://[2606:4700::1111]/search?q=%s',
    'https://user:pass@example.com/search?q=%s',
    'https://%s@example.com/',
    'javascript:alert(1)//%s',
    'data:text/html,%s',
    'file:///tmp/%s',
    'blanc://newtab/?q=%s',
    'ftp://example.com/%s',
    'searx.example.org/search?q=%s',
    `https://example.com/?q=%s${'a'.repeat(MAX_TEMPLATE_LENGTH)}`,
  ]) {
    assert.equal(isValidSearchTemplate(template), false, String(template));
  }
});

test('builds the search address with the query encoded literally', () => {
  assert.equal(
    searchUrlFromTemplate(SEARX, 'how tall is everest'),
    'https://searx.example.org/search?q=how%20tall%20is%20everest',
  );
  assert.equal(
    searchUrlFromTemplate(SEARX, 'a&b=c#d?e/f'),
    'https://searx.example.org/search?q=a%26b%3Dc%23d%3Fe%2Ff',
  );
  // String.replace would expand $& and $1; a literal %s must not be re-filled.
  assert.equal(
    searchUrlFromTemplate(SEARX, '$& $1 %s'),
    'https://searx.example.org/search?q=%24%26%20%241%20%25s',
  );
  assert.equal(searchUrlFromTemplate(SEARX, 'café'), 'https://searx.example.org/search?q=caf%C3%A9');
  assert.equal(searchUrlFromTemplate(`  ${SEARX}  `, 'q'), 'https://searx.example.org/search?q=q');
  assert.equal(searchUrlFromTemplate('http://searx.example.org/?q=%s', 'q'), null);
});

test('names the engine by its server', () => {
  assert.equal(searchTemplateLabel('https://www.searx.example.org/search?q=%s'), 'searx.example.org');
  assert.equal(searchTemplateLabel('http://localhost:8888/search?q=%s'), 'localhost:8888');
  assert.equal(searchTemplateLabel('https://Example.COM:443/s?q=%s'), 'example.com');
  assert.equal(searchTemplateLabel('http://[::1]:8888/?q=%s'), '[::1]:8888');
  assert.equal(searchTemplateLabel('not an address'), '');
});

test('Custom can be selected only with a valid address, and refusals write nothing', () => {
  const fresh = { searchEngine: 'duckduckgo', searchEngineTemplate: '' };
  const custom = { searchEngine: 'custom', searchEngineTemplate: SEARX };
  const other = 'https://search.example.net/?q=%s';

  assert.deepEqual(reconcileSearchEngineWrite(fresh, {}), {});
  assert.deepEqual(reconcileSearchEngineWrite(fresh, { searchEngine: 'google' }), { searchEngine: 'google' });
  assert.deepEqual(reconcileSearchEngineWrite(fresh, { searchEngine: 'custom' }), {});
  assert.deepEqual(
    reconcileSearchEngineWrite(fresh, { searchEngine: 'custom', searchEngineTemplate: SEARX }),
    { searchEngine: 'custom', searchEngineTemplate: SEARX },
  );
  assert.deepEqual(reconcileSearchEngineWrite(custom, { searchEngineTemplate: other }), { searchEngineTemplate: other });
  assert.deepEqual(reconcileSearchEngineWrite(custom, { searchEngineTemplate: '' }), {});
  assert.deepEqual(
    reconcileSearchEngineWrite({ searchEngine: 'google', searchEngineTemplate: SEARX }, { searchEngineTemplate: '' }),
    { searchEngineTemplate: '' },
  );
  // Switching away keeps the stored address: it is not part of the write.
  assert.deepEqual(reconcileSearchEngineWrite(custom, { searchEngine: 'kagi' }), { searchEngine: 'kagi' });
  // An old profile has no stored address at all.
  assert.deepEqual(reconcileSearchEngineWrite({ searchEngine: 'bing' }, { searchEngine: 'custom' }), {});
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `node --test test/unit/search-engine-template.test.js`
Expected: FAIL with `Cannot find module '../../src/main/search-engine-template'`.

- [ ] **Step 4: Write the module**

Create `src/main/search-engine-template.js`:

```js
// Custom search engine addresses (Settings → General → Search engine →
// Custom…). Pure: no require('electron'), so the rules are unit-tested
// directly. Spec: docs/superpowers/specs/2026-10-14-kagi-and-custom-search-design.md
//
// A template is the user's search address with %s where the query goes, the
// convention Chrome, Firefox, Vivaldi and Kagi's and SearXNG's setup guides
// use, so users can paste what those guides give them.
const { isLocalNetworkHost } = require('./site-security');

const MAX_TEMPLATE_LENGTH = 2048;
const PLACEHOLDER = '%s';
// Stands in for the query while a template is parsed. Lowercase ASCII, so it
// survives host normalization unchanged and can be found again.
const PROBE = 'blancsearchprobe';

function parseTemplate(value) {
  if (typeof value !== 'string') return null;
  const template = value.trim();
  if (!template || template.length > MAX_TEMPLATE_LENGTH) return null;
  // Exactly one lowercase %s. %S and OpenSearch's {searchTerms} are refused
  // rather than silently searching for literal text.
  if (template.split(PLACEHOLDER).length !== 2) return null;
  let url;
  try {
    url = new URL(template.replace(PLACEHOLDER, PROBE));
  } catch {
    return null;
  }
  if (url.username || url.password) return null;
  // The query must land after the host and port, so typed words can never
  // become part of a server name and leak through a DNS lookup.
  if (url.host.includes(PROBE)) return null;
  if (url.protocol === 'https:') return { template, url };
  // Plain http:// only to this computer or the home network: searches to a
  // server on the internet must not travel unencrypted.
  if (url.protocol === 'http:' && isLocalNetworkHost(url.hostname)) return { template, url };
  return null;
}

function isValidSearchTemplate(value) {
  return parseTemplate(value) !== null;
}

function searchUrlFromTemplate(template, query) {
  const parsed = parseTemplate(template);
  if (!parsed) return null;
  const encoded = encodeURIComponent(String(query));
  // A function replacement: a string one would expand $& and $1 in the query.
  return parsed.template.replace(PLACEHOLDER, () => encoded);
}

// The server's name, shown as the ⌘L search row's tag. URL.host already
// lowercases and drops a default port.
function searchTemplateLabel(template) {
  const parsed = parseTemplate(template);
  return parsed ? parsed.url.host.replace(/^www\./, '') : '';
}

// Cross-field write rule, the search counterpart of reconcileSecureDnsWrite.
// Given the stored { searchEngine, searchEngineTemplate } and an already
// sanitized partial, return only the keys to write. A change that would leave
// Custom selected without a valid address is refused whole ({}), keeping the
// previous engine and address. Keys the partial didn't touch are never
// returned, so they are not re-stamped for Profile Sync.
function reconcileSearchEngineWrite(prev, incoming) {
  const touchesEngine = 'searchEngine' in incoming;
  const touchesTemplate = 'searchEngineTemplate' in incoming;
  if (!touchesEngine && !touchesTemplate) return {};
  const engine = touchesEngine ? incoming.searchEngine : prev.searchEngine;
  const template = touchesTemplate ? incoming.searchEngineTemplate : prev.searchEngineTemplate;
  if (engine === 'custom' && !isValidSearchTemplate(template)) return {};
  const out = {};
  if (touchesEngine) out.searchEngine = engine;
  if (touchesTemplate) out.searchEngineTemplate = template;
  return out;
}

module.exports = {
  MAX_TEMPLATE_LENGTH,
  isValidSearchTemplate,
  searchUrlFromTemplate,
  searchTemplateLabel,
  reconcileSearchEngineWrite,
};
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --test test/unit/search-engine-template.test.js`
Expected: PASS, 5 tests.

- [ ] **Step 6: Lint**

Run: `npm run lint`
Expected: no errors, no warnings.

- [ ] **Step 7: Commit**

```bash
git add src/main/search-engine-template.js test/unit/search-engine-template.test.js
```
```bash
git commit -m "Add rules for custom search engine addresses

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Settings model, schema, contract and Kagi suggestions

**Files:**
- Modify: `src/main/settings.js` (requires; `SEARCH_ENGINES` at :16-21; `SYNCED_KEYS` at :57; `DEFAULTS` at :94; `getSettings()` before `return data;` at ~:354; `sanitize()` at :368-370; `setSettings()` at ~:433; `searchUrlFor()` at :628-632; `module.exports`)
- Modify: `src/main/search-suggestions.js` (`PROVIDERS`, `requestUrlFor`)
- Modify: `settings-schema/schema.json`, `settings-schema/build.mjs`
- Modify: `browser-api/contract.json` (`SearchEngineId` at :968-971)
- Regenerate: `settings-schema/generated/BlancSettings.swift`, `settings-schema/generated/BlancSettings.kt`, `browser-api/generated/vectors.json`
- Test: `test/unit/search-engine-settings.test.js` (create), `test/unit/search-suggestions.test.js` (modify)

**Interfaces:**
- Consumes: everything Task 1 produces.
- Produces:
  - `settings.currentSearchEngine(): { id: string, label: string, url(query: string): string }`. It applies the read rule; for `custom`, `label` is the server name.
  - `settings.searchUrlFor(query)` (unchanged signature, now via the resolver)
  - `settings.SEARCH_ENGINES` gains `kagi: { label: 'Kagi', url }` and `custom: { label: 'Custom' }` (no `url`; never call `SEARCH_ENGINES.custom.url`)
  - setting `searchEngineTemplate: string`
  - `PROVIDERS.kagi`; `requestUrlFor('custom', …) === null`

- [ ] **Step 1: Write the failing settings test**

Create `test/unit/search-engine-settings.test.js`:

```js
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('fs');
const os = require('os');
const path = require('path');

const electronId = require.resolve('electron');
const originalElectron = require.cache[electronId];
let activeUserData = null;
require.cache[electronId] = {
  id: electronId,
  filename: electronId,
  loaded: true,
  exports: { app: { getPath: () => activeUserData, on: () => {} } },
};

const loaded = [];
function loadSettings(userData) {
  activeUserData = userData;
  delete require.cache[require.resolve('../../src/main/settings')];
  delete require.cache[require.resolve('../../src/main/store')];
  const settings = require('../../src/main/settings');
  loaded.push({ userData, settings });
  return settings;
}

function freshProfile(t, name, stored) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `blanc-search-${name}-`));
  t.after(() => {
    for (const { userData, settings } of loaded) if (userData === dir) settings.flushSettings();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  if (stored) fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({ onboardingVersion: 1, ...stored }));
  return loadSettings(dir);
}

test.after(() => {
  delete require.cache[require.resolve('../../src/main/settings')];
  delete require.cache[require.resolve('../../src/main/store')];
  if (originalElectron) require.cache[electronId] = originalElectron;
  else delete require.cache[electronId];
});

const SEARX = 'https://searx.example.org/search?q=%s';
const settingsSchema = require('../../settings-schema/schema.json');

test('Kagi and Custom join the engine list in order, matching the schema', (t) => {
  const settings = freshProfile(t, 'list');
  const ids = ['duckduckgo', 'google', 'bing', 'brave', 'kagi', 'custom'];
  assert.deepEqual(Object.keys(settings.SEARCH_ENGINES), ids);
  assert.deepEqual(settingsSchema.searchEngines.map(({ id }) => id), ids);
  assert.equal(settingsSchema.defaults.searchEngineTemplate, '');
  assert.equal(settings.getSettings().searchEngineTemplate, '');

  settings.setSettings({ searchEngine: 'kagi' });
  assert.deepEqual(
    { id: settings.currentSearchEngine().id, label: settings.currentSearchEngine().label },
    { id: 'kagi', label: 'Kagi' },
  );
  assert.equal(settings.searchUrlFor('rust lifetimes'), 'https://kagi.com/search?q=rust%20lifetimes');
});

test('engine ids that name Object properties are refused', (t) => {
  const settings = freshProfile(t, 'proto');
  for (const id of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
    assert.equal(settings.setSettings({ searchEngine: id }).searchEngine, 'duckduckgo', id);
  }
  assert.match(settings.searchUrlFor('q'), /^https:\/\/duckduckgo\.com\//);
});

test('Custom needs a valid address and searches with it', (t) => {
  const settings = freshProfile(t, 'custom');
  assert.equal(settings.setSettings({ searchEngine: 'custom' }).searchEngine, 'duckduckgo');
  assert.equal(
    settings.setSettings({ searchEngine: 'custom', searchEngineTemplate: 'http://searx.example.org/?q=%s' }).searchEngine,
    'duckduckgo',
  );

  const saved = settings.setSettings({ searchEngine: 'custom', searchEngineTemplate: `  ${SEARX}\n` });
  assert.equal(saved.searchEngine, 'custom');
  assert.equal(saved.searchEngineTemplate, SEARX, 'stored trimmed so the Settings read-back matches');
  assert.equal(settings.searchUrlFor('how tall is everest'), 'https://searx.example.org/search?q=how%20tall%20is%20everest');
  assert.equal(settings.currentSearchEngine().label, 'searx.example.org');
});

test('a bad edit keeps the previous address, and switching away keeps it for later', (t) => {
  const settings = freshProfile(t, 'edit');
  settings.setSettings({ searchEngine: 'custom', searchEngineTemplate: SEARX });

  assert.equal(settings.setSettings({ searchEngine: 'custom', searchEngineTemplate: 'https://%s.example/' }).searchEngineTemplate, SEARX);
  assert.equal(settings.setSettings({ searchEngine: 'custom', searchEngineTemplate: '' }).searchEngineTemplate, SEARX);
  assert.equal(settings.getSettings().searchEngine, 'custom');

  const google = settings.setSettings({ searchEngine: 'google' });
  assert.equal(google.searchEngine, 'google');
  assert.equal(google.searchEngineTemplate, SEARX);
  assert.equal(settings.setSettings({ searchEngine: 'custom' }).searchEngine, 'custom');
});

test('a stored Custom without a valid address, or an unknown id, reads as DuckDuckGo', (t) => {
  const handEdited = freshProfile(t, 'read-custom', {
    searchEngine: 'custom',
    searchEngineTemplate: 'http://searx.example.org/?q=%s',
  });
  assert.equal(handEdited.getSettings().searchEngine, 'duckduckgo');
  assert.equal(handEdited.currentSearchEngine().id, 'duckduckgo');

  const unknown = freshProfile(t, 'read-unknown', { searchEngine: 'altavista' });
  assert.equal(unknown.getSettings().searchEngine, 'duckduckgo');
  assert.match(unknown.searchUrlFor('q'), /^https:\/\/duckduckgo\.com\//);
});

test('the address syncs with the engine choice', (t) => {
  const deviceA = freshProfile(t, 'sync-a');
  deviceA.setSettings({ searchEngine: 'custom', searchEngineTemplate: SEARX });
  const payload = deviceA.exportForSync();
  assert.equal(payload.values.searchEngineTemplate, SEARX);
  assert.ok(payload.meta.searchEngineTemplate > 0);
  assert.ok(payload.meta.searchEngine > 0);

  const deviceB = freshProfile(t, 'sync-b');
  deviceB.mergeFromSync(payload);
  assert.equal(deviceB.getSettings().searchEngine, 'custom');
  assert.equal(deviceB.searchUrlFor('q'), 'https://searx.example.org/search?q=q');
});

test('changing only the engine does not re-stamp the synced address', (t) => {
  const settings = freshProfile(t, 'stamp');
  settings.setSettings({ searchEngine: 'custom', searchEngineTemplate: SEARX });
  const before = settings.exportForSync().meta.searchEngineTemplate;
  settings.setSettings({ searchEngine: 'brave' });
  assert.equal(settings.exportForSync().meta.searchEngineTemplate, before);
});

test('mixed-version sync never breaks search', (t) => {
  const settings = freshProfile(t, 'mixed');
  settings.setSettings({ searchEngine: 'custom', searchEngineTemplate: SEARX });
  const later = Date.now() + 60_000;

  // An older Blanc uploads without the address key: the local address survives.
  settings.mergeFromSync({ values: { searchEngine: 'custom' }, meta: { searchEngine: later } });
  assert.equal(settings.getSettings().searchEngineTemplate, SEARX);
  assert.equal(settings.getSettings().searchEngine, 'custom');

  // Custom arrives with an address this device refuses: reads as DuckDuckGo.
  const other = freshProfile(t, 'mixed-refused');
  other.mergeFromSync({
    values: { searchEngine: 'custom', searchEngineTemplate: 'http://searx.example.org/?q=%s' },
    meta: { searchEngine: later, searchEngineTemplate: later },
  });
  assert.equal(other.getSettings().searchEngine, 'duckduckgo');
  assert.match(other.searchUrlFor('q'), /^https:\/\/duckduckgo\.com\//);
});
```

- [ ] **Step 2: Update the suggestions test**

In `test/unit/search-suggestions.test.js`, replace the first test (`'every configured search engine has a fixed HTTPS suggestion provider'`) header and its `assert.deepEqual(Object.keys(PROVIDERS), …)` line and `cases` object with:

```js
test('every built-in search engine has a fixed HTTPS suggestion provider', () => {
  // A custom engine is the user's own server: it gets no provider, so nothing
  // typed is sent anywhere before Enter.
  assert.deepEqual(
    Object.keys(PROVIDERS),
    settingsSchema.searchEngines.map(({ id }) => id).filter((id) => id !== 'custom'),
  );

  const query = 'blanc browser & tabs';
  const cases = {
    duckduckgo: ['duckduckgo.com', '/ac/', 'q'],
    google: ['www.google.com', '/complete/search', 'q'],
    bing: ['api.bing.com', '/osjson.aspx', 'query'],
    brave: ['search.brave.com', '/api/suggest', 'q'],
    kagi: ['kagi.com', '/api/autosuggest', 'q'],
  };
```

(The rest of that test body stays as it is.) In the next test, `'unknown engines and invalid query values cannot choose a request URL'`, add these lines after `assert.equal(requestUrlFor('made-up', 'hello'), null);`:

```js
  assert.equal(requestUrlFor('custom', 'hello'), null);
  assert.equal(requestUrlFor('constructor', 'hello'), null);
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `node --test test/unit/search-engine-settings.test.js test/unit/search-suggestions.test.js`
Expected: FAIL. The engine list lacks `kagi`/`custom`, `currentSearchEngine` is not a function, and `requestUrlFor('constructor', …)` is not null.

- [ ] **Step 4: Change `src/main/settings.js`**

4a. After the `const { DEFAULT_MAPPING, mappingOrDefault, validMapping } = require('./mouse-gestures');` line add:

```js
const {
  isValidSearchTemplate,
  searchUrlFromTemplate,
  searchTemplateLabel,
  reconcileSearchEngineWrite,
} = require('./search-engine-template');
```

4b. Replace the `SEARCH_ENGINES` object with:

```js
const SEARCH_ENGINES = {
  duckduckgo: { label: 'DuckDuckGo', url: (q) => `https://duckduckgo.com/?q=${encodeURIComponent(q)}` },
  google: { label: 'Google', url: (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}` },
  bing: { label: 'Bing', url: (q) => `https://www.bing.com/search?q=${encodeURIComponent(q)}` },
  brave: { label: 'Brave Search', url: (q) => `https://search.brave.com/search?q=${encodeURIComponent(q)}` },
  kagi: { label: 'Kagi', url: (q) => `https://kagi.com/search?q=${encodeURIComponent(q)}` },
  // The user's own address (searchEngineTemplate). No url here: every search
  // goes through currentSearchEngine(), which builds it from the template.
  custom: { label: 'Custom' },
};
// Own keys only: SEARCH_ENGINES.constructor is truthy, but not an engine.
const isSearchEngineId = (id) => typeof id === 'string' && Object.hasOwn(SEARCH_ENGINES, id);
```

4c. Replace the `SYNCED_KEYS` line with:

```js
const SYNCED_KEYS = ['searchEngine', 'searchEngineTemplate', 'adblockEnabled', 'homePage', 'theme', 'adblockExceptions', 'newtabLayout', 'newtabDynamicWallpaper'];
```

4d. In `DEFAULTS`, directly after `searchEngine: 'duckduckgo',` add:

```js
  // The Custom engine's address, with %s where the query goes. Synced with
  // searchEngine; search-engine-template.js validates it on write and read.
  searchEngineTemplate: '',
```

4e. In `getSettings()`, directly before the final `return data;` add:

```js
  // Read rule, like secureDns: an unknown id, or Custom without a valid
  // address (a hand-edited file, or a sync that delivered the engine before
  // an address this device accepts), reads as the default. A search never
  // goes to a broken address.
  if (typeof data.searchEngineTemplate !== 'string') data.searchEngineTemplate = DEFAULTS.searchEngineTemplate;
  if (!isSearchEngineId(data.searchEngine) ||
      (data.searchEngine === 'custom' && !isValidSearchTemplate(data.searchEngineTemplate))) {
    data.searchEngine = DEFAULTS.searchEngine;
  }
```

4f. In `sanitize()`, replace

```js
  if (typeof partial.searchEngine === 'string' && SEARCH_ENGINES[partial.searchEngine]) {
    clean.searchEngine = partial.searchEngine;
  }
```

with

```js
  if (isSearchEngineId(partial.searchEngine)) clean.searchEngine = partial.searchEngine;
  if (typeof partial.searchEngineTemplate === 'string') {
    // Like secureDnsTemplate: empty or valid, else DROPPED so a bad value can
    // never overwrite a good stored address. setSettings then decides whether
    // Custom may be selected.
    const t = partial.searchEngineTemplate.trim();
    if (t === '' || isValidSearchTemplate(t)) clean.searchEngineTemplate = t;
  }
```

4g. In `setSettings()`, directly after the closing `}` of the `if ('secureDns' in clean || 'secureDnsTemplate' in clean) { … }` block add:

```js
  // Custom needs a valid address. A change that would leave Custom selected
  // without one is refused, keeping the previous engine and address; keys
  // the write didn't touch are never re-stamped for sync.
  if ('searchEngine' in clean || 'searchEngineTemplate' in clean) {
    const search = reconcileSearchEngineWrite(
      { searchEngine: s.data.searchEngine, searchEngineTemplate: s.data.searchEngineTemplate },
      clean,
    );
    delete clean.searchEngine;
    delete clean.searchEngineTemplate;
    Object.assign(clean, search);
  }
```

4h. Replace `searchUrlFor()` with:

```js
/** The engine searches use now, after the read rule: { id, label, url(query) }.
 * The address bar, the ⌘L search row, Search for "…" and suggestions all go
 * through this, so a new engine type can't be missed in one of them. */
function currentSearchEngine() {
  const { searchEngine, searchEngineTemplate } = getSettings();
  if (searchEngine === 'custom') {
    return {
      id: 'custom',
      label: searchTemplateLabel(searchEngineTemplate),
      url: (query) => searchUrlFromTemplate(searchEngineTemplate, query),
    };
  }
  const { label, url } = SEARCH_ENGINES[searchEngine];
  return { id: searchEngine, label, url };
}

function searchUrlFor(query) {
  return currentSearchEngine().url(query);
}
```

4i. In `module.exports`, add `currentSearchEngine,` on the line before `searchUrlFor,`.

- [ ] **Step 5: Add the Kagi suggestion provider**

In `src/main/search-suggestions.js`, add this entry to `PROVIDERS` after `brave`:

```js
  kagi(query) {
    // Kagi's documented suggestion address. It answers without signing in,
    // and these requests never carry cookies (credentials: 'omit' below).
    const url = new URL('https://kagi.com/api/autosuggest');
    url.searchParams.set('q', query);
    return url.toString();
  },
```

Add this comment line directly above `const PROVIDERS = {`:

```js
// Custom engines have no provider: nothing typed is sent before Enter.
```

In `requestUrlFor`, replace `const build = PROVIDERS[engine];` with:

```js
  const build = typeof engine === 'string' && Object.hasOwn(PROVIDERS, engine) ? PROVIDERS[engine] : null;
```

- [ ] **Step 6: Update the settings schema and its checker**

6a. In `settings-schema/schema.json`, replace the `searchEngines` array with:

```json
  "searchEngines": [
    { "id": "duckduckgo", "label": "DuckDuckGo" },
    { "id": "google", "label": "Google" },
    { "id": "bing", "label": "Bing" },
    { "id": "brave", "label": "Brave Search" },
    { "id": "kagi", "label": "Kagi" },
    { "id": "custom", "label": "Custom" }
  ],
```

In `defaults`, after `"searchEngine": "duckduckgo",` add `"searchEngineTemplate": "",`. In `settings`, replace the `searchEngine` entry with these two entries:

```json
    { "key": "searchEngine", "type": "enum", "enum": "searchEngines", "default": "duckduckgo", "note": "'custom' uses searchEngineTemplate; custom without a valid template, or an unknown id, reads as duckduckgo" },
    { "key": "searchEngineTemplate", "type": "string", "default": "", "note": "custom search address with exactly one lowercase %s after the host and port; https://, or http:// to a local-network host; at most 2048 characters; synced with searchEngine; stored trimmed, not URL-normalized" },
```

6b. In `settings-schema/build.mjs`:
- In `genSwift()`, after the `searchEngine` defaults line, add:
  ```js
  out += `    public static let searchEngineTemplate: String = ${JSON.stringify(spec.defaults.searchEngineTemplate)}\n`;
  ```
- In `genKotlin()`, after the `searchEngine` defaults line, add:
  ```js
  out += `    const val searchEngineTemplate = ${JSON.stringify(spec.defaults.searchEngineTemplate)}\n`;
  ```
- In `parseSettingsJs()` `defaults`, after the `searchEngine:` entry, add:
  ```js
    searchEngineTemplate: s(/^\s*searchEngineTemplate:\s*'([^']*)'/m),
  ```
- In `check()`, after `eq('searchEngine', …);`, add:
  ```js
  eq('searchEngineTemplate', jd.searchEngineTemplate, d.searchEngineTemplate);
  ```

Run: `npm run settings:build`, then `npm run settings:check`
Expected: `wrote settings-schema/generated/BlancSettings.swift` and `.kt`, then `settings:check OK`.

- [ ] **Step 7: Update the bridge contract**

In `browser-api/contract.json`, change `SearchEngineId.ts` to:

```json
      "ts": "'duckduckgo' | 'google' | 'bing' | 'brave' | 'kagi' | 'custom'",
```

In the `SearchSuggestions` type, change the `label` field's `doc` to `"The engine's display name; for a custom engine, its server's name."`

Run: `npm run browser-api:build`, then `npm run browser-api:check`
Expected: the build regenerates `browser-api/generated/vectors.json`; the check passes.

- [ ] **Step 8: Run the tests to verify they pass**

Run: `node --test test/unit/search-engine-settings.test.js test/unit/search-suggestions.test.js test/unit/search-engine-template.test.js test/unit/browser-api-contract.test.js test/unit/tab-sleep-settings.test.js test/unit/newtab-layout-settings.test.js test/unit/dark-websites.test.js test/unit/patron-callout.test.js`
Expected: PASS.

- [ ] **Step 9: Lint**

Run: `npm run lint`
Expected: clean.

- [ ] **Step 10: Commit**

```bash
git add src/main/settings.js src/main/search-suggestions.js settings-schema browser-api test/unit/search-engine-settings.test.js test/unit/search-suggestions.test.js
```
```bash
git commit -m "Add Kagi and a synced custom search address to settings

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Route every search through the resolver, with acceptance coverage

**Files:**
- Modify: `src/main/main.js` (`tabs:search` handler at ~:7533-7554; `chrome:search-suggestions` handler at ~:7863-7935)
- Modify: `src/main/test-hook.js` (after `searchEngine()` at :788; the reset `settings.setSettings({…})` at ~:3131)
- Modify: `spec/acceptance/navigation-and-context-menu.feature`, `test/desktop/steps/extended.steps.js`, `test/desktop/cucumber.mjs` (`RUNNABLE` line 31), `spec/acceptance/index.md`
- Modify: `spec/features.md` (F5 at :121-122, settings table at :285), `spec/parity-matrix.md` (F5 row)
- Regenerate: `security/audit-surface-inventory.json`
- No change: `src/main/pages.js` builds the Settings engine list from `SEARCH_ENGINES`, so `kagi` and `custom` reach the page already. `src/main/context-menu.js` calls `settings.searchUrlFor`, covered by Task 2.

**Interfaces:**
- Consumes: `settings.currentSearchEngine()` and `settings.searchUrlFor()` from Task 2.
- Produces: test hook `setCustomSearchEngine(template: string): string`, which returns the selected engine id after the write. Steps: `Given the custom search address is {string}`, `When I set the custom search address to {string}`, `Then the selected search engine is {string}`.

- [ ] **Step 1: Write the failing acceptance scenarios**

In `spec/acceptance/navigation-and-context-menu.feature`, add `      | kagi       |` as a new last row of the `@F5-2` Examples table. After the `@F5-8` scenario add:

```gherkin
  @F5-9 @F5 @all
  Scenario: A custom search address is used for searches
    Given the custom search address is "https://searx.example.org/search?q=%s"
    When I enter "how tall is everest" in the command bar
    Then the active tab navigates to "https://searx.example.org/search?q=how%20tall%20is%20everest"

  @F5-10 @F5 @all
  Scenario: A custom address can't send searches over the internet unencrypted
    Given the search engine is "google"
    When I set the custom search address to "http://searx.example.org/search?q=%s"
    Then the selected search engine is "google"
    When I set the custom search address to "http://localhost:8888/search?q=%s"
    Then the selected search engine is "custom"

  @F5-11 @F5 @all
  Scenario: A custom search engine gets no live suggestions and searches its own address
    Given the autocomplete provider returns "should never appear"
    And the custom search address is "https://searx.example.org/search?q=%s"
    When I type "custom engine probe" in the autocomplete palette
    Then the autocomplete provider has not received a request
    When I submit the command-bar text
    Then the search submission goes to "https://searx.example.org/search?q=custom%20engine%20probe"
```

In `test/desktop/steps/extended.steps.js`, add `kagi: 'https://kagi.com/search?q=',` as the last entry of `SEARCH_PREFIX`, and add after the `Given('the search engine is {string}', …)` step:

```js
Given('the custom search address is {string}', async function (template) {
  assert.strictEqual(await this.call('setCustomSearchEngine', template), 'custom');
});

When('I set the custom search address to {string}', async function (template) {
  await this.call('setCustomSearchEngine', template);
});

Then('the selected search engine is {string}', async function (engine) {
  assert.strictEqual(await this.call('searchEngine'), engine);
});

Then('the search submission goes to {string}', async function (url) {
  await waitForValue(
    () => this.call('capturedSearchSubmission'),
    (value) => value?.url === url,
    `search submission to ${url}`
  );
});
```

In `test/desktop/cucumber.mjs`, change line 31 to:

```js
  '@F5-1', '@F5-2', '@F5-3', '@F5-4', '@F5-5', '@F5-6', '@F5-9', '@F5-10', '@F5-11',
```

In `src/main/test-hook.js`, after `searchEngine() { return settings.getSettings().searchEngine; },` add:

```js
    setCustomSearchEngine(template) {
      return settings.setSettings({ searchEngine: 'custom', searchEngineTemplate: template }).searchEngine;
    },
```

and in the reset's `settings.setSettings({ … })`, after `searchEngine: 'duckduckgo',` add `searchEngineTemplate: '',`.

- [ ] **Step 2: Run the dry run, then the scenarios, to see the failure**

Run: `npm run test:acceptance:dry`
Expected: PASS (every step resolves).

Run: `npx cucumber-js -c test/desktop/cucumber.mjs -p runnable --tags "@F5"` (launches Electron windows on screen)
Expected: `@F5-11` FAILS at its last step. `tabs:search` still calls `SEARCH_ENGINES.custom.url`, which doesn't exist, so the handler throws and no submission is recorded. `@F5-2`, `@F5-9` and `@F5-10` already pass, because the address bar goes through `searchUrlFor`.

- [ ] **Step 3: Route `main.js` through the resolver**

In the `tabs:search` handler, replace

```js
    const currentEngine = settings.getSettings().searchEngine;
    const engine = settings.SEARCH_ENGINES[currentEngine]
      ?? settings.SEARCH_ENGINES.duckduckgo;
    const target = engine.url(query.trim());
```

with

```js
    const engine = settings.currentSearchEngine();
    const target = engine.url(query.trim());
```

and in the same handler replace `engine: settings.SEARCH_ENGINES[currentEngine] ? currentEngine : 'duckduckgo',` with `engine: engine.id,`.

In the `chrome:search-suggestions` handler, replace

```js
    const configuredEngine = currentSettings.searchEngine;
    const engineId = settings.SEARCH_ENGINES[configuredEngine] ? configuredEngine : 'duckduckgo';
    const engine = settings.SEARCH_ENGINES[engineId];
    const response = { engine: engineId, label: engine.label, suggestions: [] };
```

with

```js
    const engine = settings.currentSearchEngine();
    const response = { engine: engine.id, label: engine.label, suggestions: [] };
```

Replace both remaining `engine: engineId,` lines (the `searchSuggestionService.get` argument and the `testSearchSuggestionRequests.push` record) with `engine: engine.id,`. Replace the post-request block

```js
      const latestSettings = settings.getSettings();
      const latestConfiguredEngine = latestSettings.searchEngine;
      const latestEngineId = settings.SEARCH_ENGINES[latestConfiguredEngine]
        ? latestConfiguredEngine
        : 'duckduckgo';
      if (
        !settings.isFirstRunComplete() ||
        !latestSettings.searchSuggestions ||
        latestEngineId !== engineId
      ) {
        return {
          engine: latestEngineId,
          label: settings.SEARCH_ENGINES[latestEngineId].label,
          suggestions: [],
        };
      }
```

with

```js
      const latestSettings = settings.getSettings();
      const latestEngine = settings.currentSearchEngine();
      if (
        !settings.isFirstRunComplete() ||
        !latestSettings.searchSuggestions ||
        latestEngine.id !== engine.id
      ) {
        return { engine: latestEngine.id, label: latestEngine.label, suggestions: [] };
      }
```

Then confirm nothing else reads the table directly:

Run: `grep -n "SEARCH_ENGINES\[" src/main/main.js`
Expected: no output.

- [ ] **Step 4: Run the scenarios to verify they pass**

Run: `npx cucumber-js -c test/desktop/cucumber.mjs -p runnable --tags "@F5"`
Expected: PASS for F5-1 through F5-6 and F5-9 through F5-11 (F5-2 now includes `kagi`).

- [ ] **Step 5: Ratify the spec**

In `spec/features.md`, replace the two-line `- **Search engines:** …` bullet in F5 with:

```markdown
- **Search engines:** `duckduckgo` (default), `google`, `bing`, `brave`, `kagi`,
  and `custom`: the user's own search address with one `%s` where the query goes
  (`searchEngineTemplate`). A custom address uses `https://`, or `http://` only
  to a local-network host, and `%s` must follow the host and port. Custom
  engines get no live suggestions. → substrate (engine table).
```

In its settings table, replace the `searchEngine` row with these two rows:

```markdown
| `searchEngine` | `duckduckgo` | one of duckduckgo/google/bing/brave/kagi/custom; `custom` without a valid `searchEngineTemplate`, or an unknown id, reads as `duckduckgo` |
| `searchEngineTemplate` | `""` | the custom address, exactly one `%s` after the host and port, `https://` or local-network `http://`, ≤ 2048 characters; synced with `searchEngine` |
```

In `spec/parity-matrix.md`'s F5 row, replace `engine choice (DuckDuckGo/Google/Bing/Brave)` with `engine choice (DuckDuckGo/Google/Bing/Brave/Kagi, or a custom address)`.

In `spec/acceptance/index.md`, change the F5-2 title to `Query searches (5 engines)` and add after the F5-8 row:

```markdown
| F5-9 | Custom search address is used for searches | — | ✅ | ⬜ | ⬜ |
| F5-10 | Custom address refuses internet `http://` | — | ✅ | ⬜ | ⬜ |
| F5-11 | Custom engine gets no live suggestions and searches its own address | — | ✅ | ⬜ | ⬜ |
```

- [ ] **Step 6: Refresh the audit inventory and check the guards**

Run: `npm run audit-inventory:write`, then `npm run browser-api:check`, then `npm run lint`
Expected: the inventory is rewritten for `main.js`/`test-hook.js`, and both checks pass.

- [ ] **Step 7: Commit**

```bash
git add src/main/main.js src/main/test-hook.js security/audit-surface-inventory.json spec test/desktop/steps/extended.steps.js test/desktop/cucumber.mjs
```
```bash
git commit -m "Route every search through the current engine, with custom-address scenarios

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Settings page and translations

**Files:**
- Modify: `src/renderer/pages/settings.html` (after the `searchEngine` `.setting` block at :191-197)
- Modify: `src/renderer/pages/settings.js` (engine `<option>` loop at :201-207; `searchEngine.value = …` at :210; its `change` listener at :222-223)
- Modify: `copy/messages/en.json`, `de.json`, `es.json`, `fr.json`, `pt-BR.json`, `it.json`
- Regenerate: `src/renderer/pages/strings.*.js` and other `copy:build` outputs
- Test: `test/unit/search-engine-settings-page.test.js` (create)

**Interfaces:**
- Consumes: settings keys `searchEngine` and `searchEngineTemplate`; `pages:settings:set` already returns the stored projection (`clientSettings()` in `pages.js`), which includes `searchEngineTemplate`.
- Produces: element ids `searchEngineCustomRow`, `searchEngineTemplate`, `searchEngineTemplateError`; copy keys `settings.general.searchEngine.custom`, `settings.general.searchEngineTemplate.label`, `settings.general.searchEngineTemplate.hint`, `settings.general.searchEngineTemplateError`; capability name `searchEngineTemplate` (iOS omits it, so the row and option are removed there).

- [ ] **Step 1: Write the failing page test**

Create `test/unit/search-engine-settings-page.test.js`:

```js
'use strict';

// The Custom search address row reuses the Encrypted DNS pattern: hidden
// until Custom… is chosen, an error line, and a placeholder showing %s.
const assert = require('node:assert/strict');
const { withoutInterfaceKeys } = require('../support/without-interface-keys');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const pages = path.join(__dirname, '../../src/renderer/pages');
const html = withoutInterfaceKeys(fs.readFileSync(path.join(pages, 'settings.html'), 'utf8'));
const js = fs.readFileSync(path.join(pages, 'settings.js'), 'utf8');
const en = require('../../copy/messages/en.json');

test('the custom search address row follows the search engine select, hidden', () => {
  const select = html.indexOf('<select id="searchEngine">');
  const row = html.indexOf('<div class="setting" id="searchEngineCustomRow" hidden>');
  assert.ok(select > 0 && row > select, 'row comes right after the engine select');
  assert.ok(row < html.indexOf('id="searchSuggestions"'), 'and before Search suggestions');
  assert.match(html, /<span class="hint field-error" id="searchEngineTemplateError" hidden>/);
  assert.match(html, /<input id="searchEngineTemplate" type="url" placeholder="https:\/\/search\.example\.com\/search\?q=%s"/);
});

test('the page script reads every new id and gates Custom on its capability', () => {
  for (const id of ['searchEngineCustomRow', 'searchEngineTemplate', 'searchEngineTemplateError']) {
    assert.match(js, new RegExp(`getElementById\\('${id}'\\)`), id);
  }
  assert.match(js, /supports\('searchEngineTemplate'\)/);
  assert.match(js, /t\('settings\.general\.searchEngine\.custom'\)/);
});

test('the new strings exist in English with notes', () => {
  for (const key of [
    'settings.general.searchEngine.custom',
    'settings.general.searchEngineTemplate.label',
    'settings.general.searchEngineTemplate.hint',
    'settings.general.searchEngineTemplateError',
  ]) {
    assert.equal(typeof en[key]?.message, 'string', key);
    assert.equal(typeof en[key]?.note, 'string', key);
  }
  assert.match(en['settings.general.searchEngineTemplate.hint'].message, /%s/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/unit/search-engine-settings-page.test.js`
Expected: FAIL. The row, ids and strings don't exist yet.

- [ ] **Step 3: Add the markup**

In `src/renderer/pages/settings.html`, directly after the `.setting` div that contains `<select id="searchEngine"></select>`, add:

```html
            <div class="setting" id="searchEngineCustomRow" hidden>
              <div class="label">
                <span data-i18n="settings.general.searchEngineTemplate.label">Custom search address</span>
                <span class="hint" data-i18n="settings.general.searchEngineTemplate.hint">Paste the search address with %s where your search words go, for example https://searx.example.org/search?q=%s. It syncs with your other settings.</span>
                <span class="hint field-error" id="searchEngineTemplateError" hidden data-i18n="settings.general.searchEngineTemplateError">That address isn't valid — your previous search engine is still in use.</span>
              </div>
              <input id="searchEngineTemplate" type="url" placeholder="https://search.example.com/search?q=%s"  data-i18n-ignore="placeholder"/>
            </div>
```

- [ ] **Step 4: Wire the page script**

In `src/renderer/pages/settings.js`, replace the engine option loop

```js
  for (const [key, label] of Object.entries(searchEngines)) {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = label;
    opt.dataset.i18nIgnore = ''; // engine names are proper names
    searchEngine.append(opt);
  }
```

with

```js
  for (const [key, label] of Object.entries(searchEngines)) {
    if (key === 'custom' && !supports('searchEngineTemplate')) continue;
    const opt = document.createElement('option');
    opt.value = key;
    if (key === 'custom') {
      opt.textContent = t('settings.general.searchEngine.custom');
    } else {
      opt.textContent = label;
      opt.dataset.i18nIgnore = ''; // engine names are proper names
    }
    searchEngine.append(opt);
  }
```

Delete the line `  searchEngine.value = settings.searchEngine;` and the two-line listener

```js
  searchEngine.addEventListener('change', () =>
    window.bowserPages.settings.set({ searchEngine: searchEngine.value }));
```

Then, directly after the `adblockEnabled.addEventListener('change', …);` statement that ends that block, add:

```js
  // --- Search engine, with the Custom address (Encrypted DNS pattern) ---
  const searchCustomRow = document.getElementById('searchEngineCustomRow');
  const searchTemplate = document.getElementById('searchEngineTemplate');
  const searchTemplateError = document.getElementById('searchEngineTemplateError');
  if (supports('searchEngineTemplate')) {
    // Reflect an ACCEPTED stored snapshot into the controls (clears any error).
    const showAcceptedSearch = (s) => {
      searchEngine.value = s.searchEngine;
      searchTemplate.value = s.searchEngineTemplate ?? '';
      searchCustomRow.hidden = searchEngine.value !== 'custom';
      searchTemplateError.hidden = true;
      searchTemplate.setAttribute('aria-invalid', 'false');
    };
    // Main is the sole validator: send the change, then render from what was
    // actually stored. A Custom write was refused when Custom isn't selected
    // afterwards, or when the stored address isn't the one just sent (an
    // invalid edit keeps the previous address). Keep the draft visible with
    // the error rather than snapping back.
    const commitSearch = async (partial) => {
      const next = await window.bowserPages.settings.set(partial);
      const refused = partial.searchEngine === 'custom' &&
        (next.searchEngine !== 'custom' || next.searchEngineTemplate !== partial.searchEngineTemplate);
      if (refused) {
        searchEngine.value = 'custom';
        searchCustomRow.hidden = false;
        searchTemplateError.hidden = false;
        searchTemplate.setAttribute('aria-invalid', 'true');
        return; // leaves the rejected text in the field to correct
      }
      showAcceptedSearch(next);
    };

    showAcceptedSearch(settings);

    searchEngine.addEventListener('change', () => {
      if (searchEngine.value === 'custom') {
        searchCustomRow.hidden = false;
        searchTemplateError.hidden = true; // no error before anything is typed
        const template = searchTemplate.value.trim();
        if (template) commitSearch({ searchEngine: 'custom', searchEngineTemplate: template });
        // else: the address field's own change event commits and validates
      } else {
        commitSearch({ searchEngine: searchEngine.value });
      }
    });
    searchTemplate.addEventListener('change', () =>
      commitSearch({ searchEngine: 'custom', searchEngineTemplate: searchTemplate.value.trim() }));
  } else {
    searchCustomRow?.remove();
    searchEngine.value = settings.searchEngine;
    searchEngine.addEventListener('change', () =>
      window.bowserPages.settings.set({ searchEngine: searchEngine.value }));
  }
```

- [ ] **Step 5: Add the English strings**

In `copy/messages/en.json`, directly after the `"settings.general.searchEngine.hint"` entry, add:

```json
  "settings.general.searchEngine.custom": {
    "message": "Custom…",
    "note": "Settings → General: last choice in the search engine dropdown; choosing it reveals a field for the user's own search address.",
    "maxLength": 23
  },
  "settings.general.searchEngineTemplate.label": {
    "message": "Custom search address",
    "note": "Settings → General: setting name."
  },
  "settings.general.searchEngineTemplate.hint": {
    "message": "Paste the search address with %s where your search words go, for example https://searx.example.org/search?q=%s. It syncs with your other settings.",
    "note": "Settings → General: explanation under a setting. Keep %s and the example address exactly as written."
  },
  "settings.general.searchEngineTemplateError": {
    "message": "That address isn't valid — your previous search engine is still in use.",
    "note": "Settings → General: error shown when the custom search address is invalid."
  },
```

- [ ] **Step 6: Add the five translations and acknowledge them**

Save this as `/private/tmp/claude-501/-Users-anthonyjloria-Projects-Blanc-Browser--claude-worktrees-1password-windows-linux-tests-362762/188a474b-21b3-4304-ae47-a7a1e59ef141/scratchpad/add-search-copy.cjs` (the session's scratchpad directory, not the repo):

```js
// Inserts the four search-engine strings after settings.general.searchEngine.hint
// in each translation file, keeping key order. Run from the repo root.
const fs = require('fs');
const ANCHOR = 'settings.general.searchEngine.hint';
const T = {
  de: [
    'Eigene Suchmaschine…',
    'Adresse der eigenen Suchmaschine',
    'Füge die Suchadresse ein, mit %s an der Stelle deiner Suchbegriffe, z. B. https://searx.example.org/search?q=%s. Sie wird mit deinen anderen Einstellungen synchronisiert.',
    'Diese Adresse ist ungültig – deine bisherige Suchmaschine wird weiter verwendet.',
  ],
  es: [
    'Personalizado…',
    'Dirección de búsqueda personalizada',
    'Pega la dirección de búsqueda con %s donde van tus palabras, p. ej., https://searx.example.org/search?q=%s. Se sincroniza con el resto de tus ajustes.',
    'Esa dirección no es válida; se sigue usando el motor de búsqueda anterior.',
  ],
  fr: [
    'Personnalisé…',
    'Adresse de recherche personnalisée',
    'Collez l’adresse de recherche en mettant %s à la place de vos mots-clés, p. ex. https://searx.example.org/search?q=%s. Elle est synchronisée avec vos autres réglages.',
    'Cette adresse n’est pas valide — le moteur de recherche précédent reste utilisé.',
  ],
  'pt-BR': [
    'Personalizado…',
    'Endereço de pesquisa personalizado',
    'Cole o endereço de pesquisa com %s no lugar das suas palavras, por exemplo https://searx.example.org/search?q=%s. Ele é sincronizado com suas outras configurações.',
    'Esse endereço não é válido — o mecanismo de pesquisa anterior continua em uso.',
  ],
  it: [
    'Personalizzato…',
    'Indirizzo di ricerca personalizzato',
    'Incolla l’indirizzo di ricerca con %s al posto delle parole che cerchi, ad esempio https://searx.example.org/search?q=%s. Viene sincronizzato con le altre impostazioni.',
    'Questo indirizzo non è valido: resta in uso il motore di ricerca precedente.',
  ],
};
const KEYS = [
  'settings.general.searchEngine.custom',
  'settings.general.searchEngineTemplate.label',
  'settings.general.searchEngineTemplate.hint',
  'settings.general.searchEngineTemplateError',
];
for (const [locale, messages] of Object.entries(T)) {
  const file = `copy/messages/${locale}.json`;
  const src = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!src[ANCHOR]) throw new Error(`${locale}: anchor missing`);
  const out = {};
  for (const [key, value] of Object.entries(src)) {
    if (KEYS.includes(key)) continue; // idempotent
    out[key] = value;
    if (key === ANCHOR) KEYS.forEach((k, i) => { out[k] = { message: messages[i] }; });
  }
  fs.writeFileSync(file, JSON.stringify(out, null, 2) + '\n');
}
```

Run: `node /private/tmp/claude-501/-Users-anthonyjloria-Projects-Blanc-Browser--claude-worktrees-1password-windows-linux-tests-362762/188a474b-21b3-4304-ae47-a7a1e59ef141/scratchpad/add-search-copy.cjs`
Then, for each locale in `de es fr pt-BR it` (one command each):

```bash
npm run copy:ack -- de settings.general.searchEngine.custom settings.general.searchEngineTemplate.label settings.general.searchEngineTemplate.hint settings.general.searchEngineTemplateError
```

Expected: `acknowledged 4 de entries` (and likewise for each locale).

- [ ] **Step 7: Build the catalogs and check**

Run: `npm run copy:build`, then `npm run copy:check`
Expected: `wrote …strings.*.js` lines, then `copy:check OK`.

- [ ] **Step 8: Run the tests to verify they pass**

Run: `node --test test/unit/search-engine-settings-page.test.js test/unit/settings-privacy-cards.test.js test/unit/i18n-settings.test.js`
Expected: PASS.

- [ ] **Step 9: Lint**

Run: `npm run lint`
Expected: clean.

- [ ] **Step 10: Commit**

```bash
git add src/renderer/pages copy test/unit/search-engine-settings-page.test.js
```
```bash
git commit -m "Offer Kagi and a custom search address in Settings

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Verify in the real app, review, and hand off

**Files:** none changed unless a check fails. A fix goes in the task that owns the code, with a new commit.

- [ ] **Step 1: Run the full local gates**

Run each, in order: `npm run lint`, `npm run test:unit`, `npm run substrate:check`, `npm run test:acceptance:dry`, `npm run test:i18n:desktop`
Expected: all pass. If an acceptance or i18n failure looks unrelated, compare against untouched `main` before blaming the change (some scenarios fail on this Mac on `main`).

- [ ] **Step 2: Drive the dev app and capture proof**

Warn the owner first that verification windows will open. Then, with a scratch `-Dev` profile through Playwright-Electron (`BLANC_TEST=1`), check:
1. Settings → General lists DuckDuckGo, Google, Bing, Brave Search, Kagi, Custom…, and the Custom row is hidden.
2. Choose Custom…, enter `http://searx.example.org/search?q=%s`, then Tab. The error appears, `aria-invalid="true"`, and the stored engine is unchanged (test hook `searchEngine()`).
3. Enter `https://searx.example.org/search?q=%s`. The error clears and `searchEngine()` is `custom`.
4. Choose Google, then Custom… again. The saved address comes back and is in use.
5. Take a full-resolution screenshot of the General card with the Custom row open and of the error state (before-over-after crops per the proof format).

- [ ] **Step 3: Check Kagi and a real SearXNG server**

Relaunch the owner's dev instance (`npm start`, after killing the old one) and leave it running. In it:
1. Choose Kagi, open ⌘L and type a word. Suggestions tagged "Kagi" appear. Enter loads `kagi.com/search?q=…`, which shows Kagi's sign-in page if not signed in.
2. In a private tab, a Kagi search shows Kagi's sign-in page.
3. Choose Custom… with a public HTTPS SearXNG instance picked from searx.space at run time (`https://<instance>/search?q=%s`), and confirm a search returns results.
Record exactly what was verified; a signed-in Kagi result page needs the owner's Kagi account and is otherwise reported as not verified.

- [ ] **Step 4: Code review**

Run the `code-review` skill on the branch diff and fix the findings the owner picks before any push.

- [ ] **Step 5: Hand off**

Report to the owner: what changed, the evidence from Steps 1 to 3, and anything not verified. Push the branch and open the PR only on the owner's go-ahead. The PR is not website-only, so the full Electron CI runs. Website copy, claims ledgers and the Reddit reply wait until a public release includes this.

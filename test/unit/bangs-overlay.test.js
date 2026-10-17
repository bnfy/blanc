'use strict';

// The Island's bang hint row and picker: runs the real bangResults /
// arrowStartIndex / resultKey / pickResult / suggestionsAllowed from
// overlay.js in a sandbox with the real pure module, so a rename or a dropped
// branch fails here. Also the paired classifier check the design asks for:
// a known bang takes the bang path in both processes whatever the words are.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '../..');
const overlay = fs.readFileSync(path.join(ROOT, 'src/renderer/overlay.js'), 'utf8');
const mainSource = fs.readFileSync(path.join(ROOT, 'src/main/main.js'), 'utf8');
const bangsSource = fs.readFileSync(path.join(ROOT, 'src/renderer/pages/bangs.js'), 'utf8');

const lift = (name) => {
  const source = overlay.match(new RegExp(`\\n  function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n  \\}\\n`))?.[0];
  assert.ok(source, `${name} not found in overlay.js`);
  return source;
};
const liftMain = (name) => {
  const source = mainSource.match(new RegExp(`\\nfunction ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}\\n`))?.[0];
  assert.ok(source, `${name} not found in main.js`);
  return source;
};
const plain = (value) => JSON.parse(JSON.stringify(value));

const CATALOG = [
  ['yt', ['ytb'], 'YouTube', 'www.youtube.com', 'https://www.youtube.com/results?search_query=%s', 3, 'https://www.youtube.com/'],
  ['y', [], 'Yahoo', 'yahoo.com', 'https://search.yahoo.com/search?p=%s', 3, 'https://yahoo.com/'],
  ['ytm', [], 'YouTube Music', 'music.youtube.com', 'https://music.youtube.com/search?q=%s', 3, 'https://music.youtube.com/'],
  ['w', [], 'Wikipedia', 'wikipedia.org', 'https://en.wikipedia.org/wiki/Special:Search?search=%s', 3, 'https://wikipedia.org/'],
];
Object.defineProperty(CATALOG, 'popular', { value: ['w', 'yt'] });

function sandbox({ enabled = true, recent = [], custom = [], sectionsOpen = {} } = {}) {
  const calls = [];
  const context = {
    state: { groups: [], tabs: [{ id: 't1', title: 'lofi hip hop radio', url: 'https://www.youtube.com/watch?v=1' }], activeTabId: 't1' },
    favorites: [], remoteDevices: [], historyEntries: [], wsWorkspaces: [],
    matchableText: (title, url) => `${title ?? ''} ${url ?? ''}`, stripUrl: (url) => url, tabDomain: (tab) => tab.url,
    blancI18n: { t: (key, params) => {
      if (key === 'bang.search') return `Search ${params.site} for “${params.query}”`;
      if (key === 'bang.open') return `Open ${params.site}`;
      return key;
    } },
    bangsState: { enabled, custom, recent },
    bangSectionsOpen: { recent: true, popular: true, all: true, ...sectionsOpen },
    visibleResults: [],
    inputTouched: true,
    namePrompt: null,
    addressInput: { value: '' },
    activeTab: () => ({ private: false }),
    addressInputComposing: false,
    suppressProviderSuggestions: false,
    STRONG_MATCH_SCORE: 2,
    fillBang: (code) => calls.push(['fill', code]),
    workspaceUI: { switchTo: () => {} },
    window: { browserAPI: {
      closeOverlay: () => calls.push(['close']),
      navigate: (id, text) => calls.push(['navigate', id, text]),
      search: (id, q) => calls.push(['search', id, q]),
      focusGroup: () => {}, switchTab: () => {}, createTab: () => {},
    } },
    settings: { searchUrlFor: (q) => `search:${q}` },
  };
  vm.runInNewContext(
    bangsSource + '\nconst Bangs = window.Bangs;\nconst BangsCatalog = CATALOG;\n'
    + ['matchScore', 'switcherResults', 'looksLikeAddress', 'bangResults', 'arrowStartIndex', 'resultKey', 'pickResult', 'suggestionsAllowed'].map(lift).join('\n')
    + liftMain('normalizeAddressInput')
    + '\nthis.api = { bangResults, arrowStartIndex, resultKey, pickResult, suggestionsAllowed, looksLikeAddress, normalizeAddressInput };',
    Object.assign(context, { CATALOG }),
  );
  return { ...context.api, calls, context };
}

test('a known bang with words shows the hint row over the local matches', () => {
  const { bangResults } = sandbox();
  const r = bangResults('!yt lofi');
  assert.equal(r.hint.title, 'Search YouTube for “lofi”');
  assert.equal(r.hint.url, 'https://www.youtube.com/results?search_query=lofi');
  assert.equal(r.hint.kind, 'bang');
  assert.deepEqual(plain(r.picks), []);
  assert.deepEqual(plain(r.sections), []);
  assert.equal(r.local[0].kind, 'tab');
  assert.equal(r.local[0].tab.id, 't1');
});

test('a bang at the end reads the same', () => {
  const { bangResults } = sandbox();
  assert.equal(bangResults('lofi !yt').hint.url, 'https://www.youtube.com/results?search_query=lofi');
});

test('a known bang wins over the HTML-path address guard', () => {
  const { bangResults, looksLikeAddress } = sandbox();
  assert.equal(looksLikeAddress('!yt foo.html'), true, 'the address guard alone would call this an address');
  assert.equal(bangResults('!yt foo.html').hint.url, 'https://www.youtube.com/results?search_query=foo.html');
});

test('a bare known code opens the site and lists the longer codes below', () => {
  const { bangResults } = sandbox();
  const r = bangResults('!yt');
  assert.equal(r.hint.title, 'Open YouTube');
  assert.equal(r.hint.url, 'https://www.youtube.com/');
  assert.deepEqual(plain(r.sections), [{ section: 'all', count: 1, open: true }]);
  assert.deepEqual(plain(r.picks.map((p) => [p.kind, p.code])), [['bangPick', 'ytm']]);
  assert.deepEqual(plain(r.local), []);
});

test('a folded section keeps its header and count, and unfolding restores its rows', () => {
  const { bangResults, context } = sandbox({ sectionsOpen: { all: false } });
  let r = bangResults('!yt');
  assert.deepEqual(plain(r.sections), [{ section: 'all', count: 1, open: false }]);
  assert.deepEqual(plain(r.picks), []);
  context.bangSectionsOpen.all = true;
  r = bangResults('!yt');
  assert.deepEqual(plain(r.picks.map((p) => p.code)), ['ytm']);
});

test('! alone shows recent then popular, each bang once', () => {
  const { bangResults } = sandbox({ recent: ['w'] });
  const r = bangResults('!');
  assert.equal(r.hint, null);
  assert.deepEqual(plain(r.sections.map((s) => [s.section, s.count])), [['recent', 1], ['popular', 1]]);
  assert.deepEqual(plain(r.picks.map((p) => [p.section, p.code])), [['recent', 'w'], ['popular', 'yt']]);
});

test('an unknown code with words falls through to the normal list', () => {
  const { bangResults } = sandbox();
  assert.equal(bangResults('!zzz x'), null);
});

test('an unknown bare code shows the filtered picker without a hint', () => {
  const { bangResults } = sandbox();
  const r = bangResults('!yz');
  assert.equal(r.hint, null);
  assert.deepEqual(plain(r.picks), []);
});

test('bangs off: no hint row and no picker', () => {
  const { bangResults } = sandbox({ enabled: false });
  assert.equal(bangResults('!yt lofi'), null);
  assert.equal(bangResults('!'), null);
});

test('a custom bang is listed as yours', () => {
  const { bangResults } = sandbox({ custom: [{ code: 'mine', name: 'Mine', template: 'https://m.example/?q=%s' }] });
  const r = bangResults('!mi');
  assert.deepEqual(plain(r.picks.map((p) => [p.code, p.custom])), [['mine', true]]);
});

test('arrowStartIndex: the hint is the Enter target, a picker is not', () => {
  const { arrowStartIndex, bangResults, context } = sandbox();
  const withHint = bangResults('!yt lofi');
  context.addressInput.value = '!yt lofi';
  context.visibleResults = [withHint.hint, ...withHint.local];
  assert.equal(arrowStartIndex(), 1);
  const picker = bangResults('!');
  context.addressInput.value = '!';
  context.visibleResults = picker.picks;
  assert.equal(arrowStartIndex(), 0);
  context.addressInput.value = 'lofi';
  context.visibleResults = [{ kind: 'search', query: 'lofi' }, { kind: 'tab' }];
  assert.equal(arrowStartIndex(), 1, "a search row keeps today's rule");
  context.addressInput.value = 'example.com';
  context.visibleResults = [{ kind: 'tab' }];
  assert.equal(arrowStartIndex(), 0, "an address keeps today's rule");
});

test('resultKey and pickResult for bang rows', () => {
  const { bangResults, resultKey, pickResult, calls } = sandbox();
  const r = bangResults('!yt lofi');
  assert.equal(resultKey(r.hint), 'bang:yt:lofi');
  pickResult(r.hint);
  assert.deepEqual(plain(calls), [['navigate', 't1', '!yt lofi'], ['close']], 'the typed text goes to main, which resolves it once more');
  calls.length = 0;
  const pick = bangResults('!yt').picks[0];
  assert.equal(resultKey(pick), 'bangPick:ytm');
  pickResult(pick);
  assert.deepEqual(plain(calls), [['fill', 'ytm']], 'a picker row fills the input and keeps the overlay open');
});

test('suggestionsAllowed refuses bang-shaped text, known or not, on or off', () => {
  const on = sandbox();
  assert.equal(on.suggestionsAllowed('!yt lofi'), false);
  assert.equal(on.suggestionsAllowed('lofi !yt'), false);
  assert.equal(on.suggestionsAllowed('!zzz x'), false);
  assert.equal(on.suggestionsAllowed('lofi'), true);
  const off = sandbox({ enabled: false });
  assert.equal(off.suggestionsAllowed('!zzz x'), false);
});

test('paired classifiers: a known bang takes the bang path in both processes', () => {
  const { bangResults, normalizeAddressInput } = sandbox();
  for (const input of ['!yt foo.html', '!yt https://x.example', '!yt foo://bar', '!yt site:x', '!yt 1.2.3.4', '!yt localhost', 'foo.html !yt', 'site:x !yt']) {
    const parsed = require(path.join(ROOT, 'src/renderer/pages/bangs.js')).parseBang(input);
    assert.equal(parsed?.code, 'yt', input);
    assert.ok(bangResults(input)?.hint, `overlay shows the hint for ${input}`);
  }
  // Without a known bang both classifiers keep today's answers.
  const fixed = {
    'foo.html': { overlay: true, main: 'https://foo.html' },
    'https://x.example': { overlay: true, main: 'https://x.example' },
    'site:x': { overlay: false, main: 'search:site:x' },
    '1.2.3.4': { overlay: true, main: 'http://1.2.3.4' },
    'localhost': { overlay: true, main: 'http://localhost' },
    '!zzz x': { overlay: false, main: 'search:!zzz x' },
  };
  const { looksLikeAddress } = sandbox();
  for (const [input, expected] of Object.entries(fixed)) {
    assert.equal(bangResults(input), null, `${input} is not a bang`);
    assert.equal(looksLikeAddress(input), expected.overlay, `overlay: ${input}`);
    assert.equal(normalizeAddressInput(input), expected.main, `main: ${input}`);
  }
});

'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const electronId = require.resolve('electron');
const originalElectron = require.cache[electronId];
let activeUserData = null;
require.cache[electronId] = {
  id: electronId, filename: electronId, loaded: true,
  exports: { app: { getPath: () => activeUserData, on: () => {} } },
};

function loadSettings(userData) {
  activeUserData = userData;
  delete require.cache[require.resolve('../../src/main/settings')];
  delete require.cache[require.resolve('../../src/main/store')];
  return require('../../src/main/settings');
}

test.after(() => {
  delete require.cache[require.resolve('../../src/main/settings')];
  delete require.cache[require.resolve('../../src/main/store')];
  if (originalElectron) require.cache[electronId] = originalElectron;
  else delete require.cache[electronId];
});

test('surface style defaults to sunrise, accepts only sunrise|neutral and never syncs', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-surface-'));
  const settings = loadSettings(dir);
  t.after(() => { settings.flushSettings(); fs.rmSync(dir, { recursive: true, force: true }); });
  assert.equal(settings.getSettings().surfaceStyle, 'sunrise');
  assert.equal(settings.setSettings({ surfaceStyle: 'neutral' }).surfaceStyle, 'neutral');
  assert.equal(settings.setSettings({ surfaceStyle: 'gold' }).surfaceStyle, 'neutral');
  assert.equal(settings.setSettings({ surfaceStyle: 'sunrise' }).surfaceStyle, 'sunrise');
  assert.equal(Object.hasOwn(settings.exportForSync().values, 'surfaceStyle'), false);
});

test('a stored unknown surface style reads as sunrise', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-surface-bad-'));
  fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({ surfaceStyle: 7 }));
  const settings = loadSettings(dir);
  t.after(() => { settings.flushSettings(); fs.rmSync(dir, { recursive: true, force: true }); });
  assert.equal(settings.getSettings().surfaceStyle, 'sunrise');
});

test('neutral overrides carry no gold and are served after pages.css', () => {
  const css = fs.readFileSync(path.join(__dirname, '../../src/renderer/pages/pages-neutral.css'), 'utf8');
  assert.doesNotMatch(css, /#805d28|#d4ad66|128, 93, 40|212, 173, 102/i);
  const pages = fs.readFileSync(path.join(__dirname, '../../src/main/pages.js'), 'utf8');
  assert.match(pages, /surfaceStyle === 'neutral'[\s\S]*?pages-neutral\.css/);
  const html = fs.readFileSync(path.join(__dirname, '../../src/renderer/pages/settings.html'), 'utf8');
  assert.match(html, /<select id="surfaceStyle"[^>]*>\s*<option value="sunrise"[\s\S]*?<option value="neutral"/);
});

// Flattens a stylesheet into "context|selector|property" keys, where context
// is the enclosing at-rule (e.g. an @media prelude) or empty.
function declarations(css) {
  const out = new Map();
  const stack = [];
  let buffer = '';
  for (const ch of css.replace(/\/\*[\s\S]*?\*\//g, '')) {
    if (ch === '{') { stack.push(buffer.trim().replace(/\s+/g, ' ')); buffer = ''; continue; }
    if (ch === '}') {
      const selector = stack.pop();
      for (const decl of buffer.split(';')) {
        const i = decl.indexOf(':');
        if (i < 0) continue;
        const context = stack.filter((s) => s.startsWith('@')).join(' ');
        for (const one of selector.split(',').map((s) => s.trim())) {
          out.set(`${context}|${one}|${decl.slice(0, i).trim()}`, decl.slice(i + 1).trim());
        }
      }
      buffer = '';
      continue;
    }
    if (ch === ';' && stack.length === 0) { buffer = ''; continue; }
    buffer += ch;
  }
  return out;
}

// The Sunrise cream, browns and gold (hex and rgb channel forms).
const WARM = /#(f8f2e8|f2eade|e1d7c9|805d28|d4ad66|17130f|2d251d|4a3e31|6b6257|b8aa98|f7f0e5|12100b|100d0b|251d17|1a1511|594a39|f8f0e4|b5a38f|221d17|f8ede2|3f3830|cfc2b0|ccbba6)\b|\b(247, 240, 229|18, 15, 12|24, 19, 15|18, 16, 11|128, 93, 40|212, 173, 102|242, 234, 222|45, 37, 29|34, 29, 23|37, 29, 23|26, 21, 17|12, 10, 8|19, 15, 12|10, 8, 7)\b/i;
// Warm on purpose under Neutral: Patron's own gold, the @property fallback
// (always replaced before paint), and the dusk and night wallpaper tints,
// which match that artwork rather than the palette.
const KEPT = [/\|--patron-gold$/, /^\|@property --start-footer-ink\|initial-value$/, /\|--start-footer-tint-(dusk|night)$/];

test('every warm declaration in pages.css has a Neutral counterpart', () => {
  const pages = declarations(fs.readFileSync(path.join(__dirname, '../../src/renderer/pages/pages.css'), 'utf8'));
  const neutral = declarations(fs.readFileSync(path.join(__dirname, '../../src/renderer/pages/pages-neutral.css'), 'utf8'));
  const missing = [...pages]
    .filter(([key, value]) => WARM.test(value) && !KEPT.some((re) => re.test(key)))
    .map(([key]) => key)
    .filter((key) => !neutral.has(key));
  assert.deepEqual(missing, []);
  const stillWarm = [...neutral].filter(([, value]) => WARM.test(value)).map(([key]) => key);
  assert.deepEqual(stillWarm, []);
});

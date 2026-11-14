// The resting Island keeps shipping's exact geometry (owner, 2026-11-13):
// the fork's own stylesheets may add slots but never re-space, resize or
// re-shape what shipping draws. Measured side by side against shipping's
// Electron build on 2026-11-13 (every gap, button and corner equal).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const island = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../blanc/island');
const FORK_STYLES = ['prototype.css', 'host.css', 'extensions.css'];
const strip = css => css.replace(/\/\*[\s\S]*?\*\//g, '');
const rules = css => [...strip(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => ({selector: selector.trim(), body}));
const RESTING = /#islandPill(?![\w-])(?!\.(?:proximity-active))|#pill[A-Z]\w*|\.pill-btn|\.pill-sep|\.island-dot/;
const GEOMETRY = /(^|;|\s)(gap|width|height|min-width|max-width|margin[\w-]*|padding[\w-]*|border-radius|zoom|font-size|--island-resting-[\w-]+|--shadow-island-resting|--pill-zoom|--strip-h)\s*:/;

test('the fork stylesheets do not change the resting pill geometry', () => {
  const found = [];
  for (const file of FORK_STYLES) {
    const p = path.join(island, file);
    if (!fs.existsSync(p)) continue;
    for (const {selector, body} of rules(fs.readFileSync(p, 'utf8'))) {
      if (selector.startsWith('@') || !RESTING.test(selector)) continue;
      if (/#islandPanel|panel/i.test(selector) && !/#islandPill/.test(selector)) continue;
      if (GEOMETRY.test(body)) found.push(`${file}: ${selector} { ${body.trim()} }`);
    }
  }
  assert.deepEqual(found, []);
});


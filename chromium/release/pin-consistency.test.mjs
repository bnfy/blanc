// The reviewed Chromium pin is named once by hand, in policy.mjs, and must agree
// with the desktop lane; the daily scripts derive their version prefix from it
// (docs/superpowers/plans/2026-11-22-desktop-fork-chromium-159.md, Task 1).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {CHROME_VERSION, UPSTREAM} from './policy.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const lane = JSON.parse(fs.readFileSync(path.join(here, '../lanes/desktop.json'), 'utf8'));

test('the release policy names the desktop lane\'s pin', () => {
  assert.equal(CHROME_VERSION, lane.version);
  assert.equal(UPSTREAM, lane.upstream);
});

test('the daily scripts carry no literal Chromium version', () => {
  for (const name of ['daily/desktop-nightly.mjs', 'daily/windows-beta-prep.mjs']) {
    const source = fs.readFileSync(path.join(here, name), 'utf8');
    assert.doesNotMatch(source, /\d+\.0\.\d{4}\./, name);
  }
});

// The Island's strings.js must be shipping's catalogs at the recorded release.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {generate} from './interface-strings.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('the committed catalogs are the generated ones', () => {
  assert.equal(fs.readFileSync(path.join(root, 'blanc/island/strings.js'), 'utf8'), generate());
});

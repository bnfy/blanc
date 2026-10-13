'use strict';

// #740: a persistent fill notice from a failed attempt must not stay on
// screen once the next attempt starts. prepareOnePasswordTarget (main.js)
// runs at the start of every fill that reaches the page, and it dismisses
// the window's capsule through the surface's same-runtime invalidation
// (proven to hide notices in fill-status-surface.test.js).

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const main = fs.readFileSync(path.join(__dirname, '../../src/main/main.js'), 'utf8');

function functionBody(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} must exist in main.js`);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}' && --depth === 0) return source.slice(open, i + 1);
  }
  throw new Error(`unterminated ${name}`);
}

test('starting a fill clears the window\'s previous fill notice', () => {
  const body = functionBody(main, 'prepareOnePasswordTarget');
  const clear = body.indexOf('fillStatusSurface?.invalidatePending(target.runtime.id)');
  assert.notEqual(clear, -1, 'prepareOnePasswordTarget must dismiss the previous capsule');
  assert.ok(clear < body.indexOf('target.surfaceGeneration = '),
    'the capsule is cleared before the flow stamps its surface generation');
});

test('the fill wires prepareOnePasswordTarget as its prepareTarget hook', () => {
  assert.match(main, /prepareTarget: prepareOnePasswordTarget,/);
});

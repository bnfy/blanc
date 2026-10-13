'use strict';

// Blanc Spaces became free for everyone in October 2026; Blanc Patron is
// support and unlocks nothing. The records agents read before touching Patron
// or Spaces code must not say otherwise.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '../..');
const RECORDS = ['CLAUDE.md', 'AGENTS.md', 'docs/polar-setup.md', 'spec/features.md', 'spec/parity-matrix.md'];

test('no internal record says Blanc Patron unlocks Blanc Spaces', () => {
  for (const file of RECORDS) {
    const text = fs.readFileSync(path.join(root, file), 'utf8').replace(/\s+/g, ' ');
    assert.doesNotMatch(text, /Patron (currently )?unlocks (creating )?(Blanc )?Spaces|unlocks space creation/i, file);
  }
});

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Every release writes its What's New page (or a noPage entry) in the
// post-release site update, and the owner signs it off before it deploys
// (docs/superpowers/specs/2026-10-19-whats-new-page-design.md).
const ROOT = path.join(__dirname, '../..');

test('the release runbooks name the What\'s New page and the owner\'s sign-off', () => {
  for (const rel of ['CLAUDE.md', 'AGENTS.md', '.claude/skills/releasing-blanc/SKILL.md']) {
    const doc = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    assert.match(doc, /site\/src\/data\/whats-new\.json/, rel);
    assert.match(doc, /owner's explicit sign-off/, rel);
  }
});

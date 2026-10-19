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

test('the post-release runbooks draft the page with the generator first', () => {
  for (const rel of ['CLAUDE.md', 'AGENTS.md', '.claude/skills/releasing-blanc/SKILL.md']) {
    const doc = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    assert.match(doc, /npm run site:whats-new -- --release X\.Y/, rel);
  }
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts['site:whats-new'], 'node site/scripts/whats-new-draft.mjs');
});

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(
  path.join(__dirname, '../../src/renderer/pages/tab-import.js'),
  'utf8',
);
const overlaySource = fs.readFileSync(
  path.join(__dirname, '../../src/renderer/overlay.js'),
  'utf8',
);

function lift(name) {
  const match = source.match(new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}`));
  assert.ok(match, `${name} not found in tab-import.js — update this test with it`);
  return match[0];
}

function loadReviewModel() {
  const sandbox = {
    MAX_GROUP_NAME_LENGTH: 40,
    GENERIC_GROUP_NAMES: new Set([
      'misc', 'stuff', 'other', 'other 2', 'imported tabs', 'imported', 'tabs',
      'bookmarks', 'untitled', 'group', 'folder',
    ]),
    UNGROUPED_LANE: '__ungrouped__',
    EXCLUDED_LANE: '__excluded__',
  };
  const names = [
    'normalizeReviewGroupName',
    'reviewGroupNameError',
    'proposalLaneFor',
    'removeCandidateFromProposal',
    'moveCandidateInProposal',
    'reviewProposalIssue',
    'reviewCounts',
    'tabImportApplyLabel',
    'tabImportApplyRequest',
  ];
  vm.runInNewContext(
    `${names.map(lift).join('\n')}\n${names.map((name) => `this.${name} = ${name};`).join('\n')}`,
    sandbox,
  );
  return sandbox;
}

const proposal = () => ({
  version: 1,
  groups: [
    { suggestionId: 'g-work', name: 'work', candidateIds: ['a', 'b'], confidence: 'high' },
    { suggestionId: 'g-read', name: 'reading', candidateIds: ['c', 'd'], confidence: 'review' },
  ],
  ungroupedCandidateIds: ['e'],
});

const candidates = () => ['a', 'b', 'c', 'd', 'e'].map((candidateId) => ({
  candidateId,
  selected: true,
  excluded: false,
}));

test('review group names normalize and reject blank, generic, and duplicate names', () => {
  const model = loadReviewModel();
  const p = proposal();
  assert.equal(model.normalizeReviewGroupName('  Project   Atlas '), 'project atlas');
  assert.equal(model.reviewGroupNameError('', p, 'g-work'), 'Type a group name.');
  assert.equal(model.reviewGroupNameError('misc', p, 'g-work'), 'Choose a more specific group name.');
  assert.equal(model.reviewGroupNameError('READING', p, 'g-work'), 'That group name is already in use.');
  assert.equal(model.reviewGroupNameError('project atlas', p, 'g-work'), '');
});

test('moving a tab keeps it in exactly one group or the ungrouped lane', () => {
  const model = loadReviewModel();
  const p = proposal();
  assert.equal(model.moveCandidateInProposal(p, 'a', 'g-read'), true);
  assert.equal(model.proposalLaneFor(p, 'a'), 'g-read');
  assert.equal(p.groups[0].candidateIds.includes('a'), false);

  assert.equal(model.moveCandidateInProposal(p, 'a', '__ungrouped__'), true);
  assert.equal(model.proposalLaneFor(p, 'a'), '__ungrouped__');
  assert.equal(p.ungroupedCandidateIds.filter((id) => id === 'a').length, 1);

  assert.equal(model.moveCandidateInProposal(p, 'a', '__excluded__'), true);
  assert.equal(model.proposalLaneFor(p, 'a'), null);
});

test('review validation fails closed for one-tab groups and incomplete partitions', () => {
  const model = loadReviewModel();
  const p = proposal();
  assert.equal(model.reviewProposalIssue(p, candidates()), '');
  p.groups[0].candidateIds = ['a'];
  p.ungroupedCandidateIds.push('b');
  assert.match(model.reviewProposalIssue(p, candidates()), /needs at least two tabs/);
  p.groups.shift();
  p.ungroupedCandidateIds = p.ungroupedCandidateIds.filter((id) => id !== 'a');
  assert.equal(model.reviewProposalIssue(p, candidates()), 'Review each tab placement before opening.');
});

test('apply request carries generation and editable memberships, never UI metadata', () => {
  const model = loadReviewModel();
  const request = JSON.parse(JSON.stringify(model.tabImportApplyRequest(proposal(), 'generation-1')));
  assert.deepEqual(request, {
    generation: 'generation-1',
    groups: [
      { name: 'work', candidateIds: ['a', 'b'] },
      { name: 'reading', candidateIds: ['c', 'd'] },
    ],
    ungroupedCandidateIds: ['e'],
  });
  assert.equal(JSON.stringify(request).includes('confidence'), false);
  assert.equal(JSON.stringify(request).includes('suggestionId'), false);
});

test('apply consequence copy pluralizes its exact tab and group counts', () => {
  const model = loadReviewModel();
  assert.equal(
    model.tabImportApplyLabel({ tabs: 4, groups: 1, ungrouped: 2 }),
    'Open 4 tabs in 1 group · 2 ungrouped',
  );
  assert.equal(
    model.tabImportApplyLabel({ tabs: 1, groups: 0, ungrouped: 1 }),
    'Open 1 tab in 0 groups · 1 ungrouped',
  );
});

test('post-import workspace handoff reuses the existing Patron and save-as surfaces', () => {
  const row = overlaySource.match(
    /function renderPostImportWorkspaceRow\(\) \{[\s\S]*?\n  \}/,
  )?.[0];
  assert.ok(row, 'post-import workspace row is no longer liftable from overlay.js');
  assert.match(row, /Save this setup as a workspace…/);
  assert.match(row, /Named Workspaces can save this whole setup for later/);
  assert.match(row, /beginSaveWorkspace\(\)/, 'Patrons must enter the established save-as editor');
  assert.match(row, /openPage\('settings', 'patron'\)/, 'non-Patrons use the existing learn-more surface');
  assert.doesNotMatch(row, /buy\.polar|checkout/i, 'the post-import handoff never opens checkout');
  assert.match(overlaySource, /purpose\.postImportWorkspace === true/);
});

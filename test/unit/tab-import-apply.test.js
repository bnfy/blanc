const assert = require('node:assert/strict');
const test = require('node:test');
const { planTabImportApply } = require('../../src/main/tab-import-apply');

const candidates = [
  {
    candidateId: 'preview-first',
    url: 'https://first.example/',
    title: 'First',
    favicon: null,
    pinned: true,
  },
  {
    candidateId: 'work-b',
    url: 'https://work.example/b',
    title: 'Work B',
    favicon: null,
    pinned: false,
  },
  {
    candidateId: 'work-a',
    url: 'https://work.example/a',
    title: 'Work A',
    favicon: null,
    pinned: false,
  },
];

const proposal = {
  version: 1,
  groups: [{
    suggestionId: 'suggestion-work',
    name: ' Work ',
    candidateIds: ['work-a', 'work-b'],
    confidence: 'high',
  }],
  ungroupedCandidateIds: ['preview-first'],
};

test('planner preserves preview order and focuses the first candidate', () => {
  const plan = planTabImportApply({
    candidates,
    proposal,
    existingGroupNames: [],
  });
  assert.deepEqual(
    plan.tabs.map((tab) => tab.candidateId),
    ['preview-first', 'work-b', 'work-a'],
  );
  assert.deepEqual(
    plan.tabs.map((tab) => tab.groupName),
    [null, 'work', 'work'],
  );
  assert.equal(plan.focusCandidateId, 'preview-first');
  assert.deepEqual(plan.tabs.map((tab) => tab.pinned), [true, false, false]);
  assert.equal('favoriteEntries' in plan, false);
});

test('planner marks exact lowercase group collisions for merge', () => {
  const mergeCandidates = [
    ...candidates.slice(1),
    {
      candidateId: 'reading-a',
      url: 'https://reading.example/a',
      title: 'Reading A',
      favicon: null,
      pinned: false,
    },
    {
      candidateId: 'reading-b',
      url: 'https://reading.example/b',
      title: 'Reading B',
      favicon: null,
      pinned: false,
    },
  ];
  const plan = planTabImportApply({
    candidates: mergeCandidates,
    proposal: {
      ...proposal,
      groups: [
        proposal.groups[0],
        {
          suggestionId: 'suggestion-reading',
          name: 'reading',
          candidateIds: ['reading-a', 'reading-b'],
          confidence: 'review',
        },
      ],
      ungroupedCandidateIds: [],
    },
    existingGroupNames: ['WORK'],
  });
  assert.deepEqual(plan.groups, [
    {
      name: 'work',
      candidateIds: ['work-a', 'work-b'],
      action: 'merge',
    },
    {
      name: 'reading',
      candidateIds: ['reading-a', 'reading-b'],
      action: 'create',
    },
  ]);
});

test('planner rejects malformed or non-partitioning proposals without mutation', () => {
  const input = structuredClone(candidates);
  const malformed = planTabImportApply({
    candidates: input,
    proposal: {
      ...proposal,
      groups: [{ ...proposal.groups[0], candidateIds: ['work-a', 'unknown'] }],
    },
    existingGroupNames: [],
  });
  assert.deepEqual(malformed, { error: 'invalid-proposal' });
  assert.deepEqual(input, candidates);
});

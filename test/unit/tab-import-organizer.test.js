const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  CLUSTER_THRESHOLD,
  MAX_GROUPS,
  MIN_GROUP_SIZE,
  sanitizeCandidateInput,
  deriveGroupName,
  proposeFromFolders,
  proposeFromSourceGroups,
  proposeFromEmbeddings,
  validateProposal,
  cosineSimilarity,
} = require('../../src/main/tab-import-organizer');

const fixture = (name) => JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'tab-import', name), 'utf8'),
);

let seq = 0;
const randomId = () => `sug-${++seq}`;

test('sanitizeCandidateInput bounds title and folder path', () => {
  const row = sanitizeCandidateInput({
    candidateId: 'c-1',
    title: '  Line\nbreak  ',
    hostname: 'example.com',
    folderPath: ['  Work  ', ''],
  });
  assert.equal(row.title, 'Line break');
  assert.deepEqual(row.folderPath, ['Work']);
});

test('proposeFromFolders anchors folders with at least two members', () => {
  const { candidates } = fixture('folder-suggestion.json');
  const proposal = proposeFromFolders(candidates, { randomId });
  assert.equal(proposal.version, 1);
  assert.equal(proposal.groups.length, 1);
  assert.equal(proposal.groups[0].name, 'project atlas');
  assert.deepEqual(proposal.groups[0].candidateIds, ['atlas-a', 'atlas-b']);
  assert.deepEqual(proposal.ungroupedCandidateIds, ['solo-c']);
  assert.equal(proposal.groups[0].confidence, 'high');
});

test('proposeFromSourceGroups preserves eligible named groups without inventing placeholders', () => {
  const proposal = proposeFromSourceGroups([
    { candidateId: 'a', title: 'A', hostname: 'a.example', sourceGroupName: ' Project Atlas ' },
    { candidateId: 'b', title: 'B', hostname: 'b.example', sourceGroupName: 'project atlas' },
    { candidateId: 'c', title: 'C', hostname: 'c.example', sourceGroupName: 'single' },
    { candidateId: 'd', title: 'D', hostname: 'd.example', sourceGroupName: null },
  ], { randomId });
  assert.equal(proposal.groups.length, 1);
  assert.equal(proposal.groups[0].name, 'project atlas');
  assert.deepEqual(proposal.groups[0].candidateIds, ['a', 'b']);
  assert.deepEqual(proposal.ungroupedCandidateIds, ['c', 'd']);
  assert.equal(JSON.stringify(proposal).includes('imported tabs'), false);
});

test('deriveGroupName avoids generic placeholders', () => {
  assert.equal(
    deriveGroupName([
      { title: 'misc stuff', folderPath: [], hostname: 'x.com' },
      { title: 'more misc', folderPath: [], hostname: 'x.com' },
    ]),
    null,
  );
  assert.equal(
    deriveGroupName([
      { title: 'Design References', folderPath: ['design refs'], hostname: 'figma.com' },
      { title: 'Design System', folderPath: ['design refs'], hostname: 'figma.com' },
    ]),
    'design refs',
  );
});

test('validateProposal rejects malformed and incomplete proposals', () => {
  const selected = ['a', 'b', 'c'];
  const valid = validateProposal({
    version: 1,
    groups: [{ suggestionId: 'g1', name: 'work', candidateIds: ['a', 'b'], confidence: 'high' }],
    ungroupedCandidateIds: ['c'],
  }, { selectedIds: selected, excludedIds: [] });
  assert.equal(valid.ok, true);

  assert.equal(
    validateProposal({
      version: 1,
      groups: [{ suggestionId: 'g1', name: 'misc', candidateIds: ['a', 'b'], confidence: 'high' }],
      ungroupedCandidateIds: ['c'],
    }, { selectedIds: selected }).reason,
    'generic-name',
  );
  assert.equal(
    validateProposal({
      version: 1,
      groups: [{ suggestionId: 'g1', name: 'work', candidateIds: ['a'], confidence: 'high' }],
      ungroupedCandidateIds: ['b', 'c'],
    }, { selectedIds: selected }).reason,
    'group-too-small',
  );
  assert.equal(
    validateProposal({
      version: 1,
      groups: [{ suggestionId: 'g1', name: 'work', candidateIds: ['a', 'a'], confidence: 'high' }],
      ungroupedCandidateIds: ['b', 'c'],
    }, { selectedIds: selected }).reason,
    'duplicate-candidate',
  );
  assert.equal(
    validateProposal({
      version: 1,
      groups: [{ suggestionId: 'g1', name: 'work', candidateIds: ['a', 'b'], confidence: 'high' }],
      ungroupedCandidateIds: ['c'],
    }, { selectedIds: selected, excludedIds: ['b'] }).reason,
    'excluded-candidate',
  );
});

test('proposeFromEmbeddings clusters fixed fixture vectors deterministically', () => {
  const candidates = [
    { candidateId: 'a', title: 'Alpha docs', hostname: 'alpha.example', folderPath: [] },
    { candidateId: 'b', title: 'Alpha sheet', hostname: 'alpha.example', folderPath: [] },
    { candidateId: 'c', title: 'Beta page', hostname: 'beta.example', folderPath: [] },
  ];
  const embeddingMatrix = [
    [1, 0, 0],
    [0.99, 0.01, 0],
    [0, 1, 0],
  ];
  assert.ok(cosineSimilarity(embeddingMatrix[0], embeddingMatrix[1]) >= CLUSTER_THRESHOLD);
  assert.ok(cosineSimilarity(embeddingMatrix[0], embeddingMatrix[2]) < CLUSTER_THRESHOLD);

  const proposal = proposeFromEmbeddings(candidates, embeddingMatrix, {
    threshold: CLUSTER_THRESHOLD,
    randomId,
  });
  assert.equal(proposal.groups.length, 1);
  assert.deepEqual(proposal.groups[0].candidateIds, ['a', 'b']);
  assert.deepEqual(proposal.ungroupedCandidateIds, ['c']);
});

test('proposal output caps group count at twelve', () => {
  const candidates = [];
  const groups = [];
  for (let i = 0; i < 13; i += 1) {
    const a = `c-${i}a`;
    const b = `c-${i}b`;
    candidates.push(
      { candidateId: a, title: `Topic ${i} A`, hostname: `t${i}.example`, folderPath: [`topic-${i}`] },
      { candidateId: b, title: `Topic ${i} B`, hostname: `t${i}.example`, folderPath: [`topic-${i}`] },
    );
  }
  const proposal = proposeFromFolders(candidates, { randomId });
  assert.equal(proposal.groups.length, MAX_GROUPS);
  const groupedCount = proposal.groups.reduce((sum, group) => sum + group.candidateIds.length, 0);
  assert.equal(
    groupedCount + proposal.ungroupedCandidateIds.length,
    candidates.length,
  );
});

test('constants match organizer bounds', () => {
  assert.equal(MIN_GROUP_SIZE, 2);
  assert.equal(MAX_GROUPS, 12);
  assert.equal(CLUSTER_THRESHOLD, 0.72);
});

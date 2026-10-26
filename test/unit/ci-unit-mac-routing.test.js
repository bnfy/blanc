'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const workflow = fs.readFileSync(path.join(__dirname, '../../.github/workflows/unit-tests.yml'), 'utf8');

test('unit runner routing uses the dedicated Mac only for trusted macOS jobs', () => {
  const expression = workflow.match(/^\s*runs-on: \$\{\{ (.+) \}\}$/m)?.[1];
  assert.ok(expression, 'unit job has an explicit runner expression');
  // Evaluate the small Actions expression against trusted and fork contexts.
  const route = new Function('matrix', 'vars', 'github', 'fromJSON', `return (${expression});`);
  const configured = '["self-hosted","macOS","ARM64","blanc-ci"]';
  for (const os of ['windows-latest', 'macos-15']) {
    for (const event of ['pull_request', 'push', 'workflow_dispatch']) {
      for (const sameRepository of [true, false]) {
        for (const labels of ['', configured]) {
          const github = {event_name: event, repository: 'bnfy/blanc', event: {
            pull_request: {head: {repo: {full_name: sameRepository ? 'bnfy/blanc' : 'someone/fork'}}}
          }};
          const expected = os === 'macos-15' && labels && (event !== 'pull_request' || sameRepository)
            ? JSON.parse(configured) : os;
          assert.deepEqual(route({os}, {MAC_RUNNER_LABELS: labels}, github, JSON.parse), expected,
            `${os}, ${event}, sameRepository=${sameRepository}, configured=${!!labels}`);
        }
      }
    }
  }
  assert.match(workflow, /os: \[windows-latest, macos-15\]/);
  assert.match(workflow, /run: npm run test:unit/);
});

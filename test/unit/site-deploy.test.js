const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');

test('site deploy pins Cloudflare Pages production instead of detached HEAD preview', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const command = pkg.scripts?.['site:deploy'] || '';

  assert.match(command, /wrangler pages deploy site\/dist\b/);
  assert.match(command, /--project-name=blancbrowser\b/);
  assert.match(command, /--branch=main\b/);
});

test('agent release runbooks require a production deployment assertion', () => {
  for (const file of ['AGENTS.md', 'CLAUDE.md', 'site/CLAUDE.md', 'docs/release-verification.md']) {
    const contents = fs.readFileSync(path.join(ROOT, file), 'utf8');
    assert.match(contents, /--branch=main/, `${file} must preserve the production branch flag`);
    assert.match(contents, /Production/, `${file} must require a production-environment check`);
  }
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const ledger = JSON.parse(read('docs/website-v1.15-claims.json'));
const normalize = text => text.replace(/<[^>]*>/g, '').replace(/&rsquo;/g, '’').replace(/&lsquo;/g, '‘').replace(/&amp;/g, '&').replace(/&ldquo;/g, '“').replace(/&rdquo;/g, '”').replace(/\s+/g, ' ').trim();

test('the website claim ledger resolves to public v1.15.0 and contains no publication blockers', () => {
  assert.equal(ledger.publicRelease, 'v1.15.0');
  assert.equal(execFileSync('git', ['rev-parse', ledger.publicRelease], { cwd: root, encoding: 'utf8' }).trim(), ledger.sourceSha);
  assert.ok(ledger.claims.length > 200);
  const paths = new Set();
  for (const claim of ledger.claims) {
    assert.ok(['verified', 'qualified'].includes(claim.verdict), claim.id);
    const source = read(claim.source);
    assert.ok(normalize(source).includes(claim.exactWording) || source.replace(/\s+/g, ' ').includes(claim.exactWording), `${claim.id}: exact wording drifted`);
    for (const key of claim.evidenceGroups) {
      const group = ledger.evidenceGroups[key];
      assert.ok(group?.qualification && group.evidence.length, `${claim.id}: release evidence and qualifications`);
      for (const file of group.evidence) paths.add(file);
    }
  }
  for (const file of paths) execFileSync('git', ['cat-file', '-e', `${ledger.publicRelease}:${file}`], { cwd: root });
});

test('new guide benefit and qualification paragraphs remain covered by the exact-wording ledger', () => {
  for (const slug of ['start-page', 'glance', 'workspaces', 'profiles', 'reopen-closed-tabs']) {
    const file = `site/src/pages/features/${slug}.astro`;
    const claims = new Set(ledger.claims.filter(claim => claim.source === file).map(claim => claim.exactWording));
    for (const match of read(file).matchAll(/<(h[123]|p|figcaption)\b[^>]*>([\s\S]*?)<\/\1>/g)) {
      const wording = normalize(match[2]);
      if (wording.length > 20) assert.ok(claims.has(wording), `${slug}: unrecorded wording: ${wording}`);
    }
  }
});

test('public product captures match their reviewed dimensions, hashes, and source release', () => {
  const manifest = JSON.parse(read('docs/website-captures-v1.15.json'));
  assert.equal(manifest.release, ledger.publicRelease);
  assert.equal(manifest.sourceSha, ledger.sourceSha);
  assert.equal(manifest.settings.usagePing, false);
  assert.equal(manifest.settings.searchSuggestions, false);
  assert.equal(manifest.captures.length, 10);
  for (const capture of manifest.captures) {
    const bytes = fs.readFileSync(path.join(root, capture.file));
    assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
    assert.deepEqual([bytes.readUInt32BE(16), bytes.readUInt32BE(20)], [1440, 900]);
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), capture.sha256, capture.file);
    assert.equal(capture.verdict, 'verified');
    assert.ok(capture.state && capture.evidence.length);
  }
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('sharp');
const { execFileSync } = require('node:child_process');
const { runInNewContext } = require('node:vm');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const ledger = JSON.parse(read('docs/website-revamp-claims-v1.27.json'));
const captureLedger = JSON.parse(read('docs/website-trust-claims-v1.25.json'));
const previousLedger = JSON.parse(read('docs/website-v1.21-claims.json'));
const historicalLedger = JSON.parse(read('docs/website-v1.15-claims.json'));
const entities = { rsquo: '’', lsquo: '‘', amp: '&', ldquo: '“', rdquo: '”' };
// Compare source text only; consume incomplete tags and decode entities once.
const normalize = text => text.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*(?:>|$)/g, '').replace(/&(rsquo|lsquo|amp|ldquo|rdquo);/g, (_, name) => entities[name]).replace(/\s+/g, ' ').trim();

test('the public-release claim ledger resolves to verified v1.27.0, including blocking providers', () => {
  assert.equal(ledger.publicRelease, 'v1.27.0');
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

test('current authentication claims link completed evidence rather than the preparation record', () => {
  const completed = execFileSync('git', ['show', `${ledger.completedReleaseEvidenceRevision}:${ledger.releaseEvidence}`], {cwd:root,encoding:'utf8'});
  assert.ok(completed.includes(ledger.sourceSha));
  assert.match(completed, /Publication and independent verification/);
  assert.match(completed, /Adjacent public updater handoffs/);
  assert.ok(read('site/src/components/ReleaseEvidence.astro').includes(ledger.completedReleaseEvidenceRevision));
});

test('the v1.15 claim ledger remains paired with its immutable release evidence', () => {
  assert.equal(historicalLedger.publicRelease, 'v1.15.0');
  assert.equal(
    execFileSync('git', ['rev-parse', historicalLedger.publicRelease], { cwd: root, encoding: 'utf8' }).trim(),
    historicalLedger.sourceSha
  );
});

test('new guide benefit and qualification paragraphs remain covered by the exact-wording ledger', () => {
  for (const slug of ['start-page', 'glance', 'workspaces', 'profiles', 'reopen-closed-tabs', '1password']) {
    const file = `site/src/components/guides/${slug}.astro`;
    const claims = new Set(ledger.claims.filter(claim => claim.source === file).map(claim => claim.exactWording));
    for (const match of read(file).matchAll(/<(h[123]|p|figcaption)\b[^>]*>([\s\S]*?)<\/\1>/g)) {
      const wording = normalize(match[2]);
      if (wording.length > 20) assert.ok(claims.has(wording), `${slug}: unrecorded wording: ${wording}`);
    }
  }
});

test('search landing pages are fully covered by the exact-wording ledger and link their external sources', () => {
  const sources = new Set((ledger.externalSources || []).map(source => source.url));
  for (const file of ['site/src/pages/arc-alternative.astro', 'site/src/pages/ublock-origin-after-chrome.astro']) {
    const page = read(file);
    const claims = ledger.claims.filter(claim => claim.source === file);
    const wording = new Set(claims.map(claim => claim.exactWording));
    for (const match of page.matchAll(/<(h[123]|p|figcaption)\b[^>]*>([\s\S]*?)<\/\1>/g)) {
      assert.ok(wording.has(normalize(match[2])), `${file}: unrecorded wording: ${normalize(match[2])}`);
    }
    // A claim about another product rests on a recorded first-party source the page links.
    for (const claim of claims) {
      if (claim.evidenceGroups.length === 0) assert.ok(claim.externalSources?.length, `${claim.id}: no release evidence or external source`);
      for (const url of claim.externalSources || []) {
        assert.ok(sources.has(url), `${claim.id}: unrecorded external source ${url}`);
        assert.ok(page.includes(`href="${url}"`), `${claim.id}: the page does not link ${url}`);
      }
    }
  }
});

test('drag-to-reorder copy resolves to verified public v1.30.0 evidence', () => {
  const reorder = JSON.parse(read('docs/website-reorder-claims-v1.30.json'));
  assert.equal(reorder.publicRelease, 'v1.30.0');
  assert.equal(execFileSync('git', ['rev-parse', `${reorder.publicRelease}^{commit}`], { cwd: root, encoding: 'utf8' }).trim(), reorder.sourceSha);
  assert.ok(read(reorder.releaseEvidence).includes(reorder.sourceSha));
  for (const claim of reorder.claims) {
    assert.ok(['verified', 'qualified'].includes(claim.verdict), claim.id);
    assert.ok(normalize(read(claim.source)).includes(claim.exactWording), `${claim.id}: exact wording drifted`);
    for (const key of claim.evidenceGroups) {
      const group = reorder.evidenceGroups[key];
      assert.ok(group?.qualification && group.evidence.length, `${claim.id}: release evidence and qualifications`);
      for (const file of group.evidence) execFileSync('git', ['cat-file', '-e', `${reorder.publicRelease}:${file}`], { cwd: root });
    }
  }
  // Any sentence on these pages about dragging or keyboard-moving tabs, groups
  // or headers must be a recorded claim here or in the v1.27 ledger.
  const recorded = [...reorder.claims, ...ledger.claims].map(claim => claim.exactWording);
  for (const file of new Set(reorder.claims.map(claim => claim.source))) {
    const prose = [...read(file).matchAll(/<(h[1-6]|p|figcaption)\b[^>]*>([\s\S]*?)<\/\1>/g)].map(match => normalize(match[2]));
    for (const sentence of prose.flatMap(text => text.split(/(?<=[.!?])\s+/))) {
      if (!/\bdrag\b.*\b(tabs?|groups?|header)\b|Shift\+Up/i.test(sentence)) continue;
      assert.ok(recorded.some(wording => wording.includes(sentence)), `${file}: unrecorded reorder wording: ${sentence}`);
    }
  }
});

test('Features bento copy resolves to verified public v1.30.0 evidence, and every sentence on it is recorded', () => {
  const bento = JSON.parse(read('docs/website-features-bento-claims-v1.30.json'));
  const reorder = JSON.parse(read('docs/website-reorder-claims-v1.30.json'));
  const file = 'site/src/pages/features.astro';
  assert.equal(bento.publicRelease, 'v1.30.0');
  assert.equal(execFileSync('git', ['rev-parse', `${bento.publicRelease}^{commit}`], { cwd: root, encoding: 'utf8' }).trim(), bento.sourceSha);
  assert.ok(read(bento.releaseEvidence).includes(bento.sourceSha));
  const page = read(file);
  for (const claim of bento.claims) {
    assert.equal(claim.source, file, claim.id);
    assert.ok(['verified', 'qualified'].includes(claim.verdict), claim.id);
    assert.ok(normalize(page).includes(claim.exactWording), `${claim.id}: exact wording drifted`);
    for (const key of claim.evidenceGroups) {
      const group = bento.evidenceGroups[key];
      assert.ok(group?.qualification && group.evidence.length, `${claim.id}: release evidence and qualifications`);
      for (const evidence of group.evidence) execFileSync('git', ['cat-file', '-e', `${bento.publicRelease}:${evidence}`], { cwd: root });
    }
  }
  // Every text element above the unchanged Patron and download sections is a
  // recorded claim in this ledger, the reorder ledger, or the v1.27 ledger.
  const recorded = [...bento.claims, ...reorder.claims, ...ledger.claims].filter(claim => claim.source === file).map(claim => claim.exactWording);
  const scope = page.slice(page.indexOf('<main'), page.indexOf('class="bento-patron"'));
  for (const [, , text] of scope.matchAll(/<(h[1-6]|p|figcaption|li|button)\b[^>]*>([\s\S]*?)<\/\1>/g)) {
    const wording = normalize(text);
    // Glyph-only controls (the popover's ← and → buttons) carry no claim.
    if (/\p{L}/u.test(wording)) assert.ok(recorded.includes(wording), `${file}: unrecorded copy: ${wording}`);
  }
});

test('public product captures match their reviewed dimensions, hashes, and source release', () => {
  const manifests = [
    ['docs/website-captures-v1.15.json', historicalLedger.publicRelease, historicalLedger.sourceSha, 10],
    ['docs/website-captures-v1.21.json', previousLedger.publicRelease, previousLedger.sourceSha, 5],
  ];
  for (const [file, release, sourceSha, expectedCount] of manifests) {
    const manifest = JSON.parse(read(file));
    assert.equal(manifest.release, release);
    assert.equal(manifest.sourceSha, sourceSha);
    assert.equal(execFileSync('git', ['rev-parse', manifest.release], { cwd: root, encoding: 'utf8' }).trim(), manifest.sourceSha);
    assert.equal(manifest.settings.usagePing, false);
    assert.equal(manifest.settings.searchSuggestions, false);
    assert.equal(manifest.captures.length, expectedCount);
    for (const capture of manifest.captures) {
      const bytes = fs.readFileSync(path.join(root, capture.file));
      assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
      assert.deepEqual([bytes.readUInt32BE(16), bytes.readUInt32BE(20)], [capture.width, capture.height]);
      assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), capture.sha256, capture.file);
      assert.equal(capture.verdict, 'verified');
      assert.ok(capture.state && capture.evidence.length);
    }
  }
});

test('the new homepage capture is tied to public v1.25.0 and its faithful export', () => {
  const manifest = JSON.parse(read('docs/website-trust-capture-v1.25.json'));
  assert.equal(manifest.release, captureLedger.publicRelease);
  assert.equal(manifest.sourceSha, captureLedger.sourceSha);
  for (const item of [manifest, manifest.displayAsset]) {
    const bytes = fs.readFileSync(path.join(root, item.file));
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), item.sha256);
  }
  const homepage = read('site/src/pages/index.astro');
  const wallpaper = JSON.parse(read('docs/website-wallpaper-captures-v1.25.json'));
  assert.ok(homepage.includes(wallpaper.captures[0].displayAsset.file.replace('site/public', '')));
  assert.match(homepage, /aria-label="Blanc v1\.25\.0 Billboard Start Page/);
});


test('hero wallpaper scenes retain actual public captures and phase provenance', async () => {
  const manifest = JSON.parse(read('docs/website-wallpaper-captures-v1.25.json'));
  assert.equal(manifest.release, captureLedger.publicRelease);
  assert.equal(manifest.sourceSha, captureLedger.sourceSha);
  assert.equal(manifest.settings.newtabDynamicWallpaper, true);
  assert.equal(manifest.settings.layout, 'billboard');
  assert.equal(manifest.settings.usagePing, false);
  assert.equal(manifest.settings.searchSuggestions, false);
  assert.deepEqual(manifest.captures.map(item => [item.phase, item.theme]), ['dawn', 'day', 'dusk', 'night'].flatMap(phase => [[phase, 'light'], [phase, 'dark']]));
  const releasedModule = { exports: {} };
  runInNewContext(execFileSync('git', ['show', `${captureLedger.publicRelease}:src/renderer/pages/newtab-wallpaper.js`], { cwd: root, encoding: 'utf8' }), { module: releasedModule });
  const policy = releasedModule.exports;
  for (const capture of manifest.captures) {
    const fixture = new Date(2026, 9, 2, capture.localHourFixture);
    assert.equal(policy.phaseForTime(fixture), capture.phase);
    assert.match(capture.chromeTint, /^#[0-9a-f]{6}$/);
    const expected = [1, 3, 5].map(i => parseInt(capture.chromeTint.slice(i, i + 2), 16));
    for (const item of [capture, capture.displayAsset]) {
      const { data } = await sharp(path.join(root, item.file)).extract({
        left: Math.round(item.width * 0.15), top: Math.round(item.height * 0.02), width: 1, height: 1,
      }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      assert.ok(expected.every((value, i) => Math.abs(value - data[i]) <= 2), `${capture.phase}: native tint matches the screenshot strip`);
    }
    for (const item of [capture, capture.displayAsset]) {
      const bytes = fs.readFileSync(path.join(root, item.file));
      assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), item.sha256);
    }
    const bytes = fs.readFileSync(path.join(root, capture.file));
    assert.deepEqual([bytes.readUInt32BE(16), bytes.readUInt32BE(20)], [capture.width, capture.height]);
    assert.ok(read('site/src/pages/index.astro').includes(capture.displayAsset.file.replace('site/public', '')));
  }
});

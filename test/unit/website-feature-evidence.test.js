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
const v132Ledger = JSON.parse(read('docs/website-v1.32-claims.json'));
const v133Ledger = JSON.parse(read('docs/website-v1.33-claims.json'));
const v134Ledger = JSON.parse(read('docs/website-v1.34-claims.json'));
const cinemaLedger = JSON.parse(read('docs/website-cinematic-homepage-claims-v1.34.json'));
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
    const claims = new Set([...ledger.claims, ...v132Ledger.claims, ...v133Ledger.claims].filter(claim => claim.source === file).map(claim => claim.exactWording));
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
    const claims = [...ledger.claims, ...v132Ledger.claims, ...v133Ledger.claims].filter(claim => claim.source === file);
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

test('v1.32.0 Arc import, interface-language and /space copy resolves to verified public v1.32.0 evidence', () => {
  assert.equal(v132Ledger.publicRelease, 'v1.32.0');
  assert.equal(execFileSync('git', ['rev-parse', `${v132Ledger.publicRelease}^{commit}`], { cwd: root, encoding: 'utf8' }).trim(), v132Ledger.sourceSha);
  assert.ok(read(v132Ledger.releaseEvidence).includes(v132Ledger.sourceSha));
  for (const claim of v132Ledger.claims) {
    assert.ok(['verified', 'qualified'].includes(claim.verdict), claim.id);
    const source = read(claim.source);
    assert.ok(normalize(source).includes(claim.exactWording) || source.replace(/\s+/g, ' ').includes(claim.exactWording), `${claim.id}: exact wording drifted`);
    assert.ok(claim.evidenceGroups.length, `${claim.id}: no release evidence`);
    for (const key of claim.evidenceGroups) {
      const group = v132Ledger.evidenceGroups[key];
      assert.ok(group?.qualification && group.evidence.length, `${claim.id}: release evidence and qualifications`);
      for (const file of group.evidence) execFileSync('git', ['cat-file', '-e', `${v132Ledger.publicRelease}:${file}`], { cwd: root });
    }
  }
  // Any sentence on these pages about importing from Arc or about Blanc's
  // interface languages must be a recorded claim in this ledger or the v1.27 one.
  const recorded = [...v132Ledger.claims, ...v133Ledger.claims, ...ledger.claims].map(claim => claim.exactWording);
  const topic = /\bArc\b.*\b(Spaces?|import|sidebar|Favorites|StorableSidebar)\b|\b(German|Spanish|French|Portuguese|Italian|Dutch|Polish|Russian|Ukrainian|Turkish|Arabic|Hebrew|Hindi|Chinese|Japanese|Korean|Swedish|Danish|Norwegian|Finnish)\b|\binterface languages?\b|\btranslat(e|ed|ion|ions)\b/i;
  for (const file of new Set(v132Ledger.claims.map(claim => claim.source))) {
    const text = read(file);
    const blocks = file.endsWith('.json')
      ? JSON.parse(text).flatMap(entry => [entry.q, ...entry.a])
      : [...text.matchAll(/<(h[1-6]|p|figcaption|li)\b[^>]*>([\s\S]*?)<\/\1>/g)].map(match => normalize(match[2]));
    for (const sentence of blocks.flatMap(block => block.split(/(?<=[.!?])\s+/))) {
      if (!topic.test(sentence)) continue;
      assert.ok(recorded.some(wording => wording.includes(sentence)), `${file}: unrecorded v1.32.0 wording: ${sentence}`);
    }
  }
  // v1.32.0 made the Arc page's old "cannot import" wording false.
  assert.doesNotMatch(read('site/src/pages/arc-alternative.astro'), /does not import directly from Arc|import your Arc data/);
});

test('v1.33.0 free Blanc Spaces copy resolves to verified public v1.33.0 evidence', () => {
  assert.equal(v133Ledger.publicRelease, 'v1.33.0');
  assert.equal(execFileSync('git', ['rev-parse', `${v133Ledger.publicRelease}^{commit}`], { cwd: root, encoding: 'utf8' }).trim(), v133Ledger.sourceSha);
  assert.ok(read(v133Ledger.releaseEvidence).includes(v133Ledger.sourceSha));
  for (const claim of v133Ledger.claims) {
    assert.ok(['verified', 'qualified'].includes(claim.verdict), claim.id);
    const source = read(claim.source);
    assert.ok(normalize(source).includes(claim.exactWording) || source.replace(/\s+/g, ' ').includes(claim.exactWording), `${claim.id}: exact wording drifted`);
    assert.ok(claim.evidenceGroups.length, `${claim.id}: no release evidence`);
    for (const key of claim.evidenceGroups) {
      const group = v133Ledger.evidenceGroups[key];
      assert.ok(group?.qualification && group.evidence.length, `${claim.id}: release evidence and qualifications`);
      for (const file of group.evidence) execFileSync('git', ['cat-file', '-e', `${v133Ledger.publicRelease}:${file}`], { cwd: root });
    }
  }
  // Since v1.33.0 Patron unlocks nothing: no page this ledger covers may tie
  // Patron to Blanc Spaces, its creation gate or its lapse rules again.
  for (const file of new Set(v133Ledger.claims.map(claim => claim.source))) {
    const text = file.endsWith('.json') ? JSON.parse(read(file)).flatMap(entry => [entry.q, ...entry.a]).join(' ') : normalize(read(file));
    assert.doesNotMatch(text, /Patron adds|with Blanc Patron,|Active Patrons can|requires an active Patron|active Patron membership|Blanc Spaces is a Patron feature|If membership lapses/i, `${file}: retired Patron gate`);
  }
});

test('v1.34.0 Kagi and custom search copy resolves to verified public v1.34.0 evidence', () => {
  assert.equal(v134Ledger.publicRelease, 'v1.34.0');
  assert.equal(execFileSync('git', ['rev-parse', `${v134Ledger.publicRelease}^{commit}`], { cwd: root, encoding: 'utf8' }).trim(), v134Ledger.sourceSha);
  assert.ok(read(v134Ledger.releaseEvidence).includes(v134Ledger.sourceSha));
  for (const claim of v134Ledger.claims) {
    assert.ok(['verified', 'qualified'].includes(claim.verdict), claim.id);
    const source = read(claim.source);
    assert.ok(normalize(source).includes(claim.exactWording) || source.replace(/\s+/g, ' ').includes(claim.exactWording), `${claim.id}: exact wording drifted`);
    assert.ok(claim.evidenceGroups.length, `${claim.id}: no release evidence`);
    for (const key of claim.evidenceGroups) {
      const group = v134Ledger.evidenceGroups[key];
      assert.ok(group?.qualification && group.evidence.length, `${claim.id}: release evidence and qualifications`);
      for (const file of group.evidence) execFileSync('git', ['cat-file', '-e', `${v134Ledger.publicRelease}:${file}`], { cwd: root });
    }
  }
  // Kagi needs an account: wherever the site names Kagi as a search engine,
  // that qualification travels with it.
  for (const file of new Set(v134Ledger.claims.map(claim => claim.source))) {
    const text = normalize(read(file));
    if (/\bKagi\b/.test(text)) assert.match(text, /Kagi needs a Kagi account/, `${file}: Kagi without its account qualification`);
    assert.doesNotMatch(text, /Search with DuckDuckGo, Google, Bing or Brave\./, `${file}: retired four-engine wording`);
  }
});

test('the cinematic homepage copy resolves to public v1.34.0 evidence and dated first-party Chrome sources', () => {
  assert.equal(cinemaLedger.publicRelease, 'v1.34.0');
  assert.equal(execFileSync('git', ['rev-parse', `${cinemaLedger.publicRelease}^{commit}`], { cwd: root, encoding: 'utf8' }).trim(), cinemaLedger.sourceSha);
  assert.ok(read(cinemaLedger.releaseEvidence).includes(cinemaLedger.sourceSha));
  const drifted = (claim) => {
    const source = read(claim.source);
    return !(normalize(source).includes(claim.exactWording) || source.replace(/\s+/g, ' ').includes(claim.exactWording));
  };
  for (const claim of cinemaLedger.claims) {
    assert.ok(['verified', 'qualified'].includes(claim.verdict), claim.id);
    assert.ok(!drifted(claim), `${claim.id}: exact wording drifted`);
    assert.ok(claim.evidenceGroups.length, `${claim.id}: no release evidence`);
    for (const key of claim.evidenceGroups) {
      const group = cinemaLedger.evidenceGroups[key];
      assert.ok(group?.qualification && group.evidence.length, `${claim.id}: release evidence and qualifications`);
      for (const file of group.evidence) execFileSync('git', ['cat-file', '-e', `${cinemaLedger.publicRelease}:${file}`], { cwd: root });
    }
  }
  // Claims about Chrome cite Google's own pages, read on a stated date.
  assert.match(cinemaLedger.accessed, /^\d{4}-\d{2}-\d{2}$/);
  for (const claim of cinemaLedger.externalClaims) {
    assert.ok(['verified', 'qualified'].includes(claim.verdict), claim.id);
    assert.ok(!drifted(claim), `${claim.id}: exact wording drifted`);
    assert.ok(claim.sources.length && claim.sources.every(url => /^https:\/\/(support\.google\.com|developer\.chrome\.com|chromewebstore\.google\.com)\//.test(url)), `${claim.id}: first-party source`);
  }
});

test('every sentence on the homepage is recorded in a claims ledger or named as a label', () => {
  const file = 'site/src/pages/index.astro';
  const source = read(file);
  const recorded = [cinemaLedger, ledger, v132Ledger, v133Ledger, v134Ledger, JSON.parse(read('docs/website-reorder-claims-v1.30.json'))]
    .flatMap(item => [...item.claims, ...(item.externalClaims || [])])
    .filter(claim => claim.source === file)
    .map(claim => claim.exactWording)
    .concat(cinemaLedger.labels);
  const markup = source.slice(source.indexOf('<BaseLayout'));
  const units = [...markup.matchAll(/<(h[1-6]|p|li|figcaption|caption|strong)\b[^>]*>([\s\S]*?)<\/\1>/g)]
    .map(match => normalize(match[2])).filter(text => text && !text.includes('{'));
  // The switching steps, the comparison and the questions live in the
  // frontmatter as data, so their strings are checked as written there.
  const data = source.slice(0, source.indexOf('<BaseLayout'));
  for (const [, text] of data.matchAll(/(?:title|body|limit|step|note|label|name): "([^"]+)"/g)) units.push(text);
  for (const match of data.matchAll(/^\s*\["([^"]+)", "([^"]+)"(?:, "([^"]*)", "([^"]+)", "([^"]*)")?\],?$/gm)) {
    for (const text of match.slice(1)) if (text && !['yes', 'no', 'part'].includes(text)) units.push(text);
  }
  assert.ok(units.length > 100, 'homepage prose found');
  for (const unit of units) {
    if (recorded.some(wording => wording.includes(unit))) continue;
    for (const sentence of unit.split(/(?<=[.?!])\s+(?=[A-Z“])/)) {
      assert.ok(recorded.some(wording => wording.includes(sentence)), `homepage sentence is not recorded: “${sentence}”`);
    }
  }
});

test('feature guide pages show only ledger-recorded captures or same-size WebP companions of them', async () => {
  const ledgers = fs.readdirSync(path.join(root, 'docs')).filter(name => /^website-.*captures?-.*\.json$/.test(name));
  const recorded = new Set(ledgers.flatMap(name =>
    [...read(`docs/${name}`).matchAll(/"file": "site\/public\/(feature-captures\/[^"]+)"/g)].map(match => match[1])));
  const pagesDir = path.join(root, 'site/src/pages/features');
  for (const page of fs.readdirSync(pagesDir).filter(name => name.endsWith('.astro'))) {
    for (const [, file] of read(`site/src/pages/features/${page}`).matchAll(/\/(feature-captures\/[A-Za-z0-9._-]+)/g)) {
      if (recorded.has(file)) continue;
      const png = file.replace(/\.webp$/, '.png');
      assert.ok(file.endsWith('.webp') && recorded.has(png), `${page}: ${file} is not recorded in a capture ledger`);
      const [webpMeta, pngMeta] = await Promise.all([file, png].map(f => sharp(path.join(root, 'site/public', f)).metadata()));
      assert.deepEqual([webpMeta.width, webpMeta.height], [pngMeta.width, pngMeta.height], `${page}: ${file} differs in size from ${png}`);
    }
  }
});

test('Features bento copy resolves to verified public v1.30.1 evidence, and every sentence on it is recorded', () => {
  const bento = JSON.parse(read('docs/website-features-bento-claims-v1.30.json'));
  const reorder = JSON.parse(read('docs/website-reorder-claims-v1.30.json'));
  const file = 'site/src/pages/features.astro';
  assert.equal(bento.publicRelease, 'v1.30.1');
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
      // Observations of the installed public release: the shown value must be
      // one that was measured, and it must appear in the page's demo and copy.
      for (const measurement of group.measurements ?? []) {
        const record = JSON.parse(read(measurement));
        assert.equal(record.publicRelease, bento.publicRelease, measurement);
        assert.equal(`v${record.installedVersion}`, bento.publicRelease, measurement);
        assert.ok(record.runs.some(run => run.count === record.shown.count && new URL(run.finalUrl).hostname.endsWith(record.shown.host)), `${measurement}: shown value was measured`);
        const demo = read('site/src/components/bento/demos/ShieldDemo.astro');
        if (record.favicon) {
          assert.equal(require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(root, record.favicon.file))).digest('hex'), record.favicon.sha256, `${measurement}: favicon bytes`);
          assert.ok(demo.includes(record.favicon.file.replace('site/public', '')), `${measurement}: demo shows the recorded favicon`);
        }
        assert.ok(demo.includes(`host = '${record.shown.host}'`) && demo.includes(`count = ${record.shown.count};`), `${measurement}: demo shows the measured value`);
        if (claim.exactWording.includes(record.shown.host)) {
          assert.ok(claim.exactWording.includes(`The ${record.shown.count} shown was measured on ${record.shown.host}`), `${measurement}: note names the measured value`);
        }
      }
    }
  }
  for (const measurement of Object.values(bento.evidenceGroups).flatMap(group => group.measurements ?? [])) {
    const {shown} = JSON.parse(read(measurement));
    assert.ok(bento.claims.some(claim => claim.exactWording.includes(shown.host)), `${measurement}: the page says where its count came from`);
  }
  // Every text element above the unchanged Patron and download sections is a
  // recorded claim in this ledger, the reorder ledger, or the v1.27 ledger.
  const recorded = [...bento.claims, ...reorder.claims, ...ledger.claims, ...v132Ledger.claims, ...v133Ledger.claims, ...v134Ledger.claims].filter(claim => claim.source === file).map(claim => claim.exactWording);
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
    ['docs/website-captures-v1.30.1.json', 'v1.30.1', '9e337ac583e81bae509cfc970b9d97a81f3287ba', 4],
    ['docs/website-captures-v1.31.0.json', 'v1.31.0', '5bb0e0da01e05d612382fa99a434524ed2c5b108', 4],
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
  const wallpaper = JSON.parse(read('docs/website-wallpaper-captures-v1.31.0.json'));
  assert.ok(homepage.includes(wallpaper.captures[0].displayAsset.file.replace('site/public', '')));
  assert.match(homepage, /aria-label="Blanc v1\.31\.0 Billboard Start Page/);
});


test('hero wallpaper scenes retain actual public captures and phase provenance', async () => {
  const manifest = JSON.parse(read('docs/website-wallpaper-captures-v1.31.0.json'));
  assert.equal(manifest.release, 'v1.31.0');
  assert.equal(execFileSync('git', ['rev-parse', manifest.release], { cwd: root, encoding: 'utf8' }).trim(), manifest.sourceSha);
  assert.equal(manifest.settings.newtabDynamicWallpaper, true);
  assert.equal(manifest.settings.layout, 'billboard');
  assert.equal(manifest.settings.usagePing, false);
  assert.equal(manifest.settings.searchSuggestions, false);
  assert.deepEqual(manifest.captures.map(item => [item.phase, item.theme]), ['dawn', 'day', 'dusk', 'night'].flatMap(phase => [[phase, 'light'], [phase, 'dark']]));
  const releasedModule = { exports: {} };
  runInNewContext(execFileSync('git', ['show', `${manifest.release}:src/renderer/pages/newtab-wallpaper.js`], { cwd: root, encoding: 'utf8' }), { module: releasedModule });
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
  }
  // Every wallpaper capture the homepage shows is one of these ledgered scenes.
  const ledgered = new Set(manifest.captures.map(capture => capture.displayAsset.file.replace('site/public', '')));
  const shown = [...read('site/src/pages/index.astro').matchAll(/\/feature-captures\/home-wallpaper-[a-z-]+-v[\d.]+\.webp/g)].map(match => match[0]);
  assert.ok(shown.length > 0);
  for (const file of shown) assert.ok(ledgered.has(file), `${file} is not a ledgered wallpaper capture`);
});

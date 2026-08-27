const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('app chrome and internal pages have no live Google Fonts dependency', () => {
  const files = [
    'src/renderer/index.html',
    'src/renderer/overlay.html',
    ...fs.readdirSync(path.join(root, 'src/renderer/pages'))
      .filter((name) => name.endsWith('.html'))
      .map((name) => `src/renderer/pages/${name}`),
  ];
  for (const file of files) {
    assert.doesNotMatch(read(file), /fonts\.(?:googleapis|gstatic)\.com/, file);
  }
  for (const font of ['inter-latin.woff2', 'jetbrains-mono-latin.woff2']) {
    assert.ok(fs.statSync(path.join(root, 'src/renderer/pages', font)).size > 1_000, font);
  }
});

test('privacy copy accounts for suggestions, telemetry, tab/icon sync, and service requests', () => {
  const privacy = read('site/src/pages/privacy.astro');
  assert.doesNotMatch(privacy, /exactly three things/i);
  assert.doesNotMatch(privacy, /nothing else leaves your device/i);
  assert.match(privacy, /Search suggestions \(optional\)/);
  assert.match(privacy, /random per-launch session ID/);
  assert.match(privacy, /open HTTP\(S\) tabs/);
  assert.match(privacy, /source-rasterized PNG favicons/);
  assert.match(privacy, /checks GitHub for app updates/);
  assert.match(privacy, /secure-DNS provider/);
});

test('private-tab copy matches the isolated in-memory session', () => {
  const page = read('site/src/pages/features/private-tabs.astro');
  assert.doesNotMatch(page, /shared with regular tabs/i);
  assert.match(page, /separate in-memory browsing session/i);
  assert.match(page, /files you explicitly save remain on disk/i);
});

test('marketing fixtures use bundled favicon assets only', () => {
  const marketingFiles = [
    ...fs.readdirSync(path.join(root, 'site/src/pages/features'))
      .filter((name) => name.endsWith('.astro'))
      .map((name) => `site/src/pages/features/${name}`),
    'site/src/pages/index.astro',
    'site/src/scripts/demo.js',
  ];
  for (const file of marketingFiles) {
    assert.doesNotMatch(read(file), /icons\.duckduckgo\.com/, file);
  }
  for (const icon of ['github.com.ico', 'notion.so.ico', 'netflix.com.ico']) {
    assert.ok(fs.statSync(path.join(root, 'site/public/favicons', icon)).size > 100, icon);
  }
});

test('downloads distinguish both Mac architectures without guessing from user agent', () => {
  const page = read('site/src/pages/download.astro');
  const script = read('site/src/scripts/site.js');
  assert.match(page, /data-platform="mac-arm64"/);
  assert.match(page, /data-platform="mac-x64"/);
  assert.match(script, /if \(kind === 'mac'\) return null/);
  assert.doesNotMatch(script, /\|\| dmgs\[0\]/);
  // Cards hide whenever the release lacks their artifact, and hrefs stay on
  // the counted /dl redirects - rewriting them to direct asset URLs would
  // bypass the edge download counter.
  assert.match(script, /link\.hidden = !pickAsset/);
  assert.doesNotMatch(script, /link\.href = asset/);
  assert.match(page, /href="\/dl\/mac-x64"/);
});

test('grant drafts and metrics labels do not overclaim licensing or installs', () => {
  const nlnet = read('docs/grants/nlnet-commons-fund.md');
  const futo = read('docs/grants/futo-pitch.md');
  const stats = read('scripts/stats.sh');
  const readme = read('README.md');

  assert.doesNotMatch(nlnet, /Blanc is an independent, open-source/i);
  assert.match(nlnet, /currently proprietary/);
  assert.doesNotMatch(futo, /an open-source desktop/i);
  assert.doesNotMatch(futo, /only network call/i);
  assert.doesNotMatch(futo, /launch ping,\s*off by default/i);
  assert.match(stats, /artifact-downloads/);
  assert.doesNotMatch(stats, /tag\\tinstalls/);
  assert.doesNotMatch(readme, /else\s+builds unsigned/i);
});

test('public Patron copy states the named-workspace boundary consistently', () => {
  const publicCopyFiles = [
    'README.md',
    'site/src/pages/about.astro',
    'site/src/pages/faq.astro',
    'site/src/pages/index.astro',
    'site/src/pages/press.astro',
    'site/src/pages/terms.astro',
  ];
  const detailedBoundaryFiles = [
    'README.md',
    'site/src/pages/about.astro',
    'site/src/pages/faq.astro',
    'site/src/pages/index.astro',
    'site/src/pages/terms.astro',
  ];
  const staleClaims = /every browser feature is free|all browser features included|none of them are locked behind payment|nothing is locked behind payment|cosmetic Dock icons today/i;
  const macColorwayBoundary = /(?:macOS[^.\n]*(?:app-icon|Dock)[^.\n]*colorways|(?:app-icon|Dock)[^.\n]*colorways[^.\n]*macOS)/i;

  for (const relativePath of publicCopyFiles) {
    const source = read(relativePath);
    assert.doesNotMatch(source, staleClaims, `${relativePath} must not overstate the free feature boundary`);
    assert.match(source, /named workspace/i, `${relativePath} must name the Patron workspace benefit`);
    assert.match(source, macColorwayBoundary, `${relativePath} must say the colorways are macOS-only`);
  }

  for (const relativePath of detailedBoundaryFiles) {
    const source = read(relativePath);
    assert.match(
      source,
      /Creating\s+a\s+named\s+workspace\s+requires\s+an\s+active\s+Patron\s+subscription/i,
      `${relativePath} must state the creation gate`
    );
    assert.match(
      source,
      /Renaming\s+and\s+removing\s+existing\s+workspaces\s+continue\s+to\s+work\s+if\s+it\s+lapses/i,
      `${relativePath} must state the lapsed-subscription behavior`
    );
  }
});

test('public supply-chain copy distinguishes inspection from binary authentication', () => {
  const readme = read('README.md');
  const faq = read('site/src/pages/faq.astro');

  for (const [relativePath, source] of [['README.md', readme], ['site/src/pages/faq.astro', faq]]) {
    assert.doesNotMatch(source, /verify (?:that )?the published binary matches|verify the published binary against/i, relativePath);
    assert.doesNotMatch(source, /provenance attestations for native artifacts|native artifacts carry GitHub provenance/i, relativePath);
    assert.match(source, /Windows and Linux CI\s+artifacts (?:receive|carry) GitHub provenance attestations/i, relativePath);
    assert.match(source, /(?:not proof|does not prove|do not make).*published binary|do not make.*local builds reproducible/i, relativePath);
  }
});

test('public extension copy includes the shipped macOS 1Password boundary', () => {
  const publicCopy = [
    ['README.md', read('README.md')],
    ['site/src/pages/faq.astro', read('site/src/pages/faq.astro')],
    ['launch copy', read('docs/superpowers/plans/assets/launch-copy.md')],
  ];

  for (const [label, source] of publicCopy) {
    assert.doesNotMatch(source, /password managers can(?:not|'t) integrate/i, label);
    assert.match(source, /1Password/i, `${label} must name the supported provider`);
    assert.match(source, /(?:explicit|user-invoked|user asks|user explicitly asks)/i, `${label} must state that fill is user-invoked`);
    assert.match(source, /not an extension runtime/i, `${label} must preserve the extension boundary`);
  }
});

test('official launch artifacts track the release declared by the README', () => {
  const readme = read('README.md');
  const plan = read('docs/superpowers/plans/2026-08-20-growth-counter-offensive.md');
  const copy = read('docs/superpowers/plans/assets/launch-copy.md');
  const match = readme.match(/\*\*Current release:\*\* v(\d+\.\d+\.\d+)/);

  assert.ok(match, 'README must declare the current release');
  const version = match[1];

  assert.ok(copy.startsWith(`# Blanc v${version} launch copy pack`));
  assert.ok(copy.includes(`| Current public release | v${version} |`));
  assert.ok(copy.includes(`v${version} tag is the exact source snapshot`));
  assert.ok(plan.includes(`Blanc v${version} is the current public baseline`));
  assert.ok(plan.includes(`Launch rides v${version} after a ≥48h soak`));
  assert.ok(plan.includes(`homepage show ${version} — not a Cloudflare preview URL`));
});

test('platform specs match the shipped first-run telemetry contract', () => {
  const matrix = read('spec/parity-matrix.md');
  const services = read('spec/acceptance/platform-services.feature');
  const telemetryRow = matrix.split('\n').find((line) => line.startsWith('| F21 |')) || '';
  assert.doesNotMatch(telemetryRow, /Opt-in, off by default/i);
  assert.doesNotMatch(services, /usage ping is off by default/i);
  assert.match(matrix, /commit its on\/off choice before any ping/i);
  assert.match(matrix, /\{installId,sessionId,version,platform,arch,osVersion\}/);
  assert.match(services, /no telemetry install id exists/i);
});

test('published memory figures agree across the site, the fact sheet, and the run behind them', () => {
  // A performance claim on the site is the easiest kind to let rot: the numbers
  // live in three places and nothing but this test stops one of them being
  // edited alone. If a re-run changes the figures, all three change together or
  // this fails.
  const MEASURED = [['Blanc', 1.3], ['Brave', 1.7], ['Zen', 3.2], ['Chrome', 5.6], ['Vivaldi', 5.9]];
  const RESULT = 'bench/memory/results/memory-2026-08-09T17-33-45-039Z.json';

  const chart = read('site/src/components/MemoryChart.astro');
  const factSheet = read('docs/press/fact-sheet.md');

  for (const [name, gb] of MEASURED) {
    assert.match(chart, new RegExp(`name: '${name}', gb: ${gb}\\b`), `${name} in MemoryChart`);
    assert.match(factSheet, new RegExp(`\\| ${name} \\| ${gb} GB \\|`), `${name} in fact sheet`);
  }

  // The claim must be traceable to a committed run, not to a number someone
  // remembers. Every figure above has to appear in that run's own totals.
  assert.ok(fs.existsSync(path.join(root, RESULT)), `${RESULT} must be committed`);
  const report = JSON.parse(read(RESULT));
  const adheavy = report.results.filter((r) => r.workload === 'adheavy');
  const medianGiB = (label) => {
    const row = adheavy.find((r) => r.label === label);
    assert.ok(row, `${label} missing from the committed run`);
    const totals = row.repetitions.map((r) => r.totalBytes).sort((a, b) => a - b);
    const mid = totals.length >> 1;
    const median = totals.length % 2 ? totals[mid] : (totals[mid - 1] + totals[mid]) / 2;
    return median / 1024 ** 3;
  };
  for (const [name, gb] of MEASURED) {
    const actual = medianGiB(name === 'Zen' ? 'Zen Browser' : name === 'Chrome' ? 'Google Chrome' : name);
    assert.ok(
      Math.abs(actual - gb) < 0.06, // displayed GiB rounds to 1 dp
      `${name}: published ${gb} GB but the committed run measured ${actual.toFixed(2)}`
    );
  }

  // Both qualifications must travel with the figures wherever they are shown.
  for (const [file, text] of [['MemoryChart', chart], ['fact sheet', factSheet]]) {
    assert.match(text, /blocks by default/i, `${file} must name Brave as the fair peer`);
    assert.match(text, /4\.2 GB/, `${file} must state the blocking-off figure`);
    assert.match(text, /no extensions/i, `${file} must disclose the profile conditions`);
  }
});

test('quiet-tabs copy promises a reload, and no page claims tabs are never discarded', () => {
  const page = read('site/src/pages/features/quiet-tabs.astro');
  const hub = read('site/src/pages/features.astro');

  assert.match(page, /reloads? (?:it|them|the page)/i);
  // Spec §7: wake is a network re-fetch. "Resume" would be a promise Blanc
  // cannot keep — except in the truth-note, which says it does NOT resume.
  assert.match(page, /It does not resume\./);
  assert.doesNotMatch(page, /\bresumes\b|\bresumed\b|\bresuming\b/i);
  // "asleep" is the internal field name; public copy says quiet.
  assert.doesNotMatch(page, /\basleep\b/i);
  // The honest limits are stated, not omitted.
  assert.match(page, /Private tabs come back where they were, not how they were/);
  assert.match(hub, /\/features\/quiet-tabs/);

  const marketing = [
    ...fs.readdirSync(path.join(root, 'site/src/pages/features'))
      .filter((name) => name.endsWith('.astro'))
      .map((name) => `site/src/pages/features/${name}`),
    'site/src/pages/index.astro',
    'site/src/pages/features.astro',
    'site/src/pages/download.astro',
    'site/src/pages/about.astro',
  ];
  for (const file of marketing) {
    const source = read(file);
    assert.doesNotMatch(source, /never (?:discards?|unloads?|drops?) (?:a |any |your )?tabs?/i, file);
    assert.doesNotMatch(source, /every tab stays (?:live|loaded|open in memory)/i, file);
    assert.doesNotMatch(source, /keeps (?:every|all) tabs? (?:live|loaded|in memory)/i, file);
  }
});

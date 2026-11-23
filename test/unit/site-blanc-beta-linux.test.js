'use strict';
// Blanc Beta for Linux on /download: its own wide tile after the Windows beta's.
// The tile and its data describe the same published pre-release, its four
// packages go through counted /dl/beta-linux-<arch>-<format> routes that answer
// with that release's assets,
// the repository commands are chromium/linux/manual-repository.md's, and every
// sentence in the tile is in its claims ledger.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const linux = JSON.parse(read('site/src/data/blanc-beta-linux.json'));
const ledger = JSON.parse(read(`docs/website-blanc-beta-linux-${linux.version}-claims.json`));
const page = read('site/src/pages/download.astro');

const section = () => {
  const start = page.indexOf('<article class="dl-beta-row dl-beta-row--linux" id="beta-linux"');
  assert.ok(start > 0, 'the Download page has the Blanc Beta for Linux row');
  return page.slice(start, page.indexOf('</article>', start));
};
const releaseDay = new Date(`${linux.published}T00:00:00Z`)
  .toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const expressions = {
  'betaLinux.version': linux.version, 'betaLinux.requirement': linux.requirement, 'betaLinux.chromium': linux.chromium,
  linuxBuild: String(linux.build), linuxChromiumMajor: linux.chromium.split('.')[0], linuxReleased: releaseDay,
};
// The command blocks and their Copy buttons are checked on their own below.
const withoutCommands = (html) => html
  .replace(/<div class="dl-linux-code">[\s\S]*?<\/div>/g, ' ');
const plain = (text) => text
  .replace(/<!--[\s\S]*?-->/g, ' ')
  .replace(/\{([\w.]+)\}/g, (whole, name) => (name in expressions ? expressions[name] : whole))
  .replace(/<[^>]+>/g, ' ').replace(/[’‘]/g, "'").replace(/↗/g, ' ').replace(/\s+/g, ' ').replace(/ ([.,])(?= |$)/g, '$1').trim();
const straight = (text) => text.replace(/[’‘]/g, "'");

test('the data and ledger name the same published Linux pre-release', () => {
  assert.equal(ledger.release, linux.version);
  assert.equal(ledger.tag, linux.tag);
  assert.equal(linux.tag, `chromium-beta-linux-${linux.version}`);
  assert.match(linux.version, /^158\.0\.8127\.(\d+)$/);
  assert.equal(linux.version.split('.')[3], String(linux.build));
  assert.equal(linux.releaseUrl, `https://github.com/bnfy/blanc/releases/tag/${linux.tag}`);
  assert.equal(ledger.releaseUrl, linux.releaseUrl);
  assert.equal(linux.published, ledger.publicRelease);
  assert.equal(linux.chromium, '158.0.8127.2');
  const expected = {
    'x64 deb': `blanc-beta_${linux.version}-1_amd64.deb`,
    'x64 rpm': `blanc-beta-${linux.version}-1.x86_64.rpm`,
    'arm64 deb': `blanc-beta_${linux.version}-1_arm64.deb`,
    'arm64 rpm': `blanc-beta-${linux.version}-1.aarch64.rpm`,
  };
  assert.deepEqual(linux.packages.map((p) => `${p.arch} ${p.format}`).sort(), Object.keys(expected).sort());
  for (const p of linux.packages) {
    assert.equal(p.name, expected[`${p.arch} ${p.format}`]);
    assert.equal(p.url, `https://github.com/bnfy/blanc/releases/download/${linux.tag}/${p.name}`);
    assert.match(p.sha256, /^[a-f0-9]{64}$/);
    assert.ok(Number.isInteger(p.bytes) && p.bytes > 1e7, `${p.name} size`);
  }
});

test('each package button goes through its own counted /dl route to its own asset', async () => {
  const tile = section();
  // An x64 / arm64 switch shows that architecture's .deb and .rpm; each button
  // names its architecture for screen readers.
  const buttons = [...tile.matchAll(/<li data-arch="(x64|arm64)"><a class="dl-tile-button" href="\/dl\/beta-linux-\1-(deb|rpm)" data-download-link data-track="download_click" data-platform="beta-linux-\1-\2" data-cta-position="beta-linux"><span class="sr-only">\1 <\/span>(\.\2)<\/a><\/li>/g)];
  assert.deepEqual(buttons.map((m) => [m[1], m[2], `${m[1]} ${m[3]}`]), [
    ['x64', 'deb', 'x64 .deb'], ['x64', 'rpm', 'x64 .rpm'], ['arm64', 'deb', 'arm64 .deb'], ['arm64', 'rpm', 'arm64 .rpm'],
  ]);
  assert.doesNotMatch(tile, /href="https:\/\/github\.com\/[^"]*\.(?:deb|rpm)"/, 'packages are never linked around the counter');
  const dl = await import('../../cloudflare/ping-worker/src/dl.js');
  const targets = linux.packages.map((p) => `beta-linux-${p.arch}-${p.format}`);
  assert.deepEqual(Object.keys(dl.BETA_LINUX_DOWNLOADS).sort(), targets.toSorted());
  assert.match(tile, /<input type="radio" name="dl-beta-linux-arch" id="dl-beta-linux-x64" value="x64" checked \/>/, 'x64 shows without scripting');
  const css = read('site/src/styles/site.css');
  assert.ok(css.includes('.dl-beta-row--linux:has(#dl-beta-linux-x64:checked) .dl-linux-packages [data-arch="arm64"]'), 'x64 hides the arm64 packages');
  assert.ok(css.includes('.dl-beta-row--linux:has(#dl-beta-linux-arm64:checked) .dl-linux-packages [data-arch="x64"]'), 'arm64 hides the x64 packages');
  for (const p of linux.packages) {
    const target = `beta-linux-${p.arch}-${p.format}`;
    assert.ok(dl.DL_TARGETS.has(target), target);
    assert.equal(dl.BETA_LINUX_DOWNLOADS[target], p.url);
    assert.equal(dl.fixedDownload(target), p.url);
  }
  assert.notEqual(dl.fixedDownload('beta'), linux.packages[0].url, 'the Mac beta keeps its own download');
  assert.equal(dl.fixedDownload('beta-linux-x64-AppImage'), null);
});

test('every sentence in the tile is in the claims ledger, and nothing else is', () => {
  const text = plain(withoutCommands(section()));
  let rest = text;
  for (const claim of ledger.claims) {
    assert.ok(claim.kind === 'label' || (typeof claim.evidence === 'string' && claim.evidence.length > 20), `evidence for: ${claim.text}`);
    const wording = straight(claim.text);
    assert.ok(rest.includes(wording), `the page says: ${claim.text}`);
    rest = rest.replace(wording, ' ');
  }
  assert.equal(rest.replace(/\s+/g, ''), '', `unrecorded text on the page: ${rest.trim()}`);
  assert.doesNotMatch(text, /\{/, 'every expression in the tile is substituted');
});

test('the repository commands are the manual guide’s, with Blanc’s address and key', () => {
  const tile = section();
  const blocks = [...tile.matchAll(/<div class="dl-linux-code"><pre><code>\{betaLinux\.manualSetup\.(\w+)\}<\/code><\/pre><button type="button" class="terminal-copy" data-terminal-copy=\{betaLinux\.manualSetup\.(\w+)\} hidden>Copy<\/button><\/div>/g)];
  assert.deepEqual(blocks.map((m) => m[1]), ledger.commands.blocks);
  for (const m of blocks) assert.equal(m[1], m[2], 'each Copy button copies its own block');
  assert.equal((tile.match(/class="dl-linux-code"/g) || []).length, blocks.length, 'every command block is checked');
  const setup = linux.manualSetup;
  assert.equal(setup.source, 'chromium/linux/manual-repository.md');
  assert.match(setup.commit, /^[0-9a-f]{40}$/);
  assert.ok(ledger.commands.source.includes(setup.commit), 'the ledger names the guide commit the commands came from');
  assert.equal(setup.guideUrl, 'https://github.com/bnfy/blanc/blob/chromium/next/chromium/linux/manual-repository.md');
  assert.match(setup.optOut, /repo_add_once="false"\nrepo_managed="false"/);
  assert.match(setup.optOut, /\/etc\/default\/blanc-beta/);
  assert.ok(setup.key.includes(`curl --fail --silent --show-error ${linux.repository.key} -o "$work/key.asc"`));
  assert.ok(setup.key.includes(`"${linux.repository.fingerprint.replace(/ /g, '')}"`), 'the key command checks the published fingerprint');
  assert.equal(linux.repository.fingerprint, '50D3 6197 4F47 7C8C 87E1 17BD 95AE 97AB CACF EE6C');
  assert.ok(setup.deb.includes('signed-by=/usr/share/keyrings/blanc-beta.gpg] https://pkg.blanc.day/deb stable main'));
  assert.ok(setup.rpm.includes('mirrorlist=https://pkg.blanc.day/rpm/stable/$basearch/mirrorlist'));
  assert.match(setup.rpm, /gpgcheck=1\nrepo_gpgcheck=1/);
  for (const block of [setup.optOut, setup.key, setup.deb, setup.rpm]) {
    assert.doesNotMatch(block, /google|pkg-staging/i, 'no Google or staging repository');
  }
  assert.match(tile, /<a href=\{betaLinux\.manualSetup\.guideUrl\} target="_blank" rel="noopener">/);
});

test('it follows the Windows beta, its panel spans the row, and it is never one of the platform choices', () => {
  const chooser = page.slice(page.indexOf('data-download-chooser'), page.indexOf('class="dl-version"'));
  assert.doesNotMatch(chooser, /beta-linux|Blanc Beta for Linux/);
  const tiles = page.slice(page.indexOf('id="download-more"'));
  assert.ok(tiles.indexOf('id="beta-windows"') < tiles.indexOf('id="beta-linux"'));
  assert.ok(tiles.indexOf('id="beta-linux"') < tiles.indexOf('id="beta-iphone"'));
  const css = read('site/src/styles/site.css');
  assert.match(css, /\.dl-betas \{ grid-column: 1 \/ -1;/);
  assert.match(section(), /<a class="dl-beta-notes" href=\{betaLinux\.releaseUrl\} target="_blank" rel="noopener">Release notes/);
});

test('the update wording promises what the release proved, and no more', () => {
  const text = plain(withoutCommands(section()));
  assert.match(text, /offered with your system updates through apt or dnf/);
  assert.doesNotMatch(text, /automatically/i, 'updates are offered, never installed automatically');
  assert.doesNotMatch(text, /App Center|Software Updater|Discover|GNOME Software/, 'no claim that a graphical updater lists the update');
  assert.match(text, /KDE and x64 desktops haven't been checked by hand\./);
});

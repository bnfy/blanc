'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  sha256, verifyBytes, installFromSource, installFromEnv, checkDirectory, checkAsar, main, readPinned,
} = require('../../scripts/blubird-fonts');

const root = path.join(__dirname, '../..');
const A = Buffer.from('abc');
const B = Buffer.from('xyz');
const FAKE = {
  sourceFolder: 'Blubird/Web-PS',
  files: [
    { name: 'Blubird-A.woff2', env: 'BLUBIRD_A_WOFF2', bytes: 3, sha256: sha256(A) },
    { name: 'Blubird-B.woff2', env: 'BLUBIRD_B_WOFF2', bytes: 3, sha256: sha256(B) },
  ],
};
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'blubird-'));
const quiet = { log() {}, warn() {}, error() {} };

test('the pinned manifest names the two Display webfonts and the variable font', () => {
  const pinned = readPinned();
  assert.equal(pinned.sourceFolder, 'Blubird/Web-PS');
  assert.deepEqual(pinned.files.map((entry) => entry.name), [
    'Blubird-RegularDisplay.woff2', 'Blubird-MediumDisplay.woff2', 'Blubird-VF.ttf',
  ]);
  for (const entry of pinned.files) {
    assert.match(entry.sha256, /^[0-9a-f]{64}$/);
    assert.match(entry.env, /^BLUBIRD_[A-Z_]+_(WOFF2|TTF)$/);
    assert.ok(entry.bytes > 10000);
    // GitHub caps one Actions secret at 48 KB; larger files are split.
    assert.ok(Math.ceil(entry.bytes / 3) * 4 / (entry.parts || 1) < 48 * 1024, `${entry.name} fits its secrets`);
  }
  assert.equal(pinned.files.find((entry) => entry.name === 'Blubird-VF.ttf').source, 'Blubird/Variable-TT/Blubird-VF.ttf');
});

test('verifyBytes rejects a different size or digest', () => {
  verifyBytes(FAKE.files[0], A);
  assert.throws(() => verifyBytes(FAKE.files[0], B), /Blubird-A\.woff2/);
  assert.throws(() => verifyBytes(FAKE.files[0], Buffer.from('abcd')), /pinned 3 bytes/);
});

test('installFromSource copies verified files from a folder', () => {
  const source = tmp();
  const target = tmp();
  fs.writeFileSync(path.join(source, 'Blubird-A.woff2'), A);
  fs.writeFileSync(path.join(source, 'Blubird-B.woff2'), B);
  assert.deepEqual(installFromSource(source, { pinned: FAKE, targetDir: target }), ['Blubird-A.woff2', 'Blubird-B.woff2']);
  assert.deepEqual(fs.readFileSync(path.join(target, 'Blubird-B.woff2')), B);
});

test('installFromSource writes nothing when any file does not match', () => {
  const source = tmp();
  const target = tmp();
  fs.writeFileSync(path.join(source, 'Blubird-A.woff2'), A);
  fs.writeFileSync(path.join(source, 'Blubird-B.woff2'), A);
  assert.throws(() => installFromSource(source, { pinned: FAKE, targetDir: target }), /Blubird-B\.woff2/);
  assert.deepEqual(fs.readdirSync(target), []);
});

test('installFromEnv installs present secrets, reports missing ones, and tolerates wrapped base64', () => {
  const target = tmp();
  const wrapped = A.toString('base64').replace(/(.{2})/, '$1\n');
  const result = installFromEnv({ BLUBIRD_A_WOFF2: wrapped }, { pinned: FAKE, targetDir: target });
  assert.deepEqual(result, { installed: ['Blubird-A.woff2'], missing: ['Blubird-B.woff2'] });
  assert.deepEqual(fs.readFileSync(path.join(target, 'Blubird-A.woff2')), A);
});

test('installFromEnv joins a file split across numbered secrets, and treats a missing part as missing', () => {
  const big = Buffer.from('a split licensed file');
  const pinned = { sourceFolder: 'x', files: [{ name: 'Blubird-Big.ttf', env: 'BLUBIRD_BIG_TTF', parts: 3, bytes: big.length, sha256: sha256(big) }] };
  const encoded = big.toString('base64');
  const third = Math.ceil(encoded.length / 3);
  const env = { BLUBIRD_BIG_TTF_1: encoded.slice(0, third), BLUBIRD_BIG_TTF_2: encoded.slice(third, 2 * third), BLUBIRD_BIG_TTF_3: encoded.slice(2 * third) };
  const target = tmp();
  assert.deepEqual(installFromEnv(env, { pinned, targetDir: target }), { installed: ['Blubird-Big.ttf'], missing: [] });
  assert.deepEqual(fs.readFileSync(path.join(target, 'Blubird-Big.ttf')), big);
  const { BLUBIRD_BIG_TTF_2: _dropped, ...partial } = env;
  assert.deepEqual(installFromEnv(partial, { pinned, targetDir: tmp() }), { installed: [], missing: ['Blubird-Big.ttf'] });
});

test('installFromSource reads an entry from its own folder in the zip', () => {
  const { sourcePath } = require('../../scripts/blubird-fonts');
  assert.equal(sourcePath({ name: 'Blubird-A.woff2' }, FAKE), 'Blubird/Web-PS/Blubird-A.woff2');
  assert.equal(sourcePath({ name: 'Blubird-VF.ttf', source: 'Blubird/Variable-TT/Blubird-VF.ttf' }, FAKE), 'Blubird/Variable-TT/Blubird-VF.ttf');
});

test('installFromEnv rejects a secret holding different bytes', () => {
  assert.throws(
    () => installFromEnv({ BLUBIRD_A_WOFF2: B.toString('base64') }, { pinned: FAKE, targetDir: tmp() }),
    /Blubird-A\.woff2/,
  );
});

test('checkDirectory reports missing files and throws on an altered one', () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'Blubird-A.woff2'), A);
  assert.deepEqual(checkDirectory(dir, { pinned: FAKE }), { present: ['Blubird-A.woff2'], missing: ['Blubird-B.woff2'] });
  fs.writeFileSync(path.join(dir, 'Blubird-B.woff2'), A);
  assert.throws(() => checkDirectory(dir, { pinned: FAKE }), /Blubird-B\.woff2/);
});

test('checkAsar reads the fonts from inside a packaged app.asar', async () => {
  const asar = require('@electron/asar');
  const app = tmp();
  fs.mkdirSync(path.join(app, 'src/renderer/pages'), { recursive: true });
  fs.writeFileSync(path.join(app, 'src/renderer/pages/Blubird-A.woff2'), A);
  fs.writeFileSync(path.join(app, 'package.json'), '{}');
  const archive = path.join(tmp(), 'app.asar');
  await asar.createPackage(app, archive);
  assert.deepEqual(checkAsar(archive, { pinned: FAKE }), { present: ['Blubird-A.woff2'], missing: ['Blubird-B.woff2'] });
});

test('asar paths use the platform separator, as @electron/asar resolves them', () => {
  const { asarInnerPath } = require('../../scripts/blubird-fonts');
  assert.equal(asarInnerPath('Blubird-A.woff2', '/'), 'src/renderer/pages/Blubird-A.woff2');
  assert.equal(asarInnerPath('Blubird-A.woff2', '\\'), 'src\\renderer\\pages\\Blubird-A.woff2');
});

test('licensed Blubird sources anywhere in the tree are git-ignored', () => {
  const { execFileSync } = require('node:child_process');
  for (const candidate of ['Blubird.zip', 'src/renderer/pages/Blubird.zip', 'src/renderer/pages/Blubird/Variable-TT/Blubird-VF.ttf', 'src/renderer/pages/Blubird-VF.ttf']) {
    const ignored = execFileSync('git', ['check-ignore', '--no-index', '-v', candidate], { cwd: root, encoding: 'utf8' });
    assert.ok(ignored.length > 0, `${candidate} is ignored`);
  }
});

test('check exits 0 with a warning when fonts are absent, 1 with --require, 1 on a mismatch', () => {
  const dir = tmp();
  const warnings = [];
  const options = { pinned: FAKE, pagesDir: dir, ...quiet, warn: (line) => warnings.push(line) };
  assert.equal(main(['check'], options), 0);
  assert.match(warnings.join('\n'), /fall back to Inter/);
  assert.equal(main(['check', '--require'], { ...options, warn() {} }), 1);
  fs.writeFileSync(path.join(dir, 'Blubird-A.woff2'), B);
  assert.equal(main(['check'], { ...options, warn() {} }), 1);
});

test('install-env --require fails when a secret is missing', () => {
  const options = { pinned: FAKE, pagesDir: tmp(), ...quiet };
  assert.equal(main(['install-env', '--require'], { ...options, env: { BLUBIRD_A_WOFF2: A.toString('base64') } }), 1);
  assert.equal(main(['install-env'], { ...options, env: { BLUBIRD_A_WOFF2: A.toString('base64') } }), 0);
});

test('Blubird files are git-ignored, untracked, and wired into the build scripts', () => {
  const { execFileSync } = require('node:child_process');
  const gitignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
  assert.match(gitignore, /^\/src\/renderer\/pages\/Blubird\*$/m);
  const tracked = execFileSync('git', ['ls-files', 'src/renderer/pages'], { cwd: root, encoding: 'utf8' });
  assert.doesNotMatch(tracked, /Blubird/i, 'no Blubird file may be committed');
  const scripts = require('../../package.json').scripts;
  assert.equal(scripts['fonts:install'], 'node scripts/blubird-fonts.js install');
  assert.equal(scripts['fonts:check'], 'node scripts/blubird-fonts.js check');
  assert.match(scripts.predist, /node scripts\/blubird-fonts\.js check$/);
  assert.match(scripts['predist:dir'], /node scripts\/blubird-fonts\.js check$/);
});

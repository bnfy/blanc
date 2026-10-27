'use strict';
// The iOS workflow runs only for changes to what the Xcode project builds from.
// Every input outside ios/ (a project reference or a symlink in ios/Blanc) must
// be in its path filters, and nothing else may be, so desktop-only changes
// never start a macOS simulator run.
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.join(__dirname, '../..');
// Windows checkouts may use CRLF.
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
const workflow = read('.github/workflows/ios.yml');
const project = read('ios/Blanc/Blanc.xcodeproj/project.pbxproj');

function listed(event) {
  const block = workflow.split(new RegExp(`^  ${event}:\\n`, 'm'))[1];
  const lines = block.split(/^    paths:\n/m)[1].split('\n');
  const out = [];
  for (const line of lines) {
    const m = line.match(/^      - (.+)$/);
    if (!m) break;
    out.push(m[1]);
  }
  return out;
}

function externalInputs() {
  const inputs = new Set();
  // Project references climb out of ios/Blanc with ../../.
  for (const m of project.matchAll(/path = \.\.\/\.\.\/([^;]+);/g)) {
    const ref = m[1].replace(/^"|"$/g, '');
    const kind = project.slice(project.lastIndexOf('{', m.index), m.index);
    inputs.add(/lastKnownFileType = folder/.test(kind) ? `${ref}/**` : ref);
  }
  // Symlinked sources in ios/Blanc point at generated files elsewhere. Read
  // them from git's index (mode 120000): a Windows checkout without symlink
  // support writes each one as a plain file holding its target.
  const index = execFileSync('git', ['ls-files', '-s', '--', 'ios/Blanc'], { cwd: root, encoding: 'utf8' });
  for (const line of index.split('\n')) {
    const m = line.match(/^120000 \S+ \d+\t(ios\/Blanc\/[^/]+)$/);
    if (!m) continue;
    const full = path.join(root, m[1]);
    const link = fs.lstatSync(full).isSymbolicLink() ? fs.readlinkSync(full) : fs.readFileSync(full, 'utf8').trim();
    const target = path.posix.normalize(path.posix.join(path.posix.dirname(m[1]), link.replace(/\\/g, '/')));
    if (!target.startsWith('ios/')) inputs.add(target);
  }
  return inputs;
}

test('the iOS workflow runs for exactly the inputs the Xcode project builds from', () => {
  const expected = new Set(['.github/workflows/ios.yml', 'ios/**', ...externalInputs()]);
  for (const event of ['push', 'pull_request']) {
    assert.deepEqual(new Set(listed(event)), expected, `${event} paths`);
  }
});

test('desktop-only sources and Android outputs do not start an iOS run', () => {
  for (const event of ['push', 'pull_request']) {
    const paths = listed(event);
    for (const broad of ['settings-schema/**', 'tokens/**', 'copy/generated/**', 'src/**']) {
      assert.ok(!paths.includes(broad), `${event} must not list ${broad}`);
    }
  }
});

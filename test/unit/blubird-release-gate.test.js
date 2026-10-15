'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const pinned = JSON.parse(read('fonts/blubird/pinned.json'));

test('release.sh installs Blubird from 1Password before building and verifies both Mac apps', () => {
  const script = read('scripts/release.sh');
  const install = script.indexOf('op document get "Blubird fonts" --vault Dev');
  const build = script.indexOf('npx electron-builder --mac');
  assert.ok(install > 0 && install < build, 'fonts are installed before the macOS build');
  assert.ok(script.indexOf('node scripts/blubird-fonts.js check --require') > install);
  const gate = script.slice(script.indexOf('if should_run fonts; then'));
  // The script wraps these lines with a trailing backslash continuation.
  assert.match(gate, /blubird-fonts\.js check --require --asar\s*\\?\s*"dist\/mac-arm64\/Blanc\.app\/Contents\/Resources\/app\.asar"/);
  assert.match(gate, /blubird-fonts\.js check --require --asar\s*\\?\s*"dist\/mac\/Blanc\.app\/Contents\/Resources\/app\.asar"/);
});

test('the Windows/Linux workflow installs Blubird before each build and verifies release packages', () => {
  const workflow = read('.github/workflows/release-windows-linux.yml');
  const installs = [...workflow.matchAll(/node scripts\/blubird-fonts\.js install-env \$\{\{ inputs\.mode == 'release' && '--require' \|\| '' \}\}/g)];
  assert.equal(installs.length, 2, 'one install per platform job');
  const winBuild = workflow.indexOf('name: Build Windows installer');
  const linuxBuild = workflow.indexOf('run: npx electron-builder --linux');
  assert.ok(installs[0].index < winBuild && installs[1].index > winBuild && installs[1].index < linuxBuild);
  for (const entry of pinned.files) {
    assert.equal(workflow.split(`${entry.env}: \${{ secrets.${entry.env} }}`).length - 1, 2, `${entry.env} reaches both jobs`);
  }
  for (const dir of ['win-unpacked', 'linux-unpacked']) {
    assert.match(workflow, new RegExp(`if: \\$\\{\\{ inputs\\.mode == 'release' \\}\\}\\s+run: node scripts/blubird-fonts\\.js check --require --asar dist/${dir}/resources/app\\.asar`));
  }
});

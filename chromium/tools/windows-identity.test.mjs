import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const patch = read('../patches/0098-blanc-windows-identity.patch');
const defines = Object.fromEntries([...patch.matchAll(/^\+\s*"(BLANC_WIN_\w+)=L?\\"([^\\]*)\\"",?$/gm)].map(m => [m[1], m[2]]));
const installer = read('../../build/installer.nsh');
const pkg = JSON.parse(read('../../package.json'));
const appId = /APP_ID\s*=\s*'([^']+)'/.exec(read('../../src/main/app-identity.js'))[1];

test('the preview channel has every Windows name it needs', () => {
  assert.deepEqual(defines, {
    BLANC_WIN_APP_NAME: 'Blanc Prototype', BLANC_WIN_APP_ID: 'BlancPrototype',
    BLANC_WIN_HTML_PROG_ID: 'BlancPrvHTM', BLANC_WIN_PDF_PROG_ID: 'BlancPrvPDF',
    BLANC_WIN_URL_SCHEME: 'blanc-prototype', BLANC_WIN_PUBLISHER: 'Bananify Creative',
  });
  // Chromium's limits: ProgID prefixes at most 11 characters; an app id of
  // letters, digits and dots.
  assert.ok(defines.BLANC_WIN_HTML_PROG_ID.length <= 11 && defines.BLANC_WIN_PDF_PROG_ID.length <= 11);
  assert.match(defines.BLANC_WIN_APP_ID, /^[A-Za-z0-9.]+$/);
  assert.match(patch, /assert\(blanc_channel == "preview"/);
});
test('no Windows name of the preview is the Electron Blanc\'s or Chromium\'s', () => {
  const electron = new Set([pkg.build.productName, pkg.productName, appId,
    /BLANC_URL_PROGID "([^"]+)"/.exec(installer)[1], ...pkg.build.protocols.flatMap(p => p.schemes)]);
  const chromium = new Set(['Chromium', 'ChromiumHTM', 'ChromiumPDF', 'chromium']);
  for (const value of Object.values(defines).filter(v => v !== 'Bananify Creative')) {
    assert.ok(!electron.has(value), `${value} is the Electron Blanc's`);
    assert.ok(!chromium.has(value), `${value} is Chromium's`);
  }
  // Chromium's toast activator and Active Setup ids are replaced, not kept.
  assert.doesNotMatch(patch, /^\+.*0x635EFA6F/m);
  assert.match(patch, /^-.*0x635EFA6F/m);
  assert.match(patch, /^-.*7D2B3E1D-D096/m);
});
test('the identity table names the same values as the patch', () => {
  const table = read('../windows/identity.md');
  for (const value of Object.values(defines)) assert.ok(table.includes('`' + value + '`'), value);
  for (const id of ['1BFC5BBC-FA48-49EE-BDC9-BA91E18C4B89', 'FF7CE8A2-9361-41F3-B827-83DC0CB91795']) {
    assert.ok(table.includes(id), id);
    assert.ok(patch.toUpperCase().includes(id.split('-')[0]), id);
  }
});
test('the Windows icon is the Electron app\'s Sunrise, byte for byte', () => {
  const sha = path => crypto.createHash('sha256').update(fs.readFileSync(new URL(path, import.meta.url))).digest('hex');
  assert.equal(sha('../blanc/branding/win/blanc.ico'), sha('../../build/windows-icons/icon-sunrise.ico'));
  assert.equal((patch.match(/blanc\\+branding\\+win\\+blanc\.ico/g) ?? []).length, 2);
});

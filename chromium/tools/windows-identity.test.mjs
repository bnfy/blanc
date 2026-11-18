import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const patch = read('../patches/0098-blanc-windows-identity.patch');
// Each channel's Windows names, from its own block in the patch's BUILD.gn
// hunk; the two ids (Active Setup, toast activator) apart from the names.
const between = (start, end) => {
  const i = patch.indexOf(start), j = i < 0 ? -1 : patch.indexOf(end, i + start.length);
  return i < 0 || j < 0 ? '' : patch.slice(i, j);
};
const parse = text => Object.fromEntries([...text.matchAll(/"(BLANC_WIN_\w+)=L?\\"([^\\]*)\\""/g)]
  .map(m => [m[1], m[2]]).filter(([key]) => !/_(GUID|CLSID)$/.test(key)));
const ids = text => Object.fromEntries([...text.matchAll(/"(BLANC_WIN_\w+_(?:GUID|CLSID))=(?:L\\")?([^"\\]*)/g)].map(m => [m[1], m[2]]));
const betaBlock = between('+  if (blanc_channel == "beta") {', '+  } else {');
const previewBlock = between('+  } else {', '+  }\n');
const defines = parse(previewBlock);
const betaDefines = parse(betaBlock);
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
  assert.match(patch, /assert\(blanc_channel == "preview" \|\| blanc_channel == "beta"/);
});
test('the beta channel has its own Windows names and ids, shared with no other build', () => {
  assert.deepEqual(betaDefines, {
    BLANC_WIN_APP_NAME: 'Blanc Beta', BLANC_WIN_APP_ID: 'BlancBeta',
    BLANC_WIN_HTML_PROG_ID: 'BlancBetHTM', BLANC_WIN_PDF_PROG_ID: 'BlancBetPDF',
    BLANC_WIN_URL_SCHEME: 'blanc-beta', BLANC_WIN_PUBLISHER: 'Bananify Creative',
  });
  assert.ok(betaDefines.BLANC_WIN_HTML_PROG_ID.length <= 11 && betaDefines.BLANC_WIN_PDF_PROG_ID.length <= 11);
  for (const key of Object.keys(betaDefines).filter(k => k !== 'BLANC_WIN_PUBLISHER'))
    assert.notEqual(betaDefines[key], defines[key], key);
  // Its own Active Setup and toast activator ids, unlike the preview's and Chromium's.
  const beta = ids(betaBlock), preview = ids(previewBlock);
  assert.deepEqual(Object.keys(beta).sort(), ['BLANC_WIN_ACTIVE_SETUP_GUID', 'BLANC_WIN_TOAST_CLSID']);
  assert.deepEqual(Object.keys(preview).sort(), Object.keys(beta).sort());
  for (const key of Object.keys(beta)) assert.notEqual(beta[key], preview[key], key);
  assert.match(beta.BLANC_WIN_ACTIVE_SETUP_GUID, /^\{[0-9A-F]{8}(-[0-9A-F]{4}){3}-[0-9A-F]{12}\}$/);
  assert.equal(preview.BLANC_WIN_ACTIVE_SETUP_GUID, '{FF7CE8A2-9361-41F3-B827-83DC0CB91795}');
  assert.match(preview.BLANC_WIN_TOAST_CLSID, /0x1BFC5BBC/);
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
test('the Windows preview\'s BRANDING names Bananify Creative and Blanc Prototype', () => {
  // chrome.exe, chrome.dll, setup.exe and mini_installer.exe take their
  // version resources from the file `branding_file_path` names.
  const branding = Object.fromEntries(read('../blanc/branding/win/BRANDING').split('\n')
    .filter(line => line.includes('=')).map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]));
  assert.equal(branding.COMPANY_FULLNAME, 'Bananify Creative');
  assert.equal(branding.COMPANY_SHORTNAME, 'Bananify Creative');
  assert.equal(branding.PRODUCT_FULLNAME, defines.BLANC_WIN_APP_NAME);
  assert.equal(branding.PRODUCT_SHORTNAME, defines.BLANC_WIN_APP_NAME);
  assert.equal(branding.PRODUCT_INSTALLER_FULLNAME, `${defines.BLANC_WIN_APP_NAME} Installer`);
  assert.equal(branding.PRODUCT_INSTALLER_SHORTNAME, `${defines.BLANC_WIN_APP_NAME} Installer`);
  assert.match(branding.COPYRIGHT, /Bananify Creative and The Chromium Authors/);
  assert.ok(!Object.keys(branding).some(key => key.startsWith('MAC_')), 'a Windows-only file carries no Mac keys');
  assert.match(read('../windows/args/prototype-x64.gn'), /^branding_file_path = "\/\/blanc\/branding\/win\/BRANDING"$/m);
});

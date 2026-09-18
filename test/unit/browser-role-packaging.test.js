'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { deepAssign } = require('builder-util');

const {
  REQUIRED_SCHEMES,
  REQUIRED_DOCUMENT_UTIS,
  verifyBrowserRole,
} = require('../../scripts/verify-packaged-browser-role');

const root = path.join(__dirname, '..', '..');
const pkg = require(path.join(root, 'package.json'));
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

// electron-builder writes CFBundleURLTypes from build.protocols and then uses
// builder-util's deepAssign() to merge build.mac.extendInfo into the plist.
// Rebuilding that mapping with the same helper lets Linux CI check the same
// plist macOS and Apple's entitlement reviewers read, without a mac build.
const packagedInfoPlist = () => deepAssign(
  {
    CFBundleURLTypes: pkg.build.protocols.map((protocol) => ({
      CFBundleURLName: protocol.name,
      CFBundleTypeRole: protocol.role || 'Editor',
      CFBundleURLSchemes: [...protocol.schemes],
    })),
  },
  structuredClone(pkg.build.mac.extendInfo),
);

test('the packaged bundle claims both web schemes and HTML documents', () => {
  const { schemes, documentUtis } = verifyBrowserRole(packagedInfoPlist());
  for (const scheme of REQUIRED_SCHEMES) assert.ok(schemes.includes(scheme), scheme);
  for (const uti of REQUIRED_DOCUMENT_UTIS) assert.ok(documentUtis.includes(uti), uti);
});

test('claiming only the schemes is rejected — LaunchServices needs the HTML claim too', () => {
  // The v0.7.2 amendment, removed later with local HTML viewing: without
  // CFBundleDocumentTypes, LaunchServices never flags the bundle `web-browser`
  // on a clean registration, even when the URL scheme claims are present.
  const info = packagedInfoPlist();
  delete info.CFBundleDocumentTypes;
  assert.throws(() => verifyBrowserRole(info), /CFBundleDocumentTypes/);
});

test('bundling the UTIs into one dict is rejected — LaunchServices drops that claim silently', () => {
  const info = packagedInfoPlist();
  info.CFBundleDocumentTypes = [
    { CFBundleTypeRole: 'Viewer', LSItemContentTypes: [...REQUIRED_DOCUMENT_UTIS] },
  ];
  assert.throws(() => verifyBrowserRole(info), /dict of its own/);
});

test('HTML declarations can classify the browser but never register Blanc as a file opener', () => {
  const info = packagedInfoPlist();
  for (const type of info.CFBundleDocumentTypes) {
    assert.equal(type.LSHandlerRank, 'None');
  }

  delete info.CFBundleDocumentTypes[0].LSHandlerRank;
  assert.throws(() => verifyBrowserRole(info), /LSHandlerRank None/);
});

test('dropping either web scheme is rejected', () => {
  for (const dropped of REQUIRED_SCHEMES) {
    const info = packagedInfoPlist();
    info.CFBundleURLTypes = info.CFBundleURLTypes.map((type) => ({
      ...type,
      CFBundleURLSchemes: type.CFBundleURLSchemes.filter((scheme) => scheme !== dropped),
    }));
    assert.throws(() => verifyBrowserRole(info), new RegExp(`${dropped} scheme`));
  }
});

test('build.protocols is the sole owner of web scheme declarations', () => {
  const web = pkg.build.protocols.find((protocol) => protocol.schemes?.includes('http'));
  assert.ok(web, 'build.protocols declares the web URL protocol');
  for (const scheme of REQUIRED_SCHEMES) assert.ok(web.schemes.includes(scheme), scheme);
  assert.equal(web.role, 'Viewer');
  // deepAssign appends arrays, so a second CFBundleURLTypes owner would create
  // duplicate or conflicting entries. Keep every scheme in build.protocols.
  assert.equal('CFBundleURLTypes' in pkg.build.mac.extendInfo, false);
});

test('the built bundle is gated on the browser role before it is signed', () => {
  const hook = read(pkg.build.afterPack);
  assert.match(hook, /require\('\.\/verify-packaged-browser-role'\)/);
  assert.match(hook, /verifyPackagedBrowserRole\(macAppPath\)/);
});

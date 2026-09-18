'use strict';
// macOS ships the browser role in the packaged Info.plist, not in
// package.json — LaunchServices reads the bundle, and so does Apple when it
// reviews a browser entitlement request. Two claims must survive packing:
//
//   CFBundleURLTypes      http + https (electron-builder writes these from
//                         build.protocols)
//   CFBundleDocumentTypes public.html + public.xhtml (build.mac.extendInfo),
//                         each ranked Alternate so LaunchServices admits Blanc
//                         to the default-browser picker without claiming ownership
//
// Scheme claims alone are not enough: LaunchServices only flags a bundle
// `web-browser` — what System Settings' default-browser picker keys on — when
// it also claims HTML documents. The claim landed in v0.7.2, was later removed
// with local HTML viewing, and its absence left clean installs without
// LaunchServices' browser classification. Apple's later entitlement rejection
// exposed that gap, although its response described the already-present HTTP
// and HTTPS scheme declarations instead. Verifying
// the built bundle, rather than the config that is supposed to produce it,
// is what keeps it from going missing a third time. Rank None looks safer but
// excludes the app from System Settings entirely; Alternate is the lowest rank
// that passed clean-registration picker testing. The matching open-file path
// admits only explicit macOS HTML/XHTML handoffs.
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const REQUIRED_SCHEMES = ['http', 'https'];
const REQUIRED_DOCUMENT_UTIS = ['public.html', 'public.xhtml'];

// plutil ships with macOS and reads XML and binary plists alike, so this check
// never depends on how electron-builder chose to serialize the file.
const readInfoPlist = (infoPlistPath) => JSON.parse(execFileSync(
  '/usr/bin/plutil',
  ['-convert', 'json', '-o', '-', infoPlistPath],
  { encoding: 'utf8' },
));

function verifyBrowserRole(info) {
  const schemes = (info.CFBundleURLTypes ?? [])
    .flatMap((type) => type.CFBundleURLSchemes ?? [])
    .map((scheme) => String(scheme).toLowerCase());
  for (const scheme of REQUIRED_SCHEMES) {
    assert.ok(
      schemes.includes(scheme),
      `Info.plist must claim the ${scheme} scheme in CFBundleURLTypes`,
    );
  }

  const documentTypes = info.CFBundleDocumentTypes ?? [];
  for (const uti of REQUIRED_DOCUMENT_UTIS) {
    const claim = documentTypes.find((type) => (type.LSItemContentTypes ?? []).includes(uti));
    assert.ok(
      claim,
      `Info.plist must claim ${uti} in CFBundleDocumentTypes, or LaunchServices never flags Blanc a web browser`,
    );
    // Bundling several UTIs into one dict makes LaunchServices drop the claim
    // silently — one UTI per dict is the shape Brave and Chrome ship.
    assert.deepEqual(
      claim.LSItemContentTypes,
      [uti],
      `${uti} must be claimed in a CFBundleDocumentTypes dict of its own`,
    );
    assert.equal(
      claim.CFBundleTypeRole,
      'Viewer',
      `${uti} must be claimed with CFBundleTypeRole Viewer`,
    );
    assert.equal(
      claim.LSHandlerRank,
      'Alternate',
      `${uti} must use LSHandlerRank Alternate so Blanc remains eligible for the default-browser picker`,
    );
  }

  return { schemes, documentUtis: documentTypes.flatMap((type) => type.LSItemContentTypes ?? []) };
}

function verifyPackagedBrowserRole(appPath) {
  const result = verifyBrowserRole(readInfoPlist(path.join(appPath, 'Contents', 'Info.plist')));
  console.log(
    `packaged browser role: ${REQUIRED_SCHEMES.join(' + ')} schemes and `
    + `${REQUIRED_DOCUMENT_UTIS.join(' + ')} documents verified`
    + ` (bundle claims: ${result.schemes.join(', ')})`,
  );
  return result;
}

module.exports = {
  REQUIRED_SCHEMES,
  REQUIRED_DOCUMENT_UTIS,
  verifyBrowserRole,
  verifyPackagedBrowserRole,
};

// What a release app needs to start that debug builds never exercise: release builds are
// non-component (one large library) and name the package with Blanc's version.
import test from 'node:test';
import assert from 'node:assert/strict';
import {patchedChromiumFile} from './android-patched-file.mjs';

// Chromium's own loader reserves a fixed 192 MB, and the release library is larger, so a release
// app that used it stopped at launch (patch 0116). Debug (component) builds never use it.
test('the app loads its native library with Android\'s own loader', () => {
  assert.match(patchedChromiumFile('chrome/android/chrome_public_apk_tmpl.gni'), /^\s*use_chromium_linker = false$/m);
});

// Release builds name the package with Blanc's version; Chromium's own version (the user agent,
// variations) must stay Chromium's, or variations CHECK-fails at launch (patch 0117).
test('Chromium\'s version is its own, not the package\'s version name', () => {
  const source = patchedChromiumFile('base/version_info/version_info.cc');
  assert.match(source, /GetVersionNumber\(\) \{[^}]*return PRODUCT_VERSION;/);
  assert.doesNotMatch(source, /return base::android::apk_info::package_version_name\(\);/);
});

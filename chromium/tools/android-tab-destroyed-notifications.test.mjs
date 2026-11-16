// When a tab's page is destroyed, Chromium clears that tab's capture, Bluetooth, USB and serial
// notifications, passing the tab's last address. A tab that never loaded in this run has none.
// If Blanc was killed while a site was using the microphone, the tab's capture notification id was
// still saved, so at the next cold start closing that never-loaded tab reached `url.getSpec()` on a
// missing address and the app died (found on 1.0.0-beta.2; in beta.1 too).
import test from 'node:test';
import assert from 'node:assert/strict';
import {patchedChromiumFile} from './android-patched-file.mjs';

test('clearing a destroyed tab\'s notifications never passes a missing address', () => {
  const source = patchedChromiumFile('chrome/android/java/src/org/chromium/chrome/browser/tab/TabWebContentsObserver.java');
  const start = source.indexOf('void updateNotificationsForTab() {');
  assert.notEqual(start, -1);
  const body = source.slice(start, source.indexOf('\n        }\n', start));
  assert.match(body, /GURL url = mLastUrl != null \? mLastUrl : GURL\.emptyGURL\(\);/);
  // All four callers take the same address, and none takes the nullable field.
  assert.equal(body.match(/\burl\b(?=,|\))/g).length, 4);
  assert.doesNotMatch(body.replace(/GURL url = [^;]+;/, ''), /mLastUrl/);
});

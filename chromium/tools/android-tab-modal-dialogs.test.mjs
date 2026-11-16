// Dialogs a page raises inside its tab: a site's permission prompt (camera, microphone, location),
// JavaScript alerts and confirms, HTTP sign-in. Chrome shows them only once its toolbar is fully
// visible, and Blanc keeps that toolbar hidden for good (patch 0104), so they never appeared: the
// page dimmed and Back answered "no" (found on 1.0.0-beta.1).
import test from 'node:test';
import assert from 'node:assert/strict';
import {patchedChromiumFile} from './android-patched-file.mjs';

const PRESENTER = 'chrome/android/java/src/org/chromium/chrome/browser/modaldialog/ChromeTabModalPresenter.java';

function method(source, signature) {
  const start = source.indexOf(signature);
  assert.notEqual(start, -1, `${signature} is in the presenter`);
  const end = source.indexOf('\n    }\n', start);
  return source.slice(start, end);
}

test('a dialog in a tab appears without waiting for Chrome\'s hidden toolbar', () => {
  const show = method(patchedChromiumFile(PRESENTER), 'protected void showDialogContainer() {');
  assert.match(show, /runEnterAnimation\(\);/);
  assert.doesNotMatch(show, /mRunEnterAnimationOnCallback = true/);
  assert.doesNotMatch(show, /areBrowserControlsFullyVisible/);
});

test('the dialog and its dimming start at the top of the page, not below the hidden toolbar', () => {
  const margin = method(patchedChromiumFile(PRESENTER), 'public static int getContainerTopMargin(');
  assert.match(margin, /return 0;/);
  assert.doesNotMatch(margin, /getTopControlsHeight/);
});

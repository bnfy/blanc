// Chromium clears the capture notifications left from the last run in a deferred startup task. A
// page opened at a cold start can begin using the microphone before that task runs: the task then
// removed the notification this run had just posted and stopped its foreground service, so the
// microphone was in use with no "A site is using your microphone" (found on 1.0.0-beta.2).
import test from 'node:test';
import assert from 'node:assert/strict';
import {patchedChromiumFile} from './android-patched-file.mjs';

const SERVICE = 'chrome/android/java/src/org/chromium/chrome/browser/media/MediaCaptureNotificationServiceImpl.java';
const method = (source, signature) => {
  const start = source.indexOf(signature);
  assert.notEqual(start, -1, `${signature} is in the service`);
  return source.slice(start, source.indexOf('\n    }\n', start));
};

test('clearing last run\'s capture notifications keeps the ones this run posted', () => {
  const clear = method(patchedChromiumFile(SERVICE), 'private void cancelPreviousWebRtcNotifications() {');
  // A notification this run owns is skipped, and its saved id stays saved.
  assert.match(clear, /if \(mNotificationsType\.containsKey\(notificationId\)\) \{\s+live\.add\(id\);\s+continue;/);
  assert.match(clear, /writeStringSet\(\s*ChromePreferenceKeys\.MEDIA_WEBRTC_NOTIFICATION_IDS, live\)/);
});

test('the capture service keeps running after the clearing task while it still has a notification', () => {
  const start = method(patchedChromiumFile(SERVICE), 'public int onStartCommand(');
  assert.match(start, /cancelPreviousWebRtcNotifications\(\);\s+if \(mNotificationsType\.isEmpty\(\)\) getService\(\)\.stopSelf\(\);/);
});

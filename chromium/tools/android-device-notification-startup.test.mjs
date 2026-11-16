// The deferred startup task that clears last run's capture notifications (patch 0122) clears the
// Bluetooth and USB ones the same way: every saved id is cancelled and the service stops. A page
// already connected to a device by then lost the notification this run had posted. Serial has the
// same code, but nothing calls its clearing at startup.
import test from 'node:test';
import assert from 'node:assert/strict';
import {patchedChromiumFile} from './android-patched-file.mjs';

const method = (source, signature) => {
  const start = source.indexOf(signature);
  assert.notEqual(start, -1, `${signature} is in the manager`);
  return source.slice(start, source.indexOf('\n    }\n', start));
};

for (const [name, file, clear, previous, owns, empty, key] of [
  ['Bluetooth', 'chrome/browser/bluetooth/android/java/src/org/chromium/chrome/browser/bluetooth/BluetoothNotificationManager.java',
    'cancelLastRunBluetoothNotifications', 'cancelPreviousBluetoothNotifications', 'doesNotificationExist(notificationId)', 'mNotifications.size() == 0', 'BLUETOOTH_NOTIFICATION_IDS'],
  ['USB', 'chrome/browser/usb/android/java/src/org/chromium/chrome/browser/usb/UsbNotificationManager.java',
    'cancelLastRunUsbNotifications', 'cancelPreviousUsbNotifications', 'doesNotificationExist(notificationId)', 'mNotificationIds.size() == 0', 'USB_NOTIFICATION_IDS'],
]) {
  const esc = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  test(`clearing last run's ${name} notifications keeps the ones this run posted`, () => {
    const body = method(patchedChromiumFile(file), `private void ${clear}() {`);
    assert.match(body, new RegExp(`if \\(${esc(owns)}\\) \\{\\s+live\\.add\\(id\\);\\s+continue;`));
    assert.match(body, new RegExp(`writeStringSet\\(\\s*ChromePreferenceKeys\\.${key}, live\\)`));
  });
  test(`the ${name} service keeps running after the clearing task while it still has a notification`, () => {
    const body = method(patchedChromiumFile(file), 'public void onStartCommand(');
    assert.match(body, new RegExp(`${clear}\\(\\);\\s+if \\(${esc(empty)}\\) mDelegate\\.stopSelf\\(\\);`));
  });
  // The services call this one from onDestroy and onUnbind, where everything must go.
  test(`${previous} still cancels every ${name} notification`, () => {
    assert.doesNotMatch(method(patchedChromiumFile(file), `public void ${previous}() {`), /live/);
  });
}

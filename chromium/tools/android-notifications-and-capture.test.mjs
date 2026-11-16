// Two things found while checking 1.0.0-beta.1 on the emulator.
import test from 'node:test';
import assert from 'node:assert/strict';
import {patchedChromiumFile} from './android-patched-file.mjs';

// Blanc has no notification prompt at startup (patch 0104) and counts on Chrome asking in context,
// at a download. Chrome keeps that request behind a field-trial parameter that is off by default,
// so nothing ever asked and Blanc's notifications never showed.
test('a download asks for notification permission', () => {
  const source = patchedChromiumFile(
      'chrome/android/java/src/org/chromium/chrome/browser/app/notifications/ContextualNotificationPermissionRequesterImpl.java');
  const start = source.indexOf('public void requestPermissionIfNeeded() {');
  const body = source.slice(start, source.indexOf('\n    }\n', start));
  assert.match(body, /permissionController\.requestPermissionIfNeeded\(\/\* contextual= \*\/ true\);/);
  assert.doesNotMatch(body, /isContextualPermissionRequestEnabled/);
});

// Websites can't share the screen in Blanc (Chromium leaves getDisplayMedia experimental on
// Android), so the app must not declare the screen-capture foreground service: Google Play asks
// for a demonstration of every declared type.
test('the app declares no screen-capture foreground service', () => {
  const manifest = patchedChromiumFile('chrome/android/java/AndroidManifest.xml');
  assert.doesNotMatch(manifest, /FOREGROUND_SERVICE_MEDIA_PROJECTION/);
  assert.doesNotMatch(manifest, /mediaProjection/);
  assert.match(manifest, /MediaCaptureNotificationService"\s+android:foregroundServiceType="camera\|microphone"/);
});

test('the capture service never asks Android for a type the app does not declare', () => {
  const source = patchedChromiumFile(
      'chrome/android/java/src/org/chromium/chrome/browser/media/MediaCaptureNotificationServiceImpl.java');
  const start = source.indexOf('private int getRequiredForegroundServiceType() {');
  assert.notEqual(start, -1);
  const body = source.slice(start, source.indexOf('\n    }\n', start));
  assert.doesNotMatch(body, /FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION/);
  assert.doesNotMatch(body, /FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK/);
  assert.match(body, /FOREGROUND_SERVICE_TYPE_CAMERA/);
  assert.match(body, /FOREGROUND_SERVICE_TYPE_MICROPHONE/);
});

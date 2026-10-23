'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { cleanRelaunchEnvironment } = require('../../scripts/ecs-appimage-relaunch.cjs');
test('replacement AppImage drops the old native runtime environment before exec', () => {
  const original = { APPDIR: '/tmp/old-image', APPIMAGE: '/install/old.AppImage', ARGV0: 'old', OWD: '/tmp/old-image',
    LD_PRELOAD: '/tmp/old-image/preload.so', LD_LIBRARY_PATH: '/tmp/old-image/lib', ELECTRON_RUN_AS_NODE: '1', CHROME_DEVEL_SANDBOX: '/tmp/old-image/chrome-sandbox',
    GSETTINGS_SCHEMA_DIR: '/tmp/old-image/schemas', BLANC_ECS_CDM_PRELOAD_PATH: '/profile/cdm.so', BLANC_ECS_LAUNCHER_ROOT: '/tmp/old-image',
    PATH: '/tmp/old-image:/usr/bin:relative:/tmp/old-image/usr/sbin:/tmp/old-image-other', XDG_DATA_DIRS: '/tmp/old-image/share:/usr/share',
    APPIMAGE_EXTRACT_AND_RUN: '1', APPIMAGE_SILENT_INSTALL: 'true', BLANC_ECS_FULL_PROFILE: '/profile', DISPLAY: ':99',
    BLANC_UPDATE_CHANNEL: 'staging', BLANC_UPDATE_STAGING_URL: 'http://127.0.0.1:1234/' };
  const result = cleanRelaunchEnvironment(original);
  assert.equal(result.PATH, '/usr/bin:/tmp/old-image-other'); assert.equal(result.XDG_DATA_DIRS, '/usr/share');
  for (const key of ['APPDIR', 'APPIMAGE', 'ARGV0', 'OWD', 'LD_PRELOAD', 'LD_LIBRARY_PATH', 'ELECTRON_RUN_AS_NODE', 'CHROME_DEVEL_SANDBOX', 'GSETTINGS_SCHEMA_DIR', 'BLANC_ECS_CDM_PRELOAD_PATH', 'BLANC_ECS_LAUNCHER_ROOT']) assert.equal(result[key], undefined, key);
  for (const key of ['APPIMAGE_EXTRACT_AND_RUN', 'APPIMAGE_SILENT_INSTALL', 'BLANC_ECS_FULL_PROFILE', 'DISPLAY', 'BLANC_UPDATE_CHANNEL', 'BLANC_UPDATE_STAGING_URL']) assert.equal(result[key], original[key], key);
  assert.equal(original.APPIMAGE, '/install/old.AppImage');
  assert.equal(cleanRelaunchEnvironment({ PATH: 'relative' }).PATH, '/usr/local/bin:/usr/bin:/bin');
});

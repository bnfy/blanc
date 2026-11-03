// Patch 0102 turns off Google background services from Java on Android. Its
// list must stay a superset of desktop's (blanc/common/background_services.h),
// so a service desktop stops is never left running on Android.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const header = read('blanc/common/background_services.h');
const patch = read('patches/android/0102-android-google-services-off.patch');
const added = patch.split('\n').filter(line => line.startsWith('+') && !line.startsWith('+++')).join('\n');

test('android disables every desktop background feature and the same switch', () => {
  const desktop = [...header.match(/kDisabledBackgroundFeatures =\s*\{([^}]*)\}/)[1].matchAll(/"([^"]+)"/g)].map(m => m[1]);
  const android = [...added.match(/BLANC_DISABLED_FEATURES = \{([^}]*)\}/)[1].matchAll(/"([^"]+)"/g)].map(m => m[1]);
  assert.ok(desktop.length >= 2);
  for (const feature of desktop) assert.ok(android.includes(feature), `${feature} is missing on Android`);
  assert.equal(new Set(android).size, android.length);
  const desktopSwitch = header.match(/kDisableComponentUpdateSwitch =\s*"([^"]+)"/)[1];
  assert.match(added, new RegExp(`BLANC_DISABLE_SWITCH = "${desktopSwitch}"`));
});

test('android sets them right after the command line is read', () => {
  assert.match(added, /disableBlancBackgroundServices\(CommandLine\.getInstance\(\)\);/);
  assert.match(patch, / {13}CommandLineInitUtil\.initCommandLine\(\n {21}COMMAND_LINE_FILE, SplitCompatApplication::shouldUseDebugFlags\);\n\+ {12}disableBlancBackgroundServices/);
});

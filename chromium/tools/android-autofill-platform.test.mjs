import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {patchedChromiumFile} from './android-patched-file.mjs';

const registration = patchedChromiumFile('components/autofill/core/common/autofill_prefs.cc');
const header = patchedChromiumFile('components/autofill/core/common/autofill_prefs.h');
const provider = patchedChromiumFile('chrome/browser/ui/autofill/autofill_client_provider.cc');
const launcher = patchedChromiumFile('chrome/android/java/src/org/chromium/chrome/browser/AutofillOptionsLauncher.java');
const utils = patchedChromiumFile('chrome/browser/autofill/android/java/src/org/chromium/chrome/browser/autofill/AutofillClientProviderUtils.java');
const settings = new URL('../blanc/android/java/src/org/chromium/blanc/settings/', import.meta.url);
const host = readFileSync(new URL('chromium/ChromiumSettingsHost.java', settings), 'utf8');
const screen = readFileSync(new URL('BlancSettingsScreen.java', settings), 'utf8');

test("Chromium's active autofill pref defaults to false", () => {
  assert.match(registration, /RegisterBooleanPref\(kAutofillUsingPlatformAutofill, false\);/);
});

test("Blanc's Android autofill request defaults to true", () => {
  assert.match(header, /kAutofillPlatformRequested\[\] =\s*"blanc\.autofill\.platform_requested";/);
  assert.match(registration, /#if BUILDFLAG\(IS_ANDROID\)(?:(?!#endif)[\s\S])*?RegisterBooleanPref\(kAutofillPlatformRequested, true\);/);
});

test("Android's app preferences link opens Blanc's Settings root", () => {
  assert.match(launcher, /Intent\.ACTION_APPLICATION_PREFERENCES\.equals\(getIntent\(\)\.getAction\(\)\)/);
  assert.match(launcher, /if \(invokedByPreferencesIntent\(\)\) \{\s*startActivity\(SettingsIntentUtil\.createIntent\(this, null, null\)\);/);
  assert.doesNotMatch(launcher, /AutofillOptionsFragment|AutofillOptionsReferrer/);
});

test('Settings and startup check the new request against the same service and policy', () => {
  assert.match(host, /prefs\.setBoolean\(Pref\.AUTOFILL_USING_PLATFORM_AUTOFILL,\s*on && AutofillClientProviderUtils\.getAutofillAvailabilityForRequest\(prefs, on\)\s*== AndroidAutofillAvailabilityStatus\.AVAILABLE\);/);
  assert.match(provider, /Java_AutofillClientProviderUtils_getAutofillAvailabilityForRequest\(\s*base::android::AttachCurrentThread\(\), &prefs,\s*prefs\.GetBoolean\(prefs::kAutofillPlatformRequested\)\)/);
  assert.match(utils, /getAutofillAvailabilityForRequest\([^{]+boolean requested\) \{\s*return getAutofillAvailability\(prefs, requested\);/);
  assert.match(utils, /getAndroidAutofillFrameworkAvailability\([^{]+\) \{\s*return getAutofillAvailability\(prefs, (?:\/\*[^*]*\*\/ )?null\);/);
  const google = utils.indexOf('return AndroidAutofillAvailabilityStatus.ANDROID_AUTOFILL_SERVICE_IS_GOOGLE;');
  const request = utils.indexOf('if (requested != null)');
  const remembered = utils.indexOf('if (autofillServicePackage.equals(storedPackage))');
  assert.ok(google >= 0 && google < request && request < remembered, 'an explicit wish is evaluated after service eligibility and before any remembered service');
  assert.match(utils.slice(request, remembered), /return requested\s*\? AndroidAutofillAvailabilityStatus\.AVAILABLE\s*: AndroidAutofillAvailabilityStatus\.SETTING_TURNED_OFF;/);
});

test('The reset metric reads the previous active client before the provider writes the result', () => {
  assert.match(provider, /prefs\.GetBoolean\(prefs::kAutofillUsingPlatformAutofill\) &&\s*!uses_platform_autofill/);
  const record = provider.indexOf('RecordWhetherAndroidPrefResets(*prefs, uses_platform_autofill_);');
  assert.ok(record >= 0);
  assert.doesNotMatch(provider.slice(0, record), /SetBoolean\(prefs::kAutofillUsingPlatformAutofill/);
  assert.doesNotMatch(utils, /setBoolean\(Pref\.AUTOFILL_USING_PLATFORM_AUTOFILL/);
});

test('The provider always writes the selected client back to the active pref', () => {
  assert.match(provider, /RecordWhetherAndroidPrefResets\(\*prefs, uses_platform_autofill_\);\s*(?:\/\/[^\n]*\s*)*prefs->SetBoolean\(prefs::kAutofillUsingPlatformAutofill,\s*uses_platform_autofill_\);\s*if \(uses_platform_autofill_\)/);
});

test('The one-time autofill migration is gone', () => {
  for (const source of [header, registration, provider]) {
    assert.doesNotMatch(source, /kAutofillPlatformDefaultApplied|blanc\.autofill\.platform_default_applied|ClearPref\(prefs::kAutofillUsingPlatformAutofill\)/);
  }
});

test('Browsing lists the autofill switch and password manager picker after Default browser', () => {
  const layout = readFileSync(new URL('../blanc/android/java/src/org/chromium/blanc/settings/SettingsLayout.java', import.meta.url), 'utf8');
  const rows = layout.match(/new Section\("blanc_browsing_section",\s*List\.of\(([^)]*)\)\)/)?.[1];
  assert.ok(rows, 'Browsing section is present');
  assert.deepEqual([...rows.matchAll(/"([^"]+)"/g)].map(match => match[1]), [
    'blanc_search_engine', 'blanc_default_browser', 'blanc_platform_autofill', 'blanc_choose_password_manager',
  ]);
});

test("Settings reads and writes the person's autofill request", () => {
  assert.match(host, /PLATFORM_AUTOFILL_REQUESTED\s*=\s*"blanc\.autofill\.platform_requested";/);
  assert.match(host, /\.getBoolean\(PLATFORM_AUTOFILL_REQUESTED\)/);
  assert.match(host, /prefs\.setBoolean\(PLATFORM_AUTOFILL_REQUESTED, on\);/);
  assert.match(host, /if \(!on\) \{\s+prefs\.setString\(Pref\.AUTOFILL_THIRD_PARTY_PACKAGE_USED_FOR_PLATFORM_AUTOFILL, ""\);/);
});

test('Settings shows autofill off and disabled when policy blocks it', () => {
  assert.match(host, /boolean platformAutofillAllowed\(\) \{\s*return UserPrefs\.get\(ProfileManager\.getLastUsedRegularProfile\(\)\)\s*\.getBoolean\(Pref\.AUTOFILL_THIRD_PARTY_PASSWORD_MANAGERS_ALLOWED\);/);
  assert.match(screen, /boolean allowed = host\.platformAutofillAllowed\(\);/);
  assert.match(screen, /autofill\.setEnabled\(allowed\);/);
  assert.match(screen, /autofill\.setChecked\(allowed && host\.platformAutofillRequested\(\)\);/);
  assert.match(screen, /if \(!host\.platformAutofillAllowed\(\)\) return false;\s*host\.setPlatformAutofillRequested\(/);
});

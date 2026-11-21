import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {patchedChromiumFile} from './android-patched-file.mjs';

const registration = patchedChromiumFile('components/autofill/core/common/autofill_prefs.cc');
const header = patchedChromiumFile('components/autofill/core/common/autofill_prefs.h');
const provider = patchedChromiumFile('chrome/browser/ui/autofill/autofill_client_provider.cc');
const providerTests = patchedChromiumFile('chrome/browser/ui/autofill/autofill_client_provider_unittest.cc');
const launcher = patchedChromiumFile('chrome/android/java/src/org/chromium/chrome/browser/AutofillOptionsLauncher.java');
const launcherTests = patchedChromiumFile('chrome/android/javatests/src/org/chromium/chrome/browser/AutofillOptionsLauncherTest.java');
const utils = patchedChromiumFile('chrome/browser/autofill/android/java/src/org/chromium/chrome/browser/autofill/AutofillClientProviderUtils.java');
const mediator = patchedChromiumFile('chrome/browser/autofill/android/java/src/org/chromium/chrome/browser/autofill/settings/options/AutofillOptionsMediator.java');
const settings = new URL('../blanc/android/java/src/org/chromium/blanc/settings/', import.meta.url);
const host = readFileSync(new URL('chromium/ChromiumSettingsHost.java', settings), 'utf8');
const hostTests = readFileSync(new URL('../blanc/android/junit/src/org/chromium/blanc/settings/chromium/ChromiumSettingsHostTest.java', import.meta.url), 'utf8');
const screen = readFileSync(new URL('BlancSettingsScreen.java', settings), 'utf8');

function nativeTestBody(name) {
  const body = providerTests.match(new RegExp(`TEST_F\\(\\w+,\\s*${name}\\) \\{([\\s\\S]*?)\\n\\}`))?.[1];
  assert.ok(body, `missing native provider test ${name}`);
  return body;
}

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

test("Confirming Chromium’s autofill setting saves the request and forgets the package on opt-out", () => {
  const confirm = mediator.match(/private void onConfirmWithRestart\(\) \{([\s\S]*?)\n    \}/)[1];
  assert.match(confirm, /prefs\(\)\.setBoolean\(Pref\.AUTOFILL_PLATFORM_REQUESTED, requested\);[\s\S]*?updatePackageUsedForAutofill\(prefs\(\), requested\);[\s\S]*?mRestartRunnable\.run\(\);/);
  assert.match(confirm, /boolean requested = mModel\.get\(THIRD_PARTY_AUTOFILL_ENABLED\);/);
  assert.match(utils, /if \(currentlyUsesPlatformAutofill\) \{\s*saveThirdPartyPackageUsedForAutofill\(prefs, currentlyUsesPlatformAutofill\);\s*\} else \{\s*prefs\.setString\(Pref\.AUTOFILL_THIRD_PARTY_PACKAGE_USED_FOR_PLATFORM_AUTOFILL, ""\);/);
});

test("Custom Tabs honor the test override before asking their profile's native provider", () => {
  assert.match(utils, /isPlatformAutofillEnabledForProfile\(Profile profile\) \{\s*if \(sAndroidAutofillFrameworkAvailabilityForTesting != null\) \{\s*return sAndroidAutofillFrameworkAvailabilityForTesting\s*== AndroidAutofillAvailabilityStatus\.AVAILABLE;\s*\}\s*return AutofillClientProviderUtilsJni\.get\(\)\.usesPlatformAutofill\(profile\);\s*\}/);
  assert.match(utils, /@NativeMethods\s*interface Natives \{\s*boolean usesPlatformAutofill\(@JniType\("Profile\*"\) Profile profile\);/);
  assert.match(provider, /JNI_AutofillClientProviderUtils_UsesPlatformAutofill\(\s*JNIEnv\*\s*\w*,\s*Profile\* profile\) \{\s*return AutofillClientProviderFactory::GetForProfile\(profile\)\s*\.uses_platform_autofill\(\);/);
});

test("The launcher test checks the Settings host and root fragment contract", () => {
  assert.match(launcherTests, /SettingsInTab\.shouldOpenSettingsInTab\(\)\s*\? ChromeLauncherActivity\.class\s*: SettingsActivity\.class/);
  assert.match(launcherTests, /hasComponent\(expectedActivityClass\.getName\(\)\),\s*not\(hasExtra\(is\(SettingsIntentUtil\.EXTRA_SHOW_FRAGMENT\),\s*notNullValue\(\)\)\)/);
  assert.doesNotMatch(launcherTests, /AutofillOptionsFragment/);
});

test("Both disabled-pref tests set the request and check the resulting active pref", () => {
  for (const name of ['UsesBuiltInAutofillForDisabledPref', 'CreateChromeClientForDisabledPref']) {
    const body = nativeTestBody(name);
    assert.match(body, /SetBoolean\(prefs::kAutofillPlatformRequested, false\);[\s\S]*?EXPECT_FALSE\(provider\(\)\.uses_platform_autofill\(\)\);[\s\S]*?EXPECT_FALSE\(prefs\(\)\.GetBoolean\(prefs::kAutofillUsingPlatformAutofill\)\);/);
    assert.doesNotMatch(body, /SetBoolean\(prefs::kAutofillUsingPlatformAutofill, false\)/);
  }
  assert.match(nativeTestBody('CreateChromeClientForDisabledPref'), /SetBoolean\(prefs::kAutofillPlatformRequested, true\);\s*EXPECT_FALSE\(provider\(\)\.uses_platform_autofill\(\)\);/);
});

test('The native provider checks the saved request against service availability and policy', () => {
  assert.match(provider, /Java_AutofillClientProviderUtils_getAutofillAvailabilityForRequest\(\s*base::android::AttachCurrentThread\(\), &prefs,\s*prefs\.GetBoolean\(prefs::kAutofillPlatformRequested\)\)/);
  assert.match(utils, /getAutofillAvailabilityForRequest\([^{]+boolean requested\) \{\s*return getAutofillAvailability\(prefs, requested\);/);
  assert.match(utils, /getAndroidAutofillFrameworkAvailability\([^{]+\) \{\s*return getAutofillAvailability\(prefs, (?:\/\*[^*]*\*\/ )?null\);/);
  const google = utils.indexOf('return AndroidAutofillAvailabilityStatus.ANDROID_AUTOFILL_SERVICE_IS_GOOGLE;');
  const request = utils.indexOf('if (requested != null)');
  const remembered = utils.indexOf('if (autofillServicePackage.equals(storedPackage))');
  assert.ok(google >= 0 && google < request && request < remembered, 'an explicit wish is evaluated after service eligibility and before any remembered service');
  assert.match(utils.slice(request, remembered), /return requested\s*\? AndroidAutofillAvailabilityStatus\.AVAILABLE\s*: AndroidAutofillAvailabilityStatus\.SETTING_TURNED_OFF;/);
});

test('The reset metric counts loss of a requested service and excludes an opt-out', () => {
  assert.match(provider, /will_reset_pref =\s*prefs\.GetBoolean\(prefs::kAutofillPlatformRequested\) &&\s*prefs\.GetBoolean\(prefs::kAutofillUsingPlatformAutofill\) &&\s*!uses_platform_autofill;/);
  const record = provider.indexOf('RecordWhetherAndroidPrefResets(*prefs, uses_platform_autofill_);');
  assert.ok(record >= 0);
  assert.doesNotMatch(provider.slice(0, record), /SetBoolean\(prefs::kAutofillUsingPlatformAutofill/);
  assert.doesNotMatch(utils, /setBoolean\(Pref\.AUTOFILL_USING_PLATFORM_AUTOFILL/);
});

test('Native histogram tests cover opt-out and service loss from a previously active client', () => {
  const optOut = nativeTestBody('CreateChromeClientForDisabledPref');
  const serviceLoss = nativeTestBody('RecordsResetWhenRequestedServiceIsLost');
  for (const body of [optOut, serviceLoss]) {
    assert.match(body, /SetBoolean\(prefs::kAutofillUsingPlatformAutofill, true\);[\s\S]*?EXPECT_FALSE\(provider\(\)\.uses_platform_autofill\(\)\);/);
  }
  assert.match(optOut, /SetBoolean\(prefs::kAutofillPlatformRequested, false\);[\s\S]*?ExpectUniqueSample\(kResetPrefMetric, false, 1\);/);
  assert.match(serviceLoss, /SetAutofillAvailabilityForTesting\(\s*AndroidAutofillAvailabilityStatus::kUnknownAndroidAutofillService\);/);
  assert.match(serviceLoss, /EXPECT_TRUE\(prefs\(\)\.GetBoolean\(prefs::kAutofillPlatformRequested\)\);/);
  assert.match(serviceLoss, /ExpectUniqueSample\(kResetPrefMetric, true, 1\);/);
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

test("Settings and its tests use the generated request pref and leave the active client alone until restart", () => {
  assert.match(host, /\.getBoolean\(Pref\.AUTOFILL_PLATFORM_REQUESTED\)/);
  assert.match(host, /prefs\.setBoolean\(Pref\.AUTOFILL_PLATFORM_REQUESTED, on\);/);
  assert.match(host, /if \(!on\) \{\s+prefs\.setString\(Pref\.AUTOFILL_THIRD_PARTY_PACKAGE_USED_FOR_PLATFORM_AUTOFILL, ""\);/);
  assert.doesNotMatch(host, /setBoolean\(\s*Pref\.AUTOFILL_USING_PLATFORM_AUTOFILL\b/);
  assert.match(hostTests, /verify\(mPrefs\)\.setBoolean\(Pref\.AUTOFILL_PLATFORM_REQUESTED, true\);/);
  assert.match(hostTests, /verify\(mPrefs\)\.setBoolean\(Pref\.AUTOFILL_PLATFORM_REQUESTED, false\);/);
  for (const source of [host, hostTests]) assert.doesNotMatch(source, /"blanc\.autofill\.platform_requested"/);
});

test('Policy disables both autofill rows and shows the managed note on each', () => {
  assert.match(host, /boolean platformAutofillAllowed\(\) \{\s*return UserPrefs\.get\(ProfileManager\.getLastUsedRegularProfile\(\)\)\s*\.getBoolean\(Pref\.AUTOFILL_THIRD_PARTY_PASSWORD_MANAGERS_ALLOWED\);/);
  assert.match(screen, /boolean allowed = host\.platformAutofillAllowed\(\);/);
  assert.match(screen, /autofill\.setEnabled\(allowed\);/);
  assert.match(screen, /autofill\.setChecked\(allowed && host\.platformAutofillRequested\(\)\);/);
  assert.match(screen, /if \(!host\.platformAutofillAllowed\(\)\) return false;\s*host\.setPlatformAutofillRequested\(/);
  assert.match(screen, /autofill\.setSummary\(allowed \? R\.string\.blanc_android_settings_autofill_summary\s*: R\.string\.blanc_android_settings_autofill_managed\);/);
  const picker = screen.match(/case "blanc_choose_password_manager":([\s\S]*?)break;/)[1];
  assert.match(picker, /boolean pickerAllowed = host\.platformAutofillAllowed\(\);/);
  assert.match(picker, /row\.setEnabled\(pickerAllowed\);/);
  assert.match(picker, /pickerAllowed \? R\.string\.blanc_android_settings_autofill_choose_summary\s*: R\.string\.blanc_android_settings_autofill_managed/);
  assert.match(picker, /if \(host\.platformAutofillAllowed\(\)\) host\.openPasswordManagerPicker\(\);/);
});

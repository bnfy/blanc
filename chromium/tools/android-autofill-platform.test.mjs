import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {patchedChromiumFile} from './android-patched-file.mjs';

const registration = patchedChromiumFile('components/autofill/core/common/autofill_prefs.cc');
const header = patchedChromiumFile('components/autofill/core/common/autofill_prefs.h');
const provider = patchedChromiumFile('chrome/browser/ui/autofill/autofill_client_provider.cc');
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

test('The provider seeds the active pref from the request before checking availability', () => {
  const helper = provider.match(/bool UsesVirtualViewStructureForAutofill\(PrefService& prefs\) \{([\s\S]*?)\n\}/)[1];
  assert.match(helper, /prefs\.SetBoolean\(prefs::kAutofillUsingPlatformAutofill,\s*prefs\.GetBoolean\(prefs::kAutofillPlatformRequested\)\);\s*const AndroidAutofillAvailabilityStatus availability =\s*GetAndroidAutofillAvailabilityStatus\(prefs\);/);
  assert.match(provider, /: uses_platform_autofill_\(\s*UsesVirtualViewStructureForAutofill\(CHECK_DEREF\(prefs\)\)\)/);
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
  assert.doesNotMatch(host, /Pref\.AUTOFILL_USING_PLATFORM_AUTOFILL/);
  assert.match(host, /if \(!on\) \{\s+prefs\.setString\(Pref\.AUTOFILL_THIRD_PARTY_PACKAGE_USED_FOR_PLATFORM_AUTOFILL, ""\);/);
});

test('Settings shows autofill off and disabled when policy blocks it', () => {
  assert.match(host, /boolean platformAutofillAllowed\(\) \{\s*return UserPrefs\.get\(ProfileManager\.getLastUsedRegularProfile\(\)\)\s*\.getBoolean\(Pref\.AUTOFILL_THIRD_PARTY_PASSWORD_MANAGERS_ALLOWED\);/);
  assert.match(screen, /boolean allowed = host\.platformAutofillAllowed\(\);/);
  assert.match(screen, /autofill\.setEnabled\(allowed\);/);
  assert.match(screen, /autofill\.setChecked\(allowed && host\.platformAutofillRequested\(\)\);/);
  assert.match(screen, /if \(!host\.platformAutofillAllowed\(\)\) return false;\s*host\.setPlatformAutofillRequested\(/);
});

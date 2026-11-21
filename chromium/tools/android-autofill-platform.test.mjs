import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {patchedChromiumFile} from './android-patched-file.mjs';

test('Android enables platform autofill by default', () => {
  const source = patchedChromiumFile('components/autofill/core/common/autofill_prefs.cc');
  assert.match(source, /#if BUILDFLAG\(IS_ANDROID\)\s+registry->RegisterBooleanPref\(kAutofillUsingPlatformAutofill, true\);/);
});

test('Android registers the autofill migration marker as false for each profile', () => {
  const prefs = patchedChromiumFile('components/autofill/core/common/autofill_prefs.cc');
  assert.ok(/#if BUILDFLAG\(IS_ANDROID\)\s+registry->RegisterBooleanPref\(kAutofillUsingPlatformAutofill, true\);\s+registry->RegisterBooleanPref\(kAutofillPlatformDefaultApplied, false\);/.test(prefs),
    'the marker defaults to false alongside the Android autofill preference');
  const header = patchedChromiumFile('components/autofill/core/common/autofill_prefs.h');
  assert.match(header, /inline constexpr char kAutofillPlatformDefaultApplied\[\] =\s*"blanc\.autofill\.platform_default_applied";/);
});

test('startup clears the saved autofill choice once before checking availability', () => {
  const provider = patchedChromiumFile('chrome/browser/ui/autofill/autofill_client_provider.cc');
  const helper = provider.match(/bool ShouldUsePlatformAutofill\(PrefService& prefs\) \{([\s\S]*?)\n\}/)?.[1];
  assert.ok(helper, 'startup has a helper for migrating and checking availability');
  assert.match(helper, /if \(!prefs\.GetBoolean\(prefs::kAutofillPlatformDefaultApplied\)\) \{\s+prefs\.ClearPref\(prefs::kAutofillUsingPlatformAutofill\);\s+prefs\.SetBoolean\(prefs::kAutofillPlatformDefaultApplied, true\);\s+\}\s*#endif[^\n]*\s+return UsesVirtualViewStructureForAutofill\(prefs\);/);
  assert.match(provider, /: uses_platform_autofill_\(\s*ShouldUsePlatformAutofill\(CHECK_DEREF\(prefs\)\)\)/);
});

test('startup writes the platform autofill preference only when the service is available', () => {
  const source = patchedChromiumFile('chrome/browser/ui/autofill/autofill_client_provider.cc');
  const write = /prefs->SetBoolean\(\s*prefs::kAutofillUsingPlatformAutofill,/g;
  assert.equal([...source.matchAll(write)].length, 1);
  assert.match(source, /if \(uses_platform_autofill_\) \{\s+prefs->SetBoolean\(prefs::kAutofillUsingPlatformAutofill,\s*true\);/);
});

test('Browsing lists the autofill switch and password manager picker after Default browser', () => {
  const layout = readFileSync(new URL('../blanc/android/java/src/org/chromium/blanc/settings/SettingsLayout.java', import.meta.url), 'utf8');
  const rows = layout.match(/new Section\("blanc_browsing_section",\s*List\.of\(([^)]*)\)\)/)?.[1];
  assert.ok(rows, 'Browsing section is present');
  assert.deepEqual([...rows.matchAll(/"([^"]+)"/g)].map(match => match[1]), [
    'blanc_search_engine', 'blanc_default_browser', 'blanc_platform_autofill', 'blanc_choose_password_manager',
  ]);
});

test('turning autofill off forgets the service that could turn it back on at startup', () => {
  const host = readFileSync(new URL('../blanc/android/java/src/org/chromium/blanc/settings/chromium/ChromiumSettingsHost.java', import.meta.url), 'utf8');
  const setter = host.match(/public void setPlatformAutofillEnabled\(boolean on\) \{([\s\S]*?)\n    \}/)?.[1];
  assert.ok(setter, 'Settings writes the profile preference');
  assert.match(setter, /prefs\.setBoolean\(Pref\.AUTOFILL_USING_PLATFORM_AUTOFILL, on\);/);
  assert.match(setter, /if \(!on\) \{\s+prefs\.setString\(Pref\.AUTOFILL_THIRD_PARTY_PACKAGE_USED_FOR_PLATFORM_AUTOFILL, ""\);/);
});

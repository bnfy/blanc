// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.settings.chromium;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.annotation.Config;

import org.chromium.base.test.BaseRobolectricTestRunner;
import org.chromium.chrome.browser.autofill.AndroidAutofillAvailabilityStatus;
import org.chromium.chrome.browser.autofill.AutofillClientProviderUtils;
import org.chromium.chrome.browser.preferences.Pref;
import org.chromium.components.prefs.PrefService;

@RunWith(BaseRobolectricTestRunner.class)
@Config(manifest = Config.NONE)
public class ChromiumSettingsHostTest {
    private final PrefService mPrefs = mock(PrefService.class);
    private static final String REQUEST = "blanc.autofill.platform_requested";

    @Test
    public void turningOnWithGoogleSelectedKeepsOnlyTheRequestOn() {
        AutofillClientProviderUtils.setAutofillAvailabilityToUseForTesting(
                AndroidAutofillAvailabilityStatus.ANDROID_AUTOFILL_SERVICE_IS_GOOGLE);
        ChromiumSettingsHost.setPlatformAutofillRequested(mPrefs, true);
        verify(mPrefs).setBoolean(REQUEST, true);
        verify(mPrefs).setBoolean(Pref.AUTOFILL_USING_PLATFORM_AUTOFILL, false);
        verify(mPrefs, never()).setBoolean(Pref.AUTOFILL_USING_PLATFORM_AUTOFILL, true);
    }

    @Test
    public void turningOnWithAnAvailableServiceAlsoEnablesTheActiveClient() {
        AutofillClientProviderUtils.setAutofillAvailabilityToUseForTesting(
                AndroidAutofillAvailabilityStatus.AVAILABLE);
        ChromiumSettingsHost.setPlatformAutofillRequested(mPrefs, true);
        verify(mPrefs).setBoolean(REQUEST, true);
        verify(mPrefs).setBoolean(Pref.AUTOFILL_USING_PLATFORM_AUTOFILL, true);
    }

    @Test
    public void turningOffDisablesEvenAnAvailableServiceAndForgetsItsPackage() {
        AutofillClientProviderUtils.setAutofillAvailabilityToUseForTesting(
                AndroidAutofillAvailabilityStatus.AVAILABLE);
        ChromiumSettingsHost.setPlatformAutofillRequested(mPrefs, false);
        verify(mPrefs).setBoolean(REQUEST, false);
        verify(mPrefs).setBoolean(Pref.AUTOFILL_USING_PLATFORM_AUTOFILL, false);
        verify(mPrefs, never()).setBoolean(Pref.AUTOFILL_USING_PLATFORM_AUTOFILL, true);
        verify(mPrefs).setString(Pref.AUTOFILL_THIRD_PARTY_PACKAGE_USED_FOR_PLATFORM_AUTOFILL, "");
    }
}

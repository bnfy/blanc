// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.settings.chromium;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoMoreInteractions;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.annotation.Config;

import org.chromium.base.test.BaseRobolectricTestRunner;
import org.chromium.chrome.browser.preferences.Pref;
import org.chromium.components.prefs.PrefService;

@RunWith(BaseRobolectricTestRunner.class)
@Config(manifest = Config.NONE)
public class ChromiumSettingsHostTest {
    private final PrefService mPrefs = mock(PrefService.class);

    @Test
    public void turningOnOnlySavesTheRequest() {
        ChromiumSettingsHost.setPlatformAutofillRequested(mPrefs, true);
        verify(mPrefs).setBoolean(Pref.AUTOFILL_PLATFORM_REQUESTED, true);
        verifyNoMoreInteractions(mPrefs);
    }

    @Test
    public void turningOffSavesTheRequestAndForgetsThePackage() {
        ChromiumSettingsHost.setPlatformAutofillRequested(mPrefs, false);
        verify(mPrefs).setBoolean(Pref.AUTOFILL_PLATFORM_REQUESTED, false);
        verify(mPrefs).setString(Pref.AUTOFILL_THIRD_PARTY_PACKAGE_USED_FOR_PLATFORM_AUTOFILL, "");
        verifyNoMoreInteractions(mPrefs);
    }
}

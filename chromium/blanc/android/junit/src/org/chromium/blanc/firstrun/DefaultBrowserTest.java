// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.firstrun;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.provider.Settings;

import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.Shadows;

import org.chromium.base.test.BaseRobolectricTestRunner;
import org.chromium.build.annotations.Nullable;

/** The default-browser offer: Android's role dialog twice at most, then Default apps. */
@RunWith(BaseRobolectricTestRunner.class)
public class DefaultBrowserTest {
    private static final Intent ROLE = new Intent("android.app.role.action.REQUEST_ROLE");

    private Activity mActivity;
    private SharedPreferences mPrefs;
    private @Nullable Boolean mHeld = false;

    private final DefaultBrowser.Roles mRoles = new DefaultBrowser.Roles() {
        @Override public @Nullable Boolean held() { return mHeld; }
        @Override public @Nullable Intent request() { return mHeld == null ? null : ROLE; }
    };

    @Before
    public void setUp() {
        mActivity = Robolectric.buildActivity(Activity.class).setup().get();
        mPrefs = RuntimeEnvironment.getApplication().getSharedPreferences("default-browser", 0);
        mPrefs.edit().clear().commit();
    }

    // Robolectric records a start for a result among the started activities too.
    private Intent next() {
        return Shadows.shadowOf(mActivity).getNextStartedActivity();
    }

    @Test
    public void asksWithTheRoleOnlyWhileBlancIsntTheDefaultAndAtMostTwice() {
        assertTrue(DefaultBrowser.asksWithRole(false, 0));
        assertTrue(DefaultBrowser.asksWithRole(false, 1));
        assertFalse(DefaultBrowser.asksWithRole(false, 2));
        assertFalse(DefaultBrowser.asksWithRole(true, 0));
        assertFalse(DefaultBrowser.asksWithRole(null, 0));
    }

    @Test
    public void theThirdPressOpensDefaultApps() {
        DefaultBrowser.request(mActivity, mRoles, mPrefs);
        assertEquals(ROLE.getAction(), next().getAction());
        DefaultBrowser.request(mActivity, mRoles, mPrefs);
        assertEquals(ROLE.getAction(), next().getAction());
        DefaultBrowser.request(mActivity, mRoles, mPrefs);
        assertEquals(Settings.ACTION_MANAGE_DEFAULT_APPS_SETTINGS, next().getAction());
        assertEquals(2, mPrefs.getInt(DefaultBrowser.REQUESTS_KEY, 0));
    }

    @Test
    public void whenBlancIsTheDefaultOrThereIsNoRoleItOpensDefaultApps() {
        mHeld = true;
        DefaultBrowser.request(mActivity, mRoles, mPrefs);
        assertEquals(Settings.ACTION_MANAGE_DEFAULT_APPS_SETTINGS, next().getAction());
        mHeld = null;
        DefaultBrowser.request(mActivity, mRoles, mPrefs);
        assertEquals(Settings.ACTION_MANAGE_DEFAULT_APPS_SETTINGS, next().getAction());
        assertEquals(0, mPrefs.getInt(DefaultBrowser.REQUESTS_KEY, 0));
    }
}

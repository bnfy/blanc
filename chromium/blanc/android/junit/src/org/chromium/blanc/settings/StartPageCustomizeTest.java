// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.settings;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Looper;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.Shadows;

import org.chromium.base.test.BaseRobolectricTestRunner;

import java.util.ArrayList;
import java.util.List;

/** The way to the Start Page's Customize from Settings and the Island menu (A5b). */
@RunWith(BaseRobolectricTestRunner.class)
public class StartPageCustomizeTest {
    @Test
    public void everyAskReachesTheListenerEvenTwiceInARow() {
        SharedPreferences prefs =
                RuntimeEnvironment.getApplication().getSharedPreferences("customize", Context.MODE_PRIVATE);
        List<String> heard = new ArrayList<>();
        SharedPreferences.OnSharedPreferenceChangeListener listener = (p, key) -> heard.add(key);
        prefs.registerOnSharedPreferenceChangeListener(listener);
        StartPageCustomize.request(prefs);
        StartPageCustomize.request(prefs);
        Shadows.shadowOf(Looper.getMainLooper()).idle();
        assertEquals(List.of(StartPageCustomize.KEY, StartPageCustomize.KEY), heard);
        prefs.unregisterOnSharedPreferenceChangeListener(listener);
    }

    @Test
    public void aStartPageOpensCustomizeOnItselfKeepingItsQuery() {
        assertEquals("chrome://blanc/newtab.html#customize", StartPageCustomize.onTab("chrome://blanc/newtab.html"));
        assertEquals("chrome://blanc/newtab.html?private=1#customize",
                StartPageCustomize.onTab("chrome://blanc/newtab.html?private=1"));
        assertEquals("chrome://blanc/newtab.html#customize",
                StartPageCustomize.onTab("chrome://blanc/newtab.html#customize"));
    }

    @Test
    public void anyOtherPageGetsANewStartPage() {
        assertNull(StartPageCustomize.onTab("https://example.com/newtab.html"));
        assertNull(StartPageCustomize.onTab("chrome://blanc/history.html"));
        assertNull(StartPageCustomize.onTab("chrome://blanc/start/newtab.html"));
    }
}

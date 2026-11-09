// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.settings;

import static org.junit.Assert.assertEquals;

import android.content.SharedPreferences;

import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RuntimeEnvironment;

import org.chromium.base.test.BaseRobolectricTestRunner;

/** The three settings Android's Settings writes: theme, search engine and Island position. */
@RunWith(BaseRobolectricTestRunner.class)
public class SettingsStoreTest {
    private SharedPreferences mPrefs;
    private SettingsStore mStore;

    @Before
    public void setUp() {
        mPrefs = RuntimeEnvironment.getApplication().getSharedPreferences("settings-store", 0);
        mPrefs.edit().clear().commit();
        mStore = new SettingsStore(mPrefs);
    }

    @Test
    public void themeWritesTheValueTheSlashCommandAndSyncUse() {
        assertEquals("system", mStore.theme());
        mStore.setTheme("dark");
        assertEquals(2, mPrefs.getInt("ui_theme_setting", -1));
        assertEquals("dark", mStore.theme());
        mStore.setTheme("light");
        assertEquals(1, mPrefs.getInt("ui_theme_setting", -1));
    }

    @Test
    public void anUnknownThemeIsIgnored() {
        mStore.setTheme("dark");
        mStore.setTheme("sepia");
        assertEquals("dark", mStore.theme());
    }

    @Test
    public void aThemeOutOfRangeReadsAsTheNearestKnownOne() {
        mPrefs.edit().putInt("ui_theme_setting", 9).commit();
        assertEquals("dark", mStore.theme());
        mPrefs.edit().putInt("ui_theme_setting", -4).commit();
        assertEquals("system", mStore.theme());
    }

    @Test
    public void searchEngineDefaultsToDuckDuckGoAndReadsBackASavedOne() {
        assertEquals("duckduckgo", mStore.searchEngine());
        mStore.setSearchEngine("kagi");
        assertEquals("kagi", mStore.searchEngine());
        assertEquals("kagi", mPrefs.getString("blanc.search_engine", null));
    }

    @Test
    public void anEngineThePhoneDoesNotOfferIsNeverStored() {
        mStore.setSearchEngine("kagi");
        mStore.setSearchEngine("custom");
        mStore.setSearchEngine("somethingNew");
        assertEquals("kagi", mStore.searchEngine());
    }

    @Test
    public void aStoredEngineFromAnOlderOrNewerBlancReadsAsDuckDuckGo() {
        mPrefs.edit().putString("blanc.search_engine", "custom").commit();
        assertEquals("duckduckgo", mStore.searchEngine());
    }

    @Test
    public void islandPositionDefaultsToBottomAndRoundTripsUnderTheKeyTheIslandReads() {
        assertEquals("bottom", mStore.islandPosition());
        mStore.setIslandPosition("top");
        assertEquals("top", mStore.islandPosition());
        assertEquals("top", mPrefs.getString("blanc.island_position", null));
        mStore.setIslandPosition("sideways");
        assertEquals("top", mStore.islandPosition());
    }

    @Test
    public void searchTemplateFollowsTheSavedEngine() {
        mStore.setSearchEngine("brave");
        assertEquals("https://search.brave.com/search?q=%s", mStore.searchTemplate());
    }
}

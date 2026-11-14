// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.settings;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import android.app.Activity;
import android.content.Context;

import androidx.preference.ListPreference;
import androidx.preference.Preference;
import androidx.preference.PreferenceManager;
import androidx.preference.PreferenceScreen;
import androidx.preference.SwitchPreferenceCompat;

import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.annotation.Config;

import org.chromium.base.test.BaseRobolectricTestRunner;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;

/** Blanc's step over Chromium's Settings root (docs/android/a5a-settings-spike.md). */
@RunWith(BaseRobolectricTestRunner.class)
@Config(manifest = Config.NONE)
public class BlancSettingsScreenTest {
    private static final List<String> CHROMIUM_ROWS = List.of("settings_promo_card",
            "account_and_google_services_section", "sign_in", "google_services", "basics_section", "search_engine",
            "address_bar", "privacy", "safety_hub", "default_browser", "autofill_and_passwords", "passwords",
            "advanced_section", "tabs", "homepage", "notifications", "appearance", "glic", "accessibility",
            "content_settings", "languages", "downloads", "developer", "about_chrome");

    private final List<String> mCalls = new ArrayList<>();
    private Activity mActivity;
    private PreferenceScreen mScreen;
    private boolean mConnected;
    private boolean mDebug;
    private String mTheme = "system";
    private String mEngine = "duckduckgo";
    private String mPosition = "bottom";
    private boolean mBlocker = true;

    private final BlancSettingsScreen.Host mHost = new BlancSettingsScreen.Host() {
        @Override public Context context() { return mActivity; }
        @Override public boolean debugBuild() { return mDebug; }
        @Override public boolean syncConnected() { return mConnected; }
        @Override public String appName() { return "Blanc"; }
        @Override public String version() { return "156.0.0.1"; }
        @Override public String theme() { return mTheme; }
        @Override public void setTheme(String value) { mTheme = value; mCalls.add("theme " + value); }
        @Override public String searchEngine() { return mEngine; }
        @Override public void setSearchEngine(String id) { mEngine = id; mCalls.add("engine " + id); }
        @Override public String islandPosition() { return mPosition; }
        @Override public void setIslandPosition(String value) { mPosition = value; mCalls.add("position " + value); }
        @Override public boolean blockerEnabled() { return mBlocker; }
        @Override public void setBlockerEnabled(boolean on) { mBlocker = on; mCalls.add("blocker " + on); }
        @Override public void openSync() { mCalls.add("sync"); }
        @Override public void openAllowedSites() { mCalls.add("allowed"); }
        @Override public void clearSiteData() { mCalls.add("clear"); }
        @Override public void openUrl(String url) { mCalls.add("url " + url); }
        @Override public void openLicenses() { mCalls.add("licenses"); }
        @Override public void openStartPage() { mCalls.add("start page"); }
    };

    @Before
    public void setUp() {
        mActivity = Robolectric.buildActivity(Activity.class).setup().get();
        mScreen = new PreferenceManager(mActivity).createPreferenceScreen(mActivity);
        for (String key : CHROMIUM_ROWS) {
            Preference row = new Preference(mActivity);
            row.setKey(key);
            row.setTitle(key);
            row.setFragment("org.example." + key);
            mScreen.addPreference(row);
        }
    }

    /** The keys a person sees, in order. */
    private List<String> shown() {
        List<Preference> rows = new ArrayList<>();
        for (int i = 0; i < mScreen.getPreferenceCount(); i++) {
            if (mScreen.getPreference(i).isVisible()) rows.add(mScreen.getPreference(i));
        }
        Collections.sort(rows, Comparator.comparingInt(Preference::getOrder));
        List<String> keys = new ArrayList<>();
        for (Preference row : rows) keys.add(row.getKey());
        return keys;
    }

    private Preference row(String key) {
        Preference row = mScreen.findPreference(key);
        assertNotNull(key, row);
        return row;
    }

    @Test
    public void rowsFollowTheLayoutOrder() {
        BlancSettingsScreen.apply(mScreen, mHost);
        assertEquals(List.of("blanc_header",
                "blanc_browsing_section", "blanc_search_engine",
                "blanc_appearance_section", "blanc_theme", "blanc_island_position", "blanc_start_page",
                "blanc_privacy_section", "blanc_blocker", "blanc_allowed_sites", "blanc_clear_site_data",
                "blanc_sync_section", "blanc_sync",
                "blanc_more_section", "content_settings", "notifications", "downloads",
                "blanc_about_section", "blanc_version", "blanc_website", "blanc_privacy_policy", "blanc_support",
                "blanc_licenses"), shown());
    }

    @Test
    public void rowsBlancDoesNotOfferAreHiddenWithNoPage() {
        BlancSettingsScreen.apply(mScreen, mHost);
        for (String key : List.of("google_services", "safety_hub", "address_bar", "tabs", "homepage", "glic",
                "about_chrome", "search_engine", "privacy", "appearance", "default_browser", "languages", "passwords",
                "autofill_and_passwords", "basics_section", "advanced_section", "developer", "accessibility")) {
            Preference row = row(key);
            assertFalse(key, row.isVisible());
            assertNull(key, row.getFragment());
        }
    }

    @Test
    public void signInAndThePromoCardAreRemoved() {
        BlancSettingsScreen.apply(mScreen, mHost);
        assertNull(mScreen.findPreference("sign_in"));
        assertNull(mScreen.findPreference("settings_promo_card"));
    }

    @Test
    public void aRowChromiumDoesNotKnowBlancAboutIsHiddenNotShown() {
        Preference future = new Preference(mActivity);
        future.setKey("some_future_google_row");
        future.setFragment("org.example.Future");
        mScreen.addPreference(future);
        BlancSettingsScreen.apply(mScreen, mHost);
        assertFalse(row("some_future_google_row").isVisible());
        assertFalse(shown().contains("some_future_google_row"));
    }

    @Test
    public void developerAppearsInADebugBuildOnly() {
        BlancSettingsScreen.apply(mScreen, mHost);
        assertFalse(shown().contains("developer"));
        mDebug = true;
        BlancSettingsScreen.apply(mScreen, mHost);
        assertTrue(shown().contains("developer"));
    }

    @Test
    public void applyingTwiceLeavesOneOfEachRow() {
        BlancSettingsScreen.apply(mScreen, mHost);
        List<String> first = shown();
        int count = mScreen.getPreferenceCount();
        BlancSettingsScreen.apply(mScreen, mHost);
        assertEquals(first, shown());
        assertEquals(count, mScreen.getPreferenceCount());
    }

    @Test
    public void aChromiumUpdateThatReAddsARemovedRowIsUndoneByTheNextApply() {
        BlancSettingsScreen.apply(mScreen, mHost);
        Preference signIn = new Preference(mActivity);
        signIn.setKey("sign_in");
        mScreen.addPreference(signIn);
        BlancSettingsScreen.apply(mScreen, mHost);
        assertNull(mScreen.findPreference("sign_in"));
    }

    @Test
    public void theSyncRowSaysConnectedOrNotConnectedAndOpensTheSheet() {
        BlancSettingsScreen.apply(mScreen, mHost);
        assertEquals("Not connected", row("blanc_sync").getSummary().toString());
        mConnected = true;
        BlancSettingsScreen.apply(mScreen, mHost);
        assertEquals("Connected", row("blanc_sync").getSummary().toString());
        row("blanc_sync").performClick();
        assertEquals(List.of("sync"), mCalls);
    }

    @Test
    public void searchEngineThemeAndPositionShowTheHostsValuesAndWriteBack() {
        BlancSettingsScreen.apply(mScreen, mHost);
        ListPreference engine = (ListPreference) row("blanc_search_engine");
        assertEquals("duckduckgo", engine.getValue());
        assertEquals(5, engine.getEntries().length);
        assertTrue(engine.callChangeListener("kagi"));
        ListPreference theme = (ListPreference) row("blanc_theme");
        assertEquals("system", theme.getValue());
        theme.callChangeListener("dark");
        ListPreference position = (ListPreference) row("blanc_island_position");
        assertEquals("bottom", position.getValue());
        position.callChangeListener("top");
        assertEquals(List.of("engine kagi", "theme dark", "position top"), mCalls);
    }

    @Test
    public void aSyncedEngineThePhoneDoesNotOfferShowsDuckDuckGoAndWritesNothing() {
        mEngine = "custom";
        BlancSettingsScreen.apply(mScreen, mHost);
        assertEquals("duckduckgo", ((ListPreference) row("blanc_search_engine")).getValue());
        assertEquals(List.of(), mCalls);
    }

    @Test
    public void theBlockerSwitchShowsAndWritesTheGlobalState() {
        BlancSettingsScreen.apply(mScreen, mHost);
        SwitchPreferenceCompat blocker = (SwitchPreferenceCompat) row("blanc_blocker");
        assertTrue(blocker.isChecked());
        blocker.callChangeListener(false);
        assertEquals(List.of("blocker false"), mCalls);
    }

    @Test
    public void allowedSitesAndClearSiteDataAndTheAboutRowsRunTheirActions() {
        BlancSettingsScreen.apply(mScreen, mHost);
        row("blanc_allowed_sites").performClick();
        row("blanc_clear_site_data").performClick();
        row("blanc_website").performClick();
        row("blanc_privacy_policy").performClick();
        row("blanc_support").performClick();
        row("blanc_licenses").performClick();
        assertEquals(List.of("allowed", "clear", "url https://blanc.day", "url https://blanc.day/privacy",
                "url mailto:support@blanc.day", "licenses"), mCalls);
    }

    @Test
    public void theStartPageRowOpensTheStartPagesCustomize() {
        BlancSettingsScreen.apply(mScreen, mHost);
        assertEquals("Start Page", row("blanc_start_page").getTitle().toString());
        row("blanc_start_page").performClick();
        assertEquals(List.of("start page"), mCalls);
    }

    @Test
    public void theHeaderAndVersionRowsCarryTheNameAndVersionAndDoNothingWhenTapped() {
        BlancSettingsScreen.apply(mScreen, mHost);
        assertEquals("Blanc", row("blanc_header").getTitle().toString());
        assertEquals("156.0.0.1", row("blanc_header").getSummary().toString());
        assertEquals("156.0.0.1", row("blanc_version").getSummary().toString());
        assertFalse(row("blanc_header").isSelectable());
        assertFalse(row("blanc_version").isSelectable());
    }

    @Test
    public void blancRowsNeverWriteToSharedPreferences() {
        BlancSettingsScreen.apply(mScreen, mHost);
        for (String key : List.of("blanc_search_engine", "blanc_theme", "blanc_island_position", "blanc_blocker")) {
            assertFalse(key, row(key).isPersistent());
        }
    }
}

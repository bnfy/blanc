// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.settings;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;
import org.junit.runner.RunWith;

import org.chromium.base.test.BaseRobolectricTestRunner;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;

/** What the Settings root shows, in the iPhone's order (SettingsSheet.swift) with More and Android's rows. */
@RunWith(BaseRobolectricTestRunner.class)
public class SettingsLayoutTest {
    private static final SettingsLayout.State RELEASE = new SettingsLayout.State(false);
    private static final SettingsLayout.State DEBUG = new SettingsLayout.State(true);

    private static SettingsLayout.Section section(String key, SettingsLayout.State state) {
        for (SettingsLayout.Section section : SettingsLayout.sections(state)) {
            if (section.key.equals(key)) return section;
        }
        throw new AssertionError("no section " + key);
    }

    @Test
    public void theRootRunsHeaderThenBrowsingAppearancePrivacySyncMoreAbout() {
        List<String> keys = new ArrayList<>();
        for (SettingsLayout.Section section : SettingsLayout.sections(RELEASE)) keys.add(section.key);
        assertEquals(List.of("blanc_header_section", "blanc_browsing_section", "blanc_appearance_section",
                "blanc_privacy_section", "blanc_sync_section", "blanc_more_section", "blanc_about_section"), keys);
    }

    @Test
    public void eachSectionHoldsTheRowsTheDesignNames() {
        assertEquals(List.of("blanc_header"), section("blanc_header_section", RELEASE).rows);
        assertEquals(List.of("blanc_search_engine", "blanc_default_browser"), section("blanc_browsing_section", RELEASE).rows);
        assertEquals(List.of("blanc_theme", "blanc_island_position", "blanc_start_page"),
                section("blanc_appearance_section", RELEASE).rows);
        assertEquals(List.of("blanc_blocker", "blanc_allowed_sites", "blanc_clear_site_data", "blanc_measure_usage"),
                section("blanc_privacy_section", RELEASE).rows);
        assertEquals(List.of("blanc_sync"), section("blanc_sync_section", RELEASE).rows);
        assertEquals(List.of("content_settings", "notifications", "downloads", "blanc_language"),
                section("blanc_more_section", RELEASE).rows);
        assertEquals(List.of("blanc_version", "blanc_website", "blanc_privacy_policy", "blanc_support", "blanc_licenses",
                        "blanc_show_welcome"),
                section("blanc_about_section", RELEASE).rows);
    }

    @Test
    public void developerSettingsAreForDebugBuildsOnly() {
        assertFalse(section("blanc_more_section", RELEASE).rows.contains("developer"));
        assertTrue(section("blanc_more_section", DEBUG).rows.contains("developer"));
    }

    @Test
    public void shownKeysAreEverySectionHeadingAndRow() {
        Set<String> keys = SettingsLayout.shownKeys(RELEASE);
        assertTrue(keys.contains("blanc_privacy_section"));
        assertTrue(keys.contains("blanc_allowed_sites"));
        assertTrue(keys.contains("content_settings"));
        assertFalse(keys.contains("accessibility"));
        assertFalse(keys.contains("developer"));
        assertTrue(SettingsLayout.shownKeys(DEBUG).contains("developer"));
    }

    @Test
    public void noChromeAccountOrGoogleRowIsShown() {
        for (String key : List.of("sign_in", "google_services", "account_and_google_services_section", "settings_promo_card",
                "safety_hub", "address_bar", "tabs", "homepage", "glic", "about_chrome", "search_engine", "privacy",
                "appearance", "default_browser", "languages", "passwords", "autofill_and_passwords")) {
            assertFalse(key, SettingsLayout.shownKeys(DEBUG).contains(key));
        }
    }

    @Test
    public void onlySignInAndThePromoCardAreRemovedRatherThanHidden() {
        assertTrue(SettingsLayout.isRemoved("sign_in"));
        assertTrue(SettingsLayout.isRemoved("settings_promo_card"));
        assertFalse(SettingsLayout.isRemoved("search_engine"));
    }
}

// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.settings;

import org.chromium.build.annotations.NullMarked;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * What Blanc's Settings root shows, in order: the iPhone's sections (SettingsSheet.swift), then
 * More (Chromium's own pages) and About. Blanc's rows have keys of their own; the Chromium rows that
 * stay keep Chromium's keys. Everything else in Chromium's root is hidden (docs/android/a5a-settings-spike.md).
 */
@NullMarked
public final class SettingsLayout {
    public static final class State {
        public final boolean debugBuild;

        public State(boolean debugBuild) {
            this.debugBuild = debugBuild;
        }
    }

    public static final class Section {
        public final String key;
        public final List<String> rows;

        Section(String key, List<String> rows) {
            this.key = key;
            this.rows = rows;
        }
    }

    /** Chromium's root rows Blanc never shows. `languages` and `default_browser` return with A5c, `passwords` with A6. */
    private static final List<String> ALWAYS_HIDDEN = List.of("settings_promo_card",
            "account_and_google_services_section", "sign_in", "google_services", "basics_section", "search_engine",
            "address_bar", "privacy", "safety_hub", "default_browser", "autofill_and_passwords", "autofill_section",
            "passwords", "autofill_payment_methods", "autofill_addresses", "autofill_options", "advanced_section",
            "tabs", "homepage", "appearance", "glic", "languages", "about_chrome");

    private SettingsLayout() {}

    public static List<Section> sections(State state) {
        List<String> more = new ArrayList<>(List.of("content_settings", "accessibility", "notifications", "downloads"));
        if (state.debugBuild) more.add("developer");
        return List.of(
                new Section("blanc_header_section", List.of("blanc_header")),
                new Section("blanc_browsing_section", List.of("blanc_search_engine")),
                new Section("blanc_appearance_section", List.of("blanc_theme", "blanc_island_position")),
                new Section("blanc_privacy_section", List.of("blanc_blocker", "blanc_allowed_sites", "blanc_clear_site_data")),
                new Section("blanc_sync_section", List.of("blanc_sync")),
                new Section("blanc_more_section", List.copyOf(more)),
                new Section("blanc_about_section", List.of("blanc_version", "blanc_website", "blanc_privacy_policy",
                        "blanc_support", "blanc_licenses")));
    }

    /** The Chromium root keys to hide: the always-hidden set, plus Developer outside debug builds. */
    public static Set<String> hiddenKeys(State state) {
        Set<String> hidden = new HashSet<>(ALWAYS_HIDDEN);
        if (!state.debugBuild) hidden.add("developer");
        return hidden;
    }
}

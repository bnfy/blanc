// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.settings;

import org.chromium.build.annotations.NullMarked;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * What Blanc's Settings root shows, in order: the iPhone's sections (SettingsSheet.swift), then
 * More (Chromium's own pages that carry no Chrome wording) and About. Accessibility is left out: its page
 * names Chrome and holds Chrome-only features (Reading Mode, the Chrome menu's zoom, Google's image
 * descriptions); Blanc's own page comes with A6 (spike R9). Blanc's rows have keys of their own; the Chromium rows that
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

    /**
     * The two Chromium rows that decide their own visibility, so hiding them doesn't last: Blanc removes
     * them (docs/android/a5a-settings-spike.md, R1). Every other row Blanc doesn't list is hidden.
     */
    private static final Set<String> REMOVED = Set.of("sign_in", "settings_promo_card");

    private SettingsLayout() {}

    public static List<Section> sections(State state) {
        List<String> more =
                new ArrayList<>(List.of("content_settings", "notifications", "downloads", "blanc_language"));
        if (state.debugBuild) more.add("developer");
        return List.of(
                new Section("blanc_header_section", List.of("blanc_header")),
                new Section("blanc_browsing_section", List.of("blanc_search_engine", "blanc_default_browser")),
                new Section("blanc_appearance_section", List.of("blanc_theme", "blanc_island_position", "blanc_start_page")),
                new Section("blanc_privacy_section", List.of("blanc_blocker", "blanc_allowed_sites", "blanc_clear_site_data",
                        "blanc_measure_usage")),
                new Section("blanc_sync_section", List.of("blanc_sync")),
                new Section("blanc_more_section", List.copyOf(more)),
                new Section("blanc_about_section", List.of("blanc_version", "blanc_website", "blanc_privacy_policy",
                        "blanc_support", "blanc_licenses", "blanc_show_welcome")));
    }

    /** Every key the root shows: each section's heading and its rows. */
    public static Set<String> shownKeys(State state) {
        Set<String> keys = new HashSet<>();
        for (Section section : sections(state)) {
            keys.add(section.key);
            keys.addAll(section.rows);
        }
        return keys;
    }

    public static boolean isRemoved(String key) {
        return REMOVED.contains(key);
    }
}

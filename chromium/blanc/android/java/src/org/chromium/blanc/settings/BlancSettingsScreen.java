// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.settings;

import android.content.Context;

import androidx.preference.ListPreference;
import androidx.preference.Preference;
import androidx.preference.PreferenceCategory;
import androidx.preference.PreferenceScreen;
import androidx.preference.SwitchPreferenceCompat;

import org.chromium.blanc.island.R;
import org.chromium.build.annotations.NullMarked;
import org.chromium.build.annotations.Nullable;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;

/**
 * Blanc's step over Chromium's Settings root, run at the end of every update of that root
 * (docs/android/a5a-settings-spike.md): Chromium rows Blanc doesn't list are hidden (never removed,
 * because Chromium's own update methods look them up by key) with no page, so a wide window doesn't
 * open on one; the two rows that manage their own visibility are removed; Blanc's sections and rows
 * are added or refreshed; everything gets Blanc's order. Safe to run any number of times.
 */
@NullMarked
public final class BlancSettingsScreen {
    /** What the screen needs from the app; tests supply a fake. */
    public interface Host {
        Context context();

        boolean debugBuild();

        boolean syncConnected();

        String appName();

        String version();

        String theme();

        void setTheme(String value);

        String searchEngine();

        void setSearchEngine(String id);

        String islandPosition();

        void setIslandPosition(String value);

        boolean blockerEnabled();

        void setBlockerEnabled(boolean on);

        void openSync();

        void openAllowedSites();

        void clearSiteData();

        void openUrl(String url);

        void openLicenses();

        /** The Start Page's Customize, where its widgets, clock and wallpaper are chosen (A5b). */
        void openStartPage();
    }

    /** Above every order Chromium assigns its own rows, so Blanc's sequence is the one that shows. */
    private static final int FIRST_ORDER = 1000;
    private static final String HEADER_SECTION = "blanc_header_section";
    private static final String BLANC_PREFIX = "blanc_";

    private BlancSettingsScreen() {}

    public static void apply(PreferenceScreen screen, Host host) {
        SettingsLayout.State state = new SettingsLayout.State(host.debugBuild());
        Set<String> shown = SettingsLayout.shownKeys(state);
        List<Preference> children = new ArrayList<>();
        for (int i = 0; i < screen.getPreferenceCount(); i++) children.add(screen.getPreference(i));
        for (Preference child : children) {
            String key = child.getKey();
            if (key == null || shown.contains(key)) continue;
            if (SettingsLayout.isRemoved(key)) {
                screen.removePreference(child);
            } else {
                child.setVisible(false);
                child.setFragment(null);
            }
        }
        int order = FIRST_ORDER;
        for (SettingsLayout.Section section : SettingsLayout.sections(state)) {
            if (!section.key.equals(HEADER_SECTION)) {
                Preference heading = existing(screen, section.key);
                if (heading == null) {
                    heading = new PreferenceCategory(host.context());
                    heading.setKey(section.key);
                    heading.setPersistent(false);
                    heading.setIconSpaceReserved(false);
                    screen.addPreference(heading);
                }
                heading.setTitle(host.context().getString(sectionTitle(section.key)));
                heading.setOrder(order++);
                heading.setVisible(true);
            }
            for (String key : section.rows) {
                Preference row = existing(screen, key);
                if (row == null && key.startsWith(BLANC_PREFIX)) {
                    row = create(key, host.context());
                    screen.addPreference(row);
                }
                if (row == null) continue;
                if (key.startsWith(BLANC_PREFIX)) refresh(row, key, host);
                row.setOrder(order++);
                row.setVisible(true);
            }
        }
    }

    private static @Nullable Preference existing(PreferenceScreen screen, String key) {
        return screen.findPreference(key);
    }

    private static int sectionTitle(String key) {
        switch (key) {
            case "blanc_browsing_section":
                return R.string.blanc_settings_general_cards_browsing;
            case "blanc_appearance_section":
                return R.string.blanc_settings_general_cards_appearance;
            case "blanc_privacy_section":
                return R.string.blanc_ios_settings_privacy;
            case "blanc_sync_section":
                return R.string.blanc_settings_nav_sync;
            case "blanc_more_section":
                return R.string.blanc_android_settings_more;
            default:
                return R.string.blanc_ios_settings_about;
        }
    }

    private static Preference create(String key, Context context) {
        Preference row;
        switch (key) {
            case "blanc_search_engine":
            case "blanc_theme":
            case "blanc_island_position":
                row = new ListPreference(context);
                break;
            case "blanc_blocker":
                row = new SwitchPreferenceCompat(context);
                break;
            default:
                row = new Preference(context);
                break;
        }
        row.setKey(key);
        row.setPersistent(false);
        row.setIconSpaceReserved(false);
        if (key.equals("blanc_header")) row.setLayoutResource(R.layout.blanc_settings_header);
        return row;
    }

    private static void refresh(Preference row, String key, Host host) {
        Context context = host.context();
        switch (key) {
            case "blanc_header":
                row.setSelectable(false);
                row.setTitle(host.appName());
                row.setSummary(host.version());
                break;
            case "blanc_search_engine":
                ListPreference engine = (ListPreference) row;
                List<SearchEngines.Engine> engines = SearchEngines.all();
                CharSequence[] labels = new CharSequence[engines.size()];
                CharSequence[] ids = new CharSequence[engines.size()];
                for (int i = 0; i < engines.size(); i++) {
                    labels[i] = engines.get(i).label;
                    ids[i] = engines.get(i).id;
                }
                list(engine, R.string.blanc_settings_general_search_engine_label, labels, ids,
                        SearchEngines.shown(host.searchEngine()), host::setSearchEngine);
                break;
            case "blanc_theme":
                list((ListPreference) row, R.string.blanc_settings_general_theme_label,
                        new CharSequence[] {context.getString(R.string.blanc_settings_general_theme_system),
                                context.getString(R.string.blanc_settings_general_theme_light),
                                context.getString(R.string.blanc_settings_general_theme_dark)},
                        new CharSequence[] {"system", "light", "dark"}, host.theme(), host::setTheme);
                break;
            case "blanc_island_position":
                list((ListPreference) row, R.string.blanc_android_settings_island_position,
                        new CharSequence[] {context.getString(R.string.blanc_android_settings_island_position_top),
                                context.getString(R.string.blanc_android_settings_island_position_bottom)},
                        new CharSequence[] {"top", "bottom"}, host.islandPosition(), host::setIslandPosition);
                break;
            case "blanc_blocker":
                SwitchPreferenceCompat blocker = (SwitchPreferenceCompat) row;
                blocker.setTitle(R.string.blanc_ios_settings_blocker);
                blocker.setSummary(R.string.blanc_ios_settings_blocker_help);
                blocker.setChecked(host.blockerEnabled());
                blocker.setOnPreferenceChangeListener((p, value) -> {
                    host.setBlockerEnabled((Boolean) value);
                    return true;
                });
                break;
            case "blanc_start_page":
                action(row, R.string.blanc_settings_general_cards_start_page, 0, host::openStartPage);
                break;
            case "blanc_allowed_sites":
                action(row, R.string.blanc_ios_settings_exceptions, 0, host::openAllowedSites);
                break;
            case "blanc_clear_site_data":
                action(row, R.string.blanc_settings_privacy_clear_browsing_data,
                        R.string.blanc_settings_privacy_removes_cookies_cache_and, host::clearSiteData);
                break;
            case "blanc_sync":
                action(row, R.string.blanc_settings_nav_sync, 0, host::openSync);
                row.setSummary(host.syncConnected() ? R.string.blanc_ios_settings_connected
                                                    : R.string.blanc_ios_settings_not_connected);
                break;
            case "blanc_version":
                row.setTitle(R.string.blanc_ios_settings_version);
                row.setSummary(host.version());
                row.setSelectable(false);
                break;
            case "blanc_website":
                action(row, R.string.blanc_ios_settings_website, 0, () -> host.openUrl("https://blanc.day"));
                break;
            case "blanc_privacy_policy":
                action(row, R.string.blanc_ios_settings_privacy_policy, 0,
                        () -> host.openUrl("https://blanc.day/privacy"));
                break;
            case "blanc_support":
                action(row, R.string.blanc_ios_settings_support, 0, () -> host.openUrl("mailto:support@blanc.day"));
                break;
            default:
                action(row, R.string.blanc_android_settings_open_source_licenses, 0, host::openLicenses);
                break;
        }
    }

    private interface Chosen {
        void on(String value);
    }

    private static void list(ListPreference row, int title, CharSequence[] labels, CharSequence[] values, String current,
            Chosen chosen) {
        row.setTitle(title);
        row.setDialogTitle(title);
        row.setEntries(labels);
        row.setEntryValues(values);
        row.setValue(current);
        row.setSummaryProvider(ListPreference.SimpleSummaryProvider.getInstance());
        row.setOnPreferenceChangeListener((p, value) -> {
            chosen.on((String) value);
            return true;
        });
    }

    private static void action(Preference row, int title, int summary, Runnable run) {
        row.setTitle(title);
        if (summary != 0) row.setSummary(summary);
        row.setOnPreferenceClickListener(p -> {
            run.run();
            return true;
        });
    }
}

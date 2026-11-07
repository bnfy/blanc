// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.settings;

import android.content.SharedPreferences;

import org.chromium.build.annotations.NullMarked;

import java.util.List;

/**
 * The settings Android's Settings writes, in the app's SharedPreferences: the theme under the key
 * Chromium's `/theme` command and sync already use, the search engine, and the Island's position
 * (the key the Island reads). Values Blanc doesn't offer are never stored.
 */
@NullMarked
public final class SettingsStore {
    public static final String THEME_KEY = "ui_theme_setting";
    public static final String SEARCH_ENGINE_KEY = "blanc.search_engine";
    public static final String POSITION_KEY = "blanc.island_position";

    private static final List<String> THEMES = List.of("system", "light", "dark");

    private final SharedPreferences mPrefs;

    public SettingsStore(SharedPreferences prefs) {
        mPrefs = prefs;
    }

    /** system, light or dark; a stored index out of range reads as the nearest. */
    public String theme() {
        int index = Math.max(0, Math.min(THEMES.size() - 1, mPrefs.getInt(THEME_KEY, 0)));
        return THEMES.get(index);
    }

    public void setTheme(String theme) {
        int index = THEMES.indexOf(theme);
        if (index >= 0) mPrefs.edit().putInt(THEME_KEY, index).apply();
    }

    /** The engine the Settings row shows and the address input searches with. */
    public String searchEngine() {
        return SearchEngines.shown(mPrefs.getString(SEARCH_ENGINE_KEY, null));
    }

    public void setSearchEngine(String id) {
        if (SearchEngines.isOffered(id)) mPrefs.edit().putString(SEARCH_ENGINE_KEY, id).apply();
    }

    public String searchTemplate() {
        return SearchEngines.template(searchEngine());
    }

    /** top or bottom, as on the iPhone. */
    public String islandPosition() {
        return "top".equals(mPrefs.getString(POSITION_KEY, null)) ? "top" : "bottom";
    }

    public void setIslandPosition(String position) {
        if (position.equals("top") || position.equals("bottom")) {
            mPrefs.edit().putString(POSITION_KEY, position).apply();
        }
    }
}

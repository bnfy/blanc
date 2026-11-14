// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.settings;

import android.content.SharedPreferences;

import org.chromium.build.annotations.NullMarked;
import org.chromium.build.annotations.Nullable;

import java.util.List;

/**
 * The settings Android's Settings writes, in the app's SharedPreferences: the theme under the key
 * Chromium's `/theme` command and sync already use, the search engine, the Island's position (the
 * key the Island reads), and the first minute's two device-local values, Measure usage and the
 * walkthrough's finished version, which never sync. Values Blanc doesn't offer are never stored.
 */
@NullMarked
public final class SettingsStore {
    public static final String THEME_KEY = "ui_theme_setting";
    public static final String SEARCH_ENGINE_KEY = "blanc.search_engine";
    public static final String POSITION_KEY = "blanc.island_position";
    /** The launch ping's consent (desktop's usagePing, F21): absent until the person saves a choice. */
    public static final String USAGE_PING_KEY = "blanc.usage_ping";
    /** The walkthrough version this phone has finished (WalkthroughFlow.VERSION). */
    public static final String WALKTHROUGH_KEY = "blanc.walkthrough_completed_version";

    /** What the Measure usage switch shows before a choice is saved (settings-schema: usagePing). */
    public static final boolean USAGE_PING_DEFAULT = true;

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

    /** The saved Measure usage choice, or null when none has been saved: then nothing is sent. */
    public @Nullable Boolean usagePing() {
        return mPrefs.contains(USAGE_PING_KEY) ? mPrefs.getBoolean(USAGE_PING_KEY, false) : null;
    }

    /** What a switch shows: the saved choice, or the default it would save. */
    public boolean usagePingShown() {
        Boolean saved = usagePing();
        return saved != null ? saved : USAGE_PING_DEFAULT;
    }

    /** Written at once (commit), so a ping right after the choice reads it. */
    public void setUsagePing(boolean on) {
        mPrefs.edit().putBoolean(USAGE_PING_KEY, on).commit();
    }

    public int walkthroughCompletedVersion() {
        return mPrefs.getInt(WALKTHROUGH_KEY, 0);
    }

    public void setWalkthroughCompletedVersion(int version) {
        mPrefs.edit().putInt(WALKTHROUGH_KEY, version).commit();
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

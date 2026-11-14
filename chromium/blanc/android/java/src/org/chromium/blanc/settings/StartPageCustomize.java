// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.settings;

import android.content.SharedPreferences;

import org.chromium.build.annotations.NullMarked;
import org.chromium.build.annotations.Nullable;

/**
 * The way to the Start Page's Customize, where its widgets, clock and wallpaper are chosen (A5b):
 * Settings' Start Page row and the Island menu's Customize ask here, and the Island, which knows the
 * browser's tabs, opens it. The ask is a change to one app preference, which the Island listens to.
 */
@NullMarked
public final class StartPageCustomize {
    public static final String KEY = "blanc.start_page_customize";
    public static final String START_PAGE = "chrome://blanc/newtab.html";
    /** The Start Page's address with Customize open (android-start.js reads the fragment). */
    public static final String FRAGMENT = "#customize";

    private StartPageCustomize() {}

    public static void request(SharedPreferences prefs) {
        // A new value each time, so asking twice in a row still reaches the listener.
        prefs.edit().putLong(KEY, prefs.getLong(KEY, 0) + 1).apply();
    }

    /**
     * Where Customize opens: on this tab when it already shows a Start Page (its own address, so a
     * private one stays private), else null for a new Start Page tab.
     */
    public static @Nullable String onTab(String tabUrl) {
        int end = tabUrl.indexOf('#');
        String page = end < 0 ? tabUrl : tabUrl.substring(0, end);
        int query = page.indexOf('?');
        String path = query < 0 ? page : page.substring(0, query);
        return path.equals(START_PAGE) ? page + FRAGMENT : null;
    }
}

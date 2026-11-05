// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.tabs;

import org.chromium.build.annotations.NullMarked;
import org.chromium.build.annotations.Nullable;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * What Blanc keeps across a restart that Chromium doesn't (A2 spike, docs/android/a2-tabs-spike.md):
 * the active tab and which tabs are muted. Chromium restores tabs, order, groups and pins itself.
 * On a cold start (Android ended the app), private tabs close, as on the iPhone.
 */
@NullMarked
public final class BlancTabState {
    /** Device-local preferences, never synced. */
    public interface Prefs {
        @Nullable String get(String key);

        void put(String key, @Nullable String value);
    }

    static final String ACTIVE = "blanc.tabs.active";
    static final String MUTED = "blanc.tabs.muted";

    private BlancTabState() {}

    public static void save(TabStore store, Prefs prefs) {
        prefs.put(ACTIVE, store.activeId(false));
        List<String> muted = new ArrayList<>();
        for (TabStore.Entry tab : store.tabs(false)) if (tab.muted) muted.add(tab.id);
        prefs.put(MUTED, muted.isEmpty() ? null : String.join(",", muted));
    }

    /** {@code opensLink}: another app opened Blanc on a link, so that tab stays in front. */
    public static void restore(TabStore store, Prefs prefs, boolean coldStart, boolean opensLink) {
        if (coldStart) {
            for (TabStore.Entry tab : store.tabs(true)) store.close(tab.id, false);
            store.selectModel(false);
        }
        List<String> ids = new ArrayList<>();
        for (TabStore.Entry tab : store.tabs(false)) ids.add(tab.id);
        String active = prefs.get(ACTIVE);
        if (!opensLink && active != null && ids.contains(active)) store.select(active);
        String muted = prefs.get(MUTED);
        if (muted != null) {
            for (String id : Arrays.asList(muted.split(","))) if (ids.contains(id)) store.setMuted(id, true);
        }
    }
}

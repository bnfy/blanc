// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.tabs;

import org.chromium.build.annotations.NullMarked;

import java.util.ArrayList;
import java.util.List;

/**
 * Quiet Tabs on Android (A2 spike, decision 6): which background tabs Blanc discards to free their
 * memory, by desktop's rules (src/main/tab-sleep.js) on the signals Chromium has. A quiet tab keeps
 * its title, address and back history and reloads when it's shown.
 */
@NullMarked
public final class QuietTabs {
    /** Desktop's default, "1 hour"; Settings (A5) will offer the rest. */
    public static final long DELAY_MILLIS = 60 * 60 * 1000;

    public static final long SWEEP_MILLIS = 30_000;

    /** One tab's state, as Chromium reports it. */
    public static final class Candidate {
        public final String id;
        public long lastShownMillis;
        public boolean active;
        public boolean loading;
        /** Playing or paused media (a controllable media session). */
        public boolean media;
        public boolean muted;
        public boolean pinned;
        public boolean capturing;
        /** Already quiet. */
        public boolean frozen;
        /** The page has beforeunload or unload handlers, which may guard unsaved work. */
        public boolean needsUnload;

        public Candidate(String id) {
            this.id = id;
        }
    }

    private QuietTabs() {}

    public static List<String> candidates(List<Candidate> tabs, long now, long delayMillis) {
        List<String> out = new ArrayList<>();
        for (Candidate tab : tabs) {
            if (tab.active || tab.loading || tab.media || tab.muted || tab.pinned || tab.capturing
                    || tab.frozen || tab.needsUnload) {
                continue;
            }
            if (now - tab.lastShownMillis >= delayMillis) out.add(tab.id);
        }
        return out;
    }
}

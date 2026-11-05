// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.sync;

import org.chromium.build.annotations.NullMarked;
import org.chromium.build.annotations.Nullable;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/**
 * Keeps Chromium's bookmarks and the runner's Favorites alike. The runner is sync's truth and its
 * clocks decide between devices; this only carries changes across the two sides. `seen` is every
 * address both sides held, which tells a new Favorite from a removed one. An address goes in only
 * once both hold it, and leaves only once neither does, so a step that never landed is tried again
 * and can't read as a removal.
 */
@NullMarked
public final class SyncedFavorites {
    /** A Favorite as both sides can say it. */
    public static final class Entry {
        public final String url;
        public final String title;
        public final @Nullable String folder;

        public Entry(String url, String title, @Nullable String folder) {
            this.url = url;
            this.title = title;
            this.folder = folder;
        }
    }

    /** What to do to each side, and what they agree on afterwards. */
    public static final class Plan {
        public final List<Entry> addToModel = new ArrayList<>();
        public final List<Entry> removeFromModel = new ArrayList<>();
        public final List<Entry> retitleModel = new ArrayList<>();
        public final List<Entry> addToRunner = new ArrayList<>();
        public final List<Entry> removeFromRunner = new ArrayList<>();
        public final Set<String> seen = new HashSet<>();

        public boolean isEmpty() {
            return addToModel.isEmpty() && removeFromModel.isEmpty() && retitleModel.isEmpty()
                    && addToRunner.isEmpty() && removeFromRunner.isEmpty();
        }
    }

    private SyncedFavorites() {}

    private static Map<String, Entry> byUrl(List<Entry> entries) {
        Map<String, Entry> out = new LinkedHashMap<>();
        for (Entry entry : entries) out.putIfAbsent(entry.url, entry);
        return out;
    }

    // Chromium tidies whitespace in a title, which mustn't read as a change on every pass.
    private static String tidy(String title) {
        return title.replaceAll("\\s+", " ").trim();
    }

    private static boolean differs(Entry mine, Entry theirs) {
        return !tidy(mine.title).equals(tidy(theirs.title)) || !Objects.equals(mine.folder, theirs.folder);
    }

    public static Plan plan(List<Entry> modelEntries, List<Entry> runnerEntries, Set<String> seen) {
        Map<String, Entry> model = byUrl(modelEntries);
        Map<String, Entry> runner = byUrl(runnerEntries);
        Plan plan = new Plan();
        for (Entry entry : model.values()) {
            Entry other = runner.get(entry.url);
            if (other != null) {
                plan.seen.add(entry.url);
                if (differs(entry, other)) plan.retitleModel.add(other);
            } else if (seen.contains(entry.url)) {
                plan.removeFromModel.add(entry);
                plan.seen.add(entry.url);
            } else {
                plan.addToRunner.add(entry);
            }
        }
        for (Entry entry : runner.values()) {
            if (model.containsKey(entry.url)) continue;
            if (seen.contains(entry.url)) {
                plan.removeFromRunner.add(entry);
                plan.seen.add(entry.url);
            } else {
                plan.addToModel.add(entry);
            }
        }
        return plan;
    }
}

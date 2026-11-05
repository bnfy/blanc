// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.sync;

import org.chromium.build.annotations.NullMarked;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * The settings this phone follows, Blanc for iPhone's: the theme and the blocking switch. (Search
 * engine joins them when A5's Settings gives Android a choice.) Every other synced key stays in the
 * runner untouched. `seen` holds what both sides last agreed on.
 */
@NullMarked
public final class SyncedSettings {
    private static final Map<String, List<String>> KEYS = Map.of(
            "theme", List.of("system", "light", "dark"),
            "adblockEnabled", List.of("true", "false"));

    /** What to change on the phone, and what to tell the runner. */
    public static final class Plan {
        public final Map<String, String> apply = new HashMap<>();
        public final Map<String, String> publish = new HashMap<>();
    }

    private SyncedSettings() {}

    public static Plan plan(Map<String, String> local, Map<String, String> runner, Map<String, String> seen) {
        Plan plan = new Plan();
        for (Map.Entry<String, List<String>> key : KEYS.entrySet()) {
            String name = key.getKey();
            String mine = local.get(name);
            String theirs = runner.get(name);
            String agreed = seen.get(name);
            if (mine == null || theirs == null || mine.equals(theirs)) continue;
            if (!theirs.equals(agreed) || agreed == null) {
                if (key.getValue().contains(theirs)) plan.apply.put(name, theirs);
            } else {
                plan.publish.put(name, mine);
            }
        }
        return plan;
    }
}

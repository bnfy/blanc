// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.tabs;

import org.chromium.build.annotations.NullMarked;
import org.chromium.build.annotations.Nullable;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;

/**
 * A group's optional color: one of the eight Space presets (src/renderer/space-identity.js), stored
 * as its hex, as desktop's src/main/group-color.js and the iPhone store it.
 */
@NullMarked
public final class GroupColors {
    /** Preset id to hex, in the presets' order. */
    public static final Map<String, String> PRESETS;

    static {
        Map<String, String> presets = new LinkedHashMap<>();
        presets.put("sage", "#426c4c");
        presets.put("sky", "#376694");
        presets.put("iris", "#6757a3");
        presets.put("rose", "#9b4761");
        presets.put("clay", "#974f2a");
        presets.put("sand", "#815c02");
        presets.put("slate", "#576471");
        presets.put("graphite", "#3a3a3a");
        PRESETS = Collections.unmodifiableMap(presets);
    }

    private GroupColors() {}

    /** A preset's hex in lower case, or null for anything else (desktop's sanitizeGroupColor). */
    public static @Nullable String sanitize(@Nullable String value) {
        if (value == null) return null;
        String hex = value.trim().toLowerCase(Locale.ROOT);
        return PRESETS.containsValue(hex) ? hex : null;
    }
}

// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.settings;

import org.chromium.build.annotations.NullMarked;
import org.chromium.build.annotations.Nullable;

import java.util.List;

/**
 * The iPhone's five search engines, in its order (settings-schema/schema.json and
 * AddressNormalizer.swift). A synced `custom` or a value from a newer Blanc isn't offered here: the
 * row shows DuckDuckGo for it and writes nothing.
 */
@NullMarked
public final class SearchEngines {
    public static final class Engine {
        public final String id;
        public final String label;
        public final String template;

        Engine(String id, String label, String template) {
            this.id = id;
            this.label = label;
            this.template = template;
        }
    }

    private static final String DEFAULT = "duckduckgo";
    private static final List<Engine> ALL = List.of(
            new Engine("duckduckgo", "DuckDuckGo", "https://duckduckgo.com/?q=%s"),
            new Engine("google", "Google", "https://www.google.com/search?q=%s"),
            new Engine("bing", "Bing", "https://www.bing.com/search?q=%s"),
            new Engine("brave", "Brave Search", "https://search.brave.com/search?q=%s"),
            new Engine("kagi", "Kagi", "https://kagi.com/search?q=%s"));

    private SearchEngines() {}

    public static List<Engine> all() {
        return ALL;
    }

    public static boolean isOffered(@Nullable String id) {
        if (id == null) return false;
        for (Engine engine : ALL) if (engine.id.equals(id)) return true;
        return false;
    }

    /** The engine the row shows for a stored or synced value. */
    public static String shown(@Nullable String id) {
        return id != null && isOffered(id) ? id : DEFAULT;
    }

    /** An engine's name, as the palette's Search for row shows it under the query. */
    public static String label(String id) {
        for (Engine engine : ALL) if (engine.id.equals(id)) return engine.label;
        return ALL.get(0).label;
    }

    /** The search address for an engine, with %s where the encoded query goes. */
    public static String template(String id) {
        for (Engine engine : ALL) if (engine.id.equals(id)) return engine.template;
        return ALL.get(0).template;
    }
}

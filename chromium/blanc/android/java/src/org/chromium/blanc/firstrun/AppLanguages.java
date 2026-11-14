// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.firstrun;

import org.chromium.build.annotations.NullMarked;
import org.chromium.build.annotations.Nullable;

import java.util.List;
import java.util.Locale;

/**
 * Blanc's interface languages on Android: the six desktop and the iPhone ship
 * (src/main/i18n-locales.json, with their endonyms), chosen per app through Android's per-app
 * language (LocaleManager) and listed in the manifest's locale config (patch 0114), so Android's own
 * App languages screen offers the same six. Pure.
 */
@NullMarked
public final class AppLanguages {
    public static final class Language {
        public final String tag;
        public final String endonym;

        Language(String tag, String endonym) {
            this.tag = tag;
            this.endonym = endonym;
        }
    }

    public static final List<Language> ALL = List.of(new Language("en", "English"), new Language("de", "Deutsch"),
            new Language("es", "Español"), new Language("fr", "Français"), new Language("it", "Italiano"),
            new Language("pt-BR", "Português do Brasil"));

    private AppLanguages() {}

    /**
     * The language Blanc shows for a locale: its own one if it has it (pt-BR for any Portuguese, as
     * Blanc's pages do), else English. {@code tag} is a BCP-47 tag such as "de-AT".
     */
    public static Language resolve(@Nullable String tag) {
        if (tag == null || tag.isEmpty()) return ALL.get(0);
        String base = tag.toLowerCase(Locale.ROOT).split("[-_]")[0];
        for (Language language : ALL) {
            if (language.tag.toLowerCase(Locale.ROOT).split("-")[0].equals(base)) return language;
        }
        return ALL.get(0);
    }

    /** One of the six by its exact tag, or null for "follow the system". */
    public static @Nullable Language chosen(@Nullable String tag) {
        if (tag == null || tag.isEmpty()) return null;
        for (Language language : ALL) {
            if (language.tag.equalsIgnoreCase(tag)) return language;
        }
        // A tag Android kept from elsewhere (pt-PT, de-AT): the language Blanc shows for it.
        return resolve(tag);
    }
}

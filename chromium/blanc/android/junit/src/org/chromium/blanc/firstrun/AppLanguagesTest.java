// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.firstrun;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import org.junit.Test;
import org.junit.runner.RunWith;

import org.chromium.base.test.BaseRobolectricTestRunner;

import java.util.ArrayList;
import java.util.List;

/** Blanc's six interface languages, as desktop names them (src/main/i18n-locales.json). */
@RunWith(BaseRobolectricTestRunner.class)
public class AppLanguagesTest {
    @Test
    public void theSixLanguagesInDesktopsOrderWithTheirEndonyms() {
        List<String> tags = new ArrayList<>();
        List<String> names = new ArrayList<>();
        for (AppLanguages.Language language : AppLanguages.ALL) {
            tags.add(language.tag);
            names.add(language.endonym);
        }
        assertEquals(List.of("en", "de", "es", "fr", "it", "pt-BR"), tags);
        assertEquals(List.of("English", "Deutsch", "Español", "Français", "Italiano", "Português do Brasil"), names);
    }

    @Test
    public void aLocaleResolvesToTheLanguageBlancShowsForIt() {
        assertEquals("de", AppLanguages.resolve("de-AT").tag);
        assertEquals("pt-BR", AppLanguages.resolve("pt-PT").tag);
        assertEquals("fr", AppLanguages.resolve("fr_CA").tag);
        assertEquals("en", AppLanguages.resolve("ja-JP").tag);
        assertEquals("en", AppLanguages.resolve(null).tag);
    }

    @Test
    public void noChoiceMeansFollowingThePhone() {
        assertNull(AppLanguages.chosen(null));
        assertNull(AppLanguages.chosen(""));
        assertEquals("it", AppLanguages.chosen("it").tag);
        assertEquals("pt-BR", AppLanguages.chosen("pt-br").tag);
        assertEquals("es", AppLanguages.chosen("es-MX").tag);
    }
}

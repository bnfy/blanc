// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.settings;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import org.junit.Test;
import org.junit.runner.RunWith;

import org.chromium.base.test.BaseRobolectricTestRunner;

import java.util.ArrayList;
import java.util.List;

/** The iPhone's five search engines (AddressNormalizer.swift, settings-schema/schema.json). */
@RunWith(BaseRobolectricTestRunner.class)
public class SearchEnginesTest {
    @Test
    public void fiveEnginesInTheIphonesOrderWithDuckDuckGoFirst() {
        List<String> ids = new ArrayList<>();
        for (SearchEngines.Engine engine : SearchEngines.all()) ids.add(engine.id);
        assertEquals(List.of("duckduckgo", "google", "bing", "brave", "kagi"), ids);
        assertEquals("DuckDuckGo", SearchEngines.all().get(0).label);
        assertEquals("Brave Search", SearchEngines.all().get(3).label);
    }

    @Test
    public void aCustomOrUnknownSyncedEngineShowsDuckDuckGo() {
        assertEquals("duckduckgo", SearchEngines.shown("custom"));
        assertEquals("duckduckgo", SearchEngines.shown("somethingNew"));
        assertEquals("duckduckgo", SearchEngines.shown(null));
        assertEquals("kagi", SearchEngines.shown("kagi"));
    }

    @Test
    public void everyTemplateTakesTheQueryWhereTheIphoneDoes() {
        assertEquals("https://duckduckgo.com/?q=%s", SearchEngines.template("duckduckgo"));
        assertEquals("https://www.google.com/search?q=%s", SearchEngines.template("google"));
        assertEquals("https://www.bing.com/search?q=%s", SearchEngines.template("bing"));
        assertEquals("https://search.brave.com/search?q=%s", SearchEngines.template("brave"));
        assertEquals("https://kagi.com/search?q=%s", SearchEngines.template("kagi"));
        assertTrue(SearchEngines.template("custom").startsWith("https://duckduckgo.com/"));
    }

    @Test
    public void onlyAKnownIdIsOffered() {
        assertTrue(SearchEngines.isOffered("brave"));
        assertEquals(false, SearchEngines.isOffered("custom"));
        assertEquals(false, SearchEngines.isOffered(null));
    }
}

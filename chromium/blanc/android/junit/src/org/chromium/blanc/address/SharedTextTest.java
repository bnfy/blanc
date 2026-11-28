// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.address;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.annotation.Config;

import org.chromium.base.test.BaseRobolectricTestRunner;

/**
 * Text shared into Blanc with no web address in it opens what the Island would open for the same
 * typed text (A6 ruling SH1): an address, or a search on the engine in Blanc's Settings, never
 * Chromium's default engine and never another app.
 */
@RunWith(BaseRobolectricTestRunner.class)
@Config(manifest = Config.NONE)
public class SharedTextTest {
    private static final String KAGI = "https://kagi.com/search?q=%s";

    @Test
    public void wordsSearchTheChosenEngine() {
        assertEquals("https://kagi.com/search?q=blanc%20browser%20review",
                SharedText.url("blanc browser review", KAGI));
    }

    @Test
    public void surroundingSpaceIsIgnored() {
        assertEquals("https://kagi.com/search?q=hello", SharedText.url("  hello\n", KAGI));
    }

    @Test
    public void aBareDomainOpensAsAnAddress() {
        assertEquals("https://example.com/path", SharedText.url("example.com/path", KAGI));
    }

    @Test
    public void localhostOpensOverHttp() {
        assertEquals("http://localhost:8080", SharedText.url("localhost:8080", KAGI));
    }

    @Test
    public void blancPagesOpenTheServedPageOrNothing() {
        assertEquals("chrome://blanc/history.html", SharedText.url("blanc://history", KAGI));
        assertNull(SharedText.url("blanc://downloads", KAGI));
    }

    @Test
    public void linksForOtherAppsAndEmptyTextOpenNothing() {
        assertNull(SharedText.url("mailto:someone@example.com", KAGI));
        assertNull(SharedText.url("tel:+15555550100", KAGI));
        assertNull(SharedText.url("   ", KAGI));
    }
}

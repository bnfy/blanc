// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.tabs;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;
import org.junit.runner.RunWith;

import org.chromium.base.test.BaseRobolectricTestRunner;

import java.util.ArrayList;
import java.util.List;

/** The iPhone's Quick Switcher (QuickSwitcher.swift), without other devices and Spaces (A4). */
@RunWith(BaseRobolectricTestRunner.class)
public class QuickSwitcherTest {
    private static final List<QuickSwitcher.Page> NONE = List.of();

    private static QuickSwitcher.Tab tab(String id, String title, String url) {
        return new QuickSwitcher.Tab(id, title, url, null);
    }

    private static List<String> ids(List<QuickSwitcher.Result> results) {
        List<String> out = new ArrayList<>();
        for (QuickSwitcher.Result r : results) out.add(r.id);
        return out;
    }

    @Test
    public void anEmptyQueryFindsNothing() {
        assertTrue(QuickSwitcher.search("", List.of(tab("1", "Example", "https://example.com/")), NONE, NONE, List.of()).isEmpty());
    }

    @Test
    public void aSubstringScoresTwoAnInOrderMatchOne() {
        assertEquals(2.0, QuickSwitcher.matchScore("exa", "an example"), 0);
        assertEquals(1.0, QuickSwitcher.matchScore("eml", "example"), 0);
        assertEquals(0.0, QuickSwitcher.matchScore("xyz", "example"), 0);
    }

    @Test
    public void groupsRankAboveTabsAboveFavoritesAboveHistory() {
        List<QuickSwitcher.Result> results = QuickSwitcher.search("news",
                List.of(tab("t", "News today", "https://a.example/")),
                List.of(new QuickSwitcher.Page("f", "News site", "https://b.example/")),
                List.of(new QuickSwitcher.Page("h", "Old news", "https://c.example/")),
                List.of(new QuickSwitcher.Group("g", "News")));
        assertEquals(List.of("group:g", "local:t", "favorite:f", "history:https://c.example/"), ids(results));
    }

    @Test
    public void anOpenTabsAddressIsntRepeatedFromFavoritesOrHistory() {
        List<QuickSwitcher.Result> results = QuickSwitcher.search("exa",
                List.of(tab("t", "Example", "https://example.com/")),
                List.of(new QuickSwitcher.Page("f", "Example", "https://example.com/")),
                List.of(new QuickSwitcher.Page("h", "Example", "https://example.com/")), List.of());
        assertEquals(List.of("local:t"), ids(results));
    }

    @Test
    public void onlyWebAddressesComeFromFavoritesAndHistory() {
        List<QuickSwitcher.Result> results = QuickSwitcher.search("ex", List.of(),
                List.of(new QuickSwitcher.Page("f", "Ex", "javascript:alert(1)")),
                List.of(new QuickSwitcher.Page("h", "Ex", "file:///ex")), List.of());
        assertTrue(results.isEmpty());
    }

    @Test
    public void atMostSixTabsAndTwelveResultsTiesInTabOrder() {
        List<QuickSwitcher.Tab> tabs = new ArrayList<>();
        for (int i = 0; i < 9; i++) tabs.add(tab("t" + i, "Page " + i, "https://p" + i + ".example/"));
        List<QuickSwitcher.Page> history = new ArrayList<>();
        for (int i = 0; i < 20; i++) history.add(new QuickSwitcher.Page("h" + i, "Page", "https://h" + i + ".example/"));
        List<QuickSwitcher.Result> results = QuickSwitcher.search("page", tabs, NONE, history, List.of());
        assertEquals(12, results.size());
        assertEquals(List.of("local:t0", "local:t1", "local:t2", "local:t3", "local:t4", "local:t5"), ids(results).subList(0, 6));
    }

    @Test
    public void goOpensAStrongMatchButNeverInsteadOfAnAddress() {
        List<QuickSwitcher.Result> results = QuickSwitcher.search("example", List.of(tab("t", "Example", "https://example.com/")), NONE, NONE, List.of());
        assertEquals("local:t", QuickSwitcher.goTarget("example", results).id);
        assertNull(QuickSwitcher.goTarget("example.com", QuickSwitcher.search("example.com", List.of(tab("t", "Example", "https://example.com/")), NONE, NONE, List.of())));
        assertNull(QuickSwitcher.goTarget("eml", QuickSwitcher.search("eml", List.of(tab("t", "Example", "https://example.com/")), NONE, NONE, List.of())));
    }

    @Test
    public void aSetIsFoundByNameAboveItsTabsWithItsCount() {
        List<QuickSwitcher.Result> results = QuickSwitcher.search("work", List.of(tab("1", "Work notes", "https://a.example/")),
                NONE, NONE, List.of(), List.of(new QuickSwitcher.TabSet("s1", "Work", 3)));
        assertEquals("set:s1", results.get(0).id);
        assertEquals(3, results.get(0).count);
    }
}

// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.tabs;

import static org.junit.Assert.assertEquals;

import org.junit.Test;
import org.junit.runner.RunWith;

import org.chromium.base.test.BaseRobolectricTestRunner;

import java.util.ArrayList;
import java.util.List;

/** Sections and order as desktop's tab-sections.js draws them. */
@RunWith(BaseRobolectricTestRunner.class)
public class TabSectionsTest {
    static List<TabSections.Item> decode(String encoded) {
        List<TabSections.Item> items = new ArrayList<>();
        if (encoded.isEmpty()) return items;
        for (String part : encoded.split(",")) {
            String[] f = part.split(":", -1);
            items.add(new TabSections.Item(f[0], f[1].isEmpty() ? null : f[1], f[2].equals("p")));
        }
        return items;
    }

    static String encode(List<TabSections.Section> sections) {
        List<String> out = new ArrayList<>();
        for (TabSections.Section s : sections) {
            out.add((s.groupId == null ? "" : s.groupId) + "|" + String.join(",", s.tabIds));
        }
        return String.join(";", out);
    }

    @Test
    public void matchesDesktopOnEveryFixture() {
        assertEquals(300, TabSectionsFixtures.ROWS.length);
        for (String[] row : TabSectionsFixtures.ROWS) {
            List<TabSections.Item> items = decode(row[0]);
            assertEquals("sections " + row[0], row[1], encode(TabSections.sections(items)));
            assertEquals("order " + row[0], row[2], String.join(",", TabSections.normalizedOrder(items)));
        }
    }

    @Test
    public void ungroupedPinsLeadAndAGroupsPinsLeadIt() {
        List<TabSections.Item> items = decode("a::,b:g:,c::p,d:g:p,e::");
        assertEquals("|a;g|d,b;|e", encode(TabSections.sections(items)));
        assertEquals("c,a,d,b,e", String.join(",", TabSections.normalizedOrder(items)));
    }
}

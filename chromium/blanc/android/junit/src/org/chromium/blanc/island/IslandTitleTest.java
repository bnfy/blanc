// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.island;

import static org.junit.Assert.assertEquals;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.annotation.Config;

import org.chromium.base.test.BaseRobolectricTestRunner;

import java.util.Map;

/** Port of the iPhone's displayDomain, plus the odd addresses in A1's Review Focus 5. */
@RunWith(BaseRobolectricTestRunner.class)
@Config(manifest = Config.NONE)
public class IslandTitleTest {
    private static final IslandTitle.Strings STRINGS =
            Map.of("ios.tabs.startPage", "Start Page", "pagesNav.bookmarks", "Favorites",
                    "pagesNav.history", "History")::get;

    private static String title(String scheme, String host, String path) {
        return IslandTitle.forUrl(scheme, host, path, STRINGS);
    }

    @Test
    public void blancPagesShowTheirNames() {
        assertEquals("Start Page", title("chrome", "blanc", "/newtab.html"));
        assertEquals("Favorites", title("chrome", "blanc", "/bookmarks.html"));
        assertEquals("History", title("chrome", "blanc", "/history.html"));
        assertEquals("Mahjong", title("chrome", "blanc", "/mahjong.html"));
    }

    @Test
    public void noAddressIsTheStartPage() {
        assertEquals("Start Page", title(null, null, null));
        assertEquals("Start Page", title("https", "", "/"));
    }

    @Test
    public void webHostsLoseOnlyALeadingWww() {
        assertEquals("example.com", title("https", "www.example.com", "/a"));
        assertEquals("wwwexample.com", title("https", "wwwexample.com", "/"));
        assertEquals("news.www.example.com", title("https", "news.www.example.com", "/"));
    }

    @Test
    public void oddAddressesStayReadable() {
        // The caller passes the display host (Chromium's UrlFormatter turns IDN into Unicode).
        assertEquals("bücher.example", title("https", "www.bücher.example", "/"));
        String longHost = "a-very-long-subdomain-name-that-keeps-going.example-site.co.uk";
        assertEquals("the view truncates, not the model", longHost, title("https", longHost, "/"));
        assertEquals("192.168.1.1", title("http", "192.168.1.1", "/"));
        assertEquals("about:blank", title("about", "", "blank"));
        assertEquals("a local file shows its name", "page.html", title("file", "", "/sdcard/page.html"));
    }
}

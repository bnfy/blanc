// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.island;

import org.chromium.build.annotations.NullMarked;
import org.chromium.build.annotations.Nullable;

/**
 * What the Island shows for the current address, ported from Blanc for iPhone's displayDomain:
 * Blanc's own pages by name, a web host without a leading "www.", and the Start Page when there
 * is no address. The caller passes the display host (Chromium's UrlFormatter turns IDN into
 * Unicode); the view truncates a long one.
 */
@NullMarked
public final class IslandTitle {
    /** Looks up interface text by its copy/messages key. */
    public interface Strings {
        String get(String key);
    }

    /** Blanc's pages are served from chrome://blanc/ (A1 plan, Task 6). */
    public static final String PAGES_SCHEME = "chrome";

    public static final String PAGES_HOST = "blanc";

    private IslandTitle() {}

    public static String forUrl(
            @Nullable String scheme, @Nullable String host, @Nullable String path, Strings strings) {
        String startPage = strings.get("ios.tabs.startPage");
        if (scheme == null) return startPage;
        if (PAGES_SCHEME.equals(scheme) && PAGES_HOST.equals(host)) {
            String page = pageName(path);
            switch (page) {
                case "newtab":
                    return startPage;
                case "bookmarks":
                    return strings.get("pagesNav.bookmarks");
                case "history":
                    return strings.get("pagesNav.history");
                default:
                    return page.isEmpty() ? startPage : capitalized(page);
            }
        }
        if (host == null || host.isEmpty()) {
            if ("file".equals(scheme)) return fileName(path);
            if ("http".equals(scheme) || "https".equals(scheme)) return startPage;
            return scheme + ":" + (path == null ? "" : path);
        }
        return host.startsWith("www.") ? host.substring(4) : host;
    }

    private static String pageName(@Nullable String path) {
        String name = fileName(path);
        int dot = name.lastIndexOf('.');
        return dot < 0 ? name : name.substring(0, dot);
    }

    private static String fileName(@Nullable String path) {
        if (path == null) return "";
        int slash = path.lastIndexOf('/');
        return slash < 0 ? path : path.substring(slash + 1);
    }

    private static String capitalized(String word) {
        return word.substring(0, 1).toUpperCase(java.util.Locale.ROOT) + word.substring(1);
    }
}

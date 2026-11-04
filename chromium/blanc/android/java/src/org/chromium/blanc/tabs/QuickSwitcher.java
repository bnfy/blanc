// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.tabs;

import org.chromium.blanc.address.AddressInput;
import org.chromium.build.annotations.NullMarked;
import org.chromium.build.annotations.Nullable;

import java.net.URI;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * The palette's Quick Switcher, ported from Blanc for iPhone (QuickSwitcher.swift): tab groups
 * first, then open tabs, Favorites and History, each address once. Other devices' tabs and Spaces
 * join with Sync (A4).
 */
@NullMarked
public final class QuickSwitcher {
    /** A match at least this strong is what Go opens instead of the typed text. */
    public static final double STRONG_MATCH = 2.0;

    public static final class Tab {
        public final String id;
        public final String title;
        public final String url;
        public final @Nullable String groupId;

        public Tab(String id, String title, String url, @Nullable String groupId) {
            this.id = id;
            this.title = title;
            this.url = url;
            this.groupId = groupId;
        }
    }

    /** A Favorite or a History entry. */
    public static final class Page {
        public final String id;
        public final String title;
        public final String url;

        public Page(String id, String title, String url) {
            this.id = id;
            this.title = title;
            this.url = url;
        }
    }

    public static final class Group {
        public final String id;
        public final String name;

        public Group(String id, String name) {
            this.id = id;
            this.name = name;
        }
    }

    public static final class Result {
        /** "group:<id>", "local:<tab id>", "favorite:<id>" or "history:<url>". */
        public final String id;

        public final String title;

        /** The site or address; for a group, empty (the palette shows its tab count). */
        public final String subtitle;

        public final double score;
        public final double strength;

        /** For a group, its tab count. */
        public final int count;

        Result(String id, String title, String subtitle, double score, double strength, int count) {
            this.id = id;
            this.title = title;
            this.subtitle = subtitle;
            this.score = score;
            this.strength = strength;
            this.count = count;
        }
    }

    private QuickSwitcher() {}

    /** 2 for a substring, 1 for the query's characters in order, else 0. */
    public static double matchScore(String query, String text) {
        String t = text.toLowerCase(Locale.ROOT);
        if (t.contains(query)) return 2;
        int qi = 0;
        for (int i = 0; i < t.length() && qi < query.length(); i++) {
            if (t.charAt(i) == query.charAt(qi)) qi++;
        }
        return qi == query.length() ? 1 : 0;
    }

    public static List<Result> search(
            String query, List<Tab> tabs, List<Page> favorites, List<Page> history, List<Group> groups) {
        String q = query.toLowerCase(Locale.ROOT);
        if (q.isEmpty()) return new ArrayList<>();
        List<Result> named = new ArrayList<>();
        for (Group group : groups) {
            double score = matchScore(q, group.name);
            if (score <= 0) continue;
            int count = 0;
            for (Tab tab : tabs) if (group.id.equals(tab.groupId)) count++;
            named.add(new Result("group:" + group.id, group.name, "", score + 6, score, count));
        }
        named.sort(byScore());
        List<Result> out = new ArrayList<>(named);
        out.addAll(tabsAndPages(q, tabs, favorites, history));
        return out.size() > 12 ? new ArrayList<>(out.subList(0, 12)) : out;
    }

    private static List<Result> tabsAndPages(String q, List<Tab> tabs, List<Page> favorites, List<Page> history) {
        List<Result> local = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        for (Tab tab : tabs) {
            seen.add(tab.url);
            double score = matchScore(q, matchable(tab.title, tab.url));
            if (score <= 0) continue;
            String title = tab.title.isEmpty() ? tab.url : tab.title;
            local.add(new Result("local:" + tab.id, title, host(tab.url), score + 0.2 + 4, score, 0));
        }
        local.sort(byScore());
        if (local.size() > 6) local = new ArrayList<>(local.subList(0, 6));
        List<Result> saved = pages(q, favorites, seen, "favorite:", 2, false);
        List<Result> visited = pages(q, history, seen, "history:", 0, true);
        List<Result> out = new ArrayList<>(local);
        out.addAll(saved);
        out.addAll(visited);
        return out.size() > 12 ? new ArrayList<>(out.subList(0, 12)) : out;
    }

    private static List<Result> pages(
            String q, List<Page> pages, Set<String> seen, String prefix, double bonus, boolean byUrl) {
        List<Result> out = new ArrayList<>();
        for (Page page : pages) {
            String scheme = scheme(page.url);
            if (!(scheme.equals("http") || scheme.equals("https")) || seen.contains(page.url)) continue;
            double score = matchScore(q, page.title + " " + page.url);
            if (score <= 0) continue;
            seen.add(page.url);
            out.add(new Result(prefix + (byUrl ? page.url : page.id), page.title, page.url, score + bonus, score, 0));
        }
        out.sort(byScore());
        return out;
    }

    /** What Go opens instead of the typed text: a strong match, never when the text is an address. */
    public static @Nullable Result goTarget(String query, List<Result> results) {
        if (AddressInput.interpret(query).kind != AddressInput.Kind.SEARCH) return null;
        if (results.isEmpty() || results.get(0).strength < STRONG_MATCH) return null;
        return results.get(0);
    }

    private static Comparator<Result> byScore() {
        return (a, b) -> Double.compare(b.score, a.score);
    }

    private static String matchable(String title, String url) {
        String path = "";
        try {
            String raw = new URI(url).getRawPath();
            if (raw != null) path = raw.length() > 64 ? raw.substring(0, 64) : raw;
        } catch (Exception e) {
            // Not a URI: the title and host alone.
        }
        return title + " " + host(url) + path;
    }

    private static String host(String url) {
        try {
            String host = new URI(url).getHost();
            return host == null ? url : host;
        } catch (Exception e) {
            return url;
        }
    }

    private static String scheme(String url) {
        int colon = url.indexOf(':');
        return colon < 0 ? "" : url.substring(0, colon).toLowerCase(Locale.ROOT);
    }
}

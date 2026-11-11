// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.island;

import org.chromium.build.annotations.NullMarked;
import org.chromium.build.annotations.Nullable;

import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

/**
 * The Sunrise mark's menu on the Island, ported from Blanc for iPhone's IslandMenu.swift. Entries
 * that don't apply to the page (Blanc's own pages, a private tab) are left out rather than
 * disabled. Glance entries are left out: Android 1.0 has no wide layout.
 */
@NullMarked
public final class IslandMenu {
    public enum Kind {
        CUSTOMIZE_START_PAGE,
        BLOCKING,
        BLOCKING_SETTINGS,
        BLOCKING_UNAVAILABLE,
        FAVORITE,
        SEND,
        /** The Island has no Reload (#1463); Stop while the page loads. */
        RELOAD,
        SHARE,
        FIND,
        NEW_PRIVATE_TAB,
        /** Blanc's Settings, always last (#1463). */
        SETTINGS
    }

    /** One entry; BLOCKING and FAVORITE carry their state. */
    public static final class Item {
        public final Kind kind;
        public final boolean on;

        private Item(Kind kind, boolean on) {
            this.kind = kind;
            this.on = on;
        }

        public static Item of(Kind kind) {
            return new Item(kind, false);
        }

        public static Item blocking(boolean on) {
            return new Item(Kind.BLOCKING, on);
        }

        public static Item favorite(boolean saved) {
            return new Item(Kind.FAVORITE, saved);
        }

        @Override
        public boolean equals(@Nullable Object other) {
            return other instanceof Item item && item.kind == kind && item.on == on;
        }

        @Override
        public int hashCode() {
            return Objects.hash(kind, on);
        }

        @Override
        public String toString() {
            return kind + (kind == Kind.BLOCKING || kind == Kind.FAVORITE ? "(" + on + ")" : "");
        }
    }

    /** What the menu needs to know about the current tab. */
    public static final class Context {
        public boolean startPage;

        /** A web page whose site blocking can be switched (the iPhone's AdblockExceptions.host). */
        public boolean blockableSite;

        public boolean blockingEnabled;
        public boolean siteProtected;

        /** The blocker has failed and pages are stopped until it's started again. */
        public boolean blockingUnavailable;

        public int blockedCount;
        public boolean privateTab;
        public boolean canFavorite;
        public boolean favorite;
        public boolean canSend;
        public boolean hasSendTargets;

        /** The page is loading, so Reload reads Stop. */
        public boolean loading;
    }

    private IslandMenu() {}

    public static List<Item> items(Context c) {
        List<Item> items = new ArrayList<>();
        if (c.startPage) items.add(Item.of(Kind.CUSTOMIZE_START_PAGE));
        // Wherever it's asked: a page the blocker stopped never commits, so the tab isn't on a web page.
        if (c.blockingUnavailable) items.add(Item.of(Kind.BLOCKING_UNAVAILABLE));
        if (c.blockableSite) {
            if (!c.blockingUnavailable) {
                items.add(c.blockingEnabled ? Item.blocking(c.siteProtected) : Item.of(Kind.BLOCKING_SETTINGS));
            }
            if (!c.privateTab && c.canFavorite) items.add(Item.favorite(c.favorite));
            if (c.canSend && c.hasSendTargets) items.add(Item.of(Kind.SEND));
            items.add(Item.of(Kind.RELOAD));
            items.add(Item.of(Kind.SHARE));
            items.add(Item.of(Kind.FIND));
        }
        items.add(Item.of(Kind.NEW_PRIVATE_TAB));
        items.add(Item.of(Kind.SETTINGS));
        return items;
    }
}

// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.tabs;

import org.chromium.build.annotations.NullMarked;
import org.chromium.build.annotations.Nullable;

import java.util.List;

/**
 * The tab model BlancTabs works on: Chromium's TabModelSelector on the phone (ChromiumTabStore), a
 * plain list in tests. Normal and private tabs are separate lists, as Chromium keeps them.
 */
@NullMarked
public interface TabStore {
    /** Blanc's Start Page, which a new tab opens. */
    String START_PAGE = "chrome://blanc/newtab.html";

    final class Entry {
        public final String id;
        public final String url;
        public final String title;
        public final @Nullable String groupId;
        public final boolean pinned;
        public final boolean muted;
        public final boolean privateTab;

        public Entry(String id, String url, String title, @Nullable String groupId, boolean pinned,
                boolean muted, boolean privateTab) {
            this.id = id;
            this.url = url;
            this.title = title;
            this.groupId = groupId;
            this.pinned = pinned;
            this.muted = muted;
            this.privateTab = privateTab;
        }
    }

    final class Group {
        public final String id;
        public final String name;
        public final @Nullable String color;
        public final boolean collapsed;

        public Group(String id, String name, @Nullable String color, boolean collapsed) {
            this.id = id;
            this.name = name;
            this.color = color;
            this.collapsed = collapsed;
        }
    }

    /** One list's tabs, in order; a tab whose close is pending is left out. */
    List<Entry> tabs(boolean privateTabs);

    @Nullable String activeId(boolean privateTabs);

    boolean privateSelected();

    /** Opens `url` (the Start Page when null) at `index` (the end when negative); returns its id. */
    String create(@Nullable String url, boolean privateTab, @Nullable String groupId, int index);

    /** A tab at the end that shows `url` only when it's first selected; "" if refused. */
    String createQuiet(String url, String title);

    /** Takes a tab to `url`, unloaded if it is; returns its id, which an unloaded tab may change. */
    String navigate(String id, String url, String title);

    /** Closes a tab; an undoable close stays pending until commitClose or cancelClose. */
    void close(String id, boolean undoable);

    /** Brings a pending close back where it was; false if it's no longer pending. */
    boolean cancelClose(String id);

    void commitClose(String id);

    void select(String id);

    /** Shows the normal or the private tabs. */
    void selectModel(boolean privateTabs);

    void move(String id, int index);

    void setPinned(String id, boolean pinned);

    void setMuted(String id, boolean muted);

    /** Every group that holds a tab. */
    List<Group> groups();

    /** Puts `tabId` in a new group named `name`; returns the group's id. */
    String createGroup(String tabId, String name);

    void setGroupName(String groupId, String name);

    void setGroupColor(String groupId, @Nullable String hex);

    void setGroupCollapsed(String groupId, boolean collapsed);

    void addToGroup(String tabId, String groupId);

    void removeFromGroup(String tabId);
}

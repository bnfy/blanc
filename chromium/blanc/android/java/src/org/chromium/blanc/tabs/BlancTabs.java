// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.tabs;

import org.chromium.blanc.spaces.SpacesController;
import org.chromium.build.annotations.NullMarked;
import org.chromium.build.annotations.Nullable;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;
import java.util.Objects;
import java.util.function.LongSupplier;

/**
 * Blanc's tab operations, as Blanc for iPhone's TabsManager does them, applied to a {@link
 * TabStore} (Chromium's tab model on the phone). Only the newest close is undoable, for {@link
 * #UNDO_MILLIS}; until then the closed tab stays alive, so Undo brings back its page and history.
 * After it, /reopen opens its address again. A private tab's close is final.
 */
@NullMarked
public final class BlancTabs {
    public static final long UNDO_MILLIS = 5000;

    /** The iPhone keeps ten closed addresses for /reopen, for as long as the app runs. */
    static final int REOPEN_LIMIT = 10;

    /** Why a group name was refused. */
    public static final class GroupNameException extends RuntimeException {
        public enum Reason {
            BLANK,
            DUPLICATE
        }

        public final Reason reason;

        GroupNameException(Reason reason) {
            super(reason.name());
            this.reason = reason;
        }
    }

    private static final class Closed {
        final List<String> ids = new ArrayList<>();
        final List<String> urls = new ArrayList<>();
        /** Their rows in Recently closed. */
        final List<String> rows = new ArrayList<>();
        final String title;
        final boolean group;
        final @Nullable String blankId;
        final long at;
        /** The set on show when it closed: Undo can't bring it back into another. */
        final @Nullable String shownSet = shownSet();

        Closed(List<TabStore.Entry> tabs, boolean group, @Nullable String blankId, long at) {
            this.group = group;
            for (TabStore.Entry tab : tabs) {
                ids.add(tab.id);
                urls.add(tab.url);
                String row = sCloseLog == null ? null : sCloseLog.closed(tab);
                if (row != null) rows.add(row);
            }
            this.title = tabs.get(0).title;
            this.blankId = blankId;
            this.at = at;
        }
    }

    /** Recently closed, which lives with Sync: told of each close, and of Undo. */
    public interface CloseLog {
        /** The tab's row, or null if it leaves none. */
        @Nullable String closed(TabStore.Entry tab);

        void reopened(List<String> rows);
    }

    private static @Nullable CloseLog sCloseLog;

    public static void setCloseLog(@Nullable CloseLog log) {
        sCloseLog = log;
    }

    /** Runs something later: the Undo's end (the main looper on the phone). */
    public interface Later {
        void post(Runnable run, long delayMillis);
    }

    private final TabStore mStore;
    private final LongSupplier mNow;
    private final Later mLater;
    private final Deque<String> mReopen = new ArrayDeque<>();
    private @Nullable Closed mPending;

    public BlancTabs(TabStore store, LongSupplier now) {
        this(store, now, (run, delay) -> {});
    }

    public BlancTabs(TabStore store, LongSupplier now, Later later) {
        mStore = store;
        mNow = now;
        mLater = later;
    }

    public List<TabStore.Entry> entries(boolean privateTabs) {
        return mStore.tabs(privateTabs);
    }

    public void select(String id) {
        mStore.select(id);
    }

    public boolean privateSelected() {
        return mStore.privateSelected();
    }

    /** The tab showing now, in whichever list is selected. */
    public @Nullable String activeId() {
        return mStore.activeId(mStore.privateSelected());
    }

    /** A plain new tab: ungrouped, on the Start Page, as on the iPhone and desktop. */
    public String newTab() {
        return mStore.create(null, false, null, -1);
    }

    /** An address in a new tab of whichever list is shown (a Favorite or History from the palette). */
    public String open(String url) {
        return mStore.create(url, mStore.privateSelected(), null, -1);
    }

    /** A Recently closed page: its own list never holds private tabs, so it never opens as one. */
    public String reopen(String url) {
        return mStore.create(url, false, null, -1);
    }

    public String newPrivateTab() {
        return mStore.create(null, true, null, -1);
    }

    public String newTabInGroup(String groupId) {
        int after = -1;
        List<TabStore.Entry> tabs = mStore.tabs(false);
        for (int i = 0; i < tabs.size(); i++) if (groupId.equals(tabs.get(i).groupId)) after = i;
        return mStore.create(null, false, after < 0 ? null : groupId, after < 0 ? -1 : after + 1);
    }

    public void duplicate(String id) {
        for (boolean privateTabs : new boolean[] {false, true}) {
            List<TabStore.Entry> tabs = mStore.tabs(privateTabs);
            for (int i = 0; i < tabs.size(); i++) {
                TabStore.Entry tab = tabs.get(i);
                if (tab.id.equals(id)) {
                    mStore.create(tab.url, tab.privateTab, tab.groupId, i + 1);
                    return;
                }
            }
        }
    }

    public void close(String id) {
        TabStore.@Nullable Entry tab = find(id);
        if (tab == null) return;
        expireUndo();
        if (tab.privateTab) {
            mStore.close(id, false);
            if (mStore.tabs(true).isEmpty()) mStore.selectModel(false);
            return;
        }
        List<TabStore.Entry> closing = new ArrayList<>();
        closing.add(tab);
        closeUndoably(closing, false);
    }

    /** Closes every tab in the group, as one Undo. */
    public void closeGroup(String groupId) {
        expireUndo();
        List<TabStore.Entry> closing = members(groupId);
        if (!closing.isEmpty()) closeUndoably(closing, true);
    }

    private void closeUndoably(List<TabStore.Entry> closing, boolean group) {
        for (TabStore.Entry tab : closing) mStore.close(tab.id, true);
        // Closing the last tab leaves a Start Page, which Undo takes away again if it's untouched.
        String blank = mStore.tabs(false).isEmpty() ? mStore.create(null, false, null, -1) : null;
        Closed closed = new Closed(closing, group, blank, mNow.getAsLong());
        mPending = closed;
        // The Undo ends by itself, whichever surface closed the tab.
        mLater.post(() -> {
            if (mPending == closed) expireUndo();
        }, UNDO_MILLIS);
    }

    private boolean undoable() {
        return mPending != null && mNow.getAsLong() - mPending.at <= UNDO_MILLIS
                && Objects.equals(mPending.shownSet, shownSet());
    }

    private static @Nullable String shownSet() {
        SpacesController spaces = SpacesController.current();
        return spaces == null ? null : spaces.library().shownId;
    }

    /** The closed tab Undo would bring back, while it can; null otherwise. */
    public @Nullable String undoTitle() {
        return undoable() && mPending != null ? mPending.title : null;
    }

    /** Whether Undo would bring back a whole group ("Group closed") rather than a tab. */
    public boolean undoIsGroup() {
        return undoable() && mPending != null && mPending.group;
    }

    public boolean undoClose() {
        Closed closed = mPending;
        if (closed == null || !undoable()) {
            expireUndo();
            return false;
        }
        mPending = null;
        if (sCloseLog != null) sCloseLog.reopened(closed.rows);
        // Chromium commits pending closes when the app pauses: a tab it committed opens again.
        String first = null;
        for (int i = 0; i < closed.ids.size(); i++) {
            String id = closed.ids.get(i);
            String back = mStore.cancelClose(id) ? id : mStore.create(closed.urls.get(i), false, null, -1);
            if (first == null) first = back;
        }
        String blank = closed.blankId;
        if (blank != null) {
            TabStore.@Nullable Entry tab = find(blank);
            if (tab != null && TabStore.START_PAGE.equals(tab.url)) mStore.close(blank, false);
        }
        if (first != null) mStore.select(first);
        return true;
    }

    /** Ends the Undo: the closed tabs go for good, and their addresses join /reopen. */
    public void expireUndo() {
        Closed closed = mPending;
        if (closed == null) return;
        mPending = null;
        for (String id : closed.ids) mStore.commitClose(id);
        for (String url : closed.urls) mReopen.addFirst(url);
        while (mReopen.size() > REOPEN_LIMIT) mReopen.removeLast();
    }

    /** /reopen: Undo while it lasts, then the newest closed address. */
    public boolean reopenLast() {
        if (undoable()) return undoClose();
        expireUndo();
        String url = mReopen.pollFirst();
        if (url == null) return false;
        mStore.create(url, false, null, -1);
        return true;
    }

    public void setPinned(String id, boolean pinned) {
        mStore.setPinned(id, pinned);
    }

    public void setMuted(String id, boolean muted) {
        mStore.setMuted(id, muted);
    }

    /** /group: the group with that name (in any case), or a new one; returns its id. */
    public String createGroup(String name, String tabId) {
        String normalized = GroupNames.normalize(name);
        if (normalized.isEmpty()) throw new GroupNameException(GroupNameException.Reason.BLANK);
        // Private tabs are never grouped.
        for (TabStore.Entry tab : mStore.tabs(true)) if (tab.id.equals(tabId)) return "";
        TabStore.@Nullable Group existing = groupNamed(normalized, null);
        if (existing != null) {
            mStore.addToGroup(tabId, existing.id);
            return existing.id;
        }
        return mStore.createGroup(tabId, normalized);
    }

    public void renameGroup(String groupId, String name) {
        String normalized = GroupNames.normalize(name);
        if (normalized.isEmpty()) throw new GroupNameException(GroupNameException.Reason.BLANK);
        if (groupNamed(normalized, groupId) != null) {
            throw new GroupNameException(GroupNameException.Reason.DUPLICATE);
        }
        mStore.setGroupName(groupId, normalized);
    }

    /** A preset's hex, or none for anything else. */
    public void setGroupColor(String groupId, @Nullable String hex) {
        mStore.setGroupColor(groupId, GroupColors.sanitize(hex));
    }

    public void setGroupCollapsed(String groupId, boolean collapsed) {
        mStore.setGroupCollapsed(groupId, collapsed);
    }

    public void moveToGroup(String tabId, @Nullable String groupId) {
        if (groupId == null) {
            mStore.removeFromGroup(tabId);
        } else {
            mStore.addToGroup(tabId, groupId);
        }
    }

    public void ungroup(String groupId) {
        // From the end: each tab leaves to just after what's left of the group, so the order holds.
        List<TabStore.Entry> tabs = members(groupId);
        for (int i = tabs.size() - 1; i >= 0; i--) mStore.removeFromGroup(tabs.get(i).id);
    }

    public List<TabStore.Group> groups() {
        return mStore.groups();
    }

    /** The normal tabs as groups and runs, for the palette and grid. */
    public List<TabSections.Section> sections() {
        List<TabSections.Item> items = new ArrayList<>();
        for (TabStore.Entry tab : mStore.tabs(false)) items.add(new TabSections.Item(tab.id, tab.groupId, tab.pinned));
        return TabSections.sections(items);
    }

    /**
     * What the grid and palette draw, as the iPhone's displaySections: the ungrouped pinned tabs
     * first, as their own section, then every group and run.
     */
    public List<TabSections.Section> displaySections() {
        List<TabSections.Section> out = new ArrayList<>();
        TabSections.Section pins = new TabSections.Section(null);
        for (TabStore.Entry tab : mStore.tabs(false)) if (tab.groupId == null && tab.pinned) pins.tabIds.add(tab.id);
        if (!pins.tabIds.isEmpty()) out.add(pins);
        out.addAll(sections());
        return out;
    }

    private List<TabStore.Entry> members(String groupId) {
        List<TabStore.Entry> out = new ArrayList<>();
        for (TabStore.Entry tab : mStore.tabs(false)) if (groupId.equals(tab.groupId)) out.add(tab);
        return out;
    }

    private TabStore.@Nullable Group groupNamed(String name, @Nullable String except) {
        for (TabStore.Group group : mStore.groups()) {
            if (!group.id.equals(except) && GroupNames.same(group.name, name)) return group;
        }
        return null;
    }

    private TabStore.@Nullable Entry find(String id) {
        for (boolean privateTabs : new boolean[] {false, true}) {
            for (TabStore.Entry tab : mStore.tabs(privateTabs)) if (tab.id.equals(id)) return tab;
        }
        return null;
    }
}

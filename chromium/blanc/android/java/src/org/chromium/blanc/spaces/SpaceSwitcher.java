// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.spaces;

import org.chromium.blanc.spaces.BlancSpaces.Pending;
import org.chromium.blanc.spaces.BlancSpaces.SavedGroup;
import org.chromium.blanc.spaces.BlancSpaces.SavedSet;
import org.chromium.blanc.spaces.BlancSpaces.SavedTab;
import org.chromium.blanc.tabs.TabStore;
import org.chromium.build.annotations.NullMarked;
import org.chromium.build.annotations.Nullable;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Swaps the tabs on show for another set, in place, as the iPhone does. In order: every tab's state
 * goes to disk, the switch is written down, the new set comes up frozen, and only then do the old
 * tabs close. An app killed at any point finishes the switch on its next launch ({@link #recover}),
 * and no tab exists only in memory while its old self is closing.
 */
@NullMarked
public final class SpaceSwitcher {
    /** What a switch needs from the tabs; Chromium in the app, a fake in tests. */
    public interface Tabs {
        List<TabStore.Entry> tabs();

        List<TabStore.Group> groups();

        @Nullable String activeId();

        /** Saves a tab's state under its id, in its group or out of it; false if it has none. */
        boolean freeze(String id, boolean keepGroup);

        /** Brings a saved tab back unloaded, under its id, or "" without a state. */
        String thaw(String id);

        /** A tab that loads when shown, for a saved tab with no state. "" if refused. */
        String open(String url);

        /** A new Start Page tab. */
        String startPage();

        void close(String id);

        void select(String id);

        void restoreGroup(SavedGroup group);

        void setPinned(String id, boolean pinned);

        void forget(String id);

        /** The ids with a saved state. */
        List<String> frozen();

        /** Writes Chromium's own tab list to disk now. */
        void flush();

        /** Writes the library now, before anything else happens; false if it didn't reach disk. */
        boolean save(BlancSpaces library);
    }

    private final BlancSpaces mLibrary;
    private final Tabs mTabs;

    public SpaceSwitcher(BlancSpaces library, Tabs tabs) {
        mLibrary = library;
        mTabs = tabs;
    }

    /** What's on show, as a saved set. Tabs with no state still keep their address. */
    private SavedSet capture() {
        SavedSet set = new SavedSet();
        for (TabStore.Entry tab : mTabs.tabs()) {
            mTabs.freeze(tab.id, true);
            set.tabs.add(new SavedTab(tab.id, tab.url, tab.title, tab.pinned, tab.groupId));
        }
        for (TabStore.Group group : mTabs.groups()) {
            set.groups.add(new SavedGroup(group.id, group.name, group.color, group.collapsed));
        }
        set.activeId = mTabs.activeId();
        return set;
    }

    private void store(@Nullable String id, SavedSet set) {
        if (id == null) {
            mLibrary.phone = set;
        } else {
            BlancSpaces.Space space = mLibrary.space(id);
            if (space != null) space.set = set;
        }
    }

    /** Shows a set; null is This Phone. Showing what's shown changes nothing. */
    public void show(@Nullable String id) {
        if (mLibrary.pending != null) recover();
        String from = mLibrary.shownId;
        if (from == null ? id == null : from.equals(id)) return;
        if (mLibrary.set(id) == null) return;
        SavedSet leaving = capture();
        store(from, leaving);
        Pending pending = new Pending(from, id);
        mLibrary.pending = pending;
        if (!mTabs.save(mLibrary)) {
            // Nothing's safe on disk, so nothing closes.
            mLibrary.pending = null;
            return;
        }
        finish(pending);
    }

    /** Finishes a switch a killed app left, from whatever it got to. */
    public void recover() {
        Pending pending = mLibrary.pending;
        if (pending != null) finish(pending);
    }

    private void finish(Pending pending) {
        SavedSet target = mLibrary.set(pending.to);
        if (target == null) {
            // The Space is gone: stay on the set the switch left.
            mLibrary.pending = null;
            mTabs.save(mLibrary);
            return;
        }
        Set<String> open = new HashSet<>();
        for (TabStore.Entry tab : mTabs.tabs()) open.add(tab.id);
        List<String> shown = new ArrayList<>();
        for (SavedTab tab : target.tabs) {
            if (open.contains(tab.id)) {
                shown.add(tab.id);
                continue;
            }
            String id = mTabs.thaw(tab.id);
            if (id.isEmpty()) id = mTabs.open(tab.url);
            if (id.isEmpty()) continue;
            shown.add(id);
            if (tab.pinned) mTabs.setPinned(id, true);
        }
        for (SavedGroup group : target.groups) mTabs.restoreGroup(group);
        if (shown.isEmpty()) shown.add(mTabs.startPage());
        // Everything else belongs to the set just left, saved before the switch began. After a
        // kill Chromium may have reopened those tabs under new ids, so they aren't matched by id.
        for (TabStore.Entry tab : mTabs.tabs()) {
            if (!shown.contains(tab.id)) mTabs.close(tab.id);
        }
        String active = target.activeId != null && shown.contains(target.activeId) ? target.activeId : shown.get(0);
        mTabs.select(active);
        // Until Chromium's list is on disk a kill brings the old tabs back, so the switch stays open.
        mTabs.flush();
        mLibrary.shownId = pending.to;
        mLibrary.pending = null;
        mTabs.save(mLibrary);
    }

    /** A tab to the end of a set that isn't showing; null is This Phone. The only tab here stays. */
    public void moveTab(String tabId, @Nullable String spaceId) {
        String shown = mLibrary.shownId;
        if (shown == null ? spaceId == null : shown.equals(spaceId)) return;
        SavedSet target = mLibrary.set(spaceId);
        List<TabStore.Entry> tabs = mTabs.tabs();
        if (target == null || tabs.size() < 2) return;
        for (TabStore.Entry tab : tabs) {
            if (!tab.id.equals(tabId)) continue;
            mTabs.freeze(tab.id, false);
            target.tabs.add(new SavedTab(tab.id, tab.url, tab.title, tab.pinned, null));
            mTabs.save(mLibrary);
            mTabs.close(tab.id);
            return;
        }
    }

    /** Deletes a Space, showing This Phone first if it's on show. */
    public void delete(String id, long now) {
        if (id.equals(mLibrary.shownId)) show(null);
        mLibrary.delete(id, now);
        mTabs.save(mLibrary);
    }

    /** Drops state files only a hidden set could need that no hidden set holds. */
    public void sweep() {
        Set<String> keep = new HashSet<>();
        if (mLibrary.shownId != null) addIds(keep, mLibrary.phone);
        for (BlancSpaces.Space space : mLibrary.spaces) {
            if (!space.id.equals(mLibrary.shownId)) addIds(keep, space.set);
        }
        for (BlancSpaces.Deleted entry : mLibrary.deleted) addIds(keep, entry.space.set);
        for (String id : mTabs.frozen()) {
            if (!keep.contains(id)) mTabs.forget(id);
        }
    }

    private static void addIds(Set<String> ids, SavedSet set) {
        for (SavedTab tab : set.tabs) ids.add(tab.id);
    }

    /** Past seven days, a deleted Space's tab files go too. */
    public void expire(long now) {
        for (BlancSpaces.Space space : mLibrary.expire(now)) {
            for (SavedTab tab : space.set.tabs) mTabs.forget(tab.id);
        }
    }
}

// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.spaces;

import org.chromium.blanc.spaces.BlancSpaces.Result;
import org.chromium.blanc.spaces.BlancSpaces.Space;
import org.chromium.build.annotations.NullMarked;
import org.chromium.build.annotations.Nullable;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;

/** What the Spaces surfaces call: the library and the switcher, and who to tell when they change. */
@NullMarked
public final class SpacesController {
    /** Shared Spaces, which live with Sync. */
    public interface Hook {
        /** The shown tabs are about to move: what they are now goes out first, then `then` runs. */
        void beforeSwitch(Runnable then);

        void afterChange();

        void edited(Space space);

        void deleted(Space space);

        void restored(String id);

        void reordered();

        /** The tabs on show that couldn't be synced, by this phone's ids. */
        Set<String> unsynced();
    }

    private static @Nullable Hook sHook;
    private static @Nullable SpacesController sCurrent;

    private final BlancSpaces mLibrary;
    private final SpaceSwitcher mSwitcher;
    private final SpaceSwitcher.Tabs mTabs;
    private final List<Runnable> mListeners = new ArrayList<>();
    private @Nullable String mUndoId;
    private boolean mDeletedWasShown;

    public static Set<String> unsynced() {
        return sHook == null ? Set.of() : sHook.unsynced();
    }

    public static void setHook(@Nullable Hook hook) {
        sHook = hook;
    }

    /** The window's controller, once its tabs have loaded. */
    public static @Nullable SpacesController current() {
        return sCurrent;
    }

    public static void setCurrent(@Nullable SpacesController controller) {
        sCurrent = controller;
    }

    public SpacesController(BlancSpaces library, SpaceSwitcher.Tabs tabs) {
        mLibrary = library;
        mTabs = tabs;
        mSwitcher = new SpaceSwitcher(library, tabs);
    }

    public BlancSpaces library() {
        return mLibrary;
    }

    public void addListener(Runnable listener) {
        mListeners.add(listener);
    }

    public void removeListener(Runnable listener) {
        mListeners.remove(listener);
    }

    private void changed() {
        mTabs.save(mLibrary);
        for (Runnable listener : new ArrayList<>(mListeners)) listener.run();
        if (sHook != null) sHook.afterChange();
    }

    /** The runner changed the library; it's already in it, so only the listeners need telling. */
    public void absorbed() {
        mTabs.save(mLibrary);
        for (Runnable listener : new ArrayList<>(mListeners)) listener.run();
    }

    /** What's on show now, nothing frozen. */
    public BlancSpaces.SavedSet shown() {
        return mSwitcher.shown();
    }

    public SpaceSwitcher.Tabs tabs() {
        return mTabs;
    }

    /** At launch: finishes a switch a killed app left, and clears what's expired. */
    public void start(long now) {
        mSwitcher.recover();
        mSwitcher.expire(now);
        mSwitcher.sweep();
        changed();
    }

    /** How many tabs a set holds; null is This Phone. */
    public int tabCount(@Nullable String id) {
        String shown = mLibrary.shownId;
        if (shown == null ? id == null : shown.equals(id)) return mTabs.tabs().size();
        BlancSpaces.SavedSet set = mLibrary.set(id);
        return set == null ? 0 : set.tabs.size();
    }

    /** Shows a set; null is This Phone. */
    public void show(@Nullable String id) {
        whenReady(() -> {
            mSwitcher.show(id);
            changed();
        });
    }

    private void whenReady(Runnable change) {
        if (sHook == null) change.run();
        else sHook.beforeSwitch(change);
    }

    /** A new Space, shown. */
    public Result createAndShow(String name, String color, String symbol) {
        Result result = mLibrary.create(name, color, symbol);
        if (result == Result.OK && mLibrary.lastCreated != null) show(mLibrary.lastCreated.id);
        return result;
    }

    /** "Save This Phone as a Space": the tabs on show become a new Space, and stay on show. */
    public @Nullable String saveThisPhone(String base) {
        if (mLibrary.shownId != null) show(null);
        String name = base;
        for (int n = 2; mLibrary.named(name) != null; n++) name = base + " " + n;
        Result result = mLibrary.create(name, mLibrary.nextColor(), mLibrary.nextSymbol());
        if (result != Result.OK || mLibrary.lastCreated == null) return null;
        // What's on show moves across as it is, and This Phone starts again from a Start Page.
        mLibrary.phone = new BlancSpaces.SavedSet();
        mLibrary.shownId = mLibrary.lastCreated.id;
        changed();
        return mLibrary.lastCreated.id;
    }

    /** Copies another device's Space here with no link to it, and shows it. */
    public Result bring(String name, String color, String symbol, BlancSpaces.SavedSet set) {
        Result result = mLibrary.create(name, color, symbol);
        if (result == Result.OK && mLibrary.lastCreated != null) {
            mLibrary.lastCreated.set = set;
            show(mLibrary.lastCreated.id);
        }
        return result;
    }

    /** A new Space holding one tab. This set stays on show. */
    public Result createWithTab(String tabId, String name, String color, String symbol) {
        Result result = mLibrary.create(name, color, symbol);
        if (result == Result.OK && mLibrary.lastCreated != null) moveTab(tabId, mLibrary.lastCreated.id);
        return result;
    }

    public Result update(String id, String name, String color, String symbol) {
        Result result = mLibrary.update(id, name, color, symbol);
        if (result == Result.OK) {
            Space space = mLibrary.space(id);
            if (sHook != null && space != null) sHook.edited(space);
            changed();
        }
        return result;
    }

    public void moveTab(String tabId, @Nullable String spaceId) {
        mSwitcher.moveTab(tabId, spaceId);
        changed();
    }

    public void reorder(String id, int by) {
        mLibrary.move(id, by);
        changed();
        if (sHook != null) sHook.reordered();
    }

    public void delete(String id, long now) {
        mDeletedWasShown = id.equals(mLibrary.shownId);
        Space space = mLibrary.space(id);
        if (sHook != null && space != null) sHook.deleted(space);
        Runnable change = () -> {
            mSwitcher.delete(id, now);
            mUndoId = id;
            changed();
        };
        if (mDeletedWasShown) whenReady(change);
        else change.run();
    }

    /** Brings back the Space just deleted, on show again if it was. */
    public void undoDelete() {
        String id = mUndoId;
        mUndoId = null;
        if (id != null && restore(id) == Result.OK && mDeletedWasShown) show(id);
    }

    /** Undo's five seconds are over; Recently deleted still has the Space. */
    public void forgetUndo() {
        mUndoId = null;
    }

    public Result restore(String id) {
        Result result = mLibrary.restore(id);
        if (result == Result.OK) {
            if (sHook != null) sHook.restored(id);
            changed();
        }
        return result;
    }

    /** What the Island's mark shows, or null: it's only there once a Space exists. */
    public @Nullable Space mark() {
        return mLibrary.shown();
    }
}

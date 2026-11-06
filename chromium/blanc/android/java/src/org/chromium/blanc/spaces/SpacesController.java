// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.spaces;

import org.chromium.blanc.spaces.BlancSpaces.Result;
import org.chromium.blanc.spaces.BlancSpaces.Space;
import org.chromium.build.annotations.NullMarked;
import org.chromium.build.annotations.Nullable;

import java.util.ArrayList;
import java.util.List;

/** What the Spaces surfaces call: the library and the switcher, and who to tell when they change. */
@NullMarked
public final class SpacesController {
    private static @Nullable SpacesController sCurrent;

    private final BlancSpaces mLibrary;
    private final SpaceSwitcher mSwitcher;
    private final SpaceSwitcher.Tabs mTabs;
    private final List<Runnable> mListeners = new ArrayList<>();
    private @Nullable String mUndoId;
    private boolean mDeletedWasShown;

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
    }

    /** At launch: finishes a switch a killed app left, and clears what's expired. */
    public void start(long now) {
        mSwitcher.recover();
        mSwitcher.expire(now);
        changed();
    }

    /** Before Android may end the app: the set on show, as it stands. */
    public void saveShown() {
        mSwitcher.saveShown();
    }

    /** Shows a set; null is This Phone. */
    public void show(@Nullable String id) {
        mSwitcher.show(id);
        changed();
    }

    /** A new Space, shown. */
    public Result createAndShow(String name, String color, String symbol) {
        Result result = mLibrary.create(name, color, symbol);
        if (result == Result.OK && mLibrary.lastCreated != null) show(mLibrary.lastCreated.id);
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
        if (result == Result.OK) changed();
        return result;
    }

    public void moveTab(String tabId, @Nullable String spaceId) {
        mSwitcher.moveTab(tabId, spaceId);
        changed();
    }

    public void reorder(String id, int by) {
        mLibrary.move(id, by);
        changed();
    }

    public void delete(String id, long now) {
        mDeletedWasShown = id.equals(mLibrary.shownId);
        mSwitcher.delete(id, now);
        mUndoId = id;
        changed();
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
        if (result == Result.OK) changed();
        return result;
    }

    /** What the Island's mark shows, or null: it's only there once a Space exists. */
    public @Nullable Space mark() {
        return mLibrary.shown();
    }
}

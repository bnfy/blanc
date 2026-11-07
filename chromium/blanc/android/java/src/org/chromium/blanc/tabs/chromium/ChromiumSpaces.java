// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.tabs.chromium;

import org.json.JSONException;

import org.chromium.base.Log;
import org.chromium.base.PathUtils;
import org.chromium.blanc.spaces.BlancSpaces;
import org.chromium.blanc.spaces.SpaceSwitcher;
import org.chromium.blanc.tabs.TabStore;
import org.chromium.build.annotations.NullMarked;
import org.chromium.build.annotations.Nullable;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.List;

/** A switch over Chromium's tabs: frozen state files, and the library in one small file. */
@NullMarked
public final class ChromiumSpaces implements SpaceSwitcher.Tabs {
    private static final String TAG = "BlancSpaces";

    private final ChromiumTabStore mStore;
    private final File mDirectory = new File(PathUtils.getDataDirectory(), "blanc_spaces");
    private final File mTabs = new File(mDirectory, "tabs");
    private final File mLibraryFile = new File(mDirectory, "library.json");

    private final Runnable mFlush;

    /** {@code flush} writes Chromium's tab list to disk. */
    public ChromiumSpaces(ChromiumTabStore store, Runnable flush) {
        mStore = store;
        mFlush = flush;
    }

    public BlancSpaces load() {
        if (!mLibraryFile.exists()) return new BlancSpaces();
        BlancSpaces library = null;
        try {
            library = BlancSpaces.read(new String(Files.readAllBytes(mLibraryFile.toPath()), StandardCharsets.UTF_8));
        } catch (IOException e) {
            Log.w(TAG, "library: " + e.getMessage());
        }
        if (library != null) return library;
        // An empty library is about to be saved over it: keep what was there.
        if (!mLibraryFile.renameTo(new File(mDirectory, "library.unreadable.json"))) Log.w(TAG, "library: unreadable");
        return new BlancSpaces();
    }

    @Override
    public boolean save(BlancSpaces library) {
        mDirectory.mkdirs();
        File temporary = new File(mDirectory, "library.json.tmp");
        try (FileOutputStream out = new FileOutputStream(temporary)) {
            out.write(library.toJson().getBytes(StandardCharsets.UTF_8));
            out.getFD().sync();
        } catch (IOException | JSONException e) {
            Log.w(TAG, "library: " + e.getMessage());
            return false;
        }
        boolean saved = temporary.renameTo(mLibraryFile);
        if (!saved) Log.w(TAG, "library: rename failed");
        return saved;
    }

    @Override
    public List<TabStore.Entry> tabs() {
        return mStore.tabs(false);
    }

    @Override
    public List<TabStore.Group> groups() {
        return mStore.groups();
    }

    @Override
    public @Nullable String activeId() {
        return mStore.activeId(false);
    }

    @Override
    public boolean freeze(String id, boolean keepGroup) {
        return mStore.freeze(id, mTabs, keepGroup);
    }

    @Override
    public List<String> frozen() {
        List<String> ids = new ArrayList<>();
        String[] names = mTabs.list();
        if (names == null) return ids;
        for (String name : names) {
            String id = name.replaceAll("^.*\\D", "");
            if (!id.isEmpty() && !ids.contains(id)) ids.add(id);
        }
        return ids;
    }

    @Override
    public void flush() {
        mFlush.run();
    }

    @Override
    public String thaw(String id) {
        try {
            return mStore.thaw(Integer.parseInt(id), mTabs, -1);
        } catch (NumberFormatException e) {
            return "";
        }
    }

    @Override
    public String open(String url, String title) {
        return mStore.createQuiet(url, title);
    }

    @Override
    public TabStore store() {
        return mStore;
    }

    @Override
    public String joinGroup(String tabId, BlancSpaces.SavedGroup group, @Nullable String local) {
        if (local == null) return mStore.createGroup(tabId, group.name);
        mStore.addToGroup(tabId, local);
        return local;
    }

    @Override
    public String startPage() {
        return mStore.create(null, false, null, -1);
    }

    @Override
    public void close(String id) {
        mStore.close(id, false);
    }

    @Override
    public void select(String id) {
        mStore.selectModel(false);
        mStore.select(id);
    }

    @Override
    public void restoreGroup(BlancSpaces.SavedGroup group) {
        for (TabStore.Group open : mStore.groups()) {
            if (!open.id.equals(group.id)) continue;
            mStore.setGroupName(group.id, group.name);
            mStore.setGroupColor(group.id, group.color);
            mStore.setGroupCollapsed(group.id, group.collapsed);
        }
    }

    @Override
    public void setPinned(String id, boolean pinned) {
        mStore.setPinned(id, pinned);
    }

    @Override
    public void forget(String id) {
        try {
            mStore.forgetFrozen(Integer.parseInt(id), mTabs);
        } catch (NumberFormatException e) {
            // Not a file of ours.
        }
    }
}

// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.tabs;

import org.chromium.build.annotations.Nullable;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** A TabStore over plain lists, for BlancTabsTest. Groups vanish with their last tab, as Chromium's do. */
public final class FakeTabStore implements TabStore {
    /** Tabs made to stay unloaded. */
    public final List<String> quiet = new ArrayList<>();

    private static final class Tab {
        String id;
        String url;
        @Nullable String groupId;
        boolean pinned;
        boolean muted;
        boolean privateTab;
        boolean pending;
    }

    private final List<Tab> mNormal = new ArrayList<>();
    private final List<Tab> mPrivate = new ArrayList<>();
    private final Map<String, String[]> mGroups = new LinkedHashMap<>(); // id -> {name, color, collapsed}
    private final Map<Boolean, String> mActive = new HashMap<>();
    private boolean mPrivateSelected;
    private int mNext;

    private List<Tab> list(boolean privateTabs) {
        return privateTabs ? mPrivate : mNormal;
    }

    private @Nullable Tab find(String id) {
        for (Tab t : mNormal) if (t.id.equals(id)) return t;
        for (Tab t : mPrivate) if (t.id.equals(id)) return t;
        return null;
    }

    private void prune() {
        mGroups.keySet().removeIf(g -> {
            // A group whose tabs are only pending closes keeps its record, so Undo brings it back whole.
            for (Tab t : mNormal) if (g.equals(t.groupId)) return false;
            return true;
        });
    }

    @Override
    public List<Entry> tabs(boolean privateTabs) {
        List<Entry> out = new ArrayList<>();
        for (Tab t : list(privateTabs)) {
            if (!t.pending) out.add(new Entry(t.id, t.url, t.url, t.groupId, t.pinned, t.muted, t.privateTab));
        }
        return out;
    }

    @Override
    public @Nullable String activeId(boolean privateTabs) {
        return mActive.get(privateTabs);
    }

    @Override
    public boolean privateSelected() {
        return mPrivateSelected;
    }

    @Override
    public String create(@Nullable String url, boolean privateTab, @Nullable String groupId, int index) {
        Tab t = new Tab();
        t.id = "t" + mNext++;
        t.url = url == null ? START_PAGE : url;
        t.groupId = groupId;
        t.privateTab = privateTab;
        List<Tab> list = list(privateTab);
        list.add(index < 0 || index > list.size() ? list.size() : index, t);
        mActive.put(privateTab, t.id);
        mPrivateSelected = privateTab;
        return t.id;
    }

    @Override
    public String createQuiet(String url, String title) {
        String id = create(url, false, null, -1);
        quiet.add(id);
        return id;
    }

    @Override
    public String navigate(String id, String url, String title) {
        Tab t = find(id);
        if (t == null) return "";
        t.url = url;
        return id;
    }

    @Override
    public void close(String id, boolean undoable) {
        Tab t = find(id);
        if (t == null) return;
        List<Tab> list = list(t.privateTab);
        if (undoable) {
            t.pending = true;
        } else {
            list.remove(t);
        }
        if (id.equals(mActive.get(t.privateTab))) {
            mActive.remove(t.privateTab);
            for (Tab other : list) if (!other.pending) mActive.put(t.privateTab, other.id);
        }
        prune();
    }

    @Override
    public boolean cancelClose(String id) {
        Tab t = find(id);
        if (t == null || !t.pending) return false;
        t.pending = false;
        mActive.put(t.privateTab, t.id);
        return true;
    }

    @Override
    public void commitClose(String id) {
        Tab t = find(id);
        if (t != null && t.pending) list(t.privateTab).remove(t);
        prune();
    }

    @Override
    public void select(String id) {
        Tab t = find(id);
        if (t == null) return;
        mActive.put(t.privateTab, id);
        mPrivateSelected = t.privateTab;
    }

    @Override
    public void selectModel(boolean privateTabs) {
        mPrivateSelected = privateTabs;
    }

    @Override
    public void move(String id, int index) {
        Tab t = find(id);
        if (t == null) return;
        List<Tab> list = list(t.privateTab);
        list.remove(t);
        list.add(Math.min(Math.max(index, 0), list.size()), t);
    }

    @Override
    public void setPinned(String id, boolean pinned) {
        Tab t = find(id);
        if (t != null) t.pinned = pinned;
    }

    @Override
    public void setMuted(String id, boolean muted) {
        Tab t = find(id);
        if (t != null) t.muted = muted;
    }

    @Override
    public List<Group> groups() {
        List<Group> out = new ArrayList<>();
        for (Map.Entry<String, String[]> e : mGroups.entrySet()) {
            boolean live = false;
            for (Tab t : mNormal) live |= !t.pending && e.getKey().equals(t.groupId);
            if (live) out.add(new Group(e.getKey(), e.getValue()[0], e.getValue()[1], Boolean.parseBoolean(e.getValue()[2])));
        }
        return out;
    }

    @Override
    public String createGroup(String tabId, String name) {
        Tab tab = find(tabId);
        // Chromium's normal model can't hold a private tab.
        if (tab != null && tab.privateTab) throw new IllegalStateException("private tabs are never grouped");
        String id = "g" + mNext++;
        mGroups.put(id, new String[] {name, null, "false"});
        addToGroup(tabId, id);
        return id;
    }

    @Override
    public void setGroupName(String groupId, String name) {
        String[] g = mGroups.get(groupId);
        if (g != null) g[0] = name;
    }

    @Override
    public void setGroupColor(String groupId, @Nullable String hex) {
        String[] g = mGroups.get(groupId);
        if (g != null) g[1] = hex;
    }

    @Override
    public void setGroupCollapsed(String groupId, boolean collapsed) {
        String[] g = mGroups.get(groupId);
        if (g != null) g[2] = String.valueOf(collapsed);
    }

    @Override
    public void addToGroup(String tabId, String groupId) {
        Tab t = find(tabId);
        if (t != null && !t.privateTab) t.groupId = groupId;
        prune();
    }

    @Override
    public void removeFromGroup(String tabId) {
        Tab t = find(tabId);
        if (t == null) return;
        // Chromium moves it to just after what's left of its group (trailing).
        int last = -1;
        for (int i = 0; i < mNormal.size(); i++) {
            Tab other = mNormal.get(i);
            if (other != t && t.groupId != null && t.groupId.equals(other.groupId)) last = i;
        }
        t.groupId = null;
        if (last >= 0 && mNormal.indexOf(t) < last) {
            mNormal.remove(t);
            mNormal.add(last, t);
        }
        prune();
    }
}

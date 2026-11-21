// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.sync;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import org.chromium.blanc.tabs.TabStore;
import org.chromium.build.annotations.NullMarked;

import java.util.List;

/** This phone's regular tabs, for shipping's tab snapshot. Private tabs never reach it. */
@NullMarked
public final class SyncedTabs {
    private SyncedTabs() {}

    /** The arguments of phone.setTabs: the tabs and their groups. */
    public static String arguments(List<TabStore.Entry> tabs, List<TabStore.Group> groups) throws JSONException {
        JSONArray list = new JSONArray();
        for (TabStore.Entry tab : tabs) {
            if (tab.privateTab) continue;
            list.put(new JSONObject().put("url", tab.url).put("title", tab.title)
                    .put("groupId", tab.groupId == null ? JSONObject.NULL : tab.groupId).put("pinned", tab.pinned));
        }
        JSONArray groupList = new JSONArray();
        for (TabStore.Group group : groups) {
            groupList.put(new JSONObject().put("id", group.id).put("name", group.name));
        }
        return new JSONArray().put(list).put(groupList).toString();
    }
}

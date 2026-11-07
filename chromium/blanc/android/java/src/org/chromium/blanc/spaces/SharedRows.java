// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.spaces;

import org.json.JSONArray;
import org.json.JSONObject;

import org.chromium.blanc.tabs.TabStore;
import org.chromium.build.annotations.NullMarked;
import org.chromium.build.annotations.Nullable;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Another device's change onto the tabs on show, as desktop's applySharedSpaceRow does it. Shipping
 * decides what changes and what waits for the tab on screen; this only carries it out.
 */
@NullMarked
public final class SharedRows {
    /** Told of a tab another device closed, for Recently closed. */
    public interface Closes {
        void closedElsewhere(JSONObject row);
    }

    private final BlancSpaces mLibrary;
    private final TabStore mStore;
    private final Closes mCloses;

    public SharedRows(BlancSpaces library, TabStore store, Closes closes) {
        mLibrary = library;
        mStore = store;
        mCloses = closes;
    }

    private static @Nullable String key(Map<String, String> bindings, String shared) {
        for (Map.Entry<String, String> entry : bindings.entrySet()) {
            if (shared.equals(entry.getValue())) return entry.getKey();
        }
        return null;
    }

    private TabStore.@Nullable Entry tab(String shared) {
        String local = key(mLibrary.tabBindings, shared);
        if (local == null) return null;
        for (TabStore.Entry tab : mStore.tabs(false)) if (tab.id.equals(local)) return tab;
        return null;
    }

    private @Nullable String liveGroup(String shared) {
        String local = key(mLibrary.groupBindings, shared);
        if (local == null) return null;
        for (TabStore.Group group : mStore.groups()) if (group.id.equals(local)) return local;
        return null;
    }

    /** A tab's group, by record: null leaves any group, and a group this phone lacks is made. */
    private void place(String tabId, @Nullable String shared, @Nullable JSONObject record) {
        if (shared == null) {
            mStore.removeFromGroup(tabId);
            return;
        }
        String local = liveGroup(shared);
        if (local != null) {
            mStore.addToGroup(tabId, local);
            return;
        }
        if (record == null) return;
        String made = mStore.createGroup(tabId, value(record, "name", ""));
        if (made.isEmpty()) return;
        JSONObject color = record.optJSONObject("color");
        if (color != null && !color.isNull("v")) mStore.setGroupColor(made, color.optString("v"));
        mLibrary.groupBindings.put(made, shared);
    }

    private static String value(JSONObject record, String field, String fallback) {
        JSONObject item = record.optJSONObject(field);
        return item == null ? fallback : item.optString("v", fallback);
    }

    private static @Nullable String text(JSONObject object, String key) {
        return object.isNull(key) ? null : object.optString(key);
    }

    /** One row; false leaves it waiting for the next pass. */
    public boolean apply(JSONObject row) {
        String id = row.optString("id");
        return "groups".equals(row.optString("kind")) ? group(row, id) : tabRow(row, id);
    }

    private boolean group(JSONObject row, String id) {
        String local = liveGroup(id);
        if (local == null) return true;
        if ("delete-group".equals(row.optString("op"))) {
            for (TabStore.Entry tab : mStore.tabs(false)) if (local.equals(tab.groupId)) mStore.removeFromGroup(tab.id);
            mLibrary.groupBindings.remove(local);
            return true;
        }
        JSONObject value = row.optJSONObject("value");
        if (value == null) return true;
        switch (row.optString("field")) {
            case "name":
                mStore.setGroupName(local, value.optString("v"));
                break;
            case "color":
                mStore.setGroupColor(local, text(value, "v"));
                break;
            case "collapsed":
                mStore.setGroupCollapsed(local, value.optBoolean("v"));
                break;
            default:
                break;
        }
        return true;
    }

    private boolean tabRow(JSONObject row, String id) {
        TabStore.@Nullable Entry tab = tab(id);
        String op = row.optString("op");
        if ("create".equals(op)) return create(row, id, tab);
        if (tab == null) return true;
        if ("close".equals(op)) {
            // A phone always shows a tab.
            if (mStore.tabs(false).size() == 1) mStore.create(null, false, null, -1);
            mStore.close(tab.id, false);
            mLibrary.tabBindings.remove(tab.id);
            mCloses.closedElsewhere(row);
            return true;
        }
        JSONObject value = row.optJSONObject("value");
        if (value == null) return true;
        switch (row.optString("field")) {
            case "nav":
                JSONObject nav = value.optJSONObject("v");
                return nav == null || go(tab.id, id, nav.optString("url"), nav.optString("title"));
            case "pinned":
                mStore.setPinned(tab.id, value.optBoolean("v"));
                break;
            case "groupId":
                place(tab.id, text(value, "v"), row.optJSONObject("group"));
                break;
            default:
                break;
        }
        return true;
    }

    private boolean go(String local, String shared, String url, String title) {
        String next = mStore.navigate(local, url, title);
        if (next.isEmpty()) return false;
        if (!next.equals(local)) {
            mLibrary.tabBindings.remove(local);
            mLibrary.tabBindings.put(next, shared);
        }
        return true;
    }

    private boolean create(JSONObject row, String id, TabStore.@Nullable Entry tab) {
        JSONObject record = row.optJSONObject("record");
        JSONObject nav = record == null ? null : record.optJSONObject("nav");
        JSONObject page = nav == null ? null : nav.optJSONObject("v");
        if (record == null || page == null) return true;
        String url = page.optString("url");
        String local;
        if (tab != null) {
            local = tab.id;
            if (!url.equals(tab.url) && !go(local, id, url, page.optString("title"))) return false;
            local = key(mLibrary.tabBindings, id);
            if (local == null) return false;
        } else {
            local = mStore.createQuiet(url, page.optString("title"));
            if (local.isEmpty()) return false;
            mLibrary.tabBindings.put(local, id);
        }
        JSONObject pinned = record.optJSONObject("pinned");
        if (pinned != null) mStore.setPinned(local, pinned.optBoolean("v"));
        JSONObject group = record.optJSONObject("groupId");
        place(local, group == null ? null : text(group, "v"), row.optJSONObject("group"));
        return true;
    }

    /** The order the record gives. Tabs that aren't in the Space keep their places after them. */
    public void layout(JSONObject layout) {
        JSONArray order = layout.optJSONArray("order");
        if (order == null) return;
        List<String> wanted = new ArrayList<>();
        for (int i = 0; i < order.length(); i++) {
            String local = key(mLibrary.tabBindings, order.optString(i));
            if (local != null) wanted.add(local);
        }
        for (int i = 0; i < wanted.size(); i++) {
            List<TabStore.Entry> tabs = mStore.tabs(false);
            if (i < tabs.size() && !tabs.get(i).id.equals(wanted.get(i))) mStore.move(wanted.get(i), i);
        }
    }
}

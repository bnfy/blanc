// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.spaces;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import org.chromium.blanc.spaces.BlancSpaces.SavedGroup;
import org.chromium.blanc.spaces.BlancSpaces.SavedSet;
import org.chromium.blanc.spaces.BlancSpaces.SavedTab;
import org.chromium.blanc.spaces.BlancSpaces.Space;
import org.chromium.build.annotations.NullMarked;
import org.chromium.build.annotations.Nullable;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * The library in shipping's workspace shape, and back. The runner's copy holds only record ids: a
 * group's Chromium id never reaches it once it has a record. "This Phone" is no Space and stays out.
 */
@NullMarked
public final class SpaceRows {
    private static final int DOCUMENT_POLICY = 1;

    private SpaceRows() {}

    private static Object orNull(@Nullable Object value) {
        return value == null ? JSONObject.NULL : value;
    }

    private static String groupId(SavedGroup group) {
        return group.sharedId == null ? group.id : group.sharedId;
    }

    /** One set as workspace columns. A group's id is its record's, once it has one. */
    public static JSONObject columns(SavedSet set) throws JSONException {
        Map<String, String> groupIds = new HashMap<>();
        JSONArray groups = new JSONArray();
        for (SavedGroup group : set.groups) {
            groupIds.put(group.id, groupId(group));
            groups.put(new JSONObject().put("id", groupId(group)).put("name", group.name)
                    .put("color", orNull(group.color)).put("collapsed", group.collapsed));
        }
        JSONArray urls = new JSONArray();
        JSONArray tabIds = new JSONArray();
        JSONArray localIds = new JSONArray();
        JSONArray meta = new JSONArray();
        JSONArray pinned = new JSONArray();
        JSONArray groupColumn = new JSONArray();
        JSONArray policy = new JSONArray();
        JSONArray files = new JSONArray();
        int active = 0;
        for (int i = 0; i < set.tabs.size(); i++) {
            SavedTab tab = set.tabs.get(i);
            urls.put(tab.url);
            tabIds.put(orNull(tab.sharedId));
            localIds.put(tab.id);
            meta.put(new JSONObject().put("title", tab.title));
            pinned.put(tab.pinned);
            String group = tab.groupId == null ? null : groupIds.get(tab.groupId);
            groupColumn.put(orNull(group == null ? tab.groupId : group));
            policy.put(false);
            files.put(false);
            if (tab.id.equals(set.activeId)) active = i;
        }
        return new JSONObject().put("urls", urls).put("tabIds", tabIds).put("localIds", localIds).put("meta", meta)
                .put("pinned", pinned).put("groupIds", groupColumn).put("groups", groups).put("activeIndex", active)
                .put("documentPolicy", DOCUMENT_POLICY).put("inheritsDocumentPolicy", policy).put("localFiles", files);
    }

    private static JSONObject row(Space space, SavedSet set) throws JSONException {
        JSONObject row = columns(set).put("id", space.id).put("name", space.name).put("color", space.color)
                .put("symbol", space.symbol);
        if (space.sharedId != null) row.put("sharedId", space.sharedId);
        if (space.sharedLink != null) row.put("sharedLink", space.sharedLink);
        if (space.recoveredFrom != null) row.put("recoveredFrom", space.recoveredFrom);
        return row;
    }

    /** Every Space, the one on show as it is now. */
    public static JSONArray rows(BlancSpaces library, SavedSet shown) throws JSONException {
        JSONArray rows = new JSONArray();
        for (Space space : library.spaces) {
            rows.put(row(space, space.id.equals(library.shownId) ? shown : space.set));
        }
        return rows;
    }

    private static @Nullable String text(JSONObject object, String key) {
        return object.isNull(key) ? null : object.optString(key);
    }

    private static boolean record(@Nullable String id) {
        return id != null && id.matches("[0-9a-f]{32}");
    }

    /** A hidden set as the runner left it. A tab keeps its Chromium id, and so its Back and Forward. */
    private static SavedSet set(JSONObject row, SavedSet old) {
        SavedSet set = new SavedSet();
        Map<String, SavedTab> byShared = new HashMap<>();
        Map<String, SavedTab> byLocal = new HashMap<>();
        for (SavedTab tab : old.tabs) {
            byLocal.put(tab.id, tab);
            if (tab.sharedId != null) byShared.put(tab.sharedId, tab);
        }
        Map<String, SavedGroup> oldGroups = new HashMap<>();
        for (SavedGroup group : old.groups) oldGroups.put(groupId(group), group);
        JSONArray groups = row.optJSONArray("groups");
        Map<String, String> localGroups = new HashMap<>();
        for (int i = 0; groups != null && i < groups.length(); i++) {
            JSONObject item = groups.optJSONObject(i);
            if (item == null) continue;
            String id = item.optString("id");
            SavedGroup before = oldGroups.get(id);
            if (before == null && i < old.groups.size() && record(id)) before = old.groups.get(i);
            SavedGroup group = new SavedGroup(before == null ? id : before.id, item.optString("name"),
                    text(item, "color"), item.optBoolean("collapsed"));
            if (record(id)) group.sharedId = id;
            localGroups.put(id, group.id);
            set.groups.add(group);
        }
        JSONArray urls = row.optJSONArray("urls");
        JSONArray tabIds = row.optJSONArray("tabIds");
        JSONArray localIds = row.optJSONArray("localIds");
        JSONArray meta = row.optJSONArray("meta");
        JSONArray pinned = row.optJSONArray("pinned");
        JSONArray groupIds = row.optJSONArray("groupIds");
        int active = row.optInt("activeIndex");
        for (int i = 0; urls != null && i < urls.length(); i++) {
            String shared = tabIds == null || tabIds.isNull(i) ? null : tabIds.optString(i);
            String local = localIds == null || localIds.isNull(i) ? null : localIds.optString(i);
            SavedTab before = shared != null && byShared.containsKey(shared) ? byShared.get(shared)
                    : local == null ? null : byLocal.get(local);
            // No Chromium tab behind it: "r" can't be a saved state's name, so a switch opens the address.
            String id = before != null ? before.id : "r" + (shared == null ? i : shared);
            JSONObject info = meta == null ? null : meta.optJSONObject(i);
            String group = groupIds == null || groupIds.isNull(i) ? null : groupIds.optString(i);
            SavedTab tab = new SavedTab(id, urls.optString(i), info == null ? "" : info.optString("title"),
                    pinned != null && pinned.optBoolean(i), group == null ? null : localGroups.getOrDefault(group, group));
            tab.sharedId = shared;
            set.tabs.add(tab);
            if (i == active) set.activeId = id;
        }
        return set;
    }

    private static void bindShown(BlancSpaces library, JSONObject row, SavedSet shown) {
        JSONArray tabIds = row.optJSONArray("tabIds");
        JSONArray localIds = row.optJSONArray("localIds");
        for (int i = 0; tabIds != null && localIds != null && i < localIds.length(); i++) {
            if (!tabIds.isNull(i)) library.tabBindings.put(localIds.optString(i), tabIds.optString(i));
        }
        JSONArray groups = row.optJSONArray("groups");
        for (int i = 0; groups != null && i < groups.length() && i < shown.groups.size(); i++) {
            JSONObject group = groups.optJSONObject(i);
            if (group != null && record(group.optString("id"))) {
                library.groupBindings.put(shown.groups.get(i).id, group.optString("id"));
            }
        }
    }

    /**
     * Takes the runner's rows. The set on show is Chromium's, so only its record ids come in, and a
     * Space the runner dropped goes to Recently deleted unless it's on show: the caller handles that
     * one, because it needs a switch. Returns the id of a shown Space it dropped, or null.
     */
    public static @Nullable String absorb(BlancSpaces library, JSONArray rows, SavedSet shown, long now) {
        List<Space> next = new ArrayList<>();
        for (int i = 0; i < rows.length(); i++) {
            JSONObject row = rows.optJSONObject(i);
            if (row == null) continue;
            String id = row.optString("id");
            Space space = library.space(id);
            if (space == null) {
                space = new Space(id, row.optString("name"), row.optString("color"), row.optString("symbol"));
            }
            space.name = row.optString("name", space.name);
            space.color = row.optString("color", space.color);
            space.symbol = row.optString("symbol", space.symbol);
            space.sharedId = text(row, "sharedId");
            space.sharedLink = text(row, "sharedLink");
            space.recoveredFrom = text(row, "recoveredFrom");
            if (id.equals(library.shownId)) bindShown(library, row, shown);
            else space.set = set(row, space.set);
            next.add(space);
        }
        String shownGone = null;
        List<Space> dropped = new ArrayList<>();
        for (Space space : library.spaces) {
            boolean kept = false;
            for (Space item : next) kept |= item == space;
            if (kept) continue;
            if (space.id.equals(library.shownId)) {
                shownGone = space.id;
                next.add(space);
            } else {
                dropped.add(space);
            }
        }
        for (Space space : dropped) library.delete(space.id, now);
        library.spaces.clear();
        library.spaces.addAll(next);
        return shownGone;
    }
}

// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.sync;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import org.chromium.base.Callback;
import org.chromium.blanc.spaces.BlancSpaces;
import org.chromium.blanc.spaces.SharedRows;
import org.chromium.blanc.spaces.SpaceRows;
import org.chromium.blanc.spaces.SpacesController;
import org.chromium.build.annotations.NullMarked;
import org.chromium.build.annotations.Nullable;

import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Set;

/**
 * Between the phone's Spaces and shipping's Shared Spaces in the runner (shims/spaces.js). The
 * runner decides everything; this sends it the library and the tabs on show, and carries out what
 * comes back.
 */
@NullMarked
public final class SyncedSpaces {
    private static int sRevision;
    private static boolean sHolding;
    private static @Nullable String sRestoring;
    private static String sRecoveryFormat = "{name}";
    private static Set<String> sUnsynced = Set.of();
    private static List<JSONObject> sRemote = List.of();

    private static final SpacesController.Hook HOOK = new SpacesController.Hook() {
        @Override
        public void beforeSwitch() {
            if (!SyncBridge.on()) return;
            push();
            sHolding = true;
            SyncBridge.call("spaces.hold", "[]", reply -> {});
        }

        @Override
        public void afterChange() {
            sHolding = false;
            push();
        }

        @Override
        public void edited(BlancSpaces.Space space) {
            try {
                metadata(space, new JSONObject().put("name", space.name).put("color", space.color)
                        .put("symbol", space.symbol));
            } catch (JSONException e) {
                // The next edit carries it.
            }
        }

        @Override
        public void deleted(BlancSpaces.Space space) {
            try {
                metadata(space, new JSONObject().put("deleted", true));
            } catch (JSONException e) {
                // It stays shared, and comes back at the next pass.
            }
        }

        @Override
        public void restored(String id) {
            sRestoring = id;
        }

        @Override
        public void reordered() {
            if (SyncBridge.on()) SyncBridge.call("spaces.reorder", "[]", reply -> {});
        }

        @Override
        public Set<String> unsynced() {
            return sUnsynced;
        }
    };

    private SyncedSpaces() {}

    static void start() {
        SpacesController.setHook(HOOK);
    }

    /** A recovery Space's name, in this phone's language, with {name} in it. */
    public static void setRecoveryFormat(String format) {
        sRecoveryFormat = format;
    }

    private static void metadata(BlancSpaces.Space space, JSONObject patch) {
        if (space.sharedId == null || !"active".equals(space.sharedLink) || !SyncBridge.on()) return;
        SyncBridge.call("spaces.metadata", new JSONArray().put(space.id).put(patch).toString(), reply -> {});
    }

    /** The record of a tab on show, for Recently closed. */
    static @Nullable String recordOf(String tabId) {
        SpacesController spaces = SpacesController.current();
        return spaces == null ? null : spaces.library().tabBindings.get(tabId);
    }

    /** The shared id of the Space on show. */
    static @Nullable String shownSpace() {
        SpacesController spaces = SpacesController.current();
        BlancSpaces.Space shown = spaces == null ? null : spaces.library().shown();
        return shown == null ? null : shown.sharedId;
    }

    static JSONObject pushArguments(BlancSpaces library, BlancSpaces.SavedSet shown, int revision,
            @Nullable String restoring, String recoveryFormat) throws JSONException {
        JSONArray guarded = new JSONArray();
        String active = shown.activeId == null ? null : library.tabBindings.get(shown.activeId);
        if (active != null) guarded.put(active);
        return new JSONObject().put("revision", revision).put("rows", SpaceRows.rows(library, shown))
                .put("shownId", library.shownId == null ? JSONObject.NULL : library.shownId)
                .put("capture", library.shownId == null ? JSONObject.NULL : SpaceRows.columns(shown))
                .put("protectedIds", guarded).put("recoveryFormat", recoveryFormat)
                .put("restoring", restoring == null ? JSONObject.NULL : restoring);
    }

    /** Tells the runner where things stand. Never during a switch: the tabs are on the move. */
    public static void push() {
        pushThen(null);
    }

    private static void pushThen(@Nullable Runnable done) {
        SpacesController spaces = SpacesController.current();
        if (spaces == null || sHolding || !SyncBridge.on()) {
            if (done != null) done.run();
            return;
        }
        try {
            JSONObject args = pushArguments(spaces.library(), spaces.shown(), sRevision, sRestoring, sRecoveryFormat);
            sRestoring = null;
            SyncBridge.call("spaces.push", new JSONArray().put(args).toString(), reply -> {
                onPushed(spaces, reply);
                readUnsynced(spaces);
                remote(rows -> {});
                if (done != null) done.run();
            });
        } catch (JSONException e) {
            if (done != null) done.run();
        }
    }

    private static void readUnsynced(SpacesController spaces) {
        SyncBridge.call("spaces.status", "[]", reply -> {
            try {
                JSONObject value = new JSONObject(reply).optJSONObject("value");
                JSONObject each = value == null ? null : value.optJSONObject("each");
                sUnsynced = each == null ? Set.of() : SpaceRows.unsynced(spaces.library(), each);
            } catch (JSONException e) {
                // A reply that doesn't parse leaves the last good marks.
            }
        });
    }

    /** The runner changed something this phone hadn't heard: that comes first, then this goes again. */
    private static void onPushed(SpacesController spaces, String reply) {
        try {
            JSONObject value = new JSONObject(reply).optJSONObject("value");
            if (value == null || !value.optBoolean("stale")) return;
            absorb(spaces, value);
            push();
        } catch (JSONException e) {
            // The next push tries again.
        }
    }

    private static void absorb(SpacesController spaces, JSONObject event) {
        JSONArray rows = event.optJSONArray("rows");
        sRevision = Math.max(sRevision, event.optInt("revision"));
        if (rows == null) return;
        String gone = SpaceRows.absorb(spaces.library(), rows, spaces.shown(), System.currentTimeMillis());
        spaces.absorbed();
        if (gone != null) spaces.delete(gone, System.currentTimeMillis());
    }

    private static void bind(BlancSpaces library, JSONObject event) {
        JSONArray localIds = event.optJSONArray("localIds");
        JSONArray tabIds = event.optJSONArray("tabIds");
        for (int i = 0; localIds != null && tabIds != null && i < localIds.length(); i++) {
            if (!tabIds.isNull(i)) library.tabBindings.put(localIds.optString(i), tabIds.optString(i));
        }
        JSONObject groups = event.optJSONObject("groupBindings");
        if (groups == null) return;
        for (Iterator<String> keys = groups.keys(); keys.hasNext();) {
            String local = keys.next();
            // A group that already has a record arrives under that record's id.
            if (!library.groupBindings.containsValue(local)) library.groupBindings.put(local, groups.optString(local));
        }
    }

    static void onEvent(String event, String text) {
        SpacesController spaces = SpacesController.current();
        try {
            JSONObject value = new JSONObject(text);
            if ("spaces-row".equals(event)) {
                boolean done = false;
                if (spaces != null && !sHolding) {
                    done = new SharedRows(spaces.library(), spaces.tabs().store(), SyncedClosed::closedElsewhere)
                            .apply(value.getJSONObject("row"));
                    spaces.absorbed();
                }
                SyncBridge.call("spaces.rowDone", new JSONArray().put(value.optInt("token")).put(done).toString(), reply -> {});
                return;
            }
            if (spaces == null) return;
            switch (event) {
                case "spaces-library" -> absorb(spaces, value);
                case "spaces-bindings" -> {
                    bind(spaces.library(), value);
                    spaces.absorbed();
                }
                case "spaces-layout" -> {
                    if (!sHolding) new SharedRows(spaces.library(), spaces.tabs().store(), row -> {}).layout(value);
                }
                case "spaces-deleted" -> spaces.delete(value.optString("id"), System.currentTimeMillis());
                default -> {}
            }
        } catch (JSONException e) {
            // A line that doesn't parse changes nothing, and the runner sends again.
        }
    }

    /** Calls the runner with the library current, for the sheets. `done` gets the value, or null. */
    public static void ask(String method, String argsJson, Callback<@Nullable JSONObject> done) {
        pushThen(() -> SyncBridge.call(method, argsJson, reply -> {
            try {
                JSONObject outer = new JSONObject(reply);
                done.onResult(outer.optBoolean("ok") ? outer.optJSONObject("value") : null);
            } catch (JSONException e) {
                done.onResult(null);
            }
        }));
    }

    /** The library's Spaces held elsewhere, with the switch off. `done` gets a JSON array, or null. */
    public static void remote(Callback<@Nullable JSONArray> done) {
        SyncBridge.call("spaces.remote", "[]", reply -> {
            JSONArray rows = null;
            try {
                rows = new JSONObject(reply).optJSONArray("value");
            } catch (JSONException e) {
                // Nothing to show: the callers treat it as no Spaces.
            }
            List<JSONObject> kept = new ArrayList<>();
            for (int i = 0; rows != null && i < rows.length(); i++) {
                JSONObject row = rows.optJSONObject(i);
                if (row != null) kept.add(row);
            }
            sRemote = kept;
            done.onResult(rows);
        });
    }

    /** The last read of other devices' Spaces, for the palette to search as it's typed in. */
    public static List<JSONObject> remoteSpaces() {
        return sRemote;
    }
}

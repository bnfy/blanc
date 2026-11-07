// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.sync;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import org.chromium.base.PathUtils;
import org.chromium.blanc.tabs.BlancTabs;
import org.chromium.blanc.tabs.RecentlyClosed;
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
import java.util.UUID;

/**
 * The palette's Recently closed band: this phone's closes, and with the Spaces switch on other
 * devices' too. The runner holds this phone's synced entry and the other devices' rows; shipping
 * decides everything about them, and answers nothing while the switch is off.
 */
@NullMarked
public final class SyncedClosed {
    private static @Nullable RecentlyClosed sLocal;
    private static List<RecentlyClosed.Row> sInbox = new ArrayList<>();

    /** The runner, when Sync is on. */
    interface Runner {
        void call(String method, String argsJson);
    }

    private static final Runner PHONE = (method, argsJson) -> {
        if (SyncBridge.on()) SyncBridge.call(method, argsJson, reply -> refresh());
    };
    private static Runner sRunner = PHONE;

    private SyncedClosed() {}

    /** At launch, whether or not Sync is on: a phone with no account still has its own closes. */
    static void start() {
        if (sLocal != null) return;
        File file = new File(PathUtils.getDataDirectory(), "blanc_closed.json");
        use(new RecentlyClosed(new RecentlyClosed.Disk() {
            @Override
            public @Nullable String read() {
                try {
                    return new String(Files.readAllBytes(file.toPath()), StandardCharsets.UTF_8);
                } catch (IOException e) {
                    return null;
                }
            }

            @Override
            public void write(String json) {
                File temporary = new File(file.getPath() + ".tmp");
                try (FileOutputStream out = new FileOutputStream(temporary)) {
                    out.write(json.getBytes(StandardCharsets.UTF_8));
                    out.getFD().sync();
                } catch (IOException e) {
                    return;
                }
                temporary.renameTo(file);
            }
        }, System::currentTimeMillis));
    }

    static void useRunner(@Nullable Runner runner) {
        sRunner = runner == null ? PHONE : runner;
    }

    static void use(@Nullable RecentlyClosed local) {
        sLocal = local;
        sInbox = new ArrayList<>();
        BlancTabs.setCloseLog(local == null ? null : new BlancTabs.CloseLog() {
            @Override
            public @Nullable String closed(TabStore.Entry tab) {
                return record(tab);
            }

            @Override
            public void reopened(List<String> rows) {
                SyncedClosed.reopened(rows);
            }
        });
    }

    private static void call(String method, JSONArray args) {
        sRunner.call(method, args.toString());
    }

    /** A tab closed here: its row's id, or null when it isn't a web page and leaves no row. */
    static @Nullable String record(TabStore.Entry tab) {
        RecentlyClosed local = sLocal;
        if (local == null || tab.privateTab || !RecentlyClosed.web(tab.url)) return null;
        // In a shared Space the row's id is the record's, so every device lists the page once.
        String shared = SyncedSpaces.recordOf(tab.id);
        String space = shared == null ? null : SyncedSpaces.shownSpace();
        String id = shared != null ? shared : UUID.randomUUID().toString();
        long now = System.currentTimeMillis();
        local.add(new RecentlyClosed.Row(id, tab.url, tab.title, now, space, null, null));
        try {
            call("closed.add", new JSONArray().put(new JSONObject().put("id", id).put("url", tab.url)
                    .put("title", tab.title).put("closedAt", now).put("spaceId", space == null ? JSONObject.NULL : space)));
        } catch (JSONException e) {
            // The row stays on this phone.
        }
        return id;
    }

    /** A tab another device closed here: its row names that device, and keeps the shared id. */
    static void closedElsewhere(JSONObject row) {
        RecentlyClosed local = sLocal;
        JSONObject page = row.optJSONObject("page");
        if (local == null || page == null) return;
        long now = System.currentTimeMillis();
        String id = row.optString("id"), url = page.optString("url"), title = page.optString("title");
        String space = row.isNull("spaceId") ? null : row.optString("spaceId");
        String name = row.isNull("fromName") ? null : row.optString("fromName");
        local.add(new RecentlyClosed.Row(id, url, title, now, space, row.optString("fromId"), name));
        try {
            call("closed.add", new JSONArray().put(new JSONObject().put("id", id).put("url", url).put("title", title)
                    .put("closedAt", now).put("spaceId", space == null ? JSONObject.NULL : space)));
        } catch (JSONException e) {
            // The row stays on this phone.
        }
    }

    /** Undo brought these tabs back: no longer recently closed here. */
    static void reopened(List<String> ids) {
        RecentlyClosed local = sLocal;
        if (local == null) return;
        for (String id : ids) local.remove(id);
    }

    public static List<RecentlyClosed.Row> band() {
        RecentlyClosed local = sLocal;
        return RecentlyClosed.band(local == null ? new ArrayList<>() : local.current(), sInbox);
    }

    /** Forget: hides the row on this phone, wherever it came from. */
    public static void forget(RecentlyClosed.Row row) {
        RecentlyClosed local = sLocal;
        if (local != null && local.remove(row.id)) return;
        List<RecentlyClosed.Row> kept = new ArrayList<>();
        for (RecentlyClosed.Row item : sInbox) if (!item.id.equals(row.id)) kept.add(item);
        sInbox = kept;
        call("closed.hide", new JSONArray().put(row.id));
    }

    /** Clear all: this phone's closes, its synced entry, and every other device's rows. */
    public static void clear() {
        RecentlyClosed local = sLocal;
        if (local != null) local.clear();
        sInbox = new ArrayList<>();
        call("closed.clear", new JSONArray());
    }

    /** Reads the other devices' rows from the runner. */
    static void refresh() {
        SyncBridge.call("closed.inbox", "[]", reply -> {
            try {
                JSONObject outer = new JSONObject(reply);
                JSONArray rows = outer.optBoolean("ok") ? outer.optJSONArray("value") : null;
                if (rows == null) return;
                sInbox = RecentlyClosed.parse(rows);
            } catch (JSONException e) {
                // A reply that doesn't parse leaves the last good copy.
            }
        });
    }
}

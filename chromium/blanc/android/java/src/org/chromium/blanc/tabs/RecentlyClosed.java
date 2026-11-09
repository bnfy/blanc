// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.tabs;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import org.chromium.build.annotations.NullMarked;
import org.chromium.build.annotations.Nullable;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.function.LongSupplier;

/**
 * Pages closed on this phone for the palette's Recently closed band, Blanc for iPhone's rules
 * (RecentlyClosedStore.swift): 25 rows for 24 hours, web pages only, kept on disk. A private tab
 * never gets here. Holds no page state.
 */
@NullMarked
public final class RecentlyClosed {
    public static final int LIMIT = 25;
    public static final long TTL_MILLIS = 24L * 60 * 60 * 1000;

    /** One closed page. {@code fromId} names the device that closed it, when it wasn't this one. */
    public static final class Row {
        public final String id;
        public final String url;
        public final String title;
        public final long closedAt;
        public final @Nullable String spaceId;
        public final @Nullable String fromId;
        public final @Nullable String fromName;

        public Row(String id, String url, String title, long closedAt, @Nullable String spaceId,
                @Nullable String fromId, @Nullable String fromName) {
            this.id = id;
            this.url = url;
            this.title = title;
            this.closedAt = closedAt;
            this.spaceId = spaceId;
            this.fromId = fromId;
            this.fromName = fromName;
        }
    }

    /** Where the rows live. */
    public interface Disk {
        @Nullable String read();

        void write(String json);
    }

    private final Disk mDisk;
    private final LongSupplier mNow;
    private List<Row> mRows = new ArrayList<>();

    public RecentlyClosed(Disk disk, LongSupplier now) {
        mDisk = disk;
        mNow = now;
        String saved = disk.read();
        if (saved == null) return;
        try {
            mRows = parse(new JSONArray(saved));
        } catch (JSONException e) {
            // An unreadable file is only a list of closed pages: start again.
        }
        prune();
    }

    public static boolean web(String url) {
        String lower = url.toLowerCase(Locale.ROOT);
        return lower.startsWith("https://") || lower.startsWith("http://");
    }

    private static @Nullable String text(JSONObject item, String key) {
        return item.isNull(key) ? null : item.optString(key);
    }

    /** Rows as JSON, the shape shipping's inbox answers with. A row that isn't a web page is left out. */
    public static List<Row> parse(JSONArray list) throws JSONException {
        List<Row> rows = new ArrayList<>();
        for (int i = 0; i < list.length(); i++) {
            JSONObject item = list.getJSONObject(i);
            String url = item.optString("url");
            if (!web(url)) continue;
            rows.add(new Row(item.optString("id"), url, item.optString("title"), item.optLong("closedAt"),
                    text(item, "spaceId"), text(item, "fromId"), text(item, "fromName")));
        }
        return rows;
    }

    private void prune() {
        long cutoff = mNow.getAsLong() - TTL_MILLIS;
        List<Row> kept = new ArrayList<>();
        for (Row row : mRows) if (row.closedAt > cutoff && kept.size() < LIMIT) kept.add(row);
        mRows = kept;
    }

    private void save() {
        JSONArray list = new JSONArray();
        try {
            for (Row row : mRows) {
                list.put(new JSONObject().put("id", row.id).put("url", row.url).put("title", row.title)
                        .put("closedAt", row.closedAt)
                        .put("spaceId", row.spaceId == null ? JSONObject.NULL : row.spaceId)
                        .put("fromId", row.fromId == null ? JSONObject.NULL : row.fromId)
                        .put("fromName", row.fromName == null ? JSONObject.NULL : row.fromName));
            }
        } catch (JSONException e) {
            return;
        }
        mDisk.write(list.toString());
    }

    /** The rows still within 24 hours. */
    public List<Row> current() {
        prune();
        return new ArrayList<>(mRows);
    }

    public void add(Row row) {
        if (!web(row.url)) return;
        List<Row> rows = new ArrayList<>();
        for (Row old : mRows) if (!old.id.equals(row.id)) rows.add(old);
        int at = 0;
        while (at < rows.size() && rows.get(at).closedAt > row.closedAt) at++;
        rows.add(at, row);
        mRows = rows;
        prune();
        save();
    }

    public boolean remove(String id) {
        List<Row> rows = new ArrayList<>();
        for (Row old : mRows) if (!old.id.equals(id)) rows.add(old);
        if (rows.size() == mRows.size()) return false;
        mRows = rows;
        save();
        return true;
    }

    public void clear() {
        mRows = new ArrayList<>();
        save();
    }

    /**
     * What the palette lists, newest first and each page once. This phone's row wins; of two devices'
     * rows for one page, the earlier close is the one that really closed it, as on desktop.
     */
    public static List<Row> band(List<Row> local, List<Row> remote) {
        Map<String, Row> rows = new LinkedHashMap<>();
        for (Row row : local) rows.put(row.id, row);
        Map<String, Row> others = new LinkedHashMap<>();
        for (Row row : remote) {
            if (rows.containsKey(row.id)) continue;
            Row seen = others.get(row.id);
            if (seen == null || row.closedAt < seen.closedAt) others.put(row.id, row);
        }
        List<Row> out = new ArrayList<>(rows.values());
        out.addAll(others.values());
        out.sort((a, b) -> Long.compare(b.closedAt, a.closedAt));
        return out;
    }
}

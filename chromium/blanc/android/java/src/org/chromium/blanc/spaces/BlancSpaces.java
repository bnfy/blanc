// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.spaces;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import org.chromium.build.annotations.NullMarked;
import org.chromium.build.annotations.Nullable;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

/**
 * The library of Spaces, Blanc for iPhone's rules (TabSets.swift). A Space is a saved set of this
 * phone's tabs and groups with a name, a color and a symbol; "This Phone" is the set with no name.
 * One set is shown at a time. Pure, so it's tested without Chromium; {@link SpaceSwitcher} moves
 * real tabs. A switch in progress is written down here, so a killed app can finish it.
 */
@NullMarked
public final class BlancSpaces {
    public static final int LIMIT = 25;
    public static final int NAME_LIMIT = 60;
    public static final long DELETED_MILLIS = 7L * 24 * 60 * 60 * 1000;
    public static final String[] COLORS = {
        "#426c4c", "#376694", "#6757a3", "#9b4761", "#974f2a", "#815c02", "#576471", "#3a3a3a"
    };
    public static final String[] SYMBOLS = {
        "briefcase", "house", "code", "flask", "book", "music", "camera", "plane",
        "heart", "star", "leaf", "coffee", "cap", "gamepad", "wallet", "sun"
    };

    /** Why a change was refused, or OK. */
    public enum Result { OK, EMPTY_NAME, DUPLICATE_NAME, LIMIT, BAD_IDENTITY }

    /** One saved tab. Its id is Chromium's, and its Back and Forward live in a state file under it. */
    public static final class SavedTab {
        public final String id;
        public final String url;
        public final String title;
        public final boolean pinned;
        public final @Nullable String groupId;

        public SavedTab(String id, String url, String title, boolean pinned, @Nullable String groupId) {
            this.id = id;
            this.url = url;
            this.title = title;
            this.pinned = pinned;
            this.groupId = groupId;
        }
    }

    /** One saved group. */
    public static final class SavedGroup {
        public final String id;
        public final String name;
        public final @Nullable String color;
        public final boolean collapsed;

        public SavedGroup(String id, String name, @Nullable String color, boolean collapsed) {
            this.id = id;
            this.name = name;
            this.color = color;
            this.collapsed = collapsed;
        }
    }

    /** Tabs and groups in order, and the tab that was showing. */
    public static final class SavedSet {
        public final List<SavedTab> tabs = new ArrayList<>();
        public final List<SavedGroup> groups = new ArrayList<>();
        public @Nullable String activeId;
    }

    /** A named set. */
    public static final class Space {
        public final String id;
        public String name;
        public String color;
        public String symbol;
        public SavedSet set = new SavedSet();

        Space(String id, String name, String color, String symbol) {
            this.id = id;
            this.name = name;
            this.color = color;
            this.symbol = symbol;
        }
    }

    /** A deleted Space, kept seven days. */
    public static final class Deleted {
        public final Space space;
        public final long deletedAt;
        /** Where it stood in the list: Undo and Restore put it back there. */
        public final int index;

        Deleted(Space space, long deletedAt, int index) {
            this.space = space;
            this.deletedAt = deletedAt;
            this.index = index;
        }
    }

    /** A switch begun and not finished. The set ids are null for This Phone. */
    public static final class Pending {
        public final @Nullable String from;
        public final @Nullable String to;

        Pending(@Nullable String from, @Nullable String to) {
            this.from = from;
            this.to = to;
        }
    }

    public SavedSet phone = new SavedSet();
    public final List<Space> spaces = new ArrayList<>();
    public final List<Deleted> deleted = new ArrayList<>();
    public @Nullable String shownId;
    public @Nullable Pending pending;

    /** The name to use, or null: trimmed, at most NAME_LIMIT long, not empty. */
    public static @Nullable String cleanName(String raw) {
        String name = raw.trim();
        if (name.isEmpty()) return null;
        return name.length() > NAME_LIMIT ? name.substring(0, NAME_LIMIT).trim() : name;
    }

    private boolean taken(String name, @Nullable String except) {
        String lower = name.toLowerCase(Locale.ROOT);
        for (Space space : spaces) {
            if (!space.id.equals(except) && space.name.toLowerCase(Locale.ROOT).equals(lower)) return true;
        }
        return false;
    }

    private static boolean known(String[] list, String value) {
        for (String item : list) if (item.equals(value)) return true;
        return false;
    }

    public @Nullable Space space(@Nullable String id) {
        for (Space space : spaces) if (space.id.equals(id)) return space;
        return null;
    }

    public @Nullable Space named(String name) {
        for (Space space : spaces) if (space.name.equalsIgnoreCase(name.trim())) return space;
        return null;
    }

    public @Nullable Space shown() {
        return space(shownId);
    }

    /** The set behind an id; null is This Phone. */
    public @Nullable SavedSet set(@Nullable String id) {
        if (id == null) return phone;
        Space space = space(id);
        return space == null ? null : space.set;
    }

    /** The first color no Space uses, cycling once all are. */
    public String nextColor() {
        for (String color : COLORS) {
            boolean used = false;
            for (Space space : spaces) used |= space.color.equalsIgnoreCase(color);
            if (!used) return color;
        }
        return COLORS[spaces.size() % COLORS.length];
    }

    /** The first symbol no Space uses, cycling once all are. */
    public String nextSymbol() {
        for (String symbol : SYMBOLS) {
            boolean used = false;
            for (Space space : spaces) used |= space.symbol.equals(symbol);
            if (!used) return symbol;
        }
        return SYMBOLS[spaces.size() % SYMBOLS.length];
    }

    /** How a stored color draws: the fill, the symbol on it, and whether it needs an edge. */
    public static final class Paint {
        public final int fill;
        public final int on;
        public final boolean edge;

        Paint(int fill, int on, boolean edge) {
            this.fill = fill;
            this.on = on;
            this.edge = edge;
        }
    }

    private static final int WHITE = 0xFFFFFFFF;
    private static final int BLACK = 0xFF000000;
    private static final int[] LIGHT_SURFACES = {0xFFFFFFFF, 0xFFF7F7F7, 0xFFF5F5F5};
    private static final int[] DARK_SURFACES = {0xFF1F1F1F, 0xFF171717, 0xFF282828};
    private static final double EDGE_CONTRAST = 3.0;

    private static double luminance(int color) {
        double[] linear = new double[3];
        for (int i = 0; i < 3; i++) {
            double value = ((color >> (16 - 8 * i)) & 0xFF) / 255.0;
            linear[i] = value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
        }
        return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
    }

    private static double contrast(int a, int b) {
        double x = luminance(a);
        double y = luminance(b);
        return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
    }

    /** The rules of desktop's space-identity.js. A color that isn't one draws as slate. */
    public static Paint paint(String hex, boolean dark) {
        int fill = 0xFF000000 | Integer.parseInt((isColor(hex) ? hex : COLORS[6]).substring(1), 16);
        int on = contrast(fill, WHITE) >= contrast(fill, BLACK) ? WHITE : BLACK;
        boolean edge = false;
        for (int surface : dark ? DARK_SURFACES : LIGHT_SURFACES) edge |= contrast(fill, surface) < EDGE_CONTRAST;
        return new Paint(fill, on, edge);
    }

    private static boolean isColor(String value) {
        return value.matches("#[0-9a-fA-F]{6}");
    }

    /** A new Space, or why not: read `lastCreated` after OK. */
    public Result create(String raw, String color, String symbol) {
        String name = cleanName(raw);
        if (name == null) return Result.EMPTY_NAME;
        if (spaces.size() >= LIMIT) return Result.LIMIT;
        if (taken(name, null)) return Result.DUPLICATE_NAME;
        if (!known(COLORS, color) || !known(SYMBOLS, symbol)) return Result.BAD_IDENTITY;
        lastCreated = new Space(UUID.randomUUID().toString(), name, color, symbol);
        spaces.add(lastCreated);
        return Result.OK;
    }

    public @Nullable Space lastCreated;

    public Result update(String id, String raw, String color, String symbol) {
        Space space = space(id);
        if (space == null) return Result.OK;
        String name = cleanName(raw);
        if (name == null) return Result.EMPTY_NAME;
        if (taken(name, id)) return Result.DUPLICATE_NAME;
        if (!known(COLORS, color) || !known(SYMBOLS, symbol)) return Result.BAD_IDENTITY;
        space.name = name;
        space.color = color;
        space.symbol = symbol;
        return Result.OK;
    }

    /** Moves a Space up or down the list. */
    public void move(String id, int by) {
        Space space = space(id);
        if (space == null) return;
        int from = spaces.indexOf(space);
        int to = from + by;
        if (to >= 0 && to < spaces.size()) Collections.swap(spaces, from, to);
    }

    /** To Recently deleted. The caller moves off a Space that's showing first. */
    public void delete(String id, long now) {
        Space space = space(id);
        if (space == null || id.equals(shownId)) return;
        int index = spaces.indexOf(space);
        spaces.remove(space);
        deleted.add(0, new Deleted(space, now, index));
    }

    /** Back from Recently deleted, refused at the limit or on a name now in use. */
    public Result restore(String id) {
        for (Deleted entry : deleted) {
            if (!entry.space.id.equals(id)) continue;
            if (spaces.size() >= LIMIT) return Result.LIMIT;
            if (taken(entry.space.name, null)) return Result.DUPLICATE_NAME;
            deleted.remove(entry);
            spaces.add(Math.min(entry.index, spaces.size()), entry.space);
            return Result.OK;
        }
        return Result.OK;
    }

    /** Drops what's past seven days and returns it, so its tab files can go too. */
    public List<Space> expire(long now) {
        List<Space> gone = new ArrayList<>();
        for (Deleted entry : new ArrayList<>(deleted)) {
            if (now - entry.deletedAt < DELETED_MILLIS) continue;
            deleted.remove(entry);
            gone.add(entry.space);
        }
        return gone;
    }

    private static JSONObject setJson(SavedSet set) throws JSONException {
        JSONArray tabs = new JSONArray();
        for (SavedTab tab : set.tabs) {
            tabs.put(new JSONObject().put("id", tab.id).put("url", tab.url).put("title", tab.title)
                    .put("pinned", tab.pinned).put("groupId", tab.groupId == null ? JSONObject.NULL : tab.groupId));
        }
        JSONArray groups = new JSONArray();
        for (SavedGroup group : set.groups) {
            groups.put(new JSONObject().put("id", group.id).put("name", group.name)
                    .put("color", group.color == null ? JSONObject.NULL : group.color).put("collapsed", group.collapsed));
        }
        return new JSONObject().put("tabs", tabs).put("groups", groups)
                .put("activeId", set.activeId == null ? JSONObject.NULL : set.activeId);
    }

    private static @Nullable String text(JSONObject object, String key) {
        return object.isNull(key) ? null : object.optString(key);
    }

    private static SavedSet set(@Nullable JSONObject json) {
        SavedSet set = new SavedSet();
        if (json == null) return set;
        JSONArray tabs = json.optJSONArray("tabs");
        for (int i = 0; tabs != null && i < tabs.length(); i++) {
            JSONObject tab = tabs.optJSONObject(i);
            if (tab == null || tab.optString("id").isEmpty()) continue;
            set.tabs.add(new SavedTab(tab.optString("id"), tab.optString("url"), tab.optString("title"),
                    tab.optBoolean("pinned"), text(tab, "groupId")));
        }
        JSONArray groups = json.optJSONArray("groups");
        for (int i = 0; groups != null && i < groups.length(); i++) {
            JSONObject group = groups.optJSONObject(i);
            if (group == null) continue;
            set.groups.add(new SavedGroup(group.optString("id"), group.optString("name"), text(group, "color"),
                    group.optBoolean("collapsed")));
        }
        set.activeId = text(json, "activeId");
        return set;
    }

    private static JSONObject spaceJson(Space space) throws JSONException {
        return new JSONObject().put("id", space.id).put("name", space.name).put("color", space.color)
                .put("symbol", space.symbol).put("set", setJson(space.set));
    }

    private static Space space(JSONObject json) {
        Space space = new Space(json.optString("id"), json.optString("name"), json.optString("color"), json.optString("symbol"));
        space.set = set(json.optJSONObject("set"));
        return space;
    }

    public String toJson() throws JSONException {
        JSONArray list = new JSONArray();
        for (Space space : spaces) list.put(spaceJson(space));
        JSONArray gone = new JSONArray();
        for (Deleted entry : deleted) {
            gone.put(new JSONObject().put("space", spaceJson(entry.space)).put("deletedAt", entry.deletedAt).put("index", entry.index));
        }
        JSONObject out = new JSONObject().put("version", 1).put("phone", setJson(phone)).put("spaces", list)
                .put("deleted", gone).put("shownId", shownId == null ? JSONObject.NULL : shownId);
        if (pending != null) {
            out.put("pending", new JSONObject().put("from", pending.from == null ? JSONObject.NULL : pending.from)
                    .put("to", pending.to == null ? JSONObject.NULL : pending.to));
        }
        return out.toString();
    }

    /** A file that can't be read gives an empty library: Chromium still has the tabs on show. */
    public static BlancSpaces fromJson(@Nullable String json) {
        BlancSpaces library = json == null ? null : read(json);
        return library == null ? new BlancSpaces() : library;
    }

    /** The library in a file, or null if it can't be read. */
    public static @Nullable BlancSpaces read(String json) {
        BlancSpaces library = new BlancSpaces();
        try {
            JSONObject root = new JSONObject(json);
            library.phone = set(root.optJSONObject("phone"));
            JSONArray list = root.optJSONArray("spaces");
            for (int i = 0; list != null && i < list.length(); i++) {
                JSONObject item = list.optJSONObject(i);
                if (item != null && !item.optString("id").isEmpty()) library.spaces.add(space(item));
            }
            JSONArray gone = root.optJSONArray("deleted");
            for (int i = 0; gone != null && i < gone.length(); i++) {
                JSONObject item = gone.optJSONObject(i);
                JSONObject space = item == null ? null : item.optJSONObject("space");
                if (space != null) library.deleted.add(new Deleted(space(space), item.optLong("deletedAt"), item.optInt("index", Integer.MAX_VALUE)));
            }
            library.shownId = text(root, "shownId");
            if (library.shown() == null) library.shownId = null;
            JSONObject pending = root.optJSONObject("pending");
            if (pending != null) {
                library.pending = new Pending(text(pending, "from"), text(pending, "to"));
            }
        } catch (JSONException e) {
            return null;
        }
        return library;
    }
}

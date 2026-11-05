// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.sync;

import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import org.chromium.base.ContextUtils;
import org.chromium.base.Log;
import org.chromium.blanc.sync.SyncedFavorites.Entry;
import org.chromium.build.annotations.NullMarked;
import org.chromium.build.annotations.Nullable;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;

/** Carries Favorites and settings between the runner and the rest of the app while Sync is on. */
@NullMarked
final class ProfileSync {
    private static final String TAG = "BlancSync";
    private static final String SEEN_FAVORITES = "blanc.sync.favorites.seen";
    private static final String SEEN_THEME = "blanc.sync.theme.seen";
    private static final String SEEN_BLOCKING = "blanc.sync.blocking.seen";
    private static final String THEME_KEY = "ui_theme_setting";
    private static final String[] THEMES = {"system", "light", "dark"};

    private static boolean sRunning;
    private static boolean sAgain;

    private ProfileSync() {}

    private static SharedPreferences prefs() {
        return ContextUtils.getAppSharedPreferences();
    }

    /** One pass at a time; a change during a pass runs another after it. */
    static void reconcile() {
        if (sRunning) {
            sAgain = true;
            return;
        }
        sRunning = true;
        SyncBridge.call("sync.status", "[]", reply -> {
            JSONObject status = value(reply);
            if (status == null || !status.optBoolean("enabled")) {
                prefs().edit().remove(SEEN_FAVORITES).remove(SEEN_THEME).remove(SEEN_BLOCKING).apply();
                finish();
                return;
            }
            favorites();
        });
    }

    private static void finish() {
        sRunning = false;
        if (sAgain) {
            sAgain = false;
            reconcile();
        }
    }

    private static @Nullable JSONObject value(String reply) {
        try {
            JSONObject outer = new JSONObject(reply);
            return outer.optBoolean("ok") ? outer.optJSONObject("value") : null;
        } catch (JSONException e) {
            return null;
        }
    }

    private static List<Entry> entries(JSONArray list, @Nullable Map<String, String> ids) {
        List<Entry> out = new ArrayList<>();
        for (int i = 0; i < list.length(); i++) {
            JSONObject item = list.optJSONObject(i);
            if (item == null) continue;
            String url = item.optString("url");
            out.add(new Entry(url, item.optString("title", url), item.isNull("folder") ? null : item.optString("folder")));
            if (ids != null) ids.put(url, item.optString("id"));
        }
        return out;
    }

    private static void favorites() {
        String model = SyncBridge.favoritesList();
        if (model == null) {
            // Chromium's bookmarks haven't loaded; they say when they have.
            settings();
            return;
        }
        SyncBridge.call("bookmarks.listBookmarks", "[]", reply -> {
            try {
                JSONObject outer = new JSONObject(reply);
                JSONArray runner = outer.optJSONArray("value");
                if (runner == null) {
                    settings();
                    return;
                }
                Map<String, String> ids = new HashMap<>();
                SyncedFavorites.Plan plan = SyncedFavorites.plan(entries(new JSONArray(model), null), entries(runner, ids),
                        prefs().getStringSet(SEEN_FAVORITES, new HashSet<>()));
                apply(plan, ids);
                prefs().edit().putStringSet(SEEN_FAVORITES, plan.seen).apply();
            } catch (JSONException e) {
                Log.w(TAG, "favorites: " + e.getMessage());
            }
            settings();
        });
    }

    private static JSONArray json(List<Entry> entries) throws JSONException {
        JSONArray out = new JSONArray();
        for (Entry entry : entries) {
            out.put(new JSONObject().put("url", entry.url).put("title", entry.title)
                    .put("folder", entry.folder == null ? JSONObject.NULL : entry.folder));
        }
        return out;
    }

    private static void apply(SyncedFavorites.Plan plan, Map<String, String> ids) throws JSONException {
        if (!plan.addToModel.isEmpty() || !plan.removeFromModel.isEmpty() || !plan.retitleModel.isEmpty()) {
            SyncBridge.favoritesApply(new JSONObject().put("add", json(plan.addToModel))
                    .put("remove", json(plan.removeFromModel)).put("retitle", json(plan.retitleModel)).toString());
        }
        for (Entry entry : plan.addToRunner) {
            SyncBridge.call("bookmarks.saveFavorite", new JSONArray().put(entry.url).put(entry.title)
                    .put(JSONObject.NULL).put(entry.folder == null ? JSONObject.NULL : entry.folder).toString(), r -> {});
        }
        for (Entry entry : plan.removeFromRunner) {
            SyncBridge.call("bookmarks.removeBookmark", new JSONArray().put(ids.get(entry.url)).toString(), r -> {});
        }
    }

    private static Map<String, String> local() {
        Map<String, String> out = new HashMap<>();
        int theme = Math.max(0, Math.min(2, prefs().getInt(THEME_KEY, 0)));
        out.put("theme", THEMES[theme]);
        out.put("adblockEnabled", String.valueOf(SyncBridge.blockingEnabled()));
        return out;
    }

    private static void settings() {
        SyncBridge.call("settings.getSettings", "[]", reply -> {
            JSONObject runner = value(reply);
            if (runner != null) {
                Map<String, String> theirs = new HashMap<>();
                theirs.put("theme", runner.optString("theme"));
                theirs.put("adblockEnabled", String.valueOf(runner.optBoolean("adblockEnabled", true)));
                Map<String, String> seen = new HashMap<>();
                String theme = prefs().getString(SEEN_THEME, null);
                String blocking = prefs().getString(SEEN_BLOCKING, null);
                if (theme != null) seen.put("theme", theme);
                if (blocking != null) seen.put("adblockEnabled", blocking);
                SyncedSettings.Plan plan = SyncedSettings.plan(local(), theirs, seen);
                String nextTheme = plan.apply.get("theme");
                if (nextTheme != null) {
                    prefs().edit().putInt(THEME_KEY, java.util.Arrays.asList(THEMES).indexOf(nextTheme)).apply();
                }
                String nextBlocking = plan.apply.get("adblockEnabled");
                if (nextBlocking != null) SyncBridge.setBlockingEnabled(Boolean.parseBoolean(nextBlocking));
                publish(plan);
                Map<String, String> now = local();
                prefs().edit().putString(SEEN_THEME, now.get("theme")).putString(SEEN_BLOCKING, now.get("adblockEnabled")).apply();
            }
            finish();
        });
    }

    private static void publish(SyncedSettings.Plan plan) {
        if (plan.publish.isEmpty()) return;
        try {
            JSONObject patch = new JSONObject();
            String theme = plan.publish.get("theme");
            if (theme != null) patch.put("theme", theme);
            String blocking = plan.publish.get("adblockEnabled");
            if (blocking != null) patch.put("adblockEnabled", Boolean.parseBoolean(blocking));
            SyncBridge.call("settings.setSettings", new JSONArray().put(patch).toString(), r -> {});
        } catch (JSONException e) {
            Log.w(TAG, "settings: " + e.getMessage());
        }
    }
}

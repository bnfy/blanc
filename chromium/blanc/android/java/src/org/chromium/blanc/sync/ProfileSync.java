// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.sync;

import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import org.chromium.base.Callback;
import org.chromium.base.Log;
import org.chromium.blanc.sync.SyncedFavorites.Entry;
import org.chromium.build.annotations.NullMarked;
import org.chromium.build.annotations.Nullable;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;

/**
 * Carries Favorites and settings between the runner and the rest of the app while Sync is on. What
 * both sides agree on is written down only after the runner has confirmed and saved its half, so a
 * refused or interrupted step is tried again and never reads as a removal.
 */
@NullMarked
final class ProfileSync {
    /** The app around this: SyncBridge's natives and the app's preferences. */
    interface Host {
        void call(String method, String argsJson, Callback<String> done);

        @Nullable String favoritesList();

        void favoritesApply(String planJson);

        /** Chromium's form of each address, or "" where it can't hold one. */
        String canonicalUrls(String urlsJson);

        boolean blockingEnabled();

        void setBlockingEnabled(boolean on);

        SharedPreferences prefs();

        /** Background sync on or off. */
        void schedule(boolean on);
    }

    private static final String TAG = "BlancSync";
    static final String SEEN_FAVORITES = "blanc.sync.favorites.seen";
    private static final String SEEN_THEME = "blanc.sync.theme.seen";
    private static final String SEEN_BLOCKING = "blanc.sync.blocking.seen";
    private static final String THEME_KEY = "ui_theme_setting";
    private static final String[] THEMES = {"system", "light", "dark"};

    private final Host mHost;
    private @Nullable Boolean mScheduled;
    private boolean mRunning;
    private boolean mAgain;

    ProfileSync(Host host) {
        mHost = host;
    }

    /** One pass at a time; a change during a pass runs another after it. */
    void reconcile() {
        if (mRunning) {
            mAgain = true;
            return;
        }
        mRunning = true;
        mHost.call("sync.status", "[]", reply -> {
            JSONObject outer = parse(reply);
            JSONObject status = outer != null && outer.optBoolean("ok") ? outer.optJSONObject("value") : null;
            if (status == null) {
                // The runner didn't answer. That says nothing about Sync being off.
                finish();
            } else if (!status.optBoolean("enabled")) {
                mHost.prefs().edit().remove(SEEN_FAVORITES).remove(SEEN_THEME).remove(SEEN_BLOCKING).apply();
                schedule(false);
                finish();
            } else {
                schedule(true);
                favorites();
            }
        });
    }

    // Once per launch and per change, not once ever: a force-stop makes Android drop the job.
    private void schedule(boolean on) {
        if (mScheduled != null && mScheduled == on) return;
        mHost.schedule(on);
        mScheduled = on;
    }

    private void finish() {
        mRunning = false;
        if (mAgain) {
            mAgain = false;
            reconcile();
        }
    }

    private static @Nullable JSONObject parse(String reply) {
        try {
            return new JSONObject(reply);
        } catch (JSONException e) {
            return null;
        }
    }

    private static boolean ok(String reply) {
        JSONObject outer = parse(reply);
        return outer != null && outer.optBoolean("ok");
    }

    private static @Nullable String folder(JSONObject item) {
        return item.isNull("folder") ? null : item.optString("folder");
    }

    private void favorites() {
        String model = mHost.favoritesList();
        if (model == null) {
            // Chromium's bookmarks haven't loaded; they say when they have.
            settings();
            return;
        }
        mHost.call("bookmarks.listBookmarks", "[]", reply -> {
            JSONObject outer = parse(reply);
            JSONArray runner = outer != null && outer.optBoolean("ok") ? outer.optJSONArray("value") : null;
            if (runner == null) {
                finish();
                return;
            }
            try {
                plan(new JSONArray(model), runner);
            } catch (JSONException e) {
                Log.w(TAG, "favorites: " + e.getMessage());
                finish();
            }
        });
    }

    private void plan(JSONArray model, JSONArray runner) throws JSONException {
        JSONArray addresses = new JSONArray();
        for (int i = 0; i < runner.length(); i++) addresses.put(runner.getJSONObject(i).optString("url"));
        JSONArray canonical = new JSONArray(mHost.canonicalUrls(addresses.toString()));
        // Chromium can't hold every address the runner can. Those stay in the runner, out of the plan.
        List<Entry> theirs = new ArrayList<>();
        Map<String, String> ids = new HashMap<>();
        for (int i = 0; i < runner.length(); i++) {
            JSONObject item = runner.getJSONObject(i);
            String url = canonical.optString(i);
            if (url.isEmpty()) continue;
            theirs.add(new Entry(url, item.optString("title", url), folder(item)));
            ids.put(url, item.optString("id"));
        }
        List<Entry> mine = new ArrayList<>();
        for (int i = 0; i < model.length(); i++) {
            JSONObject item = model.getJSONObject(i);
            String url = item.optString("url");
            mine.add(new Entry(url, item.optString("title", url), folder(item)));
        }
        SyncedFavorites.Plan plan = SyncedFavorites.plan(mine, theirs,
                mHost.prefs().getStringSet(SEEN_FAVORITES, new HashSet<>()));
        if (!plan.addToModel.isEmpty() || !plan.removeFromModel.isEmpty() || !plan.retitleModel.isEmpty()) {
            mHost.favoritesApply(new JSONObject().put("add", json(plan.addToModel))
                    .put("remove", json(plan.removeFromModel)).put("retitle", json(plan.retitleModel)).toString());
        }
        List<String[]> calls = new ArrayList<>();
        for (Entry entry : plan.addToRunner) {
            calls.add(new String[] {"bookmarks.saveFavorite", new JSONArray().put(entry.url).put(entry.title)
                    .put(JSONObject.NULL).put(entry.folder == null ? JSONObject.NULL : entry.folder).toString()});
        }
        for (Entry entry : plan.removeFromRunner) {
            calls.add(new String[] {"bookmarks.removeBookmark", new JSONArray().put(ids.get(entry.url)).toString()});
        }
        calls.add(new String[] {"runner.flush", "[]"});
        run(calls, 0, confirmed -> {
            if (!confirmed) {
                finish();
                return;
            }
            mHost.prefs().edit().putStringSet(SEEN_FAVORITES, plan.seen).apply();
            settings();
        });
    }

    /** The calls in order, stopping at the first the runner refuses. */
    private void run(List<String[]> calls, int index, Callback<Boolean> done) {
        if (index == calls.size()) {
            done.onResult(true);
            return;
        }
        String[] call = calls.get(index);
        mHost.call(call[0], call[1], reply -> {
            if (ok(reply)) run(calls, index + 1, done);
            else done.onResult(false);
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

    private Map<String, String> local() {
        Map<String, String> out = new HashMap<>();
        int theme = Math.max(0, Math.min(2, mHost.prefs().getInt(THEME_KEY, 0)));
        out.put("theme", THEMES[theme]);
        out.put("adblockEnabled", String.valueOf(mHost.blockingEnabled()));
        return out;
    }

    private void settings() {
        mHost.call("settings.getSettings", "[]", reply -> {
            JSONObject outer = parse(reply);
            JSONObject runner = outer != null && outer.optBoolean("ok") ? outer.optJSONObject("value") : null;
            if (runner == null) {
                finish();
                return;
            }
            Map<String, String> theirs = new HashMap<>();
            theirs.put("theme", runner.optString("theme"));
            theirs.put("adblockEnabled", String.valueOf(runner.optBoolean("adblockEnabled", true)));
            Map<String, String> seen = new HashMap<>();
            String theme = mHost.prefs().getString(SEEN_THEME, null);
            String blocking = mHost.prefs().getString(SEEN_BLOCKING, null);
            if (theme != null) seen.put("theme", theme);
            if (blocking != null) seen.put("adblockEnabled", blocking);
            SyncedSettings.Plan plan = SyncedSettings.plan(local(), theirs, seen);
            String nextTheme = plan.apply.get("theme");
            if (nextTheme != null) {
                mHost.prefs().edit().putInt(THEME_KEY, Arrays.asList(THEMES).indexOf(nextTheme)).apply();
            }
            String nextBlocking = plan.apply.get("adblockEnabled");
            if (nextBlocking != null) mHost.setBlockingEnabled(Boolean.parseBoolean(nextBlocking));
            List<String[]> calls = new ArrayList<>();
            try {
                if (!plan.publish.isEmpty()) calls.add(new String[] {"settings.setSettings", patch(plan).toString()});
            } catch (JSONException e) {
                finish();
                return;
            }
            calls.add(new String[] {"runner.flush", "[]"});
            run(calls, 0, confirmed -> {
                if (confirmed) {
                    Map<String, String> now = local();
                    mHost.prefs().edit().putString(SEEN_THEME, now.get("theme"))
                            .putString(SEEN_BLOCKING, now.get("adblockEnabled")).apply();
                }
                finish();
            });
        });
    }

    private static JSONArray patch(SyncedSettings.Plan plan) throws JSONException {
        JSONObject patch = new JSONObject();
        String theme = plan.publish.get("theme");
        if (theme != null) patch.put("theme", theme);
        String blocking = plan.publish.get("adblockEnabled");
        if (blocking != null) patch.put("adblockEnabled", Boolean.parseBoolean(blocking));
        return new JSONArray().put(patch);
    }
}

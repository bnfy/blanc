// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.sync;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONException;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;

import org.chromium.base.Callback;
import org.chromium.base.test.BaseRobolectricTestRunner;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

@RunWith(BaseRobolectricTestRunner.class)
@Config(manifest = Config.NONE)
public class ProfileSyncTest implements ProfileSync.Host {
    private static final String ON = "{\"ok\":true,\"value\":{\"enabled\":true}}";
    private final Map<String, String> mReplies = new HashMap<>();
    private final List<String> mCalls = new ArrayList<>();
    private final List<String> mApplied = new ArrayList<>();
    private String mModel = "[]";
    private SharedPreferences mPrefs;

    @Before
    public void setUp() {
        mPrefs = RuntimeEnvironment.getApplication().getSharedPreferences("test", 0);
        mPrefs.edit().clear().commit();
        mReplies.put("sync.status", ON);
        mReplies.put("bookmarks.listBookmarks", "{\"ok\":true,\"value\":[]}");
        mReplies.put("settings.getSettings", "{\"ok\":true,\"value\":{\"theme\":\"system\",\"adblockEnabled\":true}}");
    }

    @Override
    public void call(String method, String args, Callback<String> done) {
        mCalls.add(method);
        done.onResult(mReplies.getOrDefault(method, "{\"ok\":true,\"value\":null}"));
    }

    @Override public String favoritesList() { return mModel; }
    @Override public void favoritesApply(String plan) { mApplied.add(plan); }
    @Override public boolean blockingEnabled() { return true; }
    @Override public void setBlockingEnabled(boolean on) {}
    @Override public SharedPreferences prefs() { return mPrefs; }

    @Override
    public String canonicalUrls(String urls) {
        try {
            JSONArray in = new JSONArray(urls);
            JSONArray out = new JSONArray();
            for (int i = 0; i < in.length(); i++) out.put(in.getString(i).equals("bad") ? "" : in.getString(i));
            return out.toString();
        } catch (JSONException e) {
            throw new AssertionError(e);
        }
    }

    private void seen(String... urls) {
        mPrefs.edit().putStringSet(ProfileSync.SEEN_FAVORITES, new HashSet<>(List.of(urls))).commit();
    }

    private Set<String> seen() {
        return mPrefs.getStringSet(ProfileSync.SEEN_FAVORITES, Set.of());
    }

    private static String favorite(String url) {
        return "{\"id\":\"" + url + "\",\"url\":\"" + url + "\",\"title\":\"" + url + "\",\"folder\":null}";
    }

    private void reconcile() {
        new ProfileSync(this).reconcile();
    }

    @Test
    public void aRefusedSaveNeverReadsAsARemoval() {
        mModel = "[" + favorite("a") + "]";
        mReplies.put("bookmarks.saveFavorite", "{\"ok\":false,\"error\":\"ended\"}");
        reconcile();
        assertTrue(seen().isEmpty());
        mReplies.remove("bookmarks.saveFavorite");
        mCalls.clear();
        reconcile();
        assertTrue(mApplied.toString(), mApplied.isEmpty());
        assertTrue(mCalls.contains("bookmarks.saveFavorite"));
    }

    @Test
    public void aSaveTheRunnerSilentlyDropsIsTriedAgainNotDeleted() {
        mModel = "[" + favorite("a") + "]";
        reconcile();
        reconcile();
        assertTrue(mApplied.toString(), mApplied.isEmpty());
    }

    @Test
    public void aFailedFlushKeepsWhatWasAgreed() {
        seen("a");
        mModel = "[" + favorite("a") + "," + favorite("b") + "]";
        mReplies.put("bookmarks.listBookmarks", "{\"ok\":true,\"value\":[" + favorite("a") + "," + favorite("b") + "]}");
        mReplies.put("runner.flush", "{\"ok\":false,\"error\":\"ended\"}");
        reconcile();
        assertEquals(Set.of("a"), seen());
    }

    @Test
    public void aRunnerThatDoesntAnswerLeavesWhatWasAgreed() {
        seen("a");
        mReplies.put("sync.status", "{\"ok\":false,\"error\":\"unavailable\"}");
        reconcile();
        assertEquals(Set.of("a"), seen());
    }

    @Test
    public void syncOffForgetsWhatWasAgreed() {
        seen("a");
        mReplies.put("sync.status", "{\"ok\":true,\"value\":{\"enabled\":false}}");
        reconcile();
        assertTrue(seen().isEmpty());
    }

    @Test
    public void aFailedRemovalIsTriedAgainNotBroughtBack() {
        seen("a");
        mReplies.put("bookmarks.listBookmarks", "{\"ok\":true,\"value\":[" + favorite("a") + "]}");
        mReplies.put("bookmarks.removeBookmark", "{\"ok\":false,\"error\":\"ended\"}");
        reconcile();
        assertEquals(Set.of("a"), seen());
        mReplies.remove("bookmarks.removeBookmark");
        mCalls.clear();
        reconcile();
        assertTrue(mCalls.contains("bookmarks.removeBookmark"));
        assertTrue(mApplied.toString(), mApplied.isEmpty());
    }

    @Test
    public void anAddressChromiumCantHoldIsLeftInTheRunner() {
        seen("bad");
        mReplies.put("bookmarks.listBookmarks", "{\"ok\":true,\"value\":[" + favorite("bad") + "]}");
        reconcile();
        assertFalse(mCalls.contains("bookmarks.removeBookmark"));
        assertTrue(mApplied.toString(), mApplied.isEmpty());
    }

    @Test
    public void aFailedPublishIsTriedAgain() {
        mPrefs.edit().putString("blanc.sync.theme.seen", "system").putString("blanc.sync.blocking.seen", "true")
                .putInt("ui_theme_setting", 2).commit();
        mReplies.put("settings.setSettings", "{\"ok\":false,\"error\":\"ended\"}");
        reconcile();
        assertEquals("system", mPrefs.getString("blanc.sync.theme.seen", null));
        assertEquals(2, mPrefs.getInt("ui_theme_setting", 0));
        mReplies.remove("settings.setSettings");
        mCalls.clear();
        reconcile();
        assertTrue(mCalls.contains("settings.setSettings"));
    }
}

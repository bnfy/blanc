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
    private final List<Boolean> mSchedules = new ArrayList<>();
    private final List<Runnable> mLater = new ArrayList<>();
    private long mNow;
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
    @Override public void schedule(boolean on) { mSchedules.add(on); }
    @Override public long now() { return mNow; }
    @Override public void later(Runnable run, long millis) { mLater.add(run); }

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

    private void engineOnTheRunner(String engine) {
        mReplies.put("settings.getSettings", "{\"ok\":true,\"value\":{\"theme\":\"system\",\"adblockEnabled\":true,\"searchEngine\":\""
                + engine + "\"}}");
    }

    @Test
    public void aSyncedSearchEngineIsAppliedToThePhone() {
        engineOnTheRunner("kagi");
        reconcile();
        assertEquals("kagi", mPrefs.getString("blanc.search_engine", null));
    }

    @Test
    public void aSyncedCustomEngineIsNeitherAppliedNorRepublished() {
        engineOnTheRunner("custom");
        reconcile();
        assertEquals(null, mPrefs.getString("blanc.search_engine", null));
        assertFalse(mCalls.contains("settings.setSettings"));
        mPrefs.edit().putString("blanc.search_engine", "kagi").commit();
        mCalls.clear();
        reconcile();
        assertFalse(mCalls.contains("settings.setSettings"));
    }

    @Test
    public void aLocalEngineChangeIsPublishedOnce() {
        mPrefs.edit().putString("blanc.search_engine", "brave").putString("blanc.sync.searchEngine.seen", "duckduckgo")
                .putString("blanc.sync.theme.seen", "system").putString("blanc.sync.blocking.seen", "true").commit();
        engineOnTheRunner("duckduckgo");
        reconcile();
        assertTrue(mCalls.contains("settings.setSettings"));
        assertEquals("brave", mPrefs.getString("blanc.sync.searchEngine.seen", null));
        engineOnTheRunner("brave");
        mCalls.clear();
        reconcile();
        assertFalse(mCalls.contains("settings.setSettings"));
    }

    @Test
    public void backgroundSyncFollowsSyncOnceEachWay() {
        ProfileSync profile = new ProfileSync(this);
        profile.reconcile();
        profile.reconcile();
        assertEquals(List.of(true), mSchedules);
        mReplies.put("sync.status", "{\"ok\":true,\"value\":{\"enabled\":false}}");
        profile.reconcile();
        profile.reconcile();
        assertEquals(List.of(true, false), mSchedules);
    }

    @Test
    public void aNewLaunchSchedulesAgainBecauseAForceStopDropsTheJob() {
        new ProfileSync(this).reconcile();
        new ProfileSync(this).reconcile();
        assertEquals(List.of(true, true), mSchedules);
    }

    @Test
    public void aRunnerThatDoesntAnswerLeavesTheScheduleAlone() {
        mReplies.put("sync.status", "{\"ok\":false,\"error\":\"unavailable\"}");
        reconcile();
        assertTrue(mSchedules.isEmpty());
    }

    @Test
    public void anAddressJustAddedHereIsntAgreedUntilChromiumHasSavedIt() {
        mReplies.put("bookmarks.listBookmarks", "{\"ok\":true,\"value\":[" + favorite("a") + "]}");
        ProfileSync profile = new ProfileSync(this);
        profile.reconcile();
        assertEquals(1, mApplied.size());
        assertEquals(1, mLater.size());
        mModel = "[" + favorite("a") + "]";
        mNow = 1000;
        profile.reconcile();
        assertTrue("too soon", seen().isEmpty());
        mNow = ProfileSync.SETTLE_MILLIS + 1000;
        mLater.get(0).run();
        assertEquals(Set.of("a"), seen());
    }

    @Test
    public void aRunWaitsForThePassToSettle() {
        List<String> order = new ArrayList<>();
        new ProfileSync(this).reconcile(() -> order.add("done"));
        assertEquals(List.of("done"), order);
    }
}

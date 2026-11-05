// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.sync;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.annotation.Config;

import org.chromium.base.test.BaseRobolectricTestRunner;
import org.chromium.blanc.sync.SyncedFavorites.Entry;
import org.chromium.blanc.sync.SyncedFavorites.Plan;

import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

@RunWith(BaseRobolectricTestRunner.class)
@Config(manifest = Config.NONE)
public class SyncedFavoritesTest {
    private static Entry entry(String url) {
        return new Entry(url, url, null);
    }

    private static List<String> urls(List<Entry> entries) {
        return entries.stream().map(e -> e.url).collect(Collectors.toList());
    }

    private static Set<String> seen(String... urls) {
        return new HashSet<>(List.of(urls));
    }

    @Test
    public void aRemoteFavoriteComesHereAndDoesNotEcho() {
        Plan plan = SyncedFavorites.plan(List.of(), List.of(entry("a")), seen());
        assertEquals(List.of("a"), urls(plan.addToModel));
        assertTrue(plan.addToRunner.isEmpty());
        Plan next = SyncedFavorites.plan(List.of(entry("a")), List.of(entry("a")), plan.seen);
        assertTrue(next.isEmpty());
    }

    @Test
    public void aLocalFavoriteReachesTheRunner() {
        Plan plan = SyncedFavorites.plan(List.of(entry("a")), List.of(), seen());
        assertEquals(List.of("a"), urls(plan.addToRunner));
        assertTrue(plan.addToModel.isEmpty());
    }

    @Test
    public void aFavoriteRemovedElsewhereGoesHereToo() {
        Plan plan = SyncedFavorites.plan(List.of(entry("a")), List.of(), seen("a"));
        assertEquals(List.of("a"), urls(plan.removeFromModel));
        assertTrue(plan.addToRunner.isEmpty());
        assertTrue(plan.seen.isEmpty());
    }

    @Test
    public void aFavoriteRemovedHereGoesFromTheRunner() {
        Plan plan = SyncedFavorites.plan(List.of(), List.of(entry("a")), seen("a"));
        assertEquals(List.of("a"), urls(plan.removeFromRunner));
        assertTrue(plan.addToModel.isEmpty());
    }

    @Test
    public void aRemoteRenameComesHere() {
        Plan plan = SyncedFavorites.plan(List.of(new Entry("a", "old", null)), List.of(new Entry("a", "new", null)), seen("a"));
        assertEquals("new", plan.retitleModel.get(0).title);
    }

    @Test
    public void aFirstPairingKeepsBothSides() {
        Plan plan = SyncedFavorites.plan(List.of(entry("local")), List.of(entry("remote")), seen());
        assertEquals(List.of("local"), urls(plan.addToRunner));
        assertEquals(List.of("remote"), urls(plan.addToModel));
        assertEquals(seen("local", "remote"), plan.seen);
    }

    @Test
    public void theSameAddressInTwoFoldersCountsOnce() {
        Plan plan = SyncedFavorites.plan(List.of(entry("a"), new Entry("a", "a", "work")), List.of(), seen());
        assertEquals(1, plan.addToRunner.size());
    }
}

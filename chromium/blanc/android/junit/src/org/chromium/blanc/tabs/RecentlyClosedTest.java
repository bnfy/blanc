// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.tabs;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.annotation.Config;

import org.chromium.base.test.BaseRobolectricTestRunner;

import java.util.ArrayList;
import java.util.List;

/** The iPhone's RecentlyClosedStore rules: 25 rows, 24 hours, web pages only, kept on disk. */
@RunWith(BaseRobolectricTestRunner.class)
@Config(manifest = Config.NONE)
public class RecentlyClosedTest {
    private static final long HOUR = 3_600_000;

    private long mNow = 100 * HOUR;
    private String mDisk;

    private RecentlyClosed store() {
        return new RecentlyClosed(new RecentlyClosed.Disk() {
            @Override
            public String read() {
                return mDisk;
            }

            @Override
            public void write(String json) {
                mDisk = json;
            }
        }, () -> mNow);
    }

    private static RecentlyClosed.Row row(String id, String url, long at) {
        return new RecentlyClosed.Row(id, url, "T" + id, at, null, null, null);
    }

    @Test
    public void newestComesFirstAndAnIdIsListedOnce() {
        RecentlyClosed store = store();
        store.add(row("a", "https://a.example/", mNow - 2));
        store.add(row("b", "https://b.example/", mNow - 1));
        store.add(row("a", "https://a.example/", mNow));
        List<RecentlyClosed.Row> rows = store.current();
        assertEquals(2, rows.size());
        assertEquals("a", rows.get(0).id);
    }

    @Test
    public void onlyWebPagesAreKept() {
        RecentlyClosed store = store();
        store.add(row("a", "blanc://newtab/", mNow));
        store.add(row("b", "file:///sdcard/x.html", mNow));
        assertTrue(store.current().isEmpty());
    }

    @Test
    public void twentyFiveRowsAreKept() {
        RecentlyClosed store = store();
        for (int i = 0; i < 30; i++) store.add(row("r" + i, "https://a.example/", mNow - 30 + i));
        assertEquals(RecentlyClosed.LIMIT, store.current().size());
        assertEquals("r29", store.current().get(0).id);
    }

    @Test
    public void aRowGoesAfterADay() {
        RecentlyClosed store = store();
        store.add(row("a", "https://a.example/", mNow));
        mNow += 24 * HOUR;
        assertTrue(store.current().isEmpty());
    }

    @Test
    public void rowsSurviveARestart() {
        RecentlyClosed store = store();
        store.add(new RecentlyClosed.Row("a", "https://a.example/", "A", mNow, "s1", "d1", "Mac"));
        RecentlyClosed.Row back = store().current().get(0);
        assertEquals("A", back.title);
        assertEquals("s1", back.spaceId);
        assertEquals("d1", back.fromId);
        assertEquals("Mac", back.fromName);
    }

    @Test
    public void aRowWithoutASpaceReadsBackWithoutOne() {
        store().add(row("a", "https://a.example/", mNow));
        RecentlyClosed.Row back = store().current().get(0);
        assertNull(back.spaceId);
        assertNull(back.fromId);
    }

    @Test
    public void unreadableFileStartsEmpty() {
        mDisk = "not json";
        assertTrue(store().current().isEmpty());
    }

    @Test
    public void removeAndClearReachTheDisk() {
        RecentlyClosed store = store();
        store.add(row("a", "https://a.example/", mNow));
        store.add(row("b", "https://b.example/", mNow));
        store.remove("a");
        assertEquals(1, store().current().size());
        store.clear();
        assertTrue(store().current().isEmpty());
    }

    @Test
    public void theBandListsAPageOnceNewestFirst() {
        List<RecentlyClosed.Row> local = new ArrayList<>();
        local.add(row("a", "https://a.example/", 5));
        List<RecentlyClosed.Row> remote = new ArrayList<>();
        remote.add(new RecentlyClosed.Row("a", "https://a.example/", "A", 9, null, "d", "Mac"));
        remote.add(new RecentlyClosed.Row("b", "https://b.example/", "B", 7, null, "d", "Mac"));
        remote.add(new RecentlyClosed.Row("b", "https://b.example/", "B", 6, null, "e", "PC"));
        List<RecentlyClosed.Row> band = RecentlyClosed.band(local, remote);
        assertEquals(2, band.size());
        assertEquals("b", band.get(0).id);
        assertEquals("PC", band.get(0).fromName);
        assertNull(band.get(1).fromId);
    }
}

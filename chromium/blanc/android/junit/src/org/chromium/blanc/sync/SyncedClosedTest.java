// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.sync;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.annotation.Config;

import org.chromium.base.test.BaseRobolectricTestRunner;
import org.chromium.blanc.tabs.BlancTabs;
import org.chromium.blanc.tabs.FakeTabStore;
import org.chromium.blanc.tabs.RecentlyClosed;
import org.chromium.blanc.tabs.TabStore;
import org.chromium.build.annotations.Nullable;

import java.util.ArrayList;
import java.util.List;

@RunWith(BaseRobolectricTestRunner.class)
@Config(manifest = Config.NONE)
public class SyncedClosedTest {
    private final FakeTabStore mStore = new FakeTabStore();
    private final BlancTabs mTabs = new BlancTabs(mStore, () -> 0);
    private final List<String> mCalls = new ArrayList<>();

    @Before
    public void setUp() {
        SyncedClosed.useRunner((method, args) -> mCalls.add(method + " " + args));
        SyncedClosed.use(new RecentlyClosed(new RecentlyClosed.Disk() {
            @Override
            public @Nullable String read() {
                return null;
            }

            @Override
            public void write(String json) {}
        }, System::currentTimeMillis));
    }

    @After
    public void tearDown() {
        SyncedClosed.useRunner(null);
        SyncedClosed.use(null);
    }

    private static TabStore.Entry tab(String url, boolean privateTab) {
        return new TabStore.Entry("1", url, "T", null, false, false, privateTab);
    }

    @Test
    public void aWebPageLeavesARow() {
        String id = SyncedClosed.record(tab("https://a.example/", false));
        assertNotNull(id);
        assertEquals(1, SyncedClosed.band().size());
        assertTrue(mCalls.toString(), mCalls.get(0).startsWith("closed.add"));
        assertTrue(mCalls.toString(), mCalls.get(0).contains(id));
    }

    @Test
    public void aPrivateTabLeavesNothing() {
        assertNull(SyncedClosed.record(tab("https://a.example/", true)));
        assertTrue(SyncedClosed.band().isEmpty());
        assertTrue(mCalls.isEmpty());
    }

    @Test
    public void theStartPageLeavesNothing() {
        assertNull(SyncedClosed.record(tab(TabStore.START_PAGE, false)));
    }

    @Test
    public void closingATabListsItAndUndoTakesItOff() {
        String id = mStore.create("https://a.example/", false, null, -1);
        mStore.create("https://b.example/", false, null, -1);
        mTabs.close(id);
        List<RecentlyClosed.Row> band = SyncedClosed.band();
        assertEquals(1, band.size());
        assertEquals("https://a.example/", band.get(0).url);
        mTabs.undoClose();
        assertTrue(SyncedClosed.band().isEmpty());
    }

    @Test
    public void closingAPrivateTabListsNothing() {
        String id = mStore.create("https://secret.example/", true, null, -1);
        mTabs.close(id);
        assertTrue(SyncedClosed.band().isEmpty());
    }

    @Test
    public void forgetAndClearEmptyTheBand() {
        SyncedClosed.record(tab("https://a.example/", false));
        SyncedClosed.record(tab("https://b.example/", false));
        SyncedClosed.forget(SyncedClosed.band().get(0));
        assertEquals(1, SyncedClosed.band().size());
        SyncedClosed.clear();
        assertTrue(SyncedClosed.band().isEmpty());
        assertEquals("closed.clear []", mCalls.get(mCalls.size() - 1));
    }
}

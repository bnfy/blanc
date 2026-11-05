// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.sync;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.annotation.Config;

import org.chromium.base.test.BaseRobolectricTestRunner;
import org.chromium.blanc.sync.SyncSheetModel.Row;

import java.util.List;

@RunWith(BaseRobolectricTestRunner.class)
@Config(manifest = Config.NONE)
public class SyncPairingTest {
    // The shared pairLinks vectors (ios/Blanc/BlancTests/Sync/Fixtures/sync-vectors.json).
    private static final String[][] LINKS = {
        {"https://blanc.day/pair#K7MR4PX2", "K7MR4PX2"},
        {"https://blanc.day/pair#K7MR-4PX2", "K7MR4PX2"},
        {"https://blanc.day/pair#k7mr4px2", "K7MR4PX2"},
        {"https://BLANC.DAY/pair#K7MR4PX2", "K7MR4PX2"},
        {"http://blanc.day/pair#K7MR4PX2", null},
        {"https://www.blanc.day/pair#K7MR4PX2", null},
        {"https://blanc.day.example/pair#K7MR4PX2", null},
        {"https://blanc.day:443/pair#K7MR4PX2", null},
        {"https://blanc.day:8443/pair#K7MR4PX2", null},
        {"https://user@blanc.day/pair#K7MR4PX2", null},
        {"https://blanc.day/pair/#K7MR4PX2", null},
        {"https://blanc.day/Pair#K7MR4PX2", null},
        {"https://blanc.day/pair?x=1#K7MR4PX2", null},
        {"https://blanc.day/pair?#K7MR4PX2", null},
        {"https://blanc.day/pair#K7MR4PX", null},
        {"https://blanc.day/pair#K7MR4PX22", null},
        {"https://blanc.day/pair#K7MR4P02", null},
        {"https://blanc.day/pair#K7MR4PO2", null},
        {"https://blanc.day/pair#K7MR4P12", null},
        {"https://blanc.day/pair#K7MR4PI2", null},
        {"https://blanc.day/pair#K7MR4PL2", null},
        {"https://blanc.day/pair", null},
        {"https://blanc.day/pair#", null},
        {"K7MR4PX2", null},
        {"blanc://pair#K7MR4PX2", null},
        {"", null},
        {"https://blanc.day/pa\tir#K7MR4PX2", null},
        {"https://blanc.day/pair#K7MR\n4PX2", null},
        {"https://blanc.\rday/pair#K7MR4PX2", null},
        {" https://blanc.day/pair#K7MR4PX2", null},
        {"https://blanc.day/pair#K7MR4PX2\n", null},
        {"https://blanc.day/pair#K7MR 4PX2", null},
        {"https://blanc.day:/pair#K7MR4PX2", null},
        {"https://blanc.day/./pair#K7MR4PX2", null},
        {"https://blanc.day/x/../pair#K7MR4PX2", null},
        {"https://@blanc.day/pair#K7MR4PX2", null},
    };

    @Test
    public void pairLinksMatchTheSharedVectors() {
        for (String[] vector : LINKS) assertEquals(vector[0], vector[1], PairLink.code(vector[0]));
    }

    @Test
    public void codesNormalizeAsDesktopDoes() {
        assertEquals("K7MR4PX2", SyncCode.normalize(" k7mr-4px2\n"));
        assertEquals("K7MR4PX2", SyncCode.normalize("K7MR 4PX2"));
        assertNull(SyncCode.normalize("K7MR4PX"));
        assertNull(SyncCode.normalize("K7MR4P02"));
        assertEquals("K7MR-4PX2", SyncCode.format("K7MR4PX2"));
    }

    private static SyncSheetModel.State state() {
        return new SyncSheetModel.State();
    }

    @Test
    public void offStartsWithPairingAndHidesTheCodeField() {
        List<Row> rows = SyncSheetModel.rows(state());
        assertTrue(rows.indexOf(Row.PAIR_WITH_BLANC) < rows.indexOf(Row.OTHER_WAYS));
        assertFalse(rows.contains(Row.CODE_FIELD));
        assertFalse(rows.contains(Row.DISCONNECT));
    }

    @Test
    public void otherWaysShowsTheCodeThenThePassphrase() {
        SyncSheetModel.State s = state();
        s.otherWays = true;
        List<Row> rows = SyncSheetModel.rows(s);
        assertTrue(rows.indexOf(Row.CODE_FIELD) < rows.indexOf(Row.PASSPHRASE_FIELD));
        assertFalse(rows.contains(Row.CANCEL_SWITCH));
    }

    @Test
    public void onListsTheDeviceThenTheAccountActions() {
        SyncSheetModel.State s = state();
        s.enabled = true;
        s.hasLastSynced = true;
        List<Row> rows = SyncSheetModel.rows(s);
        assertTrue(rows.contains(Row.LAST_SYNCED));
        assertTrue(rows.indexOf(Row.SYNC_NOW) < rows.indexOf(Row.PAIR_DEVICE));
        assertEquals(Row.DISCONNECT, rows.get(rows.size() - 1));
        assertFalse(rows.contains(Row.PAIR_WITH_BLANC));
    }

    @Test
    public void switchingShowsOnlyTheCodeAndCancel() {
        SyncSheetModel.State s = state();
        s.enabled = true;
        s.switching = true;
        List<Row> rows = SyncSheetModel.rows(s);
        assertTrue(rows.contains(Row.CODE_FIELD));
        assertTrue(rows.contains(Row.CANCEL_SWITCH));
        assertFalse(rows.contains(Row.HANDLE_FIELD));
        assertFalse(rows.contains(Row.DISCONNECT));
    }
}

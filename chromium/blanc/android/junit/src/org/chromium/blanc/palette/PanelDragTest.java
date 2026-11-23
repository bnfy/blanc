// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.palette;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;
import org.junit.runner.RunWith;

import org.chromium.base.test.BaseRobolectricTestRunner;

/** Port of the iPhone's PalettePanelDragTests (#1682). In dp. */
@RunWith(BaseRobolectricTestRunner.class)
public class PanelDragTest {
    @Test
    public void aShortDragStaysOpen() {
        assertFalse(PanelDrag.closes(30, 80, false));
    }

    @Test
    public void aDragTowardTheIslandCloses() {
        assertTrue(PanelDrag.closes(60, 60, false));
    }

    @Test
    public void aFlickCloses() {
        assertTrue(PanelDrag.closes(20, 160, false));
    }

    @Test
    public void draggingAwayNeverCloses() {
        assertFalse(PanelDrag.closes(-200, -400, false));
    }

    @Test
    public void aTopIslandClosesUpward() {
        assertTrue(PanelDrag.closes(-60, -60, true));
        assertFalse(PanelDrag.closes(60, 60, true));
    }
}

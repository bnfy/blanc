// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.palette;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;
import org.junit.runner.RunWith;

import org.chromium.base.test.BaseRobolectricTestRunner;

/** The swipe on a palette row, with the iPhone's numbers (SwipeToCloseRow.swift), in dp. */
@RunWith(BaseRobolectricTestRunner.class)
public class RowSwipeTest {
    private static final float WIDTH = 360;

    @Test
    public void aFullSwipeIsMoreThanHalfTheRow() {
        assertEquals(198, RowSwipe.fullSwipe(WIDTH), 0.01);
        // A narrow row still needs more than the trash button's width.
        assertEquals(76 * 1.6f, RowSwipe.fullSwipe(100), 0.01);
    }

    @Test
    public void theRowFollowsLeftAndResistsRight() {
        assertEquals(-50, RowSwipe.offset(false, -50, WIDTH), 0.01);
        assertEquals(10, RowSwipe.offset(false, 40, WIDTH), 0.01);
        assertEquals(-WIDTH, RowSwipe.offset(false, -500, WIDTH), 0.01);
        // From open, the drag starts at the trash button's width.
        assertEquals(-96, RowSwipe.offset(true, -20, WIDTH), 0.01);
    }

    @Test
    public void onlyADragPastTheLineCloses() {
        assertEquals(RowSwipe.End.CLOSE, RowSwipe.end(false, -200, -200, WIDTH));
        // A quick flick past the line only opens the trash, so a tab never goes by accident.
        assertEquals(RowSwipe.End.OPEN, RowSwipe.end(false, -60, -400, WIDTH));
        assertEquals(RowSwipe.End.SHUT, RowSwipe.end(false, -20, -30, WIDTH));
        assertEquals(RowSwipe.End.SHUT, RowSwipe.end(true, 60, 80, WIDTH));
        assertEquals(RowSwipe.End.OPEN, RowSwipe.end(true, 10, 10, WIDTH));
    }

    @Test
    public void onlyASidewaysDragStartsIt() {
        assertTrue(RowSwipe.starts(-20, 5, false));
        assertFalse(RowSwipe.starts(-20, 20, false));
        // Right from rest does nothing; right from open shuts it.
        assertFalse(RowSwipe.starts(20, 0, false));
        assertTrue(RowSwipe.starts(20, 0, true));
    }
}

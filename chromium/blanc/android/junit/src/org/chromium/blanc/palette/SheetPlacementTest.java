// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.palette;

import static org.junit.Assert.assertEquals;

import org.junit.Test;
import org.junit.runner.RunWith;

import org.chromium.base.test.BaseRobolectricTestRunner;

/** Where the open Island's sheet sits, as the iPhone's floats on iOS 26 (#1472). In dp. */
@RunWith(BaseRobolectricTestRunner.class)
public class SheetPlacementTest {
    @Test
    public void withGesturesItFloatsOverTheBarWithTheScreensCorners() {
        // A Pixel 10 Pro: a 24 tall gesture bar and screen corners about 50 round.
        SheetPlacement p = SheetPlacement.of(24, 0, 0, 50);
        assertEquals(8, p.side, 0);
        assertEquals(8, p.bottom, 0);
        // Its own footer keeps clear of the gesture bar it floats over.
        assertEquals(16, p.padding, 0);
        // Concentric with the screen's corners, all four.
        assertEquals(42, p.corner, 0);
    }

    @Test
    public void threeButtonsStayUncovered() {
        SheetPlacement p = SheetPlacement.of(48, 48, 0, 50);
        assertEquals(56, p.bottom, 0);
        assertEquals(0, p.padding, 0);
        assertEquals(SheetPlacement.CORNER, p.corner, 0);
    }

    @Test
    public void overTheKeyboardItSitsJustAboveIt() {
        SheetPlacement p = SheetPlacement.of(24, 0, 300, 50);
        assertEquals(308, p.bottom, 0);
        assertEquals(0, p.padding, 0);
        assertEquals(SheetPlacement.CORNER, p.corner, 0);
    }

    @Test
    public void squareOrBarelyRoundScreensKeepTheSheetsOwnCorners() {
        assertEquals(SheetPlacement.CORNER, SheetPlacement.of(24, 0, 0, 0).corner, 0);
        assertEquals(SheetPlacement.CORNER, SheetPlacement.of(24, 0, 0, 20).corner, 0);
    }
}

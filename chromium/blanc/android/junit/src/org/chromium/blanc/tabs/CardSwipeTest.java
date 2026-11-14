// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.tabs;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;
import org.junit.runner.RunWith;

import org.chromium.base.test.BaseRobolectricTestRunner;

/** Swiping a tab's card to close it, as the iPhone's SwipeToClose (TabGridView.swift). */
@RunWith(BaseRobolectricTestRunner.class)
public class CardSwipeTest {
    @Test
    public void leftFollowsTheFingerAndRightResists() {
        assertEquals(-150, CardSwipe.displayed(-150), 0);
        assertEquals(25, CardSwipe.displayed(100), 0);
    }

    @Test
    public void theCardFadesUpToSeventyPercent() {
        assertEquals(1, CardSwipe.alpha(0), 0);
        assertEquals(0.5, CardSwipe.alpha(-120), 1e-9);
        assertEquals(0.3, CardSwipe.alpha(-600), 1e-9);
    }

    @Test
    public void itClosesPastAHundredOrAFlickPastTwoHundred() {
        assertTrue(CardSwipe.closes(-101, -101));
        assertTrue(CardSwipe.closes(-40, -201));
        assertFalse(CardSwipe.closes(-99, -150));
        assertFalse(CardSwipe.closes(150, 300));
    }

    @Test
    public void columnsAreTwoOnAPhoneAndThreeFromSixHundredDp() {
        assertEquals(2, CardSwipe.columns(360));
        assertEquals(2, CardSwipe.columns(599));
        assertEquals(3, CardSwipe.columns(600));
    }
}

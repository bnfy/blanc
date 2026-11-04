// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.island;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.annotation.Config;

import org.chromium.base.test.BaseRobolectricTestRunner;
import org.chromium.blanc.island.IslandSwipe.Outcome;

/** Port of the iPhone's IslandSwipeTests: when a sideways swipe counts, and how far the page moves. */
@RunWith(BaseRobolectricTestRunner.class)
@Config(manifest = Config.NONE)
public class IslandSwipeTest {
    @Test
    public void onlyAClearlySidewaysDragCounts() {
        assertTrue(IslandSwipe.isSideways(12, 0));
        assertFalse(IslandSwipe.isSideways(11, 0));
        assertFalse(IslandSwipe.isSideways(20, 20));
        assertTrue(IslandSwipe.isSideways(-30, 10));
    }

    @Test
    public void thePageResistsPastEitherEnd() {
        assertEquals(-25f, IslandSwipe.displayed(-100, true, false), 0f);
        assertEquals(-100f, IslandSwipe.displayed(-100, true, true), 0f);
        assertEquals(20f, IslandSwipe.displayed(80, false, true), 0f);
    }

    private static Outcome outcome(float dx, float predicted, boolean previous, boolean next) {
        return IslandSwipe.outcome(dx, predicted, 400, previous, next);
    }

    @Test
    public void outcome() {
        assertEquals("30% of the width travelled", Outcome.NEXT, outcome(-120, -120, true, true));
        assertEquals(Outcome.STAY, outcome(-119, -150, true, true));
        assertEquals("a flick whose predicted end passes 50%", Outcome.NEXT, outcome(-60, -210, true, true));
        assertEquals("no tab before the first", Outcome.STAY, outcome(130, 130, false, true));
        assertEquals(Outcome.PREVIOUS, outcome(130, 130, true, true));
    }

    private static Outcome wide(float dx, float predicted, float width) {
        return IslandSwipe.outcome(dx, predicted, width, true, true);
    }

    @Test
    public void aWideScreenNeedsNoMoreThanTheWidestIPhone() {
        assertEquals("30% of 440", Outcome.NEXT, wide(-132, -132, 950));
        assertEquals(Outcome.STAY, wide(-131, -150, 950));
        assertEquals("a flick past 50% of 440", Outcome.NEXT, wide(-60, -221, 950));
        assertEquals("the widest iPhone is unchanged", Outcome.STAY, wide(-131, -131, 440));
        assertEquals(Outcome.NEXT, wide(-132, -132, 440));
    }
}

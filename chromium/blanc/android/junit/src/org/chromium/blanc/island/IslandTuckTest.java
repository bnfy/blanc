// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.island;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.annotation.Config;

import org.chromium.base.test.BaseRobolectricTestRunner;

/** Port of the iPhone's IslandTuckTests: the Island tucks while the person scrolls down. */
@RunWith(BaseRobolectricTestRunner.class)
@Config(manifest = Config.NONE)
public class IslandTuckTest {
    /** A long page: 5000 of content in an 800 viewport. */
    private static IslandTuck.Position at(float offset) {
        return at(offset, 5000);
    }

    private static IslandTuck.Position at(float offset, float content) {
        return new IslandTuck.Position(offset, content, 800, 60, 100);
    }

    /** Scrolls through `offsets` one step at a time, as the page reports. */
    private static void scroll(IslandTuck tuck, boolean byPerson, float... offsets) {
        for (int i = 1; i < offsets.length; i++) {
            tuck.scrolled(offsets[i - 1], at(offsets[i]), byPerson);
        }
    }

    @Test
    public void scrollingDownTucksItOnlyPastTheThreshold() {
        IslandTuck tuck = new IslandTuck();
        scroll(tuck, true, 500, 510, 523);
        assertFalse("23 down isn't enough", tuck.isTucked());
        scroll(tuck, true, 523, 524);
        assertTrue(tuck.isTucked());
    }

    @Test
    public void scrollingBackUpBringsItBack() {
        IslandTuck tuck = new IslandTuck();
        scroll(tuck, true, 500, 600);
        assertTrue(tuck.isTucked());
        scroll(tuck, true, 600, 595);
        assertTrue("a small jitter back up keeps it tucked", tuck.isTucked());
        scroll(tuck, true, 595, 588);
        assertFalse(tuck.isTucked());
    }

    @Test
    public void turningAroundStartsTheCountAgain() {
        IslandTuck tuck = new IslandTuck();
        scroll(tuck, true, 500, 520, 510, 530);
        assertFalse("20 down after turning, not 30 in all", tuck.isTucked());
    }

    @Test
    public void itStaysAtTheTopOfThePage() {
        IslandTuck tuck = new IslandTuck();
        scroll(tuck, true, 500, 600);
        tuck.scrolled(600, at(-55), true);
        assertFalse(tuck.isTucked());
        scroll(tuck, false, -60, -53);
        assertFalse("within the slack of the top", tuck.isTucked());
    }

    @Test
    public void itComesBackAtTheEndOfThePage() {
        IslandTuck tuck = new IslandTuck();
        scroll(tuck, true, 3000, 3100);
        assertTrue(tuck.isTucked());
        // The end is contentHeight + bottomInset - viewportHeight = 4300.
        tuck.scrolled(3100, at(4295), true);
        assertFalse(tuck.isTucked());
    }

    @Test
    public void aPageThatDoesNotScrollKeepsIt() {
        IslandTuck tuck = new IslandTuck();
        tuck.scrolled(0, at(40, 600), true);
        assertFalse(tuck.isTucked());
    }

    @Test
    public void thePageScrollingItselfNeverTucksIt() {
        IslandTuck tuck = new IslandTuck();
        scroll(tuck, false, 500, 1500);
        assertFalse(tuck.isTucked());
    }

    @Test
    public void showBringsItBackAndForgetsTheTravel() {
        IslandTuck tuck = new IslandTuck();
        scroll(tuck, true, 500, 600);
        tuck.show();
        assertFalse(tuck.isTucked());
        scroll(tuck, true, 600, 620);
        assertFalse(tuck.isTucked());
    }
}

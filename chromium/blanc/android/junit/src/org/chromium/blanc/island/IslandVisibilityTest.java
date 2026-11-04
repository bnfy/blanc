// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.island;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.annotation.Config;

import org.chromium.base.test.BaseRobolectricTestRunner;

/** When the Island may tuck at all, as on the iPhone (ContentView and TabModel). */
@RunWith(BaseRobolectricTestRunner.class)
@Config(manifest = Config.NONE)
public class IslandVisibilityTest {
    @Test
    public void aWebPageWithTheSettingOnMayTuck() {
        assertTrue(IslandVisibility.mayTuck(false, false, false, true));
    }

    @Test
    public void itNeverTucksOnTheStartPage() {
        assertFalse(IslandVisibility.mayTuck(true, false, false, true));
    }

    @Test
    public void itNeverTucksWithTalkBack() {
        assertFalse(IslandVisibility.mayTuck(false, true, false, true));
    }

    @Test
    public void itNeverTucksWithASheetOpen() {
        assertFalse(IslandVisibility.mayTuck(false, false, true, true));
    }

    @Test
    public void theSettingTurnsTuckingOff() {
        assertFalse(IslandVisibility.mayTuck(false, false, false, false));
    }
}

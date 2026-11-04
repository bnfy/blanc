// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.island;

import static org.junit.Assert.assertEquals;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.annotation.Config;

import org.chromium.base.test.BaseRobolectricTestRunner;

/** The Island's position setting, as the iPhone stores it ("bottom" by default, or "top"). */
@RunWith(BaseRobolectricTestRunner.class)
@Config(manifest = Config.NONE)
public class IslandPositionTest {
    @Test
    public void readsTheIPhonesValues() {
        assertEquals(IslandPosition.BOTTOM, IslandPosition.fromSetting("bottom"));
        assertEquals(IslandPosition.TOP, IslandPosition.fromSetting("top"));
        assertEquals("top", IslandPosition.TOP.setting());
    }

    @Test
    public void anythingElseIsTheBottom() {
        assertEquals(IslandPosition.BOTTOM, IslandPosition.fromSetting(null));
        assertEquals(IslandPosition.BOTTOM, IslandPosition.fromSetting("TOP"));
        assertEquals(IslandPosition.BOTTOM, IslandPosition.fromSetting("left"));
    }
}

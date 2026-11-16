// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.island;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.annotation.Config;

import org.chromium.base.test.BaseRobolectricTestRunner;

/** The Island's colors, as the iPhone draws them before Liquid Glass (BrowserStyle, IslandSurface). */
@RunWith(BaseRobolectricTestRunner.class)
@Config(manifest = Config.NONE)
public class IslandStyleTest {
    @Test
    public void followsTheThemeAndPrivateIsAlwaysDark() {
        assertFalse(IslandStyle.forTab(false, false).dark);
        assertTrue(IslandStyle.forTab(false, true).dark);
        assertTrue(IslandStyle.forTab(true, false).dark);
    }

    @Test
    public void lightColors() {
        IslandStyle s = IslandStyle.forTab(false, false);
        assertEquals(0xFFFFFFFF, s.raised);
        assertEquals(0xFF0E0E0E, s.text);
        assertEquals("border at 70%", 0xB3DEDEDE, s.border);
        assertEquals("divider: text at 13%", 0x210E0E0E, s.divider);
        assertEquals("shadow 10% black", 26, s.shadowAlpha);
    }

    @Test
    public void darkColors() {
        IslandStyle s = IslandStyle.forTab(false, true);
        assertEquals(0xFF1F1F1F, s.raised);
        assertEquals(0xFFF5F5F5, s.text);
        assertEquals(0xB32E2E2E, s.border);
        assertEquals(0x21F5F5F5, s.divider);
        assertEquals("shadow 25% black", 64, s.shadowAlpha);
    }
}

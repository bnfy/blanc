// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.island;

import static org.junit.Assert.assertEquals;

import org.junit.Test;
import org.junit.runner.RunWith;

import org.chromium.base.test.BaseRobolectricTestRunner;

import java.util.Arrays;

/** The color behind the status icons: what most of the page's top row is, as Safari takes it. */
@RunWith(BaseRobolectricTestRunner.class)
public class TopColorTest {
    private static int[] row(int length, int color) {
        int[] row = new int[length];
        Arrays.fill(row, color);
        return row;
    }

    @Test
    public void aPlainBarIsItsColor() {
        assertEquals(0xFFFF6600, TopColor.dominant(row(64, 0xFFFF6600)));
    }

    @Test
    public void aHeaderWithALogoAndTextIsStillItsBackground() {
        int[] row = row(64, 0xFFFFFFFF);
        for (int x = 4; x < 20; x++) row[x] = 0xFF24292F;
        assertEquals(0xFFFFFFFF, TopColor.dominant(row));
    }

    @Test
    public void colorsThatDifferOnlyByScalingCountAsOne() {
        // A gradient sky read back and scaled: neighbors a step or two apart.
        int[] row = new int[64];
        for (int x = 0; x < 64; x++) row[x] = 0xFF37332F + ((x % 3) << 16) + ((x % 2) << 8);
        int color = TopColor.dominant(row);
        assertEquals(0xFF, color >>> 24);
        assertEquals(0x38, (color >> 16) & 0xFF, 1);
        assertEquals(0x33, (color >> 8) & 0xFF, 1);
        assertEquals(0x2F, color & 0xFF);
    }

    @Test
    public void noColorOverHalfTheRowIsNone() {
        int[] row = row(64, 0xFFFFFFFF);
        for (int x = 0; x < 32; x++) row[x] = 0xFF000000;
        assertEquals(TopColor.NONE, TopColor.dominant(row));
    }

    @Test
    public void nothingReadIsNone() {
        assertEquals(TopColor.NONE, TopColor.dominant(new int[0]));
    }

    @Test
    public void theColorIsAlwaysOpaque() {
        assertEquals(0xFF102030, TopColor.dominant(row(8, 0x80102030)));
    }
}

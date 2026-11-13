// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.island;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.shadows.ShadowLooper;

import org.chromium.base.test.BaseRobolectricTestRunner;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;

/** When the page's top is read, and whose color it is. */
@RunWith(BaseRobolectricTestRunner.class)
public class TopColorSamplerTest {
    private final List<Consumer<int[]>> mReads = new ArrayList<>();
    private int mChanges;
    private TopColorSampler mSampler;

    @Before
    public void setUp() {
        mSampler = new TopColorSampler(() -> mChanges++);
    }

    private TopColorSampler.Reader reader() {
        return mReads::add;
    }

    private static int[] row(int color) {
        int[] row = new int[16];
        Arrays.fill(row, color);
        return row;
    }

    private void idle(long ms) {
        ShadowLooper.idleMainLooper(ms, TimeUnit.MILLISECONDS);
    }

    @Test
    public void aReadColorsTheTabItWasReadFor() {
        mSampler.setPage(7, reader(), false);
        mSampler.schedule(50);
        idle(50);
        assertEquals(1, mReads.size());
        mReads.get(0).accept(row(0xFFFF6600));
        assertEquals(0xFFFF6600, mSampler.colorFor(7));
        assertEquals(TopColor.NONE, mSampler.colorFor(8));
        assertEquals(1, mChanges);
    }

    @Test
    public void requestsCloseTogetherReadOnce() {
        mSampler.setPage(7, reader(), false);
        mSampler.schedule(120);
        idle(60);
        mSampler.schedule(120);
        idle(60);
        mSampler.schedule(0);
        idle(0);
        assertEquals(1, mReads.size());
    }

    @Test
    public void aReadThatLandsAfterTheTabChangedIsDropped() {
        mSampler.setPage(7, reader(), false);
        mSampler.schedule(0);
        idle(0);
        mSampler.setPage(8, reader(), false);
        mReads.get(0).accept(row(0xFFFF6600));
        assertEquals(TopColor.NONE, mSampler.colorFor(7));
        assertEquals(TopColor.NONE, mSampler.colorFor(8));
        assertEquals(0, mChanges);
    }

    @Test
    public void aTabKeepsItsColorWhileAnotherIsShown() {
        mSampler.setPage(7, reader(), false);
        mSampler.schedule(0);
        idle(0);
        mReads.get(0).accept(row(0xFFFF6600));
        mSampler.setPage(8, reader(), false);
        mSampler.setPage(7, reader(), false);
        // Coming back shows the color at once, and a fresh read follows.
        assertEquals(0xFFFF6600, mSampler.colorFor(7));
    }

    @Test
    public void privateTabsAreNeverRead() {
        mSampler.setPage(9, reader(), true);
        mSampler.schedule(0);
        idle(100);
        assertTrue(mReads.isEmpty());
        assertEquals(TopColor.NONE, mSampler.colorFor(9));
    }

    @Test
    public void aRowWithNoMainColorFallsBackToChromes() {
        mSampler.setPage(7, reader(), false);
        mSampler.schedule(0);
        idle(0);
        mReads.get(0).accept(row(0xFFFF6600));
        mSampler.schedule(0);
        idle(0);
        int[] mixed = row(0xFFFFFFFF);
        for (int x = 0; x < 8; x++) mixed[x] = 0xFF000000;
        mReads.get(1).accept(mixed);
        assertEquals(TopColor.NONE, mSampler.colorFor(7));
        assertEquals(2, mChanges);
    }

    @Test
    public void theSameColorAgainChangesNothing() {
        mSampler.setPage(7, reader(), false);
        mSampler.schedule(0);
        idle(0);
        mReads.get(0).accept(row(0xFFFF6600));
        mSampler.schedule(0);
        idle(0);
        mReads.get(1).accept(row(0xFFFF6600));
        assertEquals(1, mChanges);
    }

    @Test
    public void noPageMeansNoRead() {
        mSampler.setPage(7, null, false);
        mSampler.schedule(0);
        idle(100);
        assertTrue(mReads.isEmpty());
    }
}

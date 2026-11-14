// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.island;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.annotation.Config;

import org.chromium.base.test.BaseRobolectricTestRunner;

/** The iPhone's pinch into the tab grid (PagePinch.swift): when a pinch on a page opens the grid. */
@RunWith(BaseRobolectricTestRunner.class)
@Config(manifest = Config.NONE)
public class PagePinchTest {
    // TabGridMotion.opens: a quick close counts even when short; opening the fingers again never does.
    @Test
    public void opensBelowEightTenthsOrOnAQuickClose() {
        assertTrue(PagePinch.opens(0.79f, 0f));
        assertFalse(PagePinch.opens(0.8f, 0f));
        assertTrue(PagePinch.opens(0.95f, -0.7f));
        assertFalse(PagePinch.opens(0.95f, -0.6f));
        assertFalse(PagePinch.opens(0.5f, 0.31f));
        assertTrue(PagePinch.opens(0.5f, 0.3f));
    }

    // PagePinchWatcher: only a fully zoomed-out page counts; a zoomed-in page zooms back out first.
    @Test
    public void onlyAFullyZoomedOutPageCounts() {
        assertTrue(PagePinch.zoomedOut(1f, 1f));
        assertTrue(PagePinch.zoomedOut(0.258f, 0.25f));
        assertFalse(PagePinch.zoomedOut(1.02f, 1f));
        assertFalse(PagePinch.zoomedOut(2f, 0.5f));
    }

    private static PagePinch closing(boolean zoomedOut, float to, int steps, long msPerStep) {
        PagePinch pinch = new PagePinch();
        pinch.begin(zoomedOut, 0);
        float factor = (float) Math.pow(to, 1.0 / steps);
        for (int i = 1; i <= steps; i++) pinch.update(factor, i * msPerStep);
        return pinch;
    }

    @Test
    public void aSlowCloseToSevenTenthsOpensTheGrid() {
        assertTrue(closing(true, 0.7f, 30, 16).end(30 * 16));
    }

    @Test
    public void aSmallSlowCloseDoesNot() {
        // To 0.9 over a second: above 0.8 and closing at 0.1 a second.
        assertFalse(closing(true, 0.9f, 60, 16).end(60 * 16));
    }

    @Test
    public void aQuickShortCloseOpensTheGrid() {
        // To 0.9 in 100 ms: closing at 1 a second.
        assertTrue(closing(true, 0.9f, 6, 16).end(6 * 16));
    }

    @Test
    public void aCloseThatStopsBeforeLiftingCountsOnHowFarItWent() {
        // The fingers closed quickly to 0.9, then rested: no speed left, and not far enough.
        assertFalse(closing(true, 0.9f, 6, 16).end(6 * 16 + 400));
    }

    @Test
    public void openingTheFingersAgainNeverOpensTheGrid() {
        PagePinch pinch = closing(true, 0.6f, 20, 16);
        for (int i = 1; i <= 6; i++) pinch.update(1.05f, 320 + i * 16);
        assertFalse(pinch.end(320 + 6 * 16));
    }

    @Test
    public void aZoomedInPageZoomsOutInstead() {
        assertFalse(closing(false, 0.5f, 30, 16).end(30 * 16));
    }

    @Test
    public void spreadingTheFingersNeverOpensTheGrid() {
        assertFalse(closing(true, 1.6f, 30, 16).end(30 * 16));
    }

    @Test
    public void aPinchThatNeverReallyStartedDoesNot() {
        // Past 0.97 the pinch is the grid's; a wobble above that isn't.
        assertFalse(closing(true, 0.98f, 3, 16).end(3 * 16));
        PagePinch untouched = new PagePinch();
        assertFalse(untouched.end(0));
    }
}

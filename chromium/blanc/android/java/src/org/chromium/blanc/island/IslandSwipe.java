// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.island;

import org.chromium.build.annotations.NullMarked;

/**
 * Swiping the Island sideways switches tabs, the page following the finger. A drag counts only
 * when it's clearly sideways (swiping into the page opens the tab grid). Moving the finger left
 * goes to the next tab. Ported from Blanc for iPhone's IslandSwipe.swift; values are in dp.
 */
@NullMarked
public final class IslandSwipe {
    public enum Outcome {
        PREVIOUS,
        NEXT,
        STAY
    }

    /** The widest iPhone held upright: a wider screen asks no more of the thumb. */
    public static final float REACH_WIDTH = 440;

    private IslandSwipe() {}

    public static boolean isSideways(float dx, float dy) {
        return Math.abs(dx) >= 12 && Math.abs(dx) > Math.abs(dy);
    }

    /** How far the page moves for a finger travel of dx: all of it, a quarter past either end. */
    public static float displayed(float dx, boolean hasPrevious, boolean hasNext) {
        boolean open = dx < 0 ? hasNext : hasPrevious;
        return open ? dx : dx * 0.25f;
    }

    /**
     * Switches past 30% of the width, or when a flick's predicted end passes 50%. In double, as
     * Swift's CGFloat is: 400 * 0.3f is just over 120 in float, which a 120 swipe would miss.
     */
    public static Outcome outcome(
            float dx, float predictedDx, float width, boolean hasPrevious, boolean hasNext) {
        double reach = Math.min(width, REACH_WIDTH);
        boolean far = Math.abs(dx) >= reach * 0.3 || Math.abs(predictedDx) > reach * 0.5;
        if (!far) return Outcome.STAY;
        if (dx < 0 || (dx == 0 && predictedDx < 0)) return hasNext ? Outcome.NEXT : Outcome.STAY;
        return hasPrevious ? Outcome.PREVIOUS : Outcome.STAY;
    }
}

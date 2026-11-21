// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.tabs;

import org.chromium.build.annotations.NullMarked;

/**
 * The tab grid's rules, from Blanc for iPhone's TabGridView: a card swiped left follows the finger
 * and fades, a drag right resists and springs back, and it closes past 100dp or a flick projected
 * past 200dp; two columns on a phone, three from 600dp.
 */
@NullMarked
public final class CardSwipe {
    private CardSwipe() {}

    public static float displayed(float dx) {
        return dx < 0 ? dx : dx * 0.25f;
    }

    public static double alpha(float dx) {
        return 1 - Math.min(Math.abs(dx) / 240.0, 0.7);
    }

    public static boolean closes(float dx, float predicted) {
        return dx < -100 || predicted < -200;
    }

    public static int columns(int widthDp) {
        return widthDp >= 600 ? 3 : 2;
    }
}

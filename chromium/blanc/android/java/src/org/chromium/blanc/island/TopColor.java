// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.island;

import org.chromium.build.annotations.NullMarked;

/**
 * The color behind the status icons, as Safari takes it: what most of the page's top row is
 * drawn in, read from the page's own pixels rather than the color it declares (its theme color
 * often isn't what's at its top). Colors a step or two apart, as scaling leaves a gradient or an
 * anti-aliased edge, count as one. With no color over half the row there is none, and Chrome's own
 * choice stands.
 */
@NullMarked
public final class TopColor {
    /** No color: Chrome's own status bar color stands. Any real color is opaque, so never 0. */
    public static final int NONE = 0;

    /** How far apart, per channel, two pixels can be and still be one color. */
    private static final int TOLERANCE = 8;

    private TopColor() {}

    /** The color over half of `row` is drawn in, opaque, or {@link #NONE}. */
    public static int dominant(int[] row) {
        int n = row.length;
        int best = -1;
        int bestCount = 0;
        for (int i = 0; i < n; i++) {
            int count = 0;
            for (int j = 0; j < n; j++) if (near(row[i], row[j])) count++;
            if (count > bestCount) {
                best = i;
                bestCount = count;
            }
        }
        if (best < 0 || bestCount * 2 <= n) return NONE;
        // The cluster's average, so a gradient takes its middle rather than one end.
        long r = 0;
        long g = 0;
        long b = 0;
        for (int pixel : row) {
            if (!near(row[best], pixel)) continue;
            r += (pixel >> 16) & 0xFF;
            g += (pixel >> 8) & 0xFF;
            b += pixel & 0xFF;
        }
        return 0xFF000000
                | (int) Math.round((double) r / bestCount) << 16
                | (int) Math.round((double) g / bestCount) << 8
                | (int) Math.round((double) b / bestCount);
    }

    private static boolean near(int a, int b) {
        return Math.abs(((a >> 16) & 0xFF) - ((b >> 16) & 0xFF)) <= TOLERANCE
                && Math.abs(((a >> 8) & 0xFF) - ((b >> 8) & 0xFF)) <= TOLERANCE
                && Math.abs((a & 0xFF) - (b & 0xFF)) <= TOLERANCE;
    }
}

// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.palette;

import org.chromium.build.annotations.NullMarked;

/**
 * A palette row's swipe, from Blanc for iPhone's SwipeToCloseRow: a drag left shows the trash
 * button, a drag right resists, and only a drag past more than half the row closes it; a quick
 * flick just opens the trash. Values are in dp.
 */
@NullMarked
public final class RowSwipe {
    /** The trash button's width once the row rests open. */
    public static final float ACTION_WIDTH = 76;

    public enum End {
        CLOSE,
        OPEN,
        SHUT
    }

    private RowSwipe() {}

    /** Past this distance a release closes the row. */
    public static float fullSwipe(float width) {
        return Math.max(ACTION_WIDTH * 1.6f, width * 0.55f);
    }

    /** Where the row's content sits while the finger is down, `dx` from where the drag began. */
    public static float offset(boolean open, float dx, float width) {
        float raw = (open ? -ACTION_WIDTH : 0) + dx;
        return raw > 0 ? raw / 4 : Math.max(raw, -width);
    }

    /** What a release does; `predicted` is where the glide would carry the drag. */
    public static End end(boolean open, float dx, float predicted, float width) {
        float resting = open ? -ACTION_WIDTH : 0;
        if (-(resting + dx) > fullSwipe(width)) return End.CLOSE;
        return resting + predicted < -ACTION_WIDTH / 2 ? End.OPEN : End.SHUT;
    }

    /** A sideways drag: to the left from rest, either way once the row is open. */
    public static boolean starts(float dx, float dy, boolean open) {
        return Math.abs(dx) > Math.abs(dy) * 1.2f && (dx < 0 || open);
    }
}

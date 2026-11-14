// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.island;

import org.chromium.build.annotations.NullMarked;

/**
 * The Island floats over every page and tucks away while the person scrolls the page down, and
 * comes back on a scroll up, at the top or the end of the page, on a page that doesn't scroll, and
 * on each new page. Only the person's own scrolling (a drag and its glide) tucks it. Ported from
 * Blanc for iPhone's IslandTuck.swift; values are in dp.
 */
@NullMarked
public final class IslandTuck {
    /** Where the page is: its scroll offset and extent, in dp. */
    public static final class Position {
        public final float offset;
        public final float contentHeight;
        public final float viewportHeight;
        public final float topInset;
        public final float bottomInset;

        public Position(
                float offset,
                float contentHeight,
                float viewportHeight,
                float topInset,
                float bottomInset) {
            this.offset = offset;
            this.contentHeight = contentHeight;
            this.viewportHeight = viewportHeight;
            this.topInset = topInset;
            this.bottomInset = bottomInset;
        }
    }

    /** Down the page this far tucks the Island; back up this far brings it back. */
    public static final float TUCK_AFTER = 24;

    public static final float SHOW_AFTER = 12;

    /** This close to the top or the end counts as being there. */
    public static final float EDGE_SLACK = 8;

    private boolean mTucked;

    /** How far the page has moved in one direction since it last turned: positive down. */
    private float mTravel;

    public boolean isTucked() {
        return mTucked;
    }

    public void scrolled(float previousOffset, Position position, boolean byPerson) {
        float top = -position.topInset;
        float end = position.contentHeight + position.bottomInset - position.viewportHeight;
        if (position.offset <= top + EDGE_SLACK || position.offset >= end - EDGE_SLACK) {
            show();
            return;
        }
        if (!byPerson) return;
        float delta = position.offset - previousOffset;
        if (delta == 0) return;
        if ((delta > 0) != (mTravel > 0)) mTravel = 0;
        mTravel += delta;
        if (mTravel >= TUCK_AFTER) {
            mTucked = true;
        } else if (mTravel <= -SHOW_AFTER) {
            mTucked = false;
        }
    }

    public void show() {
        mTucked = false;
        mTravel = 0;
    }
}

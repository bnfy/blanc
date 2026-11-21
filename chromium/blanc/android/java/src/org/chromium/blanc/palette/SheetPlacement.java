// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.palette;

import org.chromium.build.annotations.NullMarked;

/**
 * Where the open Island's sheet sits, from Blanc for iPhone's palette on iOS 26 (#1472): it floats
 * clear of the screen's edges with corners that follow the screen's, where a sheet pinned to the
 * bottom looked cut off. Over a gesture bar it floats 8 from the bottom and keeps its own footer
 * clear of the bar; above three buttons or the keyboard it sits just above them with its own 22
 * corners. Values are in dp.
 */
@NullMarked
public final class SheetPlacement {
    /** The gap to the screen's edges. */
    public static final float INSET = 8;

    /** The sheet's own corners, where the screen's can't be followed. */
    public static final float CORNER = 22;

    /** The gap at each side. */
    public final float side;

    /** The gap from the screen's bottom to the sheet's. */
    public final float bottom;

    /** Room inside the sheet's bottom, for the gesture bar it floats over. */
    public final float padding;

    /** The radius of all four corners. */
    public final float corner;

    private SheetPlacement(float side, float bottom, float padding, float corner) {
        this.side = side;
        this.bottom = bottom;
        this.padding = padding;
        this.corner = corner;
    }

    /**
     * @param navigation the navigation bar's height
     * @param tappable the part of it that takes taps (three buttons), or 0 for a gesture bar
     * @param keyboard the keyboard's height, or 0 while it's down
     * @param screenCorner the radius of the screen's bottom corners, or 0 if it has none
     */
    public static SheetPlacement of(float navigation, float tappable, float keyboard, float screenCorner) {
        if (keyboard > 0) return new SheetPlacement(INSET, keyboard + INSET, 0, CORNER);
        if (tappable > 0) return new SheetPlacement(INSET, navigation + INSET, 0, CORNER);
        // Concentric with the screen: its corner less the gap.
        float corner = Math.max(CORNER, screenCorner - INSET);
        return new SheetPlacement(INSET, INSET, Math.max(0, navigation - INSET), corner);
    }
}

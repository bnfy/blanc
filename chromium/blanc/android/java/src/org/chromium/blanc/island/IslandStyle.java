// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.island;

import org.chromium.build.annotations.NullMarked;

/**
 * The Island's colors, as Blanc for iPhone draws it before Liquid Glass (BrowserStyle.swift and
 * IslandSurface.swift): the theme's raised fill, a hairline border at 70%, a soft shadow, and
 * dividers in the text color at 13%. A private tab's Island is always dark.
 */
@NullMarked
public final class IslandStyle {
    public final boolean dark;
    public final int raised;
    public final int border;
    public final int text;
    public final int divider;

    /** The shadow's black, 0–255 (10% light, 25% dark). */
    public final int shadowAlpha;

    private IslandStyle(boolean dark) {
        this.dark = dark;
        raised = dark ? 0xFF1F1F1F : 0xFFFFFFFF;
        border = (dark ? 0x2E2E2E : 0xDEDEDE) | 0xB3000000;
        text = dark ? 0xFFF5F5F5 : 0xFF0E0E0E;
        divider = (text & 0x00FFFFFF) | 0x21000000;
        shadowAlpha = dark ? 64 : 26;
    }

    public static IslandStyle forTab(boolean privateTab, boolean systemDark) {
        return new IslandStyle(privateTab || systemDark);
    }
}

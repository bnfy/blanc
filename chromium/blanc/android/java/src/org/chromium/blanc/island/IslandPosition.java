// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.island;

import org.chromium.build.annotations.NullMarked;
import org.chromium.build.annotations.Nullable;

/** Where the Island sits: along the bottom, under the thumb (the default), or along the top. */
@NullMarked
public enum IslandPosition {
    BOTTOM("bottom"),
    TOP("top");

    private final String mSetting;

    IslandPosition(String setting) {
        mSetting = setting;
    }

    /** The value stored under the islandPosition setting, as on the iPhone. */
    public String setting() {
        return mSetting;
    }

    public static IslandPosition fromSetting(@Nullable String value) {
        return TOP.mSetting.equals(value) ? TOP : BOTTOM;
    }
}

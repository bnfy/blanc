// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.island;

import org.chromium.build.annotations.NullMarked;

/**
 * When the Island may tuck at all. As on the iPhone, it never tucks on the Start Page, with the
 * screen reader on, or while a sheet or the palette is open, and not at all with the setting off.
 */
@NullMarked
public final class IslandVisibility {
    private IslandVisibility() {}

    public static boolean mayTuck(
            boolean startPage, boolean talkBack, boolean sheetOpen, boolean tuckSetting) {
        return tuckSetting && !startPage && !talkBack && !sheetOpen;
    }
}

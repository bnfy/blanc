// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.island;

import org.jni_zero.CalledByNative;
import org.jni_zero.JNINamespace;

import org.chromium.base.ContextUtils;
import org.chromium.blanc.settings.SettingsStore;
import org.chromium.build.annotations.NullMarked;

/**
 * Where the Island sits, for the Start Page (blanc/android/browser/island_position_bridge.cc): it
 * makes room for the Island on that side. The setting itself stays here, in the app's preferences.
 */
@NullMarked
@JNINamespace("blanc")
final class IslandPositionBridge {
    private IslandPositionBridge() {}

    @CalledByNative
    private static boolean atTop() {
        return IslandPosition.fromSetting(
                        ContextUtils.getAppSharedPreferences()
                                .getString(SettingsStore.POSITION_KEY, null))
                == IslandPosition.TOP;
    }
}

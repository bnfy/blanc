// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.settings.chromium;

import androidx.preference.PreferenceFragmentCompat;

import org.json.JSONObject;

import org.chromium.blanc.settings.BlancSettingsScreen;
import org.chromium.blanc.sync.SyncBridge;
import org.chromium.build.annotations.NullMarked;
import org.chromium.build.annotations.Nullable;
import org.chromium.ui.base.WindowAndroid;

import java.util.function.Supplier;

/**
 * The one call patch 0110 makes from MainSettings, at the end of createPreferences() and of every
 * updatePreferences(): Blanc's screen over Chromium's root. The Sync row's status comes from the
 * runner asynchronously; when it changes the screen is applied again.
 */
@NullMarked
public final class BlancSettingsHook {
    private static boolean sSyncConnected;

    private BlancSettingsHook() {}

    public static void apply(PreferenceFragmentCompat fragment, Supplier<@Nullable WindowAndroid> window, Runnable openLicenses) {
        if (fragment.getPreferenceScreen() == null || fragment.getActivity() == null) return;
        BlancSettingsScreen.apply(fragment.getPreferenceScreen(),
                new ChromiumSettingsHost(fragment.requireActivity(), window, openLicenses, sSyncConnected));
        SyncBridge.call("sync.status", "[]", reply -> {
            boolean connected = connected(reply);
            if (connected == sSyncConnected) return;
            sSyncConnected = connected;
            if (fragment.isAdded() && fragment.getPreferenceScreen() != null && fragment.getActivity() != null) {
                BlancSettingsScreen.apply(fragment.getPreferenceScreen(),
                        new ChromiumSettingsHost(fragment.requireActivity(), window, openLicenses, connected));
            }
        });
    }

    private static boolean connected(String reply) {
        try {
            JSONObject outer = new JSONObject(reply);
            JSONObject value = outer.optBoolean("ok") ? outer.optJSONObject("value") : null;
            return value != null && value.optBoolean("enabled");
        } catch (org.json.JSONException e) {
            return false;
        }
    }
}

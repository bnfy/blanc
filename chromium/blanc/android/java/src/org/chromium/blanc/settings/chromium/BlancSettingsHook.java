// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.settings.chromium;

import android.os.SystemClock;

import androidx.preference.PreferenceFragmentCompat;
import androidx.preference.PreferenceGroup;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

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
    private static @Nullable String sSectionToShow;
    private static long sSectionRequestedAt;

    /** A request older than this was for a Settings that never opened. */
    private static final long SECTION_REQUEST_MS = 15000;

    private BlancSettingsHook() {}

    /** The next time the root is shown it scrolls to this section (blanc://settings#privacy). */
    public static void requestSection(String sectionKey) {
        sSectionToShow = sectionKey;
        sSectionRequestedAt = SystemClock.elapsedRealtime();
    }

    /**
     * Settings' own search box indexes every Chromium page, hidden ones included, so it would still
     * find Google services and Sign in. Blanc's Settings is short enough to need none; patch 0110
     * skips creating it.
     */
    public static boolean hidesSearch() {
        return true;
    }

    public static void apply(PreferenceFragmentCompat fragment, Supplier<@Nullable WindowAndroid> window, Runnable openLicenses) {
        if (fragment.getPreferenceScreen() == null || fragment.getActivity() == null) return;
        ChromiumSettingsHost host =
                new ChromiumSettingsHost(fragment.requireActivity(), window, openLicenses, sSyncConnected);
        BlancSettingsScreen.apply(fragment.getPreferenceScreen(), host);
        host.syncChromiumEngine();
        // The first apply runs while the root is being created, before it has a list to scroll; the
        // request waits for the one that follows it in onStart().
        String pending = sSectionToShow;
        if (pending != null && SystemClock.elapsedRealtime() - sSectionRequestedAt > SECTION_REQUEST_MS) {
            sSectionToShow = null;
            pending = null;
        }
        if (pending != null && fragment.getView() != null) {
            sSectionToShow = null;
            String section = pending;
            RecyclerView list = fragment.getListView();
            list.post(() -> scrollToTop(list, section));
        }
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

    /** Puts the section's heading at the top; scrollToPreference would leave a heading already in view where it is. */
    private static void scrollToTop(RecyclerView list, String sectionKey) {
        RecyclerView.Adapter<?> adapter = list.getAdapter();
        RecyclerView.LayoutManager layout = list.getLayoutManager();
        if (!(adapter instanceof PreferenceGroup.PreferencePositionCallback)
                || !(layout instanceof LinearLayoutManager)) {
            return;
        }
        int position =
                ((PreferenceGroup.PreferencePositionCallback) adapter).getPreferenceAdapterPosition(sectionKey);
        if (position >= 0) ((LinearLayoutManager) layout).scrollToPositionWithOffset(position, 0);
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

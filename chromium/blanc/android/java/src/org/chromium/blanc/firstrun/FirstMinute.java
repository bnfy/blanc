// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.firstrun;

import android.app.Activity;
import android.content.SharedPreferences;
import android.content.pm.ApplicationInfo;
import android.os.Handler;
import android.os.Looper;

import org.json.JSONException;
import org.json.JSONObject;

import org.chromium.base.ActivityState;
import org.chromium.base.ApplicationStatus;
import org.chromium.base.ContextUtils;
import org.chromium.blanc.settings.SettingsStore;
import org.chromium.blanc.sync.PairScanner;
import org.chromium.blanc.sync.SharedSpacesSheet;
import org.chromium.blanc.sync.SyncBridge;
import org.chromium.blanc.sync.SyncSheet;
import org.chromium.build.annotations.NullMarked;
import org.chromium.build.annotations.Nullable;

import java.io.File;

/**
 * The first minute on each launch the person opens (patch 0114 calls {@link #start} once the Island
 * exists): the walkthrough card over the Start Page when this phone hasn't finished it, and again
 * after Settings → Show the welcome again. Background launches (sync) build no Island, so they never
 * reach here.
 */
@NullMarked
public final class FirstMinute {
    /**
     * A debug build skips the card while this file exists, so the emulator checks written before it
     * start on the Start Page; the walkthrough's own check removes it. Release builds never look.
     */
    static final String SKIP_FILE = "/data/local/tmp/blanc-walkthrough-off";

    /** Long enough for the Start Page to show before the card rises over it. */
    private static final long SHOW_DELAY_MS = 700;

    private static boolean sReplay;
    private static @Nullable WalkthroughSheet sShowing;

    private FirstMinute() {}

    public static void start(Activity activity, PairScanner.Permissions permissions) {
        ApplicationStatus.registerStateListenerForActivity((a, state) -> {
            if (state == ActivityState.RESUMED) {
                WalkthroughSheet showing = sShowing;
                if (showing != null) {
                    showing.onResumed();
                } else if (sReplay) {
                    maybeShow(activity, permissions, true);
                }
            } else if (state == ActivityState.DESTROYED) {
                WalkthroughSheet showing = sShowing;
                // A recreated activity asks again; the card's choices so far are already kept.
                if (showing != null && showing.isShowing()) showing.close();
                sShowing = null;
            }
        }, activity);
        new Handler(Looper.getMainLooper()).postDelayed(() -> maybeShow(activity, permissions, false), SHOW_DELAY_MS);
    }

    /** Settings → Show the welcome again: the card shows when the browser is back in front. */
    public static void requestReplay() {
        sReplay = true;
    }

    private static void maybeShow(Activity activity, PairScanner.Permissions permissions, boolean replay) {
        if (activity.isFinishing() || activity.isDestroyed() || sShowing != null) return;
        SharedPreferences prefs = ContextUtils.getAppSharedPreferences();
        SettingsStore store = new SettingsStore(prefs);
        if (!replay && (store.walkthroughCompletedVersion() >= WalkthroughFlow.VERSION || skippedForTests(activity))) {
            return;
        }
        SyncBridge.call("sync.status", "[]", reply -> {
            if (activity.isFinishing() || activity.isDestroyed() || sShowing != null) return;
            sReplay = false;
            boolean paired = enabled(reply);
            WalkthroughFlow flow = replay ? WalkthroughFlow.replay(paired, null)
                                          : new WalkthroughFlow(paired, store.walkthroughCompletedVersion(), null);
            if (flow.current() == null) return;
            WalkthroughSheet sheet = new WalkthroughSheet(activity, host(activity, permissions, prefs), store, flow);
            sShowing = sheet;
            sheet.show();
        });
    }

    private static WalkthroughSheet.Host host(
            Activity activity, PairScanner.Permissions permissions, SharedPreferences prefs) {
        DefaultBrowser.Roles roles = DefaultBrowser.roles(activity);
        return new WalkthroughSheet.Host() {
            @Override
            public void call(String method, String argsJson, org.chromium.base.Callback<String> done) {
                SyncBridge.call(method, argsJson, done);
            }

            @Override
            public @Nullable Boolean isDefaultBrowser() {
                return roles.held();
            }

            @Override
            public void requestDefaultBrowser() {
                DefaultBrowser.request(activity, roles, prefs);
            }

            @Override
            public void openPairing(Runnable onClosed) {
                SyncSheet.open(activity, permissions, onClosed);
            }

            @Override
            public void openSharedSpaces(Runnable onDone) {
                new SharedSpacesSheet(activity, onDone).show();
            }

            @Override
            public void finished() {
                sShowing = null;
            }
        };
    }

    private static boolean skippedForTests(Activity activity) {
        boolean debuggable = (activity.getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
        return debuggable && new File(SKIP_FILE).exists();
    }

    private static boolean enabled(String reply) {
        try {
            JSONObject outer = new JSONObject(reply);
            JSONObject value = outer.optBoolean("ok") ? outer.optJSONObject("value") : null;
            return value != null && value.optBoolean("enabled");
        } catch (JSONException e) {
            return false;
        }
    }
}

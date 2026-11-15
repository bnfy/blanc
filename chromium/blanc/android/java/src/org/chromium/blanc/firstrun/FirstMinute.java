// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.firstrun;

import android.app.Activity;
import android.content.SharedPreferences;
import android.content.pm.ApplicationInfo;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;

import org.json.JSONException;
import org.json.JSONObject;

import org.chromium.base.ActivityState;
import org.chromium.base.ApplicationStatus;
import org.chromium.base.CommandLine;
import org.chromium.base.ContextUtils;
import org.chromium.blanc.settings.SettingsStore;
import org.chromium.blanc.sync.PairScanner;
import org.chromium.blanc.sync.SharedSpacesSheet;
import org.chromium.blanc.sync.SyncBridge;
import org.chromium.blanc.sync.SyncSheet;
import org.chromium.build.annotations.NullMarked;
import org.chromium.build.annotations.Nullable;

import java.io.File;
import java.util.Random;

/**
 * The first minute on each launch the person opens (patch 0114 calls {@link #start} once the Island
 * exists): the launch ping when Measure usage is saved on, the walkthrough card over the Start Page
 * when this phone hasn't finished it, and the card again after Settings → Show the welcome again.
 * Background launches (sync) build no Island, so they never reach here and never send the ping.
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
    private static @Nullable LaunchPingSender sPing;
    // Held here, never read: SharedPreferences keeps its listeners weakly, so this reference is what
    // keeps the consent listener alive.
    @SuppressWarnings("UnusedVariable")
    private static SharedPreferences.@Nullable OnSharedPreferenceChangeListener sConsentListener;
    private static @Nullable WalkthroughSheet sShowing;

    private FirstMinute() {}

    public static void start(Activity activity, PairScanner.Permissions permissions) {
        sendLaunchPing(activity);
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
                // Hidden for pairing or not, the card goes with its activity; the next one shows it again.
                if (showing != null) showing.abandon();
                sShowing = null;
            }
        }, activity);
        new Handler(Looper.getMainLooper()).postDelayed(() -> maybeShow(activity, permissions, false), SHOW_DELAY_MS);
    }

    /**
     * The launch ping (F21), once per process: now if Measure usage is saved on, else as soon as it's
     * saved on, from the walkthrough or Settings. Nothing is sent before a saved yes.
     */
    private static void sendLaunchPing(Activity activity) {
        SharedPreferences prefs = ContextUtils.getAppSharedPreferences();
        SettingsStore store = new SettingsStore(prefs);
        LaunchPingSender sender = sPing;
        if (sender == null) {
            sender = new LaunchPingSender(LaunchPingBridge::post, activity.getNoBackupFilesDir(), device(activity),
                    new Random());
            sPing = sender;
            LaunchPingSender listening = sender;
            SharedPreferences.OnSharedPreferenceChangeListener listener = (p, key) -> {
                if (SettingsStore.USAGE_PING_KEY.equals(key)) listening.sendIfAllowed(store.usagePing());
            };
            sConsentListener = listener;
            prefs.registerOnSharedPreferenceChangeListener(listener);
        }
        sender.sendIfAllowed(store.usagePing());
    }

    /**
     * What the ping reports for this phone. A test launch is a debuggable build started with
     * --blanc-test-ping-host (the switches desktop's --blanc-test-telemetry-host and -version play,
     * named for the ping alone so no other test hook turns on): it sends only to that loopback
     * collector, with --blanc-test-ping-version's version.
     */
    private static LaunchPingSender.Device device(Activity activity) {
        boolean debuggable = (activity.getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
        CommandLine line = CommandLine.getInstance();
        boolean test = debuggable && line.hasSwitch("blanc-test-ping-host");
        return new LaunchPingSender.Device(test, test ? line.getSwitchValue("blanc-test-ping-host") : null,
                test ? line.getSwitchValue("blanc-test-ping-version") : null,
                Build.SUPPORTED_ABIS.length > 0 ? Build.SUPPORTED_ABIS[0] : "",
                Build.VERSION.RELEASE == null ? "" : Build.VERSION.RELEASE,
                activity.getResources().getConfiguration().smallestScreenWidthDp);
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

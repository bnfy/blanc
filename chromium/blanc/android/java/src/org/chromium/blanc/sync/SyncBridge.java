// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.sync;

import android.content.ClipData;
import android.content.ClipDescription;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Handler;
import android.os.Looper;
import android.os.PersistableBundle;
import android.os.SystemClock;

import org.json.JSONException;
import org.json.JSONObject;
import org.jni_zero.CalledByNative;
import org.jni_zero.JNINamespace;
import org.jni_zero.NativeMethods;

import org.chromium.base.ApplicationState;
import org.chromium.base.ApplicationStatus;
import org.chromium.base.Callback;
import org.chromium.base.ContextUtils;
import org.chromium.base.PathUtils;
import org.chromium.build.annotations.NullMarked;
import org.chromium.build.annotations.Nullable;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;

/** The sandboxed runner of shipping sync (blanc/android/browser/sync_bridge.cc). */
@NullMarked
@JNINamespace("blanc")
public final class SyncBridge {
    private static final BlancKeyStore sKeys = new BlancKeyStore();
    /** The tabs last reported, for a phone that pairs after launching. */
    private static final long FIRST_SYNC_MILLIS = 20_000;
    private static @Nullable String sTabs;
    private static boolean sWatching;
    private static final ProfileSync sProfile = new ProfileSync(new ProfileSync.Host() {
        @Override
        public void call(String method, String argsJson, Callback<String> done) {
            SyncBridge.call(method, argsJson, done);
        }

        @Override
        public @Nullable String favoritesList() {
            return SyncBridge.favoritesList();
        }

        @Override
        public void favoritesApply(String planJson) {
            SyncBridgeJni.get().favoritesApply(planJson);
        }

        @Override
        public String canonicalUrls(String urlsJson) {
            return SyncBridgeJni.get().canonicalUrls(urlsJson);
        }

        @Override
        public boolean blockingEnabled() {
            return SyncBridgeJni.get().blockingEnabled();
        }

        @Override
        public void setBlockingEnabled(boolean on) {
            SyncBridgeJni.get().setBlockingEnabled(on);
        }

        @Override
        public SharedPreferences prefs() {
            return ContextUtils.getAppSharedPreferences();
        }

        @Override
        public void schedule(boolean on) {
            SyncSchedule.set(on);
        }

        @Override
        public long now() {
            return SystemClock.elapsedRealtime();
        }

        @Override
        public void later(Runnable run, long millis) {
            new Handler(Looper.getMainLooper()).postDelayed(run, millis);
        }
    });

    private SyncBridge() {}

    /** Calls "module.export" with a JSON array; `done` gets {"ok":…,"value":…} as JSON. */
    public static void call(String method, String argsJson, Callback<String> done) {
        SyncBridgeJni.get().call(method, argsJson, done);
    }

    @CalledByNative
    private static byte @Nullable [] protect(byte[] data) {
        return sKeys.protect(data);
    }

    @CalledByNative
    private static byte @Nullable [] unprotect(byte[] data) {
        return sKeys.unprotect(data);
    }

    static boolean on() {
        File file = new File(PathUtils.getDataDirectory(), "blanc_sync/sync.json");
        try (FileInputStream in = new FileInputStream(file)) {
            byte[] data = new byte[(int) Math.min(file.length(), 1 << 20)];
            int read = in.read(data);
            return read > 0 && new JSONObject(new String(data, 0, read, StandardCharsets.UTF_8)).optBoolean("enabled");
        } catch (IOException | JSONException e) {
            return false;
        }
    }

    /** Starts the runner for a phone that syncs. A phone that doesn't never starts it. */
    public static void startIfOn() {
        SyncedClosed.start();
        if (!sWatching) {
            sWatching = true;
            ApplicationStatus.registerApplicationStateListener(state -> {
                if (!on()) return;
                boolean front = state == ApplicationState.HAS_RUNNING_ACTIVITIES;
                call("sync.setForeground", "[" + front + "]", result -> {});
                // A theme or blocking change made while Sync was on is published here.
                if (front) sProfile.reconcile();
            });
        }
        if (!on()) return;
        call("sync.setForeground", "[true]", result -> {});
        sProfile.reconcile();
        OtherDevices.refresh();
        SyncedClosed.refresh();
    }

    /** This phone's tabs for other devices, once its tab model has them. */
    public static void setTabs(String argsJson) {
        sTabs = argsJson;
        if (on()) call("phone.setTabs", argsJson, result -> {});
    }

    static void setStartData(String devicesJson, String sentJson) {
        SyncBridgeJni.get().setStartData(devicesJson, sentJson);
    }

    /** Whether the wrapping key is really gone. */
    public static boolean keyLost() {
        return sKeys.lost();
    }

    /** Chromium's Favorites as JSON, or null until they've loaded. */
    static @Nullable String favoritesList() {
        return SyncBridgeJni.get().favoritesList();
    }

    @CalledByNative
    private static void sentAction(String id, boolean open) {
        OtherDevices.act(id, open);
    }

    /** One pass, then `done`: a background run stays open until it has settled. */
    static void reconcileThen(Runnable done) {
        sProfile.reconcile(done);
    }

    @CalledByNative
    private static void onFavoritesChanged() {
        if (on()) sProfile.reconcile();
    }

    /** Shipping's recovery code goes to the clipboard, marked sensitive. */
    @CalledByNative
    private static void onEvent(String event, String text) {
        if ("remote".equals(event)) {
            OtherDevices.refresh();
            return;
        }
        if ("closed".equals(event)) {
            SyncedClosed.refresh();
            return;
        }
        if (!"clipboard".equals(event)) {
            if ("account".equals(event)) {
                if (sTabs != null) setTabs(sTabs);
                // After the first sync: in front, shipping leaves requests free for change checks,
                // and the first sync would wait a whole 15 seconds for its last ones.
                new Handler(Looper.getMainLooper()).postDelayed(
                        () -> call("sync.setForeground", "[" + ApplicationStatus.hasVisibleActivities() + "]", result -> {}),
                        FIRST_SYNC_MILLIS);
            }
            sProfile.reconcile();
            OtherDevices.refresh();
            SyncedClosed.refresh();
            return;
        }
        Context context = ContextUtils.getApplicationContext();
        ClipData clip = ClipData.newPlainText("", text);
        PersistableBundle extras = new PersistableBundle();
        extras.putBoolean(ClipDescription.EXTRA_IS_SENSITIVE, true);
        clip.getDescription().setExtras(extras);
        ((ClipboardManager) context.getSystemService(Context.CLIPBOARD_SERVICE)).setPrimaryClip(clip);
    }

    @CalledByNative
    private static String deviceName() {
        return "Android";
    }

    @NativeMethods
    interface Natives {
        void call(String method, String argsJson, Callback<String> done);

        @Nullable String favoritesList();

        void favoritesApply(String planJson);

        void setStartData(String devicesJson, String sentJson);

        String canonicalUrls(String urlsJson);

        boolean blockingEnabled();

        void setBlockingEnabled(boolean on);
    }
}

// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.sync;

import android.content.ClipData;
import android.content.ClipDescription;
import android.content.ClipboardManager;
import android.content.Context;
import android.os.PersistableBundle;

import org.json.JSONException;
import org.json.JSONObject;
import org.jni_zero.CalledByNative;
import org.jni_zero.JNINamespace;
import org.jni_zero.NativeMethods;

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

    /** Starts the runner for a phone that syncs. A phone that doesn't never starts it. */
    public static void startIfOn() {
        File file = new File(PathUtils.getDataDirectory(), "blanc_sync/sync.json");
        try (FileInputStream in = new FileInputStream(file)) {
            byte[] data = new byte[(int) Math.min(file.length(), 1 << 20)];
            int read = in.read(data);
            if (read > 0 && new JSONObject(new String(data, 0, read, StandardCharsets.UTF_8)).optBoolean("enabled")) {
                ProfileSync.reconcile();
            }
        } catch (IOException | JSONException e) {
            // No file, or one that isn't ours yet: nothing to start.
        }
    }

    /** Chromium's Favorites as JSON, or null until they've loaded. */
    static @Nullable String favoritesList() {
        return SyncBridgeJni.get().favoritesList();
    }

    static void favoritesApply(String planJson) {
        SyncBridgeJni.get().favoritesApply(planJson);
    }

    static boolean blockingEnabled() {
        return SyncBridgeJni.get().blockingEnabled();
    }

    static void setBlockingEnabled(boolean on) {
        SyncBridgeJni.get().setBlockingEnabled(on);
    }

    @CalledByNative
    private static void onFavoritesChanged() {
        ProfileSync.reconcile();
    }

    /** Shipping's recovery code goes to the clipboard, marked sensitive. */
    @CalledByNative
    private static void onEvent(String event, String text) {
        if (!"clipboard".equals(event)) {
            ProfileSync.reconcile();
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

        boolean blockingEnabled();

        void setBlockingEnabled(boolean on);
    }
}

// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.sync;

import org.jni_zero.CalledByNative;
import org.jni_zero.JNINamespace;
import org.jni_zero.NativeMethods;

import org.chromium.base.Callback;
import org.chromium.build.annotations.NullMarked;
import org.chromium.build.annotations.Nullable;

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

    @CalledByNative
    private static String deviceName() {
        return "Android";
    }

    @NativeMethods
    interface Natives {
        void call(String method, String argsJson, Callback<String> done);
    }
}

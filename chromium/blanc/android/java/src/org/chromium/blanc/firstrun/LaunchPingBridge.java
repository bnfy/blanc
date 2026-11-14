// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.firstrun;

import org.jni_zero.JNINamespace;
import org.jni_zero.NativeMethods;

import org.chromium.build.annotations.NullMarked;

/**
 * Sends the launch ping through Chromium's own network stack (browser/launch_ping_bridge.cc), so it
 * appears in the NetLog the outbound gate reads. Native refuses every address but the Worker's
 * production endpoint and, in a build with test hooks, a loopback collector.
 */
@NullMarked
@JNINamespace("blanc")
public final class LaunchPingBridge {
    private LaunchPingBridge() {}

    public static void post(String url, String json) {
        LaunchPingBridgeJni.get().post(url, json);
    }

    @NativeMethods
    interface Natives {
        void post(String url, String json);
    }
}

// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.blocking;

import org.jni_zero.JNINamespace;
import org.jni_zero.NativeMethods;

import org.chromium.build.annotations.NullMarked;
import org.chromium.content_public.browser.WebContents;

/** The blocker's state for a page (blanc/android/browser/blocker_bridge.cc). */
@NullMarked
@JNINamespace("blanc")
public final class BlockerBridge {
    /** "unavailable" once it has failed for good; see blanc/services/blocker/blocker_proxy.h. */
    public static final String UNAVAILABLE = "unavailable";

    private BlockerBridge() {}

    public static boolean enabled(WebContents contents) {
        return BlockerBridgeJni.get().enabled(contents);
    }

    public static void setEnabled(WebContents contents, boolean on) {
        BlockerBridgeJni.get().setEnabled(contents, on);
    }

    public static boolean excepted(WebContents contents) {
        return BlockerBridgeJni.get().excepted(contents);
    }

    public static void setExcepted(WebContents contents, boolean allow) {
        BlockerBridgeJni.get().setExcepted(contents, allow);
    }

    public static int blockedCount(WebContents contents) {
        return BlockerBridgeJni.get().blockedCount(contents);
    }

    /** The blocking switch for the profile, with no page: Settings has none (blocker_bridge.cc). */
    public static boolean profileEnabled() {
        return BlockerBridgeJni.get().profileEnabled();
    }

    public static void setProfileEnabled(boolean on) {
        BlockerBridgeJni.get().setProfileEnabled(on);
    }

    /** The hosts where blocking is off, as the blocker stores them. */
    public static String[] allowedSites() {
        return BlockerBridgeJni.get().allowedSites();
    }

    public static void allowSite(String host, boolean allow) {
        BlockerBridgeJni.get().allowSite(host, allow);
    }

    public static String health() {
        return BlockerBridgeJni.get().health();
    }

    public static void restart() {
        BlockerBridgeJni.get().restart();
    }

    @NativeMethods
    interface Natives {
        boolean enabled(WebContents contents);

        void setEnabled(WebContents contents, boolean on);

        boolean excepted(WebContents contents);

        void setExcepted(WebContents contents, boolean allow);

        int blockedCount(WebContents contents);

        boolean profileEnabled();

        void setProfileEnabled(boolean on);

        String[] allowedSites();

        void allowSite(String host, boolean allow);

        String health();

        void restart();
    }
}

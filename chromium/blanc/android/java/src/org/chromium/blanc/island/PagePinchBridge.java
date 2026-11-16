// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.island;

import org.jni_zero.CalledByNative;
import org.jni_zero.JNINamespace;
import org.jni_zero.NativeMethods;

import org.chromium.build.annotations.NullMarked;
import org.chromium.build.annotations.Nullable;
import org.chromium.content_public.browser.WebContents;

/**
 * A page's pinches as Chromium's gesture detector reports them
 * (blanc/android/browser/page_pinch_bridge.cc). Chromium handles page touches outside the browser's
 * views (InputOnViz), so a view can't watch them; this hears the gestures themselves, alongside the
 * page's own zoom and never instead of it.
 */
@NullMarked
@JNINamespace("blanc")
public final class PagePinchBridge {
    /** The fingers went down on a pinch. */
    public static final int BEGAN = 0;

    /** The fingers' span changed by `scale` since the last report. */
    public static final int CHANGED = 1;

    /** The fingers lifted. */
    public static final int ENDED = 2;

    /** Hears every watched page's pinches; the Island follows only the page on show. */
    public interface Listener {
        void onPinch(WebContents contents, int phase, float scale);
    }

    private static @Nullable Listener sListener;

    private PagePinchBridge() {}

    public static void setListener(@Nullable Listener listener) {
        sListener = listener;
    }

    /** Starts reporting this page's pinches, for as long as the page lives. Safe to call again. */
    public static void watch(WebContents contents) {
        PagePinchBridgeJni.get().watch(contents);
    }

    @CalledByNative
    private static void onPinch(WebContents contents, int phase, float scale) {
        Listener listener = sListener;
        if (listener != null) listener.onPinch(contents, phase, scale);
    }

    @NativeMethods
    interface Natives {
        void watch(WebContents contents);
    }
}

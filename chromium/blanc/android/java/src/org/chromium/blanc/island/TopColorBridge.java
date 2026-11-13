// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.island;

import org.jni_zero.CalledByNative;
import org.jni_zero.JNINamespace;
import org.jni_zero.NativeMethods;

import org.chromium.build.annotations.NullMarked;
import org.chromium.content_public.browser.WebContents;

import java.util.function.Consumer;

/**
 * Reads the page's top row (blanc/android/browser/top_color_bridge.cc): a strip a few pixels tall
 * at the top of the page's own surface, copied by Chromium's compositor as the tab grid's
 * thumbnails are, scaled to one row. Nothing is drawn, kept or written to disk.
 */
@NullMarked
@JNINamespace("blanc")
public final class TopColorBridge {
    private TopColorBridge() {}

    /** Calls back with the row's pixels as ARGB, or none if the page couldn't be read. */
    public static void read(WebContents contents, Consumer<int[]> row) {
        TopColorBridgeJni.get().read(contents, row);
    }

    // Native passes the callback back untyped, so its generated signature stays a plain object.
    @CalledByNative
    @SuppressWarnings("unchecked")
    private static void onRead(Object row, int[] pixels) {
        ((Consumer<int[]>) row).accept(pixels);
    }

    @NativeMethods
    interface Natives {
        void read(WebContents contents, Object row);
    }
}

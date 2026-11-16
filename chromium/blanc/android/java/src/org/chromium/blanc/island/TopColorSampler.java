// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.island;

import android.os.Handler;
import android.os.Looper;

import org.chromium.build.annotations.NullMarked;
import org.chromium.build.annotations.Nullable;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.function.Consumer;

/**
 * Reads the page's top row when the Island asks (a page painted, loaded, changed color or stopped
 * scrolling, or a tab came forward), a request at a time, and keeps each tab's {@link TopColor} for
 * the status bar. A read that lands after its tab left the screen is dropped. Private tabs are
 * never read: their bar stays Blanc's own.
 */
@NullMarked
public final class TopColorSampler {
    /** Reads the shown page's top row, then calls back with its pixels (empty if it couldn't). */
    public interface Reader {
        void read(Consumer<int[]> row);
    }

    /** Tabs whose color is remembered, so switching back shows it at once. */
    private static final int REMEMBERED = 32;

    private final Runnable mOnChanged;
    private final Handler mHandler = new Handler(Looper.getMainLooper());
    private final Runnable mRead = this::read;
    private final Map<Integer, Integer> mColors =
            new LinkedHashMap<>(16, 0.75f, true) {
                @Override
                protected boolean removeEldestEntry(Map.Entry<Integer, Integer> eldest) {
                    return size() > REMEMBERED;
                }
            };
    private int mTabId = -1;
    private @Nullable Reader mReader;
    private boolean mPrivate;
    private boolean mDestroyed;
    private int mGeneration;

    /** `onChanged` runs when the shown tab's color changes, for the status bar to redraw. */
    public TopColorSampler(Runnable onChanged) {
        mOnChanged = onChanged;
    }

    /**
     * The tab on show and how to read its page; `reader` is null with no page to read. A new tab
     * or a new reader (the tab's page swapped) drops any read in flight.
     */
    public void setPage(int tabId, @Nullable Reader reader, boolean privateTab) {
        if (tabId != mTabId || reader != mReader) mGeneration++;
        mTabId = tabId;
        mReader = reader;
        mPrivate = privateTab;
    }

    /** The shown tab started another page: a read of the old one is dropped. */
    public void pageChanged() {
        mGeneration++;
    }

    /** Reads the shown page after `delayMs`; a later request replaces an earlier one. */
    public void schedule(long delayMs) {
        if (mDestroyed) return;
        mHandler.removeCallbacks(mRead);
        mHandler.postDelayed(mRead, delayMs);
    }

    /** The color behind the status icons for this tab, or {@link TopColor#NONE}. */
    public int colorFor(int tabId) {
        Integer color = mColors.get(tabId);
        return color == null ? TopColor.NONE : color;
    }

    public void destroy() {
        mDestroyed = true;
        mHandler.removeCallbacks(mRead);
        mGeneration++;
        mReader = null;
    }

    private void read() {
        Reader reader = mReader;
        if (reader == null || mPrivate) return;
        int tabId = mTabId;
        int generation = mGeneration;
        reader.read(row -> {
            // An empty row is a copy that failed, not a page without a main color.
            if (generation != mGeneration || row.length == 0) return;
            int color = TopColor.dominant(row);
            int before = colorFor(tabId);
            if (color == TopColor.NONE) mColors.remove(tabId);
            else mColors.put(tabId, color);
            if (color != before) mOnChanged.run();
        });
    }
}

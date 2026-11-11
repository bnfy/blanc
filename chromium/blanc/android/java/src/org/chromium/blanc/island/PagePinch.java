// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.island;

import org.chromium.build.annotations.NullMarked;

import java.util.ArrayDeque;

/**
 * Blanc for iPhone's pinch into the tab grid (PagePinch.swift): a pinch in on a fully zoomed-out
 * page opens the grid, on every page; a zoomed-in page zooms back out first, as in Safari. It
 * watches the page's pinch alongside the page's own, never instead of it. One instance follows one
 * pinch at a time: {@link #begin}, {@link #update} for each change, then {@link #end}.
 */
@NullMarked
public final class PagePinch {
    /** How far the fingers must close for the pinch to open the grid. */
    static final float OPENS_BELOW_SCALE = 0.8f;

    /** Where the page's own pinch would shrink the page too; past this it's the grid's. */
    static final float STARTS_BELOW_SCALE = 0.97f;

    /** The stretch of the pinch its closing speed is taken over. */
    private static final long SPEED_WINDOW_MS = 100;

    /** A quick close counts even when short; opening the fingers again never does. */
    public static boolean opens(float scale, float velocity) {
        if (velocity > 0.3f) return false;
        return scale < OPENS_BELOW_SCALE || velocity < -0.6f;
    }

    /** Whether the page is as small as it goes, so a pinch in has nothing left to zoom. */
    public static boolean zoomedOut(float pageScale, float minPageScale) {
        return pageScale <= minPageScale + 0.01f;
    }

    private boolean mStartedZoomedOut;
    private boolean mTracking;
    private float mScale = 1f;

    /** {time in ms, scale} for the last {@link #SPEED_WINDOW_MS}. */
    private final ArrayDeque<float[]> mRecent = new ArrayDeque<>();

    private long mStartMs;

    public void begin(boolean pageZoomedOut, long nowMs) {
        mStartedZoomedOut = pageZoomedOut;
        mTracking = false;
        mScale = 1f;
        mStartMs = nowMs;
        mRecent.clear();
        mRecent.add(new float[] {0f, 1f});
    }

    /** The fingers' span changed by `factor` since the last update. */
    public void update(float factor, long nowMs) {
        if (!(factor > 0f) || Float.isInfinite(factor)) return;
        mScale *= factor;
        float at = nowMs - mStartMs;
        mRecent.add(new float[] {at, mScale});
        while (mRecent.size() > 2 && at - mRecent.peekFirst()[0] > SPEED_WINDOW_MS) mRecent.removeFirst();
        if (!mTracking && mStartedZoomedOut && mScale < STARTS_BELOW_SCALE) mTracking = true;
    }

    /** The fingers lifted: whether the tab grid opens. */
    public boolean end(long nowMs) {
        boolean opens = mTracking && opens(mScale, velocity(nowMs - mStartMs));
        mTracking = false;
        mStartedZoomedOut = false;
        mRecent.clear();
        return opens;
    }

    /** The scale's change a second over the last stretch; none once the fingers have rested. */
    private float velocity(float at) {
        float[] first = mRecent.peekFirst();
        float[] last = mRecent.peekLast();
        if (first == null || last == null || at - last[0] > SPEED_WINDOW_MS) return 0f;
        float span = last[0] - first[0];
        return span <= 0f ? 0f : (last[1] - first[1]) / span * 1000f;
    }
}

// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.palette;

import android.view.MotionEvent;
import android.view.VelocityTracker;
import android.view.View;
import android.view.ViewConfiguration;

import org.chromium.build.annotations.NullMarked;
import org.chromium.build.annotations.Nullable;

/**
 * Dragging the open Island's sheet back toward the Island closes it, as on the iPhone
 * (PalettePanelDrag.swift, #1682): 60 dp, or a flick that would carry it 160. A drag away never
 * does. Values are in dp.
 */
@NullMarked
public final class PanelDrag {
    /** How far a drag toward the Island must go to close the sheet. */
    public static final float CLOSE_DP = 60;

    /** How far a flick's projected end must reach. */
    public static final float FLICK_DP = 160;

    /** A flick's projected end, as UIKit projects it: velocity times about half a second. */
    static final float PROJECTION_SECONDS = 0.5f;

    private PanelDrag() {}

    /**
     * @param translation the finger's travel, down positive
     * @param predicted where a flick would carry it
     * @param atTop the Island is at the top, so closing is upward
     */
    public static boolean closes(float translation, float predicted, boolean atTop) {
        float direction = atTop ? -1 : 1;
        return direction * translation >= CLOSE_DP || direction * predicted >= FLICK_DP;
    }

    /**
     * Follows a vertical drag that starts on one of the sheet's handles (its search and action
     * rows) and closes the sheet when {@link #closes} says so. The sheet's layout forwards its
     * touches here from onInterceptTouchEvent and onTouchEvent.
     */
    static final class Tracker {
        private final float mDensity;
        private final boolean mAtTop;
        private final Runnable mClose;
        private final View[] mHandles;
        private float mDownY;
        private boolean mOnHandle;
        private boolean mDragging;
        private @Nullable VelocityTracker mVelocity;

        Tracker(float density, boolean atTop, Runnable close, View... handles) {
            mDensity = density;
            mAtTop = atTop;
            mClose = close;
            mHandles = handles;
        }

        /** Whether the sheet takes over this gesture: a vertical drag from a handle. */
        boolean intercept(MotionEvent event) {
            switch (event.getActionMasked()) {
                case MotionEvent.ACTION_DOWN:
                    mDownY = event.getY();
                    mOnHandle = onHandle(event.getY());
                    mDragging = false;
                    track(event);
                    return false;
                case MotionEvent.ACTION_MOVE:
                    if (!mOnHandle) return false;
                    track(event);
                    int slop = ViewConfiguration.get(mHandles[0].getContext()).getScaledTouchSlop();
                    if (Math.abs(event.getY() - mDownY) > slop) mDragging = true;
                    return mDragging;
                default:
                    reset();
                    return false;
            }
        }

        /** Follows the drag it took over; on lifting, closes the sheet if it went far enough. */
        boolean touch(MotionEvent event) {
            if (!mDragging) return false;
            track(event);
            int action = event.getActionMasked();
            if (action == MotionEvent.ACTION_UP && mVelocity != null) {
                mVelocity.computeCurrentVelocity(1000);
                float dy = (event.getY() - mDownY) / mDensity;
                float predicted = dy + mVelocity.getYVelocity() / mDensity * PROJECTION_SECONDS;
                reset();
                if (closes(dy, predicted, mAtTop)) mClose.run();
            } else if (action == MotionEvent.ACTION_CANCEL) {
                reset();
            }
            return true;
        }

        private boolean onHandle(float y) {
            for (View handle : mHandles) {
                if (y >= handle.getTop() && y < handle.getBottom()) return true;
            }
            return false;
        }

        private void track(MotionEvent event) {
            if (mVelocity == null) mVelocity = VelocityTracker.obtain();
            mVelocity.addMovement(event);
        }

        private void reset() {
            mDragging = false;
            mOnHandle = false;
            if (mVelocity != null) {
                mVelocity.recycle();
                mVelocity = null;
            }
        }
    }
}

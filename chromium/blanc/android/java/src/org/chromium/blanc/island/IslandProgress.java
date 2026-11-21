// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.island;

import android.animation.ValueAnimator;
import android.graphics.Canvas;
import android.graphics.ColorFilter;
import android.graphics.Paint;
import android.graphics.PixelFormat;
import android.graphics.Rect;
import android.graphics.drawable.Drawable;

import org.chromium.build.annotations.NullMarked;
import org.chromium.build.annotations.Nullable;

/**
 * The Island's loading line, from Blanc for iPhone's IslandProgress (#1445): 2 tall along the
 * Island's outer edge (the bottom for a bottom Island, the top for a top one), filling as the page
 * loads and fading when it ends. It is the pill's foreground, so the capsule clips it.
 */
@NullMarked
public final class IslandProgress extends Drawable {
    /** A load shows at once: at least this share of the width. */
    private static final float SLIVER = 0.06f;

    private final Paint mPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final int mHeight;
    private boolean mAtTop;
    private boolean mShowing;
    private float mTarget;
    private float mFraction;
    private float mOpacity;
    private @Nullable ValueAnimator mWidth;
    private @Nullable ValueAnimator mFade;

    public IslandProgress(int heightPx) {
        mHeight = heightPx;
    }

    /** The line's rectangle in `bounds`: `fraction` of the width, along the top or the bottom. */
    public static Rect line(Rect bounds, float fraction, boolean atTop, int height) {
        int width = Math.round(bounds.width() * Math.max(SLIVER, Math.min(fraction, 1f)));
        int top = atTop ? bounds.top : bounds.bottom - height;
        return new Rect(bounds.left, top, bounds.left + width, top + height);
    }

    /** The text's color at 55%, as the iPhone tints it. */
    public void setInk(int color) {
        mPaint.setColor(color);
        invalidateSelf();
    }

    public void setAtTop(boolean atTop) {
        mAtTop = atTop;
        invalidateSelf();
    }

    /** Where the page's load is; the width follows in 0.2 s and the line fades in 0.25 s when it ends. */
    public void set(boolean loading, float progress) {
        if (loading) {
            if (!mShowing) mFraction = 0;
            mTarget = progress;
            animateWidth(progress);
        }
        if (loading != mShowing) {
            mShowing = loading;
            animateOpacity(loading ? 1f : 0f);
        }
    }

    public float target() {
        return mTarget;
    }

    public boolean showing() {
        return mShowing;
    }

    private void animateWidth(float to) {
        if (mWidth != null) mWidth.cancel();
        mWidth = ValueAnimator.ofFloat(mFraction, to).setDuration(200);
        mWidth.addUpdateListener(a -> {
            mFraction = (float) a.getAnimatedValue();
            invalidateSelf();
        });
        mWidth.start();
    }

    private void animateOpacity(float to) {
        if (mFade != null) mFade.cancel();
        mFade = ValueAnimator.ofFloat(mOpacity, to).setDuration(250);
        mFade.addUpdateListener(a -> {
            mOpacity = (float) a.getAnimatedValue();
            invalidateSelf();
        });
        mFade.start();
    }

    @Override
    public void draw(Canvas canvas) {
        if (mOpacity <= 0) return;
        int ink = mPaint.getAlpha();
        mPaint.setAlpha(Math.round(ink * mOpacity));
        canvas.drawRect(line(getBounds(), mFraction, mAtTop, mHeight), mPaint);
        mPaint.setAlpha(ink);
    }

    @Override
    public void setAlpha(int alpha) {}

    @Override
    public void setColorFilter(@Nullable ColorFilter filter) {}

    @Override
    public int getOpacity() {
        return PixelFormat.TRANSLUCENT;
    }
}

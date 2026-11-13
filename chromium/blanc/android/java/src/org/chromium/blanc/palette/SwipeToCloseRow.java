// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.palette;

import android.content.Context;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.view.Gravity;
import android.view.HapticFeedbackConstants;
import android.view.MotionEvent;
import android.view.VelocityTracker;
import android.view.View;
import android.view.ViewConfiguration;
import android.view.ViewGroup;
import android.view.accessibility.AccessibilityNodeInfo;
import android.widget.FrameLayout;
import android.widget.ImageButton;

import org.chromium.blanc.island.R;
import org.chromium.build.annotations.NullMarked;
import org.chromium.build.annotations.Nullable;

/**
 * A palette row that slides left to show a trash button, from Blanc for iPhone's SwipeToCloseRow
 * (#1466): no × to miss and open the tab instead. The row's own background (a group's tint) stays
 * put under the sliding content. A drag past more than half the row closes it, with a tick as it
 * crosses that line; a tap on an open row only shuts it. TalkBack has the close as an action.
 */
@NullMarked
public final class SwipeToCloseRow extends FrameLayout {
    /** The palette's rows share one, so opening a row shuts any other. */
    public static final class Group {
        private @Nullable SwipeToCloseRow mOpen;
    }

    // The iPhone's trash: a gray capsule 12 narrower than its strip, 40 tall, with a white glyph.
    private static final int TRASH_GRAY = 0xFF8E8E93;

    private final View mContent;
    private final FrameLayout mStrip;
    private final ImageButton mTrash;
    private final Runnable mOnClose;
    private final Group mGroup;
    private final float mDensity;
    private final int mSlop;
    private boolean mOpen;
    private boolean mDragging;
    private boolean mPast;
    private float mDownX;
    private float mDownY;
    private @Nullable VelocityTracker mVelocity;

    public SwipeToCloseRow(Context context, View content, String label, Runnable onClose, Group group) {
        super(context);
        mContent = content;
        mOnClose = onClose;
        mGroup = group;
        mDensity = context.getResources().getDisplayMetrics().density;
        mSlop = ViewConfiguration.get(context).getScaledTouchSlop();
        addView(content, new LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        mTrash = new ImageButton(context);
        mTrash.setImageResource(R.drawable.blanc_palette_trash);
        mTrash.setImageTintList(ColorStateList.valueOf(Color.WHITE));
        GradientDrawable capsule = new GradientDrawable();
        capsule.setColor(TRASH_GRAY);
        capsule.setCornerRadius(100 * mDensity);
        mTrash.setBackground(capsule);
        mTrash.setContentDescription(label);
        mTrash.setOnClickListener(v -> close());
        mStrip = new FrameLayout(context);
        mStrip.addView(mTrash, new LayoutParams(dp(RowSwipe.ACTION_WIDTH - 12), dp(40), Gravity.CENTER));
        mStrip.setVisibility(View.GONE);
        addView(mStrip, new LayoutParams(dp(RowSwipe.ACTION_WIDTH), ViewGroup.LayoutParams.MATCH_PARENT, Gravity.END));

        // On the row TalkBack lands on, as the iPhone's Close Tab action.
        content.setAccessibilityDelegate(new AccessibilityDelegate() {
            @Override
            public void onInitializeAccessibilityNodeInfo(View host, AccessibilityNodeInfo info) {
                super.onInitializeAccessibilityNodeInfo(host, info);
                info.addAction(new AccessibilityNodeInfo.AccessibilityAction(closeActionId(), label));
            }

            @Override
            public boolean performAccessibilityAction(View host, int action, @Nullable Bundle arguments) {
                if (action != closeActionId()) return super.performAccessibilityAction(host, action, arguments);
                close();
                return true;
            }
        });
    }

    /** The TalkBack action on the row's content that closes it. */
    public static int closeActionId() {
        return R.id.blanc_palette_close_action;
    }

    /** The trash button; shown only while a swipe has the row open. */
    public ImageButton trash() {
        return mTrash;
    }

    public void open() {
        settle(true);
    }

    public void shut() {
        settle(false);
    }

    @Override
    public boolean onInterceptTouchEvent(MotionEvent event) {
        return switch (event.getActionMasked()) {
            case MotionEvent.ACTION_DOWN -> {
                begin(event);
                // An open row takes the whole touch, unless it's on the trash: a tap only shuts it.
                yield mOpen && !onTrash(event);
            }
            case MotionEvent.ACTION_MOVE -> {
                track(event);
                yield startsDrag(event);
            }
            default -> false;
        };
    }

    @Override
    public boolean onTouchEvent(MotionEvent event) {
        return switch (event.getActionMasked()) {
            case MotionEvent.ACTION_DOWN -> {
                begin(event);
                yield true;
            }
            case MotionEvent.ACTION_MOVE -> {
                track(event);
                if (mDragging || startsDrag(event)) drag(event);
                yield true;
            }
            case MotionEvent.ACTION_UP -> {
                track(event);
                if (mDragging) release(event);
                else settle(false);
                endTracking();
                yield true;
            }
            case MotionEvent.ACTION_CANCEL -> {
                mDragging = false;
                settle(mOpen);
                endTracking();
                yield true;
            }
            default -> super.onTouchEvent(event);
        };
    }

    private void begin(MotionEvent event) {
        mDownX = event.getRawX();
        mDownY = event.getRawY();
        mDragging = false;
        mPast = false;
        if (mVelocity != null) mVelocity.recycle();
        mVelocity = VelocityTracker.obtain();
        track(event);
    }

    private void endTracking() {
        if (mVelocity == null) return;
        mVelocity.recycle();
        mVelocity = null;
    }

    private void track(MotionEvent event) {
        if (mVelocity == null) return;
        // Raw coordinates: the row's own position moves as its content slides.
        MotionEvent raw = MotionEvent.obtain(event);
        raw.setLocation(event.getRawX(), event.getRawY());
        mVelocity.addMovement(raw);
        raw.recycle();
    }

    private boolean startsDrag(MotionEvent event) {
        float dx = event.getRawX() - mDownX;
        float dy = event.getRawY() - mDownY;
        if (Math.hypot(dx, dy) < mSlop || !RowSwipe.starts(dx, dy, mOpen)) return false;
        mDragging = true;
        mContent.animate().cancel();
        if (getParent() != null) getParent().requestDisallowInterceptTouchEvent(true);
        if (mGroup.mOpen != null && mGroup.mOpen != this) mGroup.mOpen.shut();
        return true;
    }

    private void drag(MotionEvent event) {
        float dx = (event.getRawX() - mDownX) / mDensity;
        float width = getWidth() / mDensity;
        setOffset(RowSwipe.offset(mOpen, dx, width) * mDensity);
        boolean past = -RowSwipe.offset(mOpen, dx, width) > RowSwipe.fullSwipe(width);
        if (past != mPast) {
            mPast = past;
            if (past) performHapticFeedback(HapticFeedbackConstants.CLOCK_TICK);
        }
    }

    private void release(MotionEvent event) {
        mDragging = false;
        float dx = (event.getRawX() - mDownX) / mDensity;
        float velocity = 0;
        if (mVelocity != null) {
            mVelocity.computeCurrentVelocity(1000);
            velocity = mVelocity.getXVelocity() / mDensity;
        }
        // The iPhone projects a fifth of a second of glide.
        switch (RowSwipe.end(mOpen, dx, dx + velocity * 0.2f, getWidth() / mDensity)) {
            case CLOSE -> close();
            case OPEN -> settle(true);
            case SHUT -> settle(false);
        }
    }

    private boolean onTrash(MotionEvent event) {
        return mStrip.getVisibility() == View.VISIBLE && event.getX() >= mStrip.getLeft();
    }

    private void settle(boolean open) {
        if (open && mGroup.mOpen != null && mGroup.mOpen != this) mGroup.mOpen.shut();
        mOpen = open;
        if (open) mGroup.mOpen = this;
        else if (mGroup.mOpen == this) mGroup.mOpen = null;
        float target = open ? -dp(RowSwipe.ACTION_WIDTH) : 0;
        if (!isLaidOut()) {
            setOffset(target);
            return;
        }
        mContent.animate().translationX(target).setDuration(200).setUpdateListener(a -> setOffset(mContent.getTranslationX()));
    }

    private void close() {
        if (mGroup.mOpen == this) mGroup.mOpen = null;
        mOpen = false;
        if (!isLaidOut()) {
            mOnClose.run();
            return;
        }
        mContent.animate().translationX(-getWidth()).setDuration(200)
                .setUpdateListener(a -> setOffset(mContent.getTranslationX()))
                .withEndAction(mOnClose);
    }

    private void setOffset(float px) {
        mContent.setTranslationX(px);
        boolean showing = px < -mDensity;
        mStrip.setVisibility(showing ? View.VISIBLE : View.GONE);
        if (!showing) return;
        // The trash fills the strip the row has slid away from.
        ViewGroup.LayoutParams lp = mStrip.getLayoutParams();
        int width = Math.max(dp(RowSwipe.ACTION_WIDTH), Math.round(-px));
        if (lp.width != width) {
            lp.width = width;
            mStrip.setLayoutParams(lp);
        }
    }

    private int dp(float value) {
        return Math.round(value * mDensity);
    }
}

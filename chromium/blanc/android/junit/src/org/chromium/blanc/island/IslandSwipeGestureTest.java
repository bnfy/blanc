// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.island;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import android.app.Activity;
import android.os.SystemClock;
import android.view.MotionEvent;
import android.view.View.MeasureSpec;

import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.shadows.ShadowLooper;

import org.chromium.base.test.BaseRobolectricTestRunner;
import org.chromium.blanc.island.IslandSwipe.Outcome;

import java.util.ArrayList;
import java.util.List;

/** The Island's sideways swipe, as the iPhone's IslandSwipeUITests drive it. */
@RunWith(BaseRobolectricTestRunner.class)
public class IslandSwipeGestureTest {
    private IslandView mView;
    private float mDensity;
    private final List<Float> mShown = new ArrayList<>();
    private final List<Outcome> mEnded = new ArrayList<>();
    private int mIntoPage;
    private int mAddressTaps;

    @Before
    public void setUp() {
        Activity activity = Robolectric.buildActivity(Activity.class).setup().get();
        mView = new IslandView(activity);
        mDensity = activity.getResources().getDisplayMetrics().density;
        mView.setSwipeListener(
                new IslandView.SwipeListener() {
                    @Override
                    public void onSwipe(float displayedPx) {
                        mShown.add(displayedPx / mDensity);
                    }

                    @Override
                    public void onSwipeEnd(Outcome outcome) {
                        mEnded.add(outcome);
                    }

                    @Override
                    public void onSwipeIntoPage() {
                        mIntoPage++;
                    }
                });
        mView.domainView().setOnClickListener(v -> mAddressTaps++);
        mView.measure(
                MeasureSpec.makeMeasureSpec((int) (390 * mDensity), MeasureSpec.EXACTLY),
                MeasureSpec.makeMeasureSpec((int) (200 * mDensity), MeasureSpec.AT_MOST));
        mView.layout(0, 0, mView.getMeasuredWidth(), mView.getMeasuredHeight());
    }

    private void tabs(boolean previous, boolean next) {
        IslandView.State s = new IslandView.State();
        s.title = "example.com";
        s.tabCount = 3;
        s.hasPrevious = previous;
        s.hasNext = next;
        mView.bind(s);
    }

    /** A slow drag over the domain by (dx, dy) dp in `steps` moves, 400 ms apart: no flick. */
    private void drag(float dx, float dy, int steps) {
        drag(dx, dy, steps, 400);
    }

    private void drag(float dx, float dy, int steps, long stepMs) {
        float x = 200 * mDensity;
        float y = mView.getMeasuredHeight() / 2f;
        long t0 = SystemClock.uptimeMillis();
        mView.dispatchTouchEvent(MotionEvent.obtain(t0, t0, MotionEvent.ACTION_DOWN, x, y, 0));
        for (int i = 1; i <= steps; i++) {
            float f = (float) i / steps;
            mView.dispatchTouchEvent(
                    MotionEvent.obtain(t0, t0 + stepMs * i, MotionEvent.ACTION_MOVE,
                            x + dx * mDensity * f, y + dy * mDensity * f, 0));
        }
        long t1 = t0 + stepMs * (steps + 1);
        mView.dispatchTouchEvent(
                MotionEvent.obtain(t0, t1, MotionEvent.ACTION_UP, x + dx * mDensity, y + dy * mDensity, 0));
        // A click is posted to the main looper.
        ShadowLooper.idleMainLooper();
    }

    @Test
    public void swipeLeftGoesToTheNextTab() {
        tabs(true, true);
        drag(-150, 0, 10);
        assertEquals(List.of(Outcome.NEXT), mEnded);
        assertEquals(-150f, mShown.get(mShown.size() - 1), 1f);
        assertEquals(0, mAddressTaps);
    }

    @Test
    public void swipeAtTheEndStays() {
        tabs(true, false);
        drag(-150, 0, 10);
        assertEquals(List.of(Outcome.STAY), mEnded);
        assertEquals("the page follows at a quarter past the end", -37.5f, mShown.get(mShown.size() - 1), 1f);
    }

    @Test
    public void aShortSwipeStays() {
        tabs(true, true);
        drag(-60, 0, 10);
        assertEquals(List.of(Outcome.STAY), mEnded);
    }

    @Test
    public void tapStillOpensTheAddressSheet() {
        tabs(true, true);
        // A quick tap that moves a little (under the long-press timeout).
        drag(5, 0, 2, 16);
        assertEquals(1, mAddressTaps);
        assertTrue(mEnded.isEmpty());
        assertTrue(mShown.isEmpty());
    }

    @Test
    public void swipingIntoThePageOpensTheTabs() {
        tabs(true, true);
        drag(0, -50, 10);
        assertEquals(1, mIntoPage);
        assertTrue(mEnded.isEmpty());
        assertEquals(0, mAddressTaps);
    }

    @Test
    public void aShortVerticalMoveIsNotATabsSwipe() {
        tabs(true, true);
        drag(0, -30, 10);
        assertEquals(0, mIntoPage);
        assertFalse(mEnded.contains(Outcome.NEXT));
    }
}

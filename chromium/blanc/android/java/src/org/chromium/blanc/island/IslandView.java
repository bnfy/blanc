// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.island;

import android.content.Context;
import android.content.res.ColorStateList;
import android.content.res.Configuration;
import android.content.res.Resources;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.view.LayoutInflater;
import android.view.MotionEvent;
import android.view.VelocityTracker;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.ImageButton;
import android.widget.LinearLayout;
import android.widget.TextView;

import org.chromium.build.annotations.NullMarked;
import org.chromium.build.annotations.Nullable;

/**
 * Blanc for iPhone's Island pill as an Android view (ContentView.addressPill): the Sunrise mark,
 * the site, the private chip, Reload or Stop, the tab count and New tab, on the theme's raised
 * surface with a hairline and soft shadow, at most 600 wide inside 16 of padding. It only draws
 * {@link State}; IslandCoordinator wires it to the browser.
 */
@NullMarked
public class IslandView extends FrameLayout {
    /** What the pill shows. */
    public static final class State {
        public String title = "";
        public boolean loading;
        public int tabCount;
        public boolean privateTab;

        /** Tabs on either side of this one, for the swipe (left goes to the next). */
        public boolean hasPrevious;

        public boolean hasNext;
    }

    /** The sideways swipe on the Island (IslandSwipe), and the swipe into the page. */
    public interface SwipeListener {
        /** The page's offset for the finger's travel so far, in pixels. */
        void onSwipe(float displayedPx);

        void onSwipeEnd(IslandSwipe.Outcome outcome);

        /** A swipe from the Island into the page, past 40dp: the tab grid (A2). */
        void onSwipeIntoPage();
    }

    /** How far into the page a swipe opens the tab grid, as on the iPhone. */
    private static final float INTO_PAGE_DP = 40;

    /** A flick's projected end, as UIKit projects it: velocity times about half a second. */
    private static final float PROJECTION_SECONDS = 0.5f;

    private @Nullable SwipeListener mSwipeListener;
    private boolean mAtTop;
    private boolean mHasPrevious;
    private boolean mHasNext;
    private float mDownX;
    private float mDownY;
    private boolean mSwiping;
    private boolean mIntoPage;
    private @Nullable VelocityTracker mVelocity;

    private final LinearLayout mPill;
    private final ImageButton mMenu;
    private final TextView mDomain;
    private final TextView mPrivate;
    private final ImageButton mReload;
    private final View mTabs;
    private final TextView mTabCount;
    private final ImageButton mNewTab;
    private final View mDividerStart;
    private final View mDividerEnd;
    private final int mMaxWidth;
    private final float mDensity;

    public IslandView(Context context) {
        super(context);
        LayoutInflater.from(context).inflate(R.layout.blanc_island, this, true);
        Resources res = getResources();
        mDensity = res.getDisplayMetrics().density;
        mMaxWidth = res.getDimensionPixelSize(R.dimen.blanc_island_max_width);
        int h = res.getDimensionPixelSize(R.dimen.blanc_island_padding_horizontal);
        int v = res.getDimensionPixelSize(R.dimen.blanc_island_padding_vertical);
        setPadding(h, v, h, v);
        setClipToPadding(false);
        mPill = findViewById(R.id.blanc_island_pill);
        mMenu = findViewById(R.id.blanc_island_menu);
        mDomain = findViewById(R.id.blanc_island_domain);
        mPrivate = findViewById(R.id.blanc_island_private);
        mReload = findViewById(R.id.blanc_island_reload);
        mTabs = findViewById(R.id.blanc_island_tabs);
        mTabCount = findViewById(R.id.blanc_island_tab_count);
        mNewTab = findViewById(R.id.blanc_island_new_tab);
        mDividerStart = findViewById(R.id.blanc_island_divider_start);
        mDividerEnd = findViewById(R.id.blanc_island_divider_end);
        mMenu.setContentDescription(res.getString(R.string.blanc_ios_island_page_actions));
        mTabs.setContentDescription(res.getString(R.string.blanc_ios_island_show_all_tabs));
        mNewTab.setContentDescription(res.getString(R.string.blanc_tab_new));
        mPrivate.setContentDescription(res.getString(R.string.blanc_pill_private_title));
        bind(new State());
    }

    public void bind(State state) {
        mHasPrevious = state.hasPrevious;
        mHasNext = state.hasNext;
        Resources res = getResources();
        mDomain.setText(state.title);
        mDomain.setContentDescription(
                res.getString(R.string.blanc_ios_island_search_or_switch, state.title));
        mReload.setImageResource(
                state.loading ? R.drawable.blanc_island_stop : R.drawable.blanc_island_reload);
        mReload.setContentDescription(
                res.getString(
                        state.loading
                                ? R.string.blanc_ios_island_stop
                                : R.string.blanc_ios_island_reload));
        mTabCount.setText(String.valueOf(state.tabCount));
        // The iPhone's accessibility value: TalkBack hears "Show all tabs, 3 tabs".
        String count =
                res.getQuantityString(R.plurals.blanc_tabs_menu_header, state.tabCount, state.tabCount);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            mTabs.setStateDescription(count);
        } else {
            mTabs.setContentDescription(
                    res.getString(R.string.blanc_ios_island_show_all_tabs) + ", " + count);
        }
        mPrivate.setVisibility(state.privateTab ? View.VISIBLE : View.GONE);
        boolean systemDark =
                (res.getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK)
                        == Configuration.UI_MODE_NIGHT_YES;
        applyStyle(IslandStyle.forTab(state.privateTab, systemDark));
    }

    private void applyStyle(IslandStyle style) {
        GradientDrawable surface = new GradientDrawable();
        surface.setColor(style.raised);
        surface.setCornerRadius(getResources().getDimension(R.dimen.blanc_island_corner_radius));
        surface.setStroke(
                getResources().getDimensionPixelSize(R.dimen.blanc_island_border_width),
                style.border);
        mPill.setBackground(surface);
        // The iPhone's shadow is radius 10 at y 4 in 10% (light) or 25% (dark) black; Android's
        // elevation shadow is the closest, with its color set to that black.
        mPill.setElevation(getResources().getDimension(R.dimen.blanc_island_shadow_y) * 1.5f);
        int shadow = style.shadowAlpha << 24;
        mPill.setOutlineAmbientShadowColor(shadow);
        mPill.setOutlineSpotShadowColor(shadow);
        ColorStateList ink = ColorStateList.valueOf(style.text);
        mMenu.setImageTintList(ink);
        mReload.setImageTintList(ink);
        mNewTab.setImageTintList(ink);
        mDomain.setTextColor(style.text);
        mTabCount.setTextColor(style.text);
        mPrivate.setTextColor(style.text);
        GradientDrawable box = new GradientDrawable();
        box.setCornerRadius(getResources().getDimension(R.dimen.blanc_island_tab_box_radius));
        box.setStroke(
                getResources().getDimensionPixelSize(R.dimen.blanc_island_tab_box_stroke),
                style.text);
        mTabCount.setBackground(box);
        GradientDrawable chip = new GradientDrawable();
        chip.setCornerRadius(100 * mDensity);
        chip.setStroke(
                getResources().getDimensionPixelSize(R.dimen.blanc_island_chip_stroke),
                (style.text & 0x00FFFFFF) | 0x66000000);
        mPrivate.setBackground(chip);
        mDividerStart.setBackgroundColor(style.divider);
        mDividerEnd.setBackgroundColor(style.divider);
    }

    @Override
    protected void onMeasure(int widthMeasureSpec, int heightMeasureSpec) {
        // The pill is at most 600 wide and centered, as on the iPhone (frame(maxWidth: 600)).
        int available = MeasureSpec.getSize(widthMeasureSpec) - getPaddingLeft() - getPaddingRight();
        FrameLayout.LayoutParams lp = (FrameLayout.LayoutParams) mPill.getLayoutParams();
        int width = Math.min(Math.max(available, 0), mMaxWidth);
        if (lp.width != width) {
            lp.width = width;
            mPill.setLayoutParams(lp);
        }
        super.onMeasure(widthMeasureSpec, heightMeasureSpec);
    }

    public void setSwipeListener(@Nullable SwipeListener listener) {
        mSwipeListener = listener;
    }

    /** At the top, a swipe into the page goes down; at the bottom, up. */
    public void setAtTop(boolean atTop) {
        mAtTop = atTop;
    }

    @Override
    public boolean onInterceptTouchEvent(MotionEvent event) {
        track(event);
        switch (event.getActionMasked()) {
            case MotionEvent.ACTION_DOWN:
                mDownX = event.getX();
                mDownY = event.getY();
                mSwiping = false;
                mIntoPage = false;
                return false;
            case MotionEvent.ACTION_MOVE:
                return startsGesture(event);
            default:
                return mSwiping || mIntoPage;
        }
    }

    @Override
    public boolean onTouchEvent(MotionEvent event) {
        if (!mSwiping && !mIntoPage) return super.onTouchEvent(event);
        track(event);
        float dx = (event.getX() - mDownX) / mDensity;
        switch (event.getActionMasked()) {
            case MotionEvent.ACTION_MOVE:
                if (mSwiping && mSwipeListener != null) {
                    mSwipeListener.onSwipe(
                            IslandSwipe.displayed(dx, mHasPrevious, mHasNext) * mDensity);
                }
                return true;
            case MotionEvent.ACTION_UP:
            case MotionEvent.ACTION_CANCEL:
                if (mSwiping && mSwipeListener != null) {
                    IslandSwipe.Outcome outcome = IslandSwipe.Outcome.STAY;
                    if (event.getActionMasked() == MotionEvent.ACTION_UP && mVelocity != null) {
                        mVelocity.computeCurrentVelocity(1000);
                        float predicted = dx + mVelocity.getXVelocity() / mDensity * PROJECTION_SECONDS;
                        outcome =
                                IslandSwipe.outcome(
                                        dx, predicted, getWidth() / mDensity, mHasPrevious, mHasNext);
                    }
                    mSwipeListener.onSwipeEnd(outcome);
                }
                mSwiping = false;
                mIntoPage = false;
                if (mVelocity != null) {
                    mVelocity.recycle();
                    mVelocity = null;
                }
                return true;
            default:
                return true;
        }
    }

    /** Whether this move begins the sideways swipe or the swipe into the page. */
    private boolean startsGesture(MotionEvent event) {
        if (mSwiping || mIntoPage) return true;
        float dx = (event.getX() - mDownX) / mDensity;
        float dy = (event.getY() - mDownY) / mDensity;
        if (IslandSwipe.isSideways(dx, dy)) {
            mSwiping = true;
        } else if (Math.abs(dy) > Math.abs(dx) && (mAtTop ? dy : -dy) >= INTO_PAGE_DP) {
            mIntoPage = true;
            if (mSwipeListener != null) mSwipeListener.onSwipeIntoPage();
        } else {
            return false;
        }
        if (getParent() != null) getParent().requestDisallowInterceptTouchEvent(true);
        return true;
    }

    private void track(MotionEvent event) {
        if (mVelocity == null) mVelocity = VelocityTracker.obtain();
        mVelocity.addMovement(event);
    }

    public View menuButton() {
        return mMenu;
    }

    public View domainView() {
        return mDomain;
    }

    public View privateChip() {
        return mPrivate;
    }

    public View reloadButton() {
        return mReload;
    }

    public View tabsButton() {
        return mTabs;
    }

    public View newTabButton() {
        return mNewTab;
    }

    public View pill() {
        return mPill;
    }
}

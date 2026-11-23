// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.island;

import android.animation.LayoutTransition;
import android.animation.ValueAnimator;
import android.annotation.SuppressLint;
import android.content.Context;
import android.content.res.ColorStateList;
import android.content.res.Configuration;
import android.content.res.Resources;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.graphics.Typeface;
import android.graphics.drawable.BitmapDrawable;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.text.TextUtils;
import android.view.LayoutInflater;
import android.view.MotionEvent;
import android.view.VelocityTracker;
import android.view.View;
import android.view.accessibility.AccessibilityNodeInfo;
import android.widget.FrameLayout;
import android.widget.ImageButton;
import android.widget.LinearLayout;
import android.widget.TextView;

import org.chromium.build.annotations.NullMarked;
import org.chromium.build.annotations.Nullable;

/**
 * Blanc for iPhone's Island as an Android view (ContentView.addressPill, #1682): Back, Forward while
 * there's somewhere to go, the page menu (the site's icon, or the Sunrise on Blanc's pages), the
 * site, and New tab, which Stop replaces while a page loads. A 44 tall rounded rectangle with 17
 * corners on the theme's raised surface with a hairline and soft shadow, only as wide as what it
 * holds and at most 600 inside 16 of padding. It only draws {@link State}; IslandCoordinator wires
 * it to the browser.
 */
@NullMarked
public class IslandView extends FrameLayout {
    /** The iPhone's placeholder opacity on the Start Page, and its dimmed Back and Forward (#1463). */
    private static final float PLACEHOLDER_ALPHA = 0.55f;

    private static final float DISABLED_ALPHA = 0.35f;

    /** What the pill shows. */
    public static final class State {
        public String title = "";
        public boolean loading;
        public int tabCount;
        public boolean privateTab;

        /** The Start Page: the address shows the dimmed placeholder instead of `title`. */
        public boolean startPage;

        /** The page's history: Back dims without it, and Forward shows only with it. */
        public boolean canGoBack;

        public boolean canGoForward;

        /** Tabs on either side of this one, for the swipe (left goes to the next). */
        public boolean hasPrevious;

        public boolean hasNext;

        /** The site's own icon for the page menu, or null for a globe. */
        public @Nullable Bitmap favicon;

        /** One of Blanc's own pages: the page menu shows the Sunrise. */
        public boolean blancPage;
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
    private boolean mTucked;
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
    private final ImageButton mStop;
    private final ImageButton mBack;
    private final ImageButton mForward;
    private final ImageButton mNewTab;
    private final IslandProgress mProgress;
    private final String mPageActions;
    private final String mPrivateLabel;
    private int mInk;
    /** The page menu shows the globe, the one glyph drawn in the Island's ink. */
    private boolean mGlobe;
    private @Nullable Bitmap mFavicon;
    private @Nullable BitmapDrawable mFaviconDrawable;
    private final int mMaxWidth;
    private final float mDensity;

    public IslandView(Context context) {
        super(context);
        org.chromium.blanc.sync.SharedSpacesUi.install(context);
        LayoutInflater.from(context).inflate(R.layout.blanc_island, this, true);
        Resources res = getResources();
        mDensity = res.getDisplayMetrics().density;
        mMaxWidth = res.getDimensionPixelSize(R.dimen.blanc_island_max_width);
        int h = res.getDimensionPixelSize(R.dimen.blanc_island_padding_horizontal);
        int v = res.getDimensionPixelSize(R.dimen.blanc_island_padding_vertical);
        setPadding(h, v, h, v);
        setClipToPadding(false);
        mPill = findViewById(R.id.blanc_island_pill);
        // The loading line is the pill's foreground; the capsule clips it to its round ends.
        mProgress = new IslandProgress(Math.round(2 * mDensity));
        mPill.setForeground(mProgress);
        mPill.setClipToOutline(true);
        // The Island changes size as it changes: Forward slides in and out and a new site resizes
        // it, as the iPhone's springs do. Nothing moves with animations off.
        if (ValueAnimator.areAnimatorsEnabled()) {
            LayoutTransition transition = new LayoutTransition();
            transition.enableTransitionType(LayoutTransition.CHANGING);
            mPill.setLayoutTransition(transition);
        }
        mMenu = findViewById(R.id.blanc_island_menu);
        mDomain = findViewById(R.id.blanc_island_domain);
        mStop = findViewById(R.id.blanc_island_stop);
        mBack = findViewById(R.id.blanc_island_back);
        mForward = findViewById(R.id.blanc_island_forward);
        mNewTab = findViewById(R.id.blanc_island_new_tab);
        mPageActions = res.getString(R.string.blanc_ios_island_page_actions);
        mPrivateLabel = res.getString(R.string.blanc_tab_private_label);
        // Sighted people swipe from the Island into the page for the tab grid; TalkBack gets the same
        // as an action on the address, where the iPhone has it.
        String showAllTabs = res.getString(R.string.blanc_ios_island_show_all_tabs);
        mDomain.setAccessibilityDelegate(new View.AccessibilityDelegate() {
            @Override
            public void onInitializeAccessibilityNodeInfo(View host, AccessibilityNodeInfo info) {
                super.onInitializeAccessibilityNodeInfo(host, info);
                info.addAction(new AccessibilityNodeInfo.AccessibilityAction(
                        R.id.blanc_island_show_all_tabs_action, showAllTabs));
            }

            @Override
            public boolean performAccessibilityAction(View host, int action, @Nullable Bundle args) {
                if (action != R.id.blanc_island_show_all_tabs_action) {
                    return super.performAccessibilityAction(host, action, args);
                }
                if (mSwipeListener != null) mSwipeListener.onSwipeIntoPage();
                return true;
            }
        });
        bind(new State());
    }

    public void bind(State state) {
        mHasPrevious = state.hasPrevious;
        mHasNext = state.hasNext;
        Resources res = getResources();
        // #1463: the Start Page invites a search, dimmed like a placeholder and cut at its end;
        // TalkBack still hears the page's name below.
        mDomain.setText(state.startPage ? res.getString(R.string.blanc_pill_placeholder) : state.title);
        mDomain.setEllipsize(state.startPage ? TextUtils.TruncateAt.END : TextUtils.TruncateAt.MIDDLE);
        mDomain.setAlpha(state.startPage ? PLACEHOLDER_ALPHA : 1f);
        // #1472: the site in SemiBold, as Safari draws its address, so it holds up over busy pages;
        // the Start Page's placeholder stays regular.
        mDomain.setTypeface(Typeface.create(Typeface.DEFAULT, siteWeight(state.startPage), false));
        // No Reload on the Island (#1463): the page menu and pull to refresh reload. Stop takes New
        // tab's place while a page loads (#1682), so the Island never changes width for a load; New
        // tab is in the page menu meanwhile.
        mStop.setVisibility(state.loading ? View.VISIBLE : View.GONE);
        mNewTab.setVisibility(state.loading ? View.GONE : View.VISIBLE);
        // Back always leads, dimmed with nowhere to go, so the Island's start never jumps; Forward
        // shows only while there's somewhere to go.
        mBack.setEnabled(state.canGoBack);
        mBack.setAlpha(state.canGoBack ? 1f : DISABLED_ALPHA);
        mForward.setVisibility(state.canGoForward ? View.VISIBLE : View.GONE);
        // No tab count on the Island, as on the iPhone since November 5 (#1372): the address carries
        // the count as its accessibility value, so TalkBack hears "Search or switch tabs, example.com,
        // 3 tabs", and a Show all tabs action opens the grid as the swipe into the page does.
        String search = res.getString(R.string.blanc_ios_island_search_or_switch, state.title);
        String count =
                res.getQuantityString(R.plurals.blanc_tabs_menu_header, state.tabCount, state.tabCount);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            mDomain.setContentDescription(search);
            mDomain.setStateDescription(count);
        } else {
            mDomain.setContentDescription(search + ", " + count);
        }
        // No Private chip (#1682): a private tab's Island is dark, and the page menu tells TalkBack
        // it's private and leads with Close Private Tab.
        bindMenu(state);
        boolean systemDark =
                (res.getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK)
                        == Configuration.UI_MODE_NIGHT_YES;
        applyStyle(IslandStyle.forTab(state.privateTab, systemDark));
    }

    private void applyStyle(IslandStyle style) {
        GradientDrawable surface = new GradientDrawable();
        surface.setColor(style.raised);
        // 17 at any height, the desktop Island's resting corners (#1682), never a capsule.
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
        mInk = style.text;
        tintMenu();
        mStop.setImageTintList(ink);
        mBack.setImageTintList(ink);
        mForward.setImageTintList(ink);
        mNewTab.setImageTintList(ink);
        mDomain.setTextColor(style.text);
        mProgress.setInk((style.text & 0x00FFFFFF) | 0x8C000000);
    }

    /**
     * The page menu's glyph: the Sunrise in its own gold on Blanc's pages (the owner's call of
     * November 11, 2026), the site's icon at 16 with 4 corners, or a globe in the Island's ink
     * until the site's icon is known. A private tab's menu tells TalkBack it's private.
     */
    private void bindMenu(State state) {
        mGlobe = !state.blancPage && state.favicon == null;
        if (state.blancPage) {
            mFavicon = null;
            mFaviconDrawable = null;
            mMenu.setImageResource(R.drawable.blanc_island_mark);
        } else if (state.favicon != null) {
            if (state.favicon != mFavicon || mFaviconDrawable == null) {
                mFavicon = state.favicon;
                mFaviconDrawable = new BitmapDrawable(getResources(), rounded(state.favicon));
            }
            mMenu.setImageDrawable(mFaviconDrawable);
        } else {
            mFavicon = null;
            mFaviconDrawable = null;
            mMenu.setImageResource(R.drawable.blanc_palette_globe);
        }
        tintMenu();
        // In the label itself, which screen readers and UI dumps both carry.
        mMenu.setContentDescription(state.privateTab ? mPageActions + ", " + mPrivateLabel : mPageActions);
    }

    /** Only the globe takes the Island's ink; the Sunrise and a site's icon keep their colors. */
    private void tintMenu() {
        mMenu.setImageTintList(mGlobe && mInk != 0 ? ColorStateList.valueOf(mInk) : null);
    }

    /** `icon` at 16 square with 4 corners, as the iPhone draws a site's icon on its Island. */
    private Bitmap rounded(Bitmap icon) {
        int side = getResources().getDimensionPixelSize(R.dimen.blanc_island_favicon);
        float corner = getResources().getDimension(R.dimen.blanc_island_favicon_corner);
        Bitmap out = Bitmap.createBitmap(side, side, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(out);
        Path clip = new Path();
        clip.addRoundRect(new RectF(0, 0, side, side), corner, corner, Path.Direction.CW);
        canvas.clipPath(clip);
        canvas.drawBitmap(Bitmap.createScaledBitmap(icon, side, side, true), 0, 0, new Paint(Paint.FILTER_BITMAP_FLAG));
        return out;
    }

    @Override
    protected void onMeasure(int widthMeasureSpec, int heightMeasureSpec) {
        // The pill is only as wide as what it holds, at most 600 and centered, as on the iPhone
        // (#1682). The site gives way first: it gets what the buttons leave, cut in the middle.
        int available = MeasureSpec.getSize(widthMeasureSpec) - getPaddingLeft() - getPaddingRight();
        int width = Math.min(Math.max(available, 0), mMaxWidth);
        int others = mPill.getPaddingLeft() + mPill.getPaddingRight();
        for (int i = 0; i < mPill.getChildCount(); i++) {
            View child = mPill.getChildAt(i);
            if (child == mDomain || child.getVisibility() == View.GONE) continue;
            others += child.getLayoutParams().width;
        }
        int max = Math.max(width - others, mDomain.getMinWidth());
        if (mDomain.getMaxWidth() != max) mDomain.setMaxWidth(max);
        super.onMeasure(widthMeasureSpec, heightMeasureSpec);
    }

    /** While tucked, every touch goes to the page. */
    public void setTucked(boolean tucked) {
        mTucked = tucked;
    }

    @Override
    public boolean dispatchTouchEvent(MotionEvent event) {
        // The view spans the window; only the pill takes touches, and only while it shows. The
        // rest of the band (padding, the room beside a 600dp pill) belongs to the page.
        if (event.getActionMasked() == MotionEvent.ACTION_DOWN
                && (mTucked
                        || event.getX() < mPill.getLeft()
                        || event.getX() >= mPill.getRight()
                        || event.getY() < mPill.getTop()
                        || event.getY() >= mPill.getBottom())) {
            return false;
        }
        return super.dispatchTouchEvent(event);
    }

    public void setSwipeListener(@Nullable SwipeListener listener) {
        mSwipeListener = listener;
    }

    /** At the top, a swipe into the page goes down; at the bottom, up. */
    public void setAtTop(boolean atTop) {
        mAtTop = atTop;
        mProgress.setAtTop(atTop);
    }

    /** The site's weight: SemiBold, or regular for the Start Page's placeholder (#1472). */
    static int siteWeight(boolean startPage) {
        return startPage ? 400 : 600;
    }

    /** The current page's load, for the line along the Island's outer edge (#1445). */
    public void setLoadProgress(boolean loading, float progress) {
        mProgress.set(loading, progress);
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

    // Only the swipe is handled here; a tap falls through to super, which performs the click.
    @SuppressLint("ClickableViewAccessibility")
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

    public View stopButton() {
        return mStop;
    }

    public View backButton() {
        return mBack;
    }

    public View forwardButton() {
        return mForward;
    }

    public View newTabButton() {
        return mNewTab;
    }

    public View pill() {
        return mPill;
    }
}

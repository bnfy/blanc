// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.island;

import android.app.Activity;
import android.content.SharedPreferences;
import android.os.SystemClock;
import android.provider.Settings;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.accessibility.AccessibilityManager;
import android.view.animation.DecelerateInterpolator;
import android.widget.FrameLayout;

import androidx.core.graphics.Insets;
import androidx.core.view.WindowInsetsCompat;

import org.chromium.base.Callback;
import org.chromium.base.ContextUtils;
import org.chromium.base.supplier.NullableObservableSupplier;
import org.chromium.blanc.settings.SettingsStore;
import org.chromium.build.annotations.NullMarked;
import org.chromium.build.annotations.Nullable;
import org.chromium.cc.mojom.RootScrollOffsetUpdateFrequency;
import org.chromium.chrome.browser.tab.Tab;
import org.chromium.chrome.browser.tab.TabObserver;
import org.chromium.chrome.browser.tab.TabSelectionType;
import org.chromium.chrome.browser.tabmodel.TabModel;
import org.chromium.chrome.browser.tabmodel.TabModelSelector;
import org.chromium.chrome.browser.tabmodel.TabModelSelectorTabModelObserver;
import org.chromium.components.url_formatter.SchemeDisplay;
import org.chromium.components.url_formatter.UrlFormatter;
import org.chromium.content_public.browser.GestureListenerManager;
import org.chromium.content_public.browser.GestureStateListener;
import org.chromium.content_public.browser.RenderCoordinates;
import org.chromium.content_public.browser.WebContents;
import org.chromium.ui.insets.InsetObserver;
import org.chromium.url.GURL;

/**
 * Puts Blanc for iPhone's Island over the page and keeps it in step with the browser: the active
 * tab's site, loading state, history and privacy, the tab count for TalkBack, the iPhone's tuck rules on the person's
 * scrolling, its position setting, and the window's insets (system bars, cutout and keyboard,
 * which the Island rides above, as on the iPhone). Actions that need the activity go to
 * {@link Callbacks}. Spike: docs/android/a1-island-spike.md.
 */
@NullMarked
public final class IslandCoordinator {
    /** What the Island's buttons do; the activity implements them. */
    public interface Callbacks {
        void onMenu(View anchor);

        void onAddress();

        void onTabs();

        void onNewTab();

        void onClosePrivateTab(Tab tab);

        /** The view the page draws in, which follows the finger during the Island's swipe. */
        @Nullable View pageView();
    }

    /** Device-local settings, as the iPhone stores them (SettingsStore.swift). */
    public static final String POSITION_KEY = SettingsStore.POSITION_KEY;

    public static final String TUCK_KEY = "blanc.island_tucks_on_scroll";

    private static final long TUCK_MS = 300;

    /** The page settling after a swipe (the iPhone's spring, response 0.35, damping 0.85). */
    private static final long SETTLE_MS = 350;

    private final Activity mActivity;
    private final PagePinch mPinch = new PagePinch();
    private final NullableObservableSupplier<Tab> mActiveTab;
    private final TabModelSelector mSelector;
    private final @Nullable InsetObserver mInsets;
    private final Callbacks mCallbacks;
    private final IslandView mView;
    private final IslandTuck mTuck = new IslandTuck();
    private final float mDensity;
    private final Callback<@Nullable Tab> mTabChanged = this::setTab;
    // Settings can move the Island while it is showing, so it follows the stored position at once.
    private final SharedPreferences.OnSharedPreferenceChangeListener mPositionChanged =
            (prefs, key) -> onPositionChanged(key);
    private final TabModelSelectorTabModelObserver mCountObserver;
    private final InsetObserver.WindowInsetObserver mInsetObserver =
            new InsetObserver.WindowInsetObserver() {
                @Override
                public void onInsetChanged() {
                    applyInsets();
                }
            };

    private @Nullable Tab mTab;
    private @Nullable WebContents mWebContents;
    private boolean mScrollingByPerson;
    private float mLastOffset;
    private boolean mSheetOpen;
    private boolean mShownTucked;

    private final TabObserver mTabObserver =
            new TabObserver() {
                @Override
                public void onUrlUpdated(Tab tab) {
                    refresh();
                }

                @Override
                public void onPageLoadStarted(Tab tab, GURL url) {
                    // Each new page brings the Island back, as on the iPhone.
                    mTuck.show();
                    refresh();
                }

                @Override
                public void onLoadStarted(Tab tab, boolean toDifferentDocument) {
                    refresh();
                }

                @Override
                public void onLoadStopped(Tab tab, boolean toDifferentDocument) {
                    refresh();
                }

                // The line along the Island's edge (#1445); only the line redraws.
                @Override
                public void onLoadProgressChanged(Tab tab, float progress) {
                    mView.setLoadProgress(tab.isLoading(), progress);
                }

                // Back and Forward follow the page's history, including pages that change it with
                // pushState.
                @Override
                public void onNavigationEntriesDeleted(Tab tab) {
                    refresh();
                }

                @Override
                public void onDidFinishNavigationInPrimaryMainFrame(
                        Tab tab, org.chromium.content_public.browser.NavigationHandle navigation) {
                    refresh();
                }

                @Override
                public void onContentChanged(Tab tab) {
                    attachGestures(tab.getWebContents());
                    refresh();
                }
            };

    private final GestureStateListener mGestures =
            new GestureStateListener() {
                @Override
                public void onScrollStarted(int offset, int extent, boolean isDirectionUp) {
                    mScrollingByPerson = true;
                }

                @Override
                public void onFlingStartGesture(int offset, int extent, boolean isDirectionUp) {
                    mScrollingByPerson = true;
                }

                @Override
                public void onFlingEndGesture(int offset, int extent) {
                    mScrollingByPerson = false;
                }

                @Override
                public void onScrollEnded(int offset, int extent) {
                    mScrollingByPerson = false;
                }

                @Override
                public void onScrollOffsetOrExtentChanged(int offset, int extent) {
                    scrolled(offset, extent);
                }
            };

    public IslandCoordinator(
            Activity activity,
            NullableObservableSupplier<Tab> activeTab,
            TabModelSelector selector,
            @Nullable InsetObserver insets,
            Callbacks callbacks) {
        mActivity = activity;
        PagePinchBridge.setListener(this::onPagePinch);
        mActiveTab = activeTab;
        mSelector = selector;
        mInsets = insets;
        mCallbacks = callbacks;
        mDensity = activity.getResources().getDisplayMetrics().density;
        mView = new IslandView(activity);
        mView.menuButton().setOnClickListener(mCallbacks::onMenu);
        mView.domainView().setOnClickListener(v -> mCallbacks.onAddress());
        mView.setSwipeListener(
                new IslandView.SwipeListener() {
                    @Override
                    public void onSwipe(float displayedPx) {
                        View page = mCallbacks.pageView();
                        if (page != null) page.setTranslationX(displayedPx);
                    }

                    @Override
                    public void onSwipeEnd(IslandSwipe.Outcome outcome) {
                        swiped(outcome);
                    }

                    @Override
                    public void onSwipeIntoPage() {
                        mCallbacks.onTabs();
                    }
                });
        mView.newTabButton().setOnClickListener(v -> mCallbacks.onNewTab());
        mView.privateChip()
                .setOnClickListener(
                        v -> {
                            Tab tab = mTab;
                            if (tab != null && tab.isIncognito()) mCallbacks.onClosePrivateTab(tab);
                        });
        // #1463: Stop while a page loads, then Back and Forward; Reload is in the Sunrise menu.
        mView.stopButton()
                .setOnClickListener(
                        v -> {
                            Tab tab = mTab;
                            if (tab != null) tab.stopLoading();
                        });
        mView.backButton()
                .setOnClickListener(
                        v -> {
                            Tab tab = mTab;
                            if (tab != null && tab.canGoBack()) tab.goBack();
                        });
        mView.forwardButton()
                .setOnClickListener(
                        v -> {
                            Tab tab = mTab;
                            if (tab != null && tab.canGoForward()) tab.goForward();
                        });
        ViewGroup content = activity.findViewById(android.R.id.content);
        content.addView(
                mView,
                new FrameLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.WRAP_CONTENT,
                        gravity()));
        mCountObserver =
                new TabModelSelectorTabModelObserver(selector) {
                    @Override
                    public void didAddTab(
                            Tab tab, int type, int creationState, boolean markedForSelection) {
                        refresh();
                    }

                    @Override
                    public void tabRemoved(Tab tab) {
                        refresh();
                    }
                };
        if (mInsets != null) mInsets.addObserver(mInsetObserver);
        ContextUtils.getAppSharedPreferences().registerOnSharedPreferenceChangeListener(mPositionChanged);
        mActiveTab.addSyncObserverAndCall(mTabChanged);
        applyInsets();
    }

    /** The address sheet or palette is open: the Island stays shown. */
    public void setSheetOpen(boolean open) {
        mSheetOpen = open;
        updateTuck();
    }

    /** Shows the Island now (a new tab, the Start Page, a sheet closing). */
    public void forceShow() {
        mTuck.show();
        updateTuck();
    }

    public View view() {
        return mView;
    }

    public void destroy() {
        PagePinchBridge.setListener(null);
        ContextUtils.getAppSharedPreferences().unregisterOnSharedPreferenceChangeListener(mPositionChanged);
        setTab(null);
        mActiveTab.removeObserver(mTabChanged);
        mCountObserver.destroy();
        if (mInsets != null) mInsets.removeObserver(mInsetObserver);
        ViewGroup parent = (ViewGroup) mView.getParent();
        if (parent != null) parent.removeView(mView);
    }

    private void setTab(@Nullable Tab tab) {
        if (mTab == tab) return;
        if (mTab != null) mTab.removeObserver(mTabObserver);
        mTab = tab;
        if (tab != null) tab.addObserver(mTabObserver);
        attachGestures(tab == null ? null : tab.getWebContents());
        mTuck.show();
        refresh();
    }

    /**
     * The iPhone's pinch into the tab grid: a pinch in on the page on show, fully zoomed out, opens
     * the grid once the fingers have closed far or fast enough (PagePinch).
     */
    private void onPagePinch(WebContents contents, int phase, float scale) {
        if (contents != mWebContents) return;
        long now = SystemClock.uptimeMillis();
        if (phase == PagePinchBridge.BEGAN) {
            RenderCoordinates page = RenderCoordinates.fromWebContents(contents);
            mPinch.begin(
                    PagePinch.zoomedOut(page.getPageScaleFactor(), page.getMinPageScaleFactor()), now);
        } else if (phase == PagePinchBridge.CHANGED) {
            mPinch.update(scale, now);
        } else if (mPinch.end(now)) {
            mCallbacks.onTabs();
        }
    }

    private void attachGestures(@Nullable WebContents webContents) {
        if (mWebContents == webContents) return;
        GestureListenerManager old =
                mWebContents == null ? null : GestureListenerManager.fromWebContents(mWebContents);
        if (old != null) old.removeListener(mGestures);
        mWebContents = webContents;
        mScrollingByPerson = false;
        mLastOffset = 0;
        GestureListenerManager manager =
                webContents == null ? null : GestureListenerManager.fromWebContents(webContents);
        // Every offset, not just at scroll ends (the spike found the default stops updating).
        if (manager != null) {
            manager.addListener(mGestures, RootScrollOffsetUpdateFrequency.ALL_UPDATES);
        }
        if (webContents != null) PagePinchBridge.watch(webContents);
    }

    /** Switches to the neighbor (left goes to the next), sliding the page in from that side. */
    private void swiped(IslandSwipe.Outcome outcome) {
        View page = mCallbacks.pageView();
        TabModel model = mSelector.getCurrentModel();
        int index = model.index();
        int target =
                outcome == IslandSwipe.Outcome.NEXT
                        ? index + 1
                        : outcome == IslandSwipe.Outcome.PREVIOUS ? index - 1 : index;
        if (target != index && target >= 0 && target < model.getCount()) {
            model.setIndex(target, TabSelectionType.FROM_USER);
            if (page != null) {
                float width = page.getWidth();
                page.setTranslationX(outcome == IslandSwipe.Outcome.NEXT ? width * 0.3f : -width * 0.3f);
            }
        }
        if (page != null) {
            page.animate()
                    .translationX(0)
                    .setInterpolator(new DecelerateInterpolator())
                    .setDuration(SETTLE_MS)
                    .start();
        }
    }

    private void scrolled(int offsetPx, int extentPx) {
        WebContents webContents = mWebContents;
        if (webContents == null) return;
        float offset = offsetPx / mDensity;
        float content =
                RenderCoordinates.fromWebContents(webContents).getContentHeightPixInt() / mDensity;
        mTuck.scrolled(
                mLastOffset,
                new IslandTuck.Position(offset, content, extentPx / mDensity, 0, 0),
                mScrollingByPerson);
        mLastOffset = offset;
        updateTuck();
    }

    private void refresh() {
        Tab tab = mTab;
        IslandView.State state = new IslandView.State();
        state.title = title(tab);
        state.loading = tab != null && tab.isLoading();
        mView.setLoadProgress(state.loading, tab == null ? 0 : tab.getProgress());
        state.privateTab = tab != null && tab.isIncognito();
        state.startPage = onStartPage();
        state.canGoBack = tab != null && tab.canGoBack();
        state.canGoForward = tab != null && tab.canGoForward();
        state.tabCount = mSelector.getTotalTabCount();
        TabModel model = mSelector.getCurrentModel();
        state.hasPrevious = model.index() > 0;
        state.hasNext = model.index() < model.getCount() - 1;
        mView.setAtTop(position() == IslandPosition.TOP);
        mView.bind(state);
        updateTuck();
    }

    private String title(@Nullable Tab tab) {
        GURL url = tab == null ? null : tab.getUrl();
        IslandTitle.Strings strings = key -> mActivity.getString(stringFor(key));
        if (url == null || !url.isValid()) return IslandTitle.forUrl(null, null, null, strings);
        String scheme = url.getScheme();
        String host = url.getHost();
        if ("http".equals(scheme) || "https".equals(scheme)) {
            // The display host: IDN as readable Unicode, as Chromium's address bar shows it.
            host = UrlFormatter.formatUrlForSecurityDisplay(url, SchemeDisplay.OMIT_HTTP_AND_HTTPS);
        }
        return IslandTitle.forUrl(scheme, host, url.getPath(), strings);
    }

    private static int stringFor(String key) {
        switch (key) {
            case "pagesNav.bookmarks":
                return R.string.blanc_pages_nav_bookmarks;
            case "pagesNav.history":
                return R.string.blanc_pages_nav_history;
            default:
                return R.string.blanc_ios_tabs_start_page;
        }
    }

    private boolean onStartPage() {
        Tab tab = mTab;
        if (tab == null) return true;
        GURL url = tab.getUrl();
        return ("chrome".equals(url.getScheme()) && "blanc".equals(url.getHost())
                        && "/newtab.html".equals(url.getPath()))
                || "chrome-native".equals(url.getScheme());
    }

    private void updateTuck() {
        AccessibilityManager a11y = mActivity.getSystemService(AccessibilityManager.class);
        boolean talkBack = a11y != null && a11y.isTouchExplorationEnabled();
        SharedPreferences prefs = ContextUtils.getAppSharedPreferences();
        if (!IslandVisibility.mayTuck(
                onStartPage(), talkBack, mSheetOpen, prefs.getBoolean(TUCK_KEY, true))) {
            mTuck.show();
        }
        boolean tucked = mTuck.isTucked();
        if (tucked == mShownTucked) return;
        mShownTucked = tucked;
        boolean reduceMotion =
                Settings.Global.getFloat(
                                mActivity.getContentResolver(),
                                Settings.Global.ANIMATOR_DURATION_SCALE,
                                1f)
                        == 0f;
        boolean top = position() == IslandPosition.TOP;
        float height = mView.getHeight() / mDensity;
        float away = (top ? -(height + 80) : height + 40) * mDensity;
        mView.animate().cancel();
        if (reduceMotion) {
            // Only fades, and takes no touches while tucked, as on the iPhone.
            mView.animate().alpha(tucked ? 0f : 1f).setDuration(TUCK_MS).start();
            mView.setTranslationY(0);
        } else {
            mView.setAlpha(1f);
            mView.animate()
                    .translationY(tucked ? away : 0f)
                    .setInterpolator(new DecelerateInterpolator())
                    .setDuration(TUCK_MS)
                    .start();
        }
        mView.setDescendantFocusability(
                tucked ? ViewGroup.FOCUS_BLOCK_DESCENDANTS : ViewGroup.FOCUS_AFTER_DESCENDANTS);
        mView.setTucked(tucked);
        setButtonsEnabled(!tucked);
    }

    private void setButtonsEnabled(boolean enabled) {
        View[] buttons = {
            mView.menuButton(), mView.domainView(), mView.privateChip(),
            mView.stopButton(), mView.backButton(), mView.forwardButton(), mView.newTabButton()
        };
        for (View button : buttons) button.setEnabled(enabled);
    }

    private void onPositionChanged(@Nullable String key) {
        if (!POSITION_KEY.equals(key)) return;
        mView.animate().cancel();
        mView.setTranslationY(0);
        mView.setAlpha(1f);
        mShownTucked = false;
        applyInsets();
        refresh();
    }

    private static IslandPosition position() {
        return IslandPosition.fromSetting(
                ContextUtils.getAppSharedPreferences().getString(POSITION_KEY, null));
    }

    // Top or bottom only: the view spans the window and centers its pill itself. Centering the
    // full-width view as well shifted it by a side navigation bar's width (three-button nav in
    // landscape, found by island-insets.mjs).
    private static int gravity() {
        return position() == IslandPosition.TOP ? Gravity.TOP : Gravity.BOTTOM;
    }

    private void applyInsets() {
        WindowInsetsCompat raw = mInsets == null ? null : mInsets.getLastRawWindowInsets();
        Insets bars =
                raw == null
                        ? Insets.NONE
                        : raw.getInsets(
                                WindowInsetsCompat.Type.systemBars()
                                        | WindowInsetsCompat.Type.displayCutout()
                                        | WindowInsetsCompat.Type.ime());
        FrameLayout.LayoutParams lp = (FrameLayout.LayoutParams) mView.getLayoutParams();
        lp.gravity = gravity();
        lp.leftMargin = bars.left;
        lp.rightMargin = bars.right;
        boolean top = position() == IslandPosition.TOP;
        lp.topMargin = top ? bars.top : 0;
        lp.bottomMargin = top ? 0 : bars.bottom;
        mView.setLayoutParams(lp);
    }
}

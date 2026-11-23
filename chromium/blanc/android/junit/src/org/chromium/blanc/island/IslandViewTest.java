// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.island;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import android.app.Activity;
import android.graphics.Rect;
import android.graphics.drawable.GradientDrawable;
import android.view.View;
import android.view.View.MeasureSpec;
import android.widget.TextView;

import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;

import org.chromium.base.test.BaseRobolectricTestRunner;

/** The Island's pill as the iPhone lays it out (ContentView.addressPill). */
@RunWith(BaseRobolectricTestRunner.class)
public class IslandViewTest {
    private Activity mActivity;
    private IslandView mView;

    @Before
    public void setUp() {
        mActivity = Robolectric.buildActivity(Activity.class).setup().get();
        mActivity.setTheme(android.R.style.Theme_DeviceDefault_Light_NoActionBar);
        mView = new IslandView(mActivity);
    }

    private static IslandView.State state(String title, boolean loading, int tabs, boolean privateTab) {
        IslandView.State s = new IslandView.State();
        s.title = title;
        s.loading = loading;
        s.tabCount = tabs;
        s.privateTab = privateTab;
        return s;
    }

    @Test
    public void theDomainShowsTheTitleAndNamesTheSearch() {
        mView.bind(state("example.com", false, 3, false));
        TextView domain = mView.findViewById(R.id.blanc_island_domain);
        assertEquals("example.com", domain.getText().toString());
        assertEquals("Search or switch tabs, example.com, 3 tabs", heard(domain));
    }

    // #1682: the Island has no Reload (the page menu and pull to refresh reload); Stop takes New tab's
    // place while a page loads, so the Island keeps its width.
    @Test
    public void stopTakesNewTabsPlaceWhileLoading() {
        View stop = mView.findViewById(R.id.blanc_island_stop);
        View newTab = mView.findViewById(R.id.blanc_island_new_tab);
        mView.bind(state("example.com", false, 1, false));
        assertEquals(View.GONE, stop.getVisibility());
        assertEquals(View.VISIBLE, newTab.getVisibility());
        mView.bind(state("example.com", true, 1, false));
        assertEquals(View.VISIBLE, stop.getVisibility());
        assertEquals(View.GONE, newTab.getVisibility());
        assertEquals("Stop loading", stop.getContentDescription().toString());
    }

    // #1682: Back leads, then Forward, the page menu and the site, and New tab (or Stop) last.
    @Test
    public void backLeadsAndNewTabEnds() {
        IslandView.State s = state("example.com", true, 1, false);
        s.canGoForward = true;
        mView.bind(s);
        int[] order = {R.id.blanc_island_back, R.id.blanc_island_forward, R.id.blanc_island_menu,
            R.id.blanc_island_domain, R.id.blanc_island_new_tab, R.id.blanc_island_stop};
        android.view.ViewGroup pill = mView.findViewById(R.id.blanc_island_pill);
        int last = -1;
        for (int id : order) {
            int at = pill.indexOfChild(mView.findViewById(id));
            assertTrue("out of order: " + mActivity.getResources().getResourceEntryName(id), at > last);
            last = at;
        }
        assertEquals("Back", mView.findViewById(R.id.blanc_island_back).getContentDescription().toString());
        assertEquals("Forward", mView.findViewById(R.id.blanc_island_forward).getContentDescription().toString());
    }

    // #1682: Back always shows, dimmed with nowhere to go; Forward shows only with somewhere to go.
    @Test
    public void forwardShowsOnlyWithSomewhereToGo() {
        View back = mView.findViewById(R.id.blanc_island_back);
        View forward = mView.findViewById(R.id.blanc_island_forward);
        mView.bind(state("example.com", false, 1, false));
        assertEquals(View.VISIBLE, back.getVisibility());
        assertFalse(back.isEnabled());
        assertTrue(back.getAlpha() < 1f);
        assertEquals(View.GONE, forward.getVisibility());
        IslandView.State s = state("example.com", false, 1, false);
        s.canGoBack = true;
        s.canGoForward = true;
        mView.bind(s);
        assertTrue(back.isEnabled());
        assertEquals(View.VISIBLE, forward.getVisibility());
    }

    // #1463: the Start Page invites a search, dimmed like a placeholder; TalkBack still hears the page.
    @Test
    public void theStartPageShowsADimmedPlaceholder() {
        IslandView.State s = state("Start Page", false, 1, false);
        s.startPage = true;
        mView.bind(s);
        TextView domain = mView.findViewById(R.id.blanc_island_domain);
        assertEquals("Search or type URL", domain.getText().toString());
        assertTrue(domain.getAlpha() < 1f);
        assertTrue(domain.getContentDescription().toString().startsWith("Search or switch tabs, Start Page"));
        mView.bind(state("example.com", false, 1, false));
        assertEquals("example.com", domain.getText().toString());
        assertEquals(1f, domain.getAlpha(), 0f);
    }

    // The iPhone dropped the tab count on November 5 (#1372): the grid opens by swiping from the Island
    // into the page, and TalkBack hears the count on the address and gets a Show all tabs action.
    @Test
    public void theClosedIslandHasNoTabCount() {
        mView.bind(state("example.com", false, 12, false));
        for (View view : all(mView)) {
            if (view instanceof TextView t && "12".contentEquals(t.getText())) {
                throw new AssertionError("the Island still shows the tab count");
            }
        }
    }

    @Test
    public void theAddressReadsTheTabCountAndOffersShowAllTabs() {
        int[] opened = {0};
        mView.setSwipeListener(new IslandView.SwipeListener() {
            @Override
            public void onSwipe(float displayedPx) {}

            @Override
            public void onSwipeEnd(IslandSwipe.Outcome outcome) {}

            @Override
            public void onSwipeIntoPage() {
                opened[0]++;
            }
        });
        View domain = mView.findViewById(R.id.blanc_island_domain);
        mView.bind(state("example.com", false, 1, false));
        assertEquals("Search or switch tabs, example.com, 1 tab", heard(domain));
        mView.bind(state("example.com", false, 3, false));
        assertEquals("Search or switch tabs, example.com, 3 tabs", heard(domain));
        android.view.accessibility.AccessibilityNodeInfo info = domain.createAccessibilityNodeInfo();
        int action = -1;
        for (android.view.accessibility.AccessibilityNodeInfo.AccessibilityAction a : info.getActionList()) {
            if ("Show all tabs".contentEquals(String.valueOf(a.getLabel()))) action = a.getId();
        }
        assertTrue("no Show all tabs action on the address", action != -1);
        assertTrue(domain.performAccessibilityAction(action, null));
        assertEquals(1, opened[0]);
    }

    private static java.util.List<View> all(View root) {
        java.util.List<View> out = new java.util.ArrayList<>();
        out.add(root);
        if (root instanceof android.view.ViewGroup g) {
            for (int i = 0; i < g.getChildCount(); i++) out.addAll(all(g.getChildAt(i)));
        }
        return out;
    }

    // #1682: no Private chip; the page menu tells TalkBack the tab is private.
    @Test
    public void aPrivateTabHasNoChipAndItsMenuSaysPrivate() {
        mView.bind(state("example.com", false, 1, true));
        for (View view : all(mView)) {
            if (view instanceof TextView t && "Private".contentEquals(t.getText())) {
                throw new AssertionError("the Island still shows a Private chip");
            }
        }
        View menu = mView.menuButton();
        assertEquals("Page actions, Private tab", heard(menu));
        mView.bind(state("example.com", false, 1, false));
        assertEquals("Page actions", heard(menu));
    }

    @Test
    public void theButtonsHaveTheIPhonesLabelsAndSizes() {
        mView.bind(state("example.com", false, 1, false));
        float d = mActivity.getResources().getDisplayMetrics().density;
        View menu = mView.findViewById(R.id.blanc_island_menu);
        View newTab = mView.findViewById(R.id.blanc_island_new_tab);
        assertEquals("Page actions", menu.getContentDescription().toString());
        assertEquals("New tab", newTab.getContentDescription().toString());
        mView.measure(MeasureSpec.makeMeasureSpec((int) (390 * d), MeasureSpec.EXACTLY),
                MeasureSpec.makeMeasureSpec((int) (200 * d), MeasureSpec.AT_MOST));
        assertEquals(Math.round(36 * d), menu.getMeasuredWidth());
        assertEquals(Math.round(44 * d), newTab.getMeasuredWidth());
        // #1682: the closed Island is 44 tall.
        assertEquals(Math.round(44 * d), newTab.getMeasuredHeight());
    }

    // #1682: the desktop Island's resting shape, 17 corners at any height, never a capsule, with 4
    // at its ends.
    @Test
    public void thePillIsARoundedRectangleWithRoomAtItsEnds() {
        float d = mActivity.getResources().getDisplayMetrics().density;
        View pill = mView.findViewById(R.id.blanc_island_pill);
        mView.bind(state("example.com", false, 1, false));
        mView.measure(MeasureSpec.makeMeasureSpec((int) (390 * d), MeasureSpec.EXACTLY),
                MeasureSpec.makeMeasureSpec((int) (200 * d), MeasureSpec.AT_MOST));
        assertEquals(Math.round(44 * d), pill.getMeasuredHeight());
        assertEquals(17 * d, ((GradientDrawable) pill.getBackground()).getCornerRadius(), 0.5f);
        assertEquals(Math.round(4 * d), pill.getPaddingStart());
        assertEquals(Math.round(4 * d), pill.getPaddingEnd());
        // A large font makes the Island taller; its corners stay 17.
        ((TextView) mView.findViewById(R.id.blanc_island_domain)).setTextSize(40);
        mView.measure(MeasureSpec.makeMeasureSpec((int) (390 * d), MeasureSpec.EXACTLY),
                MeasureSpec.makeMeasureSpec((int) (200 * d), MeasureSpec.AT_MOST));
        mView.layout(0, 0, mView.getMeasuredWidth(), mView.getMeasuredHeight());
        assertTrue(pill.getMeasuredHeight() > Math.round(44 * d));
        assertEquals(17 * d, ((GradientDrawable) pill.getBackground()).getCornerRadius(), 0.5f);
    }

    // #1472: the site in SemiBold, as Safari draws its address; the Start Page placeholder stays regular.
    @Test
    public void theSiteIsSemiboldAndThePlaceholderRegular() {
        // Robolectric's typefaces carry no weight, so the rule is checked where IslandView reads it.
        assertEquals(600, IslandView.siteWeight(false));
        assertEquals(400, IslandView.siteWeight(true));
    }

    // #1682: only as wide as what it holds; a long site fills at most the room inside 16 of padding,
    // and never more than 600.
    @Test
    public void thePillFitsItsSiteUpTo600AndPadded16() {
        float d = mActivity.getResources().getDisplayMetrics().density;
        View pill = mView.findViewById(R.id.blanc_island_pill);
        mView.bind(state("example.com", false, 1, false));
        measure(390 * d);
        assertTrue("a short site leaves the Island narrow", pill.getMeasuredWidth() < 0.75f * 390 * d);
        String longSite = "a-very-long-subdomain-name-that-keeps-going-and-going-and-going-and-going.example.com";
        mView.bind(state(longSite, false, 1, false));
        measure(390 * d);
        assertEquals(Math.round((390 - 32) * d), pill.getMeasuredWidth(), 1);
        measure(900 * d);
        assertTrue(pill.getMeasuredWidth() <= Math.round(600 * d));
        // Every button stays whole; the site gives way.
        assertEquals(Math.round(44 * d), mView.findViewById(R.id.blanc_island_new_tab).getMeasuredWidth());
    }

    private void measure(float width) {
        mView.measure(MeasureSpec.makeMeasureSpec((int) width, MeasureSpec.EXACTLY),
                MeasureSpec.makeMeasureSpec(Integer.MAX_VALUE >> 2, MeasureSpec.AT_MOST));
    }

    // What TalkBack reads: the label, then the state (Android 11+), or the label alone before.
    private static String heard(View v) {
        String label = v.getContentDescription().toString();
        return android.os.Build.VERSION.SDK_INT >= 30 && v.getStateDescription() != null
                ? label + ", " + v.getStateDescription()
                : label;
    }

    @Test
    public void longSitesAreCutInTheMiddleAsOnTheIphone() {
        TextView domain = mView.findViewById(R.id.blanc_island_domain);
        assertEquals(android.text.TextUtils.TruncateAt.MIDDLE, domain.getEllipsize());
    }

    @Test
    public void touchesOutsideThePillOrWhileTuckedReachThePage() {
        mActivity.setContentView(mView);
        mView.measure(MeasureSpec.makeMeasureSpec(1200, MeasureSpec.EXACTLY),
                MeasureSpec.makeMeasureSpec(400, MeasureSpec.UNSPECIFIED));
        mView.layout(0, 0, 1200, mView.getMeasuredHeight());
        View pill = mView.pill();
        float outsideX = pill.getLeft() / 2f;
        float y = pill.getTop() + pill.getHeight() / 2f;
        assertEquals(false, mView.dispatchTouchEvent(down(outsideX, y)));
        // The menu button, inside the pill, takes it.
        View menu = mView.menuButton();
        float menuX = pill.getLeft() + menu.getLeft() + menu.getWidth() / 2f;
        assertEquals(true, mView.dispatchTouchEvent(down(menuX, y)));
        mView.setTucked(true);
        assertEquals(false, mView.dispatchTouchEvent(down(menuX, y)));
    }

    private static android.view.MotionEvent down(float x, float y) {
        return android.view.MotionEvent.obtain(0, 0, android.view.MotionEvent.ACTION_DOWN, x, y, 0);
    }

    // #1445: a 2 tall line along the Island's outer edge fills as the page loads, at least a sliver
    // so a load is seen at once, then fades when it ends.
    @Test
    public void aLineAlongTheOuterEdgeFillsAsThePageLoads() {
        float d = mActivity.getResources().getDisplayMetrics().density;
        View pill = mView.findViewById(R.id.blanc_island_pill);
        IslandProgress line = (IslandProgress) pill.getForeground();
        Rect bounds = new Rect(0, 0, Math.round(300 * d), Math.round(44 * d));
        mView.setLoadProgress(true, 0.5f);
        assertEquals(0.5f, line.target(), 0f);
        assertTrue(line.showing());
        assertEquals(new Rect(0, bounds.bottom - Math.round(2 * d), bounds.width() / 2, bounds.bottom),
                IslandProgress.line(bounds, 0.5f, false, Math.round(2 * d)));
        assertEquals(new Rect(0, 0, Math.round(bounds.width() * 0.06f), Math.round(2 * d)),
                IslandProgress.line(bounds, 0f, true, Math.round(2 * d)));
        mView.setLoadProgress(false, 1f);
        assertFalse(line.showing());
    }

    // #1682: the page menu shows the site's icon, the Sunrise in its own gold on Blanc's pages, and
    // a globe in the Island's ink until the site's icon is known.
    @Test
    public void thePageMenuShowsTheSitesIconTheSunriseOrAGlobe() {
        android.widget.ImageButton menu = mView.findViewById(R.id.blanc_island_menu);
        float d = mActivity.getResources().getDisplayMetrics().density;
        IslandView.State blanc = state("Start Page", false, 1, false);
        blanc.blancPage = true;
        mView.bind(blanc);
        assertEquals(null, menu.getImageTintList());
        IslandView.State site = state("example.com", false, 1, false);
        site.favicon = android.graphics.Bitmap.createBitmap(32, 32, android.graphics.Bitmap.Config.ARGB_8888);
        mView.bind(site);
        assertEquals(null, menu.getImageTintList());
        assertEquals(Math.round(16 * d), menu.getDrawable().getIntrinsicWidth());
        mView.bind(state("example.com", false, 1, false));
        assertTrue("the globe takes the Island's ink", menu.getImageTintList() != null);
    }
}

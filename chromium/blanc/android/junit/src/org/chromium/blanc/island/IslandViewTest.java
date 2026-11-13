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

    // #1463: the Island has no Reload (the Sunrise menu and pull to refresh reload); Stop shows only
    // while a page loads, just before Back and Forward.
    @Test
    public void stopShowsOnlyWhileLoading() {
        View stop = mView.findViewById(R.id.blanc_island_stop);
        mView.bind(state("example.com", false, 1, false));
        assertEquals(View.GONE, stop.getVisibility());
        mView.bind(state("example.com", true, 1, false));
        assertEquals(View.VISIBLE, stop.getVisibility());
        assertEquals("Stop loading", stop.getContentDescription().toString());
    }

    @Test
    public void backForwardAndNewTabFollowTheAddressInThatOrder() {
        mView.bind(state("example.com", true, 1, false));
        int[] order = {R.id.blanc_island_menu, R.id.blanc_island_domain, R.id.blanc_island_stop,
            R.id.blanc_island_back, R.id.blanc_island_forward, R.id.blanc_island_new_tab};
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

    @Test
    public void backAndForwardAreOffWhenThereIsNowhereToGo() {
        IslandView.State s = state("example.com", false, 1, false);
        s.canGoBack = true;
        mView.bind(s);
        assertTrue(mView.findViewById(R.id.blanc_island_back).isEnabled());
        assertFalse(mView.findViewById(R.id.blanc_island_forward).isEnabled());
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

    @Test
    public void thePrivateChipShowsOnlyOnPrivateTabs() {
        View chip = mView.findViewById(R.id.blanc_island_private);
        mView.bind(state("example.com", false, 1, false));
        assertEquals(View.GONE, chip.getVisibility());
        mView.bind(state("example.com", false, 1, true));
        assertEquals(View.VISIBLE, chip.getVisibility());
        assertEquals("Private", ((TextView) chip).getText().toString());
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
        assertEquals(Math.round(48 * d), menu.getMeasuredWidth());
        assertEquals(Math.round(44 * d), newTab.getMeasuredWidth());
        // #1472: the closed Island is a 52 tall capsule.
        assertEquals(Math.round(52 * d), newTab.getMeasuredHeight());
    }

    // #1472: a capsule with 4 more at its round ends for the mark and New tab.
    @Test
    public void thePillIsACapsuleWithRoomAtItsEnds() {
        float d = mActivity.getResources().getDisplayMetrics().density;
        View pill = mView.findViewById(R.id.blanc_island_pill);
        mView.measure(MeasureSpec.makeMeasureSpec((int) (390 * d), MeasureSpec.EXACTLY),
                MeasureSpec.makeMeasureSpec((int) (200 * d), MeasureSpec.AT_MOST));
        assertEquals(Math.round(52 * d), pill.getMeasuredHeight());
        assertEquals(26 * d, ((GradientDrawable) pill.getBackground()).getCornerRadius(), 0.5f);
        assertEquals(Math.round(4 * d), pill.getPaddingStart());
        assertEquals(Math.round(4 * d), pill.getPaddingEnd());
    }

    // #1472: the site in SemiBold, as Safari draws its address; the Start Page placeholder stays regular.
    @Test
    public void theSiteIsSemiboldAndThePlaceholderRegular() {
        // Robolectric's typefaces carry no weight, so the rule is checked where IslandView reads it.
        assertEquals(600, IslandView.siteWeight(false));
        assertEquals(400, IslandView.siteWeight(true));
    }

    @Test
    public void thePillIsAtMost600WideAndPadded16() {
        float d = mActivity.getResources().getDisplayMetrics().density;
        View pill = mView.findViewById(R.id.blanc_island_pill);
        mView.measure(MeasureSpec.makeMeasureSpec((int) (900 * d), MeasureSpec.EXACTLY),
                MeasureSpec.makeMeasureSpec((int) (200 * d), MeasureSpec.AT_MOST));
        assertEquals(Math.round(600 * d), pill.getMeasuredWidth());
        mView.measure(MeasureSpec.makeMeasureSpec((int) (390 * d), MeasureSpec.EXACTLY),
                MeasureSpec.makeMeasureSpec((int) (200 * d), MeasureSpec.AT_MOST));
        assertEquals(Math.round((390 - 32) * d), pill.getMeasuredWidth());
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
        Rect bounds = new Rect(0, 0, Math.round(300 * d), Math.round(52 * d));
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
}

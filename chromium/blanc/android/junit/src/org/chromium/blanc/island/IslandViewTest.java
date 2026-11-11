// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.island;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import android.app.Activity;
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
        assertEquals("Search or switch tabs, example.com", domain.getContentDescription().toString());
    }

    @Test
    public void reloadBecomesStopWhileLoading() {
        View reload = mView.findViewById(R.id.blanc_island_reload);
        mView.bind(state("example.com", false, 1, false));
        assertEquals("Reload page", reload.getContentDescription().toString());
        mView.bind(state("example.com", true, 1, false));
        assertEquals("Stop loading", reload.getContentDescription().toString());
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
        assertEquals(Math.round(48 * d), newTab.getMeasuredHeight());
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
}

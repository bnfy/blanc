// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.island;

import static org.junit.Assert.assertEquals;

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

    @Test
    public void theTabCountShowsTheNumber() {
        mView.bind(state("example.com", false, 12, false));
        TextView count = mView.findViewById(R.id.blanc_island_tab_count);
        assertEquals("12", count.getText().toString());
        assertEquals("Show all tabs", mView.findViewById(R.id.blanc_island_tabs).getContentDescription().toString());
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
}

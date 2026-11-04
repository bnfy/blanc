// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.tabs;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import android.app.Activity;
import android.view.MotionEvent;
import android.view.View;
import android.view.accessibility.AccessibilityNodeInfo;

import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.shadows.ShadowLooper;

import org.chromium.base.test.BaseRobolectricTestRunner;
import org.chromium.blanc.grid.TabGrid;

import java.util.ArrayList;
import java.util.List;

/** The tab grid as Blanc for iPhone draws it (TabGridView.swift), over a plain tab store. */
@RunWith(BaseRobolectricTestRunner.class)
public class TabGridTest {
    private Activity mActivity;
    private FakeTabStore mStore;
    private BlancTabs mTabs;
    private long mNow;
    private String mA;
    private String mB;
    private String mC;
    private String mGroup;

    @Before
    public void setUp() {
        mActivity = Robolectric.buildActivity(Activity.class).setup().get();
        mStore = new FakeTabStore();
        mTabs = new BlancTabs(mStore, () -> mNow);
        mA = mStore.create("https://a.example/", false, null, -1);
        mB = mStore.create("https://b.example/", false, null, -1);
        mC = mStore.create("https://c.example/", false, null, -1);
        mGroup = mTabs.createGroup("Research", mA);
        mTabs.moveToGroup(mB, mGroup);
        mStore.select(mC);
    }

    private TabGrid show() {
        TabGrid grid = TabGrid.show(mActivity, mTabs, (id, width, done) -> done.onResult(null));
        ShadowLooper.idleMainLooper();
        return grid;
    }

    private static List<String> cards(TabGrid grid) {
        List<String> out = new ArrayList<>();
        for (TabGrid.Card card : grid.cards()) out.add(card.title);
        return out;
    }

    private static TabGrid.Card card(TabGrid grid, String title) {
        for (TabGrid.Card card : grid.cards()) if (card.title.equals(title)) return card;
        throw new AssertionError("no card " + title);
    }

    @Test
    public void theHeaderNamesTheOpenTabsAndDoneCloses() {
        TabGrid grid = show();
        assertEquals("Open tabs", grid.title().getText().toString());
        assertEquals("3", grid.count().getText().toString());
        grid.doneButton().performClick();
        assertFalse(grid.isShowing());
    }

    @Test
    public void groupsHaveHeadersAndAFoldedGroupIsOneTuckedRow() {
        TabGrid grid = show();
        assertEquals(List.of("Research"), grid.groupNames());
        assertEquals(List.of("https://a.example/", "https://b.example/", "https://c.example/"), cards(grid));
        assertEquals("Research, 2 tabs, Fold group", grid.groupHeader("Research").getContentDescription().toString());
        grid.groupHeader("Research").performClick();
        ShadowLooper.idleMainLooper();
        assertEquals(List.of("https://c.example/"), cards(grid));
        assertEquals(List.of("2 tabs tucked away"), grid.tuckedRows());
    }

    @Test
    public void privateTabsAreTheirOwnSection() {
        mStore.create("https://p.example/", true, null, -1);
        mStore.select(mC);
        TabGrid grid = show();
        assertEquals(List.of("Private"), grid.sectionHeadings());
        assertEquals("https://p.example/", cards(grid).get(3));
    }

    @Test
    public void aCardsTapSwitchesToIt() {
        TabGrid grid = show();
        assertTrue(card(grid, "https://c.example/").active);
        card(grid, "https://a.example/").view.performClick();
        assertEquals(mA, mStore.activeId(false));
        assertFalse(grid.isShowing());
    }

    @Test
    public void closingACardOffersUndoForFiveSeconds() {
        TabGrid grid = show();
        card(grid, "https://b.example/").close.performClick();
        ShadowLooper.idleMainLooper();
        assertFalse(cards(grid).contains("https://b.example/"));
        assertEquals("Tab closed", grid.bannerText());
        grid.undoButton().performClick();
        ShadowLooper.idleMainLooper();
        assertTrue(cards(grid).contains("https://b.example/"));
        assertNull(grid.bannerText());
        card(grid, "https://b.example/").close.performClick();
        mNow += BlancTabs.UNDO_MILLIS + 1;
        ShadowLooper.idleMainLooper(BlancTabs.UNDO_MILLIS + 1, java.util.concurrent.TimeUnit.MILLISECONDS);
        assertNull(grid.bannerText());
        assertFalse(mTabs.undoClose());
    }

    @Test
    public void swipingACardLeftClosesItAndRightPutsItBack() {
        TabGrid grid = show();
        View view = card(grid, "https://c.example/").view;
        float d = mActivity.getResources().getDisplayMetrics().density;
        swipe(view, 0, -150 * d);
        assertFalse(cards(grid).contains("https://c.example/"));
        View a = card(grid, "https://a.example/").view;
        swipe(a, 0, 150 * d);
        assertTrue(cards(grid).contains("https://a.example/"));
        assertEquals(0, a.getTranslationX(), 0);
    }

    private static void swipe(View view, float from, float by) {
        long t = 0;
        view.dispatchTouchEvent(MotionEvent.obtain(t, t, MotionEvent.ACTION_DOWN, 200 + from, 200, 0));
        for (int i = 1; i <= 10; i++) {
            view.dispatchTouchEvent(MotionEvent.obtain(t, t + i * 30, MotionEvent.ACTION_MOVE, 200 + from + by * i / 10, 200, 0));
        }
        view.dispatchTouchEvent(MotionEvent.obtain(t, t + 1000, MotionEvent.ACTION_UP, 200 + from + by, 200, 0));
        ShadowLooper.idleMainLooper(500, java.util.concurrent.TimeUnit.MILLISECONDS);
    }

    @Test
    public void theGroupMenuRenamesColorsUngroupsAndCloses() {
        TabGrid grid = show();
        assertEquals("", grid.renameGroup(mGroup, "Research list"));
        String other = mTabs.createGroup("Reading", mC);
        assertEquals("A group named “RESEARCH LIST” already exists", grid.renameGroup(other, "RESEARCH LIST"));
        assertEquals("", grid.renameGroup(other, "Reading list"));
        grid.setGroupColor(mGroup, "sky");
        assertEquals("#376694", mStore.groups().get(0).color);
        grid.ungroup(other);
        assertEquals(1, mStore.groups().size());
        grid.closeGroup(mGroup);
        ShadowLooper.idleMainLooper();
        assertEquals(List.of("https://c.example/"), cards(grid));
        assertEquals("Group closed", grid.bannerText());
    }

    @Test
    public void cardsHaveTheIphonesLabelsAndCloseAction() {
        TabGrid grid = show();
        TabGrid.Card c = card(grid, "https://c.example/");
        assertEquals("Switch to https://c.example/", c.view.getContentDescription().toString());
        assertEquals("Close https://c.example/", c.close.getContentDescription().toString());
        AccessibilityNodeInfo info = c.view.createAccessibilityNodeInfo();
        boolean hasClose = false;
        for (AccessibilityNodeInfo.AccessibilityAction action : info.getActionList()) {
            hasClose |= "Close tab".contentEquals(action.getLabel() == null ? "" : action.getLabel());
        }
        assertTrue(hasClose);
    }

    @Test
    public void newTabOpensATabAndClosesTheGrid() {
        TabGrid grid = show();
        grid.newTabButton().performClick();
        assertEquals(4, mStore.tabs(false).size());
        assertFalse(grid.isShowing());
    }

    @Test
    public void aPinnedTabLeadsTheGrid() {
        mTabs.setPinned(mC, true);
        TabGrid grid = show();
        assertEquals("https://c.example/", cards(grid).get(0));
        assertEquals(3, cards(grid).size());
    }

    @Test
    public void aClosedGridsTimerLeavesANewerUndoAlone() {
        TabGrid grid = show();
        card(grid, "https://c.example/").close.performClick();
        ShadowLooper.idleMainLooper();
        // The activity's own dismiss listener replaces any the grid set.
        grid.setOnDismissListener(d -> {});
        grid.dismiss();
        mNow += 4000;
        ShadowLooper.idleMainLooper(4000, java.util.concurrent.TimeUnit.MILLISECONDS);
        mTabs.close(mB);
        mNow += 1100;
        ShadowLooper.idleMainLooper(1100, java.util.concurrent.TimeUnit.MILLISECONDS);
        assertNotNull(mTabs.undoTitle());
    }

    @Test
    public void aGroupHeaderSaysItsCountAndWhetherItIsFolded() {
        TabGrid grid = show();
        assertEquals("Research, 2 tabs, Fold group", grid.groupHeader("Research").getContentDescription().toString());
    }
}

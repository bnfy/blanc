// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.island;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.app.Activity;
import android.view.Menu;
import android.view.View;
import android.widget.PopupMenu;

import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;

import org.chromium.base.test.BaseRobolectricTestRunner;

import java.util.ArrayList;
import java.util.List;

/** The Sunrise menu as the iPhone shows it (ContentView.islandMenuElements), with A1's entries. */
@RunWith(BaseRobolectricTestRunner.class)
public class IslandMenuPopupTest {
    private Activity mActivity;
    private View mAnchor;
    private final List<String> mRan = new ArrayList<>();
    private final IslandMenuPopup.Actions mActions =
            new IslandMenuPopup.Actions() {
                @Override
                public void setSiteProtected(boolean on) {
                    mRan.add("protect:" + on);
                }

                @Override
                public void turnBlockingOn() {
                    mRan.add("blocking-on");
                }

                @Override
                public void retryBlocking() {
                    mRan.add("retry");
                }

                @Override
                public void toggleFavorite() {
                    mRan.add("favorite");
                }

                @Override
                public void share() {
                    mRan.add("share");
                }

                @Override
                public void find() {
                    mRan.add("find");
                }

                @Override
                public void newPrivateTab() {
                    mRan.add("private");
                }
            };

    @Before
    public void setUp() {
        mActivity = Robolectric.buildActivity(Activity.class).setup().get();
        mAnchor = new View(mActivity);
        mActivity.setContentView(mAnchor);
    }

    private static IslandMenu.Context page(boolean privateTab, boolean favorite) {
        IslandMenu.Context c = new IslandMenu.Context();
        c.blockableSite = true;
        c.blockingEnabled = true;
        c.siteProtected = true;
        c.privateTab = privateTab;
        c.canFavorite = true;
        c.favorite = favorite;
        c.canSend = true;
        c.hasSendTargets = true;
        return c;
    }

    private static List<String> titles(PopupMenu popup) {
        Menu menu = popup.getMenu();
        List<String> titles = new ArrayList<>();
        for (int i = 0; i < menu.size(); i++) titles.add(menu.getItem(i).getTitle().toString());
        return titles;
    }

    @Test
    public void theStartPageShowsOnlyNewPrivateTab() {
        IslandMenu.Context start = new IslandMenu.Context();
        start.startPage = true;
        // Customize Start Page waits for Settings (A5), so it's left out, as unbuilt entries are.
        assertEquals(List.of("New Private Tab"), titles(IslandMenuPopup.show(mAnchor, start, mActions)));
    }

    @Test
    public void aWebPageShowsTheIphonesOrderWithA1sEntries() {
        assertEquals(
                List.of("Ad & tracker blocking", "Nothing blocked on this page yet", "Save to Favorites", "Share", "Find in Page", "New Private Tab"),
                titles(IslandMenuPopup.show(mAnchor, page(false, false), mActions)));
    }

    @Test
    public void aSavedPageOffersRemoval() {
        assertEquals("Remove from Favorites", titles(IslandMenuPopup.show(mAnchor, page(false, true), mActions)).get(2));
    }

    @Test
    public void aPrivateTabHasNoFavorite() {
        assertEquals(
                List.of("Ad & tracker blocking", "Nothing blocked on this page yet", "Share", "Find in Page", "New Private Tab"),
                titles(IslandMenuPopup.show(mAnchor, page(true, false), mActions)));
    }

    @Test
    public void eachEntryRunsItsAction() {
        PopupMenu popup = IslandMenuPopup.show(mAnchor, page(false, false), mActions);
        Menu menu = popup.getMenu();
        for (int i = 0; i < menu.size(); i++) {
            assertNotNull(menu.getItem(i));
            menu.performIdentifierAction(menu.getItem(i).getItemId(), 0);
        }
        assertEquals(List.of("protect:false", "favorite", "share", "find", "private"), mRan);
    }

    private IslandMenu.Context blockable() {
        IslandMenu.Context c = new IslandMenu.Context();
        c.blockableSite = true;
        c.blockingEnabled = true;
        c.siteProtected = true;
        return c;
    }

    @Test
    public void aProtectedSiteShowsTheSwitchOnAndItsCount() {
        IslandMenu.Context c = blockable();
        c.blockedCount = 3;
        PopupMenu popup = IslandMenuPopup.show(mAnchor, c, mActions);
        assertEquals(List.of("Ad & tracker blocking", "3 ads & trackers blocked on this page", "Share", "Find in Page", "New Private Tab"), titles(popup));
        assertTrue(popup.getMenu().getItem(0).isChecked());
        assertFalse(popup.getMenu().getItem(1).isEnabled());
    }

    @Test
    public void nothingBlockedYetSaysSo() {
        assertEquals("Nothing blocked on this page yet", titles(IslandMenuPopup.show(mAnchor, blockable(), mActions)).get(1));
    }

    @Test
    public void anAllowedSiteSaysSoAndTheSwitchProtectsIt() {
        IslandMenu.Context c = blockable();
        c.siteProtected = false;
        PopupMenu popup = IslandMenuPopup.show(mAnchor, c, mActions);
        assertEquals("Ads allowed on this site", titles(popup).get(1));
        assertFalse(popup.getMenu().getItem(0).isChecked());
        popup.getMenu().performIdentifierAction(popup.getMenu().getItem(0).getItemId(), 0);
        assertEquals(List.of("protect:true"), mRan);
    }

    @Test
    public void blockingOffEverywhereOffersTheWayBack() {
        IslandMenu.Context c = blockable();
        c.blockingEnabled = false;
        PopupMenu popup = IslandMenuPopup.show(mAnchor, c, mActions);
        assertEquals("Ad blocking is off everywhere", titles(popup).get(1));
        popup.getMenu().performIdentifierAction(popup.getMenu().getItem(0).getItemId(), 0);
        assertEquals(List.of("blocking-on"), mRan);
    }

    @Test
    public void anUnavailableBlockerSaysSoAndOffersRetry() {
        IslandMenu.Context c = blockable();
        c.blockingUnavailable = true;
        PopupMenu popup = IslandMenuPopup.show(mAnchor, c, mActions);
        assertEquals(List.of("Blocking could not start.", "Retry"), titles(popup).subList(0, 2));
        popup.getMenu().performIdentifierAction(popup.getMenu().getItem(1).getItemId(), 0);
        assertEquals(List.of("retry"), mRan);
    }
}

// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.island;

import static org.junit.Assert.assertEquals;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.annotation.Config;

import org.chromium.base.test.BaseRobolectricTestRunner;
import org.chromium.blanc.island.IslandMenu.Item;
import org.chromium.blanc.island.IslandMenu.Kind;

import java.util.List;

/** Port of the iPhone's IslandMenuTests: what the Sunrise mark's menu offers on each page. */
@RunWith(BaseRobolectricTestRunner.class)
@Config(manifest = Config.NONE)
public class IslandMenuTest {
    private static IslandMenu.Context web() {
        IslandMenu.Context c = new IslandMenu.Context();
        c.blockableSite = true;
        c.blockingEnabled = true;
        c.siteProtected = true;
        c.canFavorite = true;
        return c;
    }

    @Test
    public void webPageOffersEverything() {
        assertEquals(
                List.of(Item.blocking(true), Item.favorite(false), Item.of(Kind.SHARE), Item.of(Kind.FIND),
                        Item.of(Kind.NEW_PRIVATE_TAB)),
                IslandMenu.items(web()));
    }

    @Test
    public void startPageOffersCustomizeAndAPrivateTab() {
        IslandMenu.Context c = new IslandMenu.Context();
        c.startPage = true;
        assertEquals(List.of(Item.of(Kind.CUSTOMIZE_START_PAGE), Item.of(Kind.NEW_PRIVATE_TAB)), IslandMenu.items(c));
    }

    @Test
    public void privatePageIsNeverAFavorite() {
        IslandMenu.Context c = web();
        c.privateTab = true;
        assertEquals(
                List.of(Item.blocking(true), Item.of(Kind.SHARE), Item.of(Kind.FIND), Item.of(Kind.NEW_PRIVATE_TAB)),
                IslandMenu.items(c));
    }

    @Test
    public void statesFollowTheSiteAndTheFavorite() {
        IslandMenu.Context c = web();
        c.siteProtected = false;
        c.favorite = true;
        assertEquals(List.of(Item.blocking(false), Item.favorite(true)), IslandMenu.items(c).subList(0, 2));
    }

    @Test
    public void blockingOffEverywhereOffersSettings() {
        IslandMenu.Context c = web();
        c.blockingEnabled = false;
        assertEquals(Item.of(Kind.BLOCKING_SETTINGS), IslandMenu.items(c).get(0));
    }

    @Test
    public void sendNeedsSomewhereToSend() {
        IslandMenu.Context c = web();
        c.canSend = true;
        assertEquals(Item.favorite(false), IslandMenu.items(c).get(1));
        assertEquals(Item.of(Kind.SHARE), IslandMenu.items(c).get(2));
        c.hasSendTargets = true;
        assertEquals(Item.of(Kind.SEND), IslandMenu.items(c).get(2));
    }
}

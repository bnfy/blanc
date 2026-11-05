// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.tabs;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;
import org.junit.runner.RunWith;

import org.chromium.base.test.BaseRobolectricTestRunner;
import org.chromium.blanc.blocking.BlancBlocking;

/** /block-ads, /allow-ads and the menu's switch: desktop's and the iPhone's rules. */
@RunWith(BaseRobolectricTestRunner.class)
public class BlancBlockingTest {
    private static final class Fake implements BlancBlocking.Engine {
        boolean mEnabled = true;
        boolean mBlockable = true;
        boolean mExcepted;
        int mReloads;
        int mRestarts;

        @Override public boolean enabled() { return mEnabled; }
        @Override public void setEnabled(boolean on) { mEnabled = on; }
        @Override public boolean blockable() { return mBlockable; }
        @Override public boolean excepted() { return mExcepted; }
        @Override public void setExcepted(boolean allow) { mExcepted = allow; }
        @Override public void restart() { mRestarts++; }
        @Override public void reload() { mReloads++; }
    }

    private final Fake mEngine = new Fake();
    private final BlancBlocking mBlocking = new BlancBlocking(mEngine);

    @Test
    public void blockAdsOnAnAllowedSiteLiftsItsException() {
        mEngine.mExcepted = true;
        mBlocking.blockAds();
        assertFalse(mEngine.mExcepted);
        assertTrue(mEngine.mEnabled);
        assertEquals(1, mEngine.mReloads);
    }

    @Test
    public void blockAdsElsewhereTogglesBlockingEverywhere() {
        mBlocking.blockAds();
        assertFalse(mEngine.mEnabled);
        mBlocking.blockAds();
        assertTrue(mEngine.mEnabled);
        assertEquals(2, mEngine.mReloads);
    }

    @Test
    public void allowAdsAddsTheSiteOnce() {
        mBlocking.allowAds();
        assertTrue(mEngine.mExcepted);
        mBlocking.allowAds();
        assertEquals(1, mEngine.mReloads);
    }

    @Test
    public void allowAdsDoesNothingOnBlancsOwnPages() {
        mEngine.mBlockable = false;
        mBlocking.allowAds();
        assertFalse(mEngine.mExcepted);
        assertEquals(0, mEngine.mReloads);
    }

    @Test
    public void theSwitchSetsTheSiteAndReloads() {
        mBlocking.setSiteProtected(false);
        assertTrue(mEngine.mExcepted);
        mBlocking.setSiteProtected(true);
        assertFalse(mEngine.mExcepted);
        assertEquals(2, mEngine.mReloads);
    }

    @Test
    public void retryRestartsTheEngineAndReloads() {
        mBlocking.retry();
        assertEquals(1, mEngine.mRestarts);
        assertEquals(1, mEngine.mReloads);
    }
}

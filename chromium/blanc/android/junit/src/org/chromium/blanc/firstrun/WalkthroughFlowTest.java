// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.firstrun;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;
import org.junit.runner.RunWith;

import org.chromium.base.test.BaseRobolectricTestRunner;
import org.chromium.blanc.firstrun.WalkthroughFlow.Step;

/** Every path through the walkthrough, as the iPhone's WalkthroughFlowTests, with Android's two changes. */
@RunWith(BaseRobolectricTestRunner.class)
public class WalkthroughFlowTest {
    @Test
    public void aFreshPhoneStartsAtWelcomeAndAPairedOneAtShareBack() {
        assertEquals(Step.WELCOME, new WalkthroughFlow(false, 0, null).current());
        assertEquals(Step.SHARE_BACK, new WalkthroughFlow(true, 0, null).current());
    }

    @Test
    public void aPhoneThatFinishedThisVersionSeesNothing() {
        assertNull(new WalkthroughFlow(false, WalkthroughFlow.VERSION, null).current());
        assertNull(new WalkthroughFlow(true, WalkthroughFlow.VERSION + 1, null).current());
    }

    @Test
    public void pairingJoinsThenWalksArrivedShareBackPrivacyAndTheDefaultBrowser() {
        WalkthroughFlow flow = new WalkthroughFlow(false, 0, false);
        flow.pairWithBlanc();
        assertEquals(Step.PAIR, flow.current());
        flow.joined();
        assertEquals(Step.ARRIVED, flow.current());
        flow.next();
        assertEquals(Step.SHARE_BACK, flow.current());
        flow.next();
        assertEquals(Step.PRIVACY, flow.current());
        assertFalse(flow.privacySaved());
        flow.next();
        assertTrue(flow.privacySaved());
        assertEquals(Step.DEFAULT_BROWSER, flow.current());
        flow.next();
        assertNull(flow.current());
    }

    @Test
    public void browsingWithoutPairingGoesStraightToPrivacy() {
        WalkthroughFlow flow = new WalkthroughFlow(false, 0, null);
        flow.browseWithoutPairing();
        assertEquals(Step.PRIVACY, flow.current());
    }

    @Test
    public void leavingTheSyncScreenWithoutJoiningGoesBackToWelcome() {
        WalkthroughFlow flow = new WalkthroughFlow(false, 0, null);
        flow.pairWithBlanc();
        flow.pairingClosed();
        assertEquals(Step.WELCOME, flow.current());
        // Only the Pair step goes back.
        flow.browseWithoutPairing();
        flow.pairingClosed();
        assertEquals(Step.PRIVACY, flow.current());
    }

    @Test
    public void theDefaultBrowserStepIsSkippedWhenBlancAlreadyIsTheDefault() {
        WalkthroughFlow flow = new WalkthroughFlow(false, 0, null);
        flow.browseWithoutPairing();
        flow.defaultBrowserChanged(true);
        flow.next();
        assertNull(flow.current());
        // Unknown still offers it, as on the iPhone.
        WalkthroughFlow unknown = new WalkthroughFlow(false, 0, null);
        unknown.browseWithoutPairing();
        unknown.next();
        assertEquals(Step.DEFAULT_BROWSER, unknown.current());
    }

    @Test
    public void closingOnThePrivacyStepSavesTheChoiceOnScreen() {
        WalkthroughFlow flow = new WalkthroughFlow(false, 0, null);
        flow.browseWithoutPairing();
        assertTrue(flow.close());
        assertNull(flow.current());
    }

    @Test
    public void closingBeforeThePrivacyStepSavesNoChoiceUnlikeTheIphone() {
        for (int path = 0; path < 4; path++) {
            WalkthroughFlow flow = new WalkthroughFlow(path == 3, 0, null);
            if (path == 1) flow.pairWithBlanc();
            if (path == 2) {
                flow.pairWithBlanc();
                flow.joined();
            }
            assertFalse("path " + path, flow.close());
        }
    }

    @Test
    public void closingAfterThePrivacyStepHasNothingLeftToSave() {
        WalkthroughFlow flow = new WalkthroughFlow(false, 0, false);
        flow.browseWithoutPairing();
        flow.next();
        assertEquals(Step.DEFAULT_BROWSER, flow.current());
        assertFalse(flow.close());
    }

    @Test
    public void replayStartsAgainWhateverWasFinished() {
        assertEquals(Step.WELCOME, WalkthroughFlow.replay(false, null).current());
        assertEquals(Step.SHARE_BACK, WalkthroughFlow.replay(true, null).current());
    }

    @Test
    public void joiningWhileOnAnyStepShowsWhatArrived() {
        WalkthroughFlow flow = new WalkthroughFlow(false, 0, null);
        flow.browseWithoutPairing();
        flow.joined();
        assertEquals(Step.ARRIVED, flow.current());
        WalkthroughFlow closed = new WalkthroughFlow(false, WalkthroughFlow.VERSION, null);
        closed.joined();
        assertNull(closed.current());
    }
}

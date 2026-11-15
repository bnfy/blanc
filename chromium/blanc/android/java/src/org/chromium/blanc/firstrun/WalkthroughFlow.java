// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.firstrun;

import org.chromium.build.annotations.NullMarked;
import org.chromium.build.annotations.Nullable;

/**
 * The first-minute walkthrough's steps, Blanc for iPhone's WalkthroughFlow.swift (M18 §3.2): a card
 * over the Start Page that leads with pairing, then what arrived, sharing back, the privacy choice
 * and the default-browser offer. Pure, so every path is tested.
 *
 * <p>Android's privacy step has Measure usage only: Android has no search suggestions yet, so the
 * iPhone's version 2 (which added them) is Android's version 1. A later release that adds a step
 * bumps {@link #VERSION} and shows a phone that saw an earlier version only the privacy step.
 */
@NullMarked
public final class WalkthroughFlow {
    public enum Step {
        WELCOME,
        PAIR,
        ARRIVED,
        SHARE_BACK,
        PRIVACY,
        DEFAULT_BROWSER
    }

    public static final int VERSION = 1;

    private @Nullable Step mCurrent;
    private @Nullable Boolean mIsDefaultBrowser;
    private boolean mPrivacySaved;
    private boolean mOnlyNewSteps;

    /**
     * A null {@link #current()} means the card isn't shown. A phone already paired skips pairing and
     * starts at Share back; one that has seen this version sees nothing, and one that saw an earlier
     * version sees the privacy step alone.
     */
    public WalkthroughFlow(boolean paired, int completedVersion, @Nullable Boolean isDefaultBrowser) {
        mIsDefaultBrowser = isDefaultBrowser;
        if (completedVersion >= VERSION) {
            mCurrent = null;
        } else if (completedVersion >= 1) {
            mCurrent = Step.PRIVACY;
            mOnlyNewSteps = true;
        } else {
            mCurrent = paired ? Step.SHARE_BACK : Step.WELCOME;
        }
    }

    /** Settings → Show the welcome again. */
    public static WalkthroughFlow replay(boolean paired, @Nullable Boolean isDefaultBrowser) {
        return new WalkthroughFlow(paired, 0, isDefaultBrowser);
    }

    public @Nullable Step current() {
        return mCurrent;
    }

    /** Whether the privacy choice has been saved by this run of the card. */
    public boolean privacySaved() {
        return mPrivacySaved;
    }

    public void pairWithBlanc() {
        if (mCurrent == Step.WELCOME) mCurrent = Step.PAIR;
    }

    public void browseWithoutPairing() {
        if (mCurrent == Step.WELCOME) mCurrent = Step.PRIVACY;
    }

    /**
     * Pairing was left without joining: Android pairs on the Sync screen, which can close with Back,
     * so the card goes back to Welcome rather than staying on an empty step.
     */
    public void pairingClosed() {
        if (mCurrent == Step.PAIR) mCurrent = Step.WELCOME;
    }

    /** The phone joined a sync: from the Pair step, or from a pairing link confirmed meanwhile. */
    public void joined() {
        if (mCurrent == null) return;
        mCurrent = Step.ARRIVED;
        // A phone that pairs now gets the rest of the card, as a new one does.
        mOnlyNewSteps = false;
    }

    public void next() {
        if (mCurrent == null) return;
        switch (mCurrent) {
            case ARRIVED:
                mCurrent = Step.SHARE_BACK;
                break;
            case SHARE_BACK:
                mCurrent = Step.PRIVACY;
                break;
            case PRIVACY:
                mPrivacySaved = true;
                mCurrent = showsDefaultBrowser() && !mOnlyNewSteps ? Step.DEFAULT_BROWSER : null;
                break;
            case DEFAULT_BROWSER:
                mCurrent = null;
                break;
            default:
                break;
        }
    }

    /** What Android answered about the default browser; the step is skipped once Blanc is it. */
    public void defaultBrowserChanged(@Nullable Boolean isDefault) {
        mIsDefaultBrowser = isDefault;
    }

    /**
     * Closes the card. Returns true when the privacy choice on screen still has to be saved (§3.2:
     * closing never loses it). Unlike the iPhone, a card closed before the privacy step saves no
     * choice at all: the person never saw the switch, so Measure usage stays unsaved and nothing is
     * sent until they choose in Settings.
     */
    public boolean close() {
        boolean unsaved = mCurrent == Step.PRIVACY && !mPrivacySaved;
        mCurrent = null;
        return unsaved;
    }

    private boolean showsDefaultBrowser() {
        return !Boolean.TRUE.equals(mIsDefaultBrowser);
    }
}

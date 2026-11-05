// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.blocking;

import org.chromium.build.annotations.NullMarked;

/**
 * /block-ads, /allow-ads and the Sunrise menu's blocking row, over the blocker: desktop's rules
 * (main.js) and the iPhone's (TabsManager.setSiteProtection). Each change reloads the page, so it
 * takes effect on what's shown.
 */
@NullMarked
public final class BlancBlocking {
    /** The blocker, for the page in front. */
    public interface Engine {
        boolean enabled();

        void setEnabled(boolean on);

        /** A web page, which blocking applies to; not one of Blanc's own. */
        boolean blockable();

        boolean excepted();

        void setExcepted(boolean allow);

        void restart();

        void reload();
    }

    private final Engine mEngine;

    public BlancBlocking(Engine engine) {
        mEngine = engine;
    }

    /** On an allowed site this blocks it again; anywhere else it toggles blocking everywhere. */
    public void blockAds() {
        if (mEngine.blockable() && mEngine.excepted()) {
            mEngine.setExcepted(false);
        } else {
            mEngine.setEnabled(!mEngine.enabled());
        }
        mEngine.reload();
    }

    public void allowAds() {
        if (!mEngine.blockable() || mEngine.excepted()) return;
        mEngine.setExcepted(true);
        mEngine.reload();
    }

    public void setSiteProtected(boolean on) {
        mEngine.setExcepted(!on);
        mEngine.reload();
    }

    public void turnOn() {
        mEngine.setEnabled(true);
        mEngine.reload();
    }

    /** After the blocker became unavailable: start it again and reload what it stopped. */
    public void retry() {
        mEngine.restart();
        mEngine.reload();
    }
}

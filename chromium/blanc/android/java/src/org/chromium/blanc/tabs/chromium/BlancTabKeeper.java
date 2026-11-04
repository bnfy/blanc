// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.tabs.chromium;

import android.content.SharedPreferences;
import android.os.Handler;
import android.os.Looper;

import org.chromium.base.ContextUtils;
import org.chromium.blanc.tabs.BlancTabState;
import org.chromium.blanc.tabs.QuietTabs;
import org.chromium.build.annotations.NullMarked;
import org.chromium.build.annotations.Nullable;
import org.chromium.chrome.browser.tab.Tab;
import org.chromium.chrome.browser.tabmodel.TabModel;
import org.chromium.chrome.browser.tabmodel.TabModelSelector;
import org.chromium.chrome.browser.tabmodel.TabModelUtils;
import org.chromium.content_public.browser.MediaSession;
import org.chromium.content_public.browser.WebContents;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Predicate;

/**
 * Keeps what Chromium doesn't across a restart (BlancTabState: the active tab and mute, and closes
 * private tabs on a cold start) and runs Quiet Tabs' sweep (QuietTabs, every 30 s).
 */
@NullMarked
public final class BlancTabKeeper {
    /** A debug-only override of the quiet delay, for the emulator check. */
    static final String QUIET_DELAY_PREF = "blanc.quiet_delay_ms";

    /** The first keeper in a process starts cold: Android ended the app, or it's a fresh launch. */
    private static boolean sStarted;

    private final TabModelSelector mSelector;
    private final ChromiumTabStore mStore;
    private final Predicate<Tab> mCapturing;
    private final Handler mHandler = new Handler(Looper.getMainLooper());
    private final Runnable mSweep = this::sweep;
    /** Tabs this keeper quieted, with when each was last shown: quiet until it's shown again. */
    private final Map<Integer, Long> mQuieted = new HashMap<>();
    private boolean mDestroyed;

    public BlancTabKeeper(TabModelSelector selector, ChromiumTabStore store, Predicate<Tab> capturing) {
        mSelector = selector;
        mStore = store;
        mCapturing = capturing;
    }

    private static BlancTabState.Prefs prefs() {
        SharedPreferences prefs = ContextUtils.getAppSharedPreferences();
        return new BlancTabState.Prefs() {
            @Override
            public @Nullable String get(String key) {
                return prefs.getString(key, null);
            }

            @Override
            public void put(String key, @Nullable String value) {
                if (value == null) {
                    prefs.edit().remove(key).apply();
                } else {
                    prefs.edit().putString(key, value).apply();
                }
            }
        };
    }

    public void start() {
        boolean coldStart = !sStarted;
        sStarted = true;
        TabModelUtils.runOnTabStateInitialized(mSelector, selector -> {
            if (mDestroyed) return;
            BlancTabState.restore(mStore, prefs(), coldStart);
            mHandler.postDelayed(mSweep, QuietTabs.SWEEP_MILLIS);
        });
    }

    /** When the app goes to the background, which is before Android may end it. */
    public void save() {
        if (mSelector.isTabStateInitialized()) BlancTabState.save(mStore, prefs());
    }

    public void destroy() {
        mDestroyed = true;
        mHandler.removeCallbacks(mSweep);
    }

    private void sweep() {
        if (mDestroyed) return;
        TabModel model = mSelector.getModel(false);
        List<QuietTabs.Candidate> candidates = new ArrayList<>();
        List<Tab> tabs = new ArrayList<>();
        Tab active = model.index() < 0 ? null : model.getTabAt(model.index());
        for (int i = 0; i < model.getCount(); i++) {
            Tab tab = model.getTabAt(i);
            if (tab == null) continue;
            WebContents contents = tab.getWebContents();
            QuietTabs.Candidate c = new QuietTabs.Candidate(String.valueOf(tab.getId()));
            c.lastShownMillis = tab.getTimestampMillis();
            c.active = tab == active;
            c.loading = tab.isLoading();
            c.media = contents != null && MediaSession.fromWebContents(contents) != null
                    && MediaSession.fromWebContents(contents).isControllable();
            c.muted = contents != null && contents.isAudioMuted();
            c.pinned = tab.getIsPinned();
            c.capturing = mCapturing.test(tab);
            // Chromium's discard keeps the WebContents and frees its renderer, so Blanc remembers it.
            Long quietSince = mQuieted.get(tab.getId());
            if (quietSince != null && quietSince != tab.getTimestampMillis()) mQuieted.remove(tab.getId());
            c.frozen = tab.isFrozen() || contents == null || mQuieted.containsKey(tab.getId());
            c.needsUnload = contents != null && contents.needToFireBeforeUnloadOrUnloadEvents();
            candidates.add(c);
            tabs.add(tab);
        }
        long delay = ContextUtils.getAppSharedPreferences().getLong(QUIET_DELAY_PREF, QuietTabs.DELAY_MILLIS);
        List<String> quiet = QuietTabs.candidates(candidates, System.currentTimeMillis(), delay);
        for (Tab tab : tabs) {
            if (!quiet.contains(String.valueOf(tab.getId()))) continue;
            tab.discard();
            mQuieted.put(tab.getId(), tab.getTimestampMillis());
        }
        mHandler.postDelayed(mSweep, QuietTabs.SWEEP_MILLIS);
    }
}

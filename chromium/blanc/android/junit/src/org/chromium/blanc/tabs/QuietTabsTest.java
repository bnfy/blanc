// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.tabs;

import static org.junit.Assert.assertEquals;

import org.junit.Test;
import org.junit.runner.RunWith;

import org.chromium.base.test.BaseRobolectricTestRunner;

import java.util.List;

/** Which background tabs go quiet: desktop's rules (src/main/tab-sleep.js) on Chromium's signals. */
@RunWith(BaseRobolectricTestRunner.class)
public class QuietTabsTest {
    private static final long HOUR = 60 * 60 * 1000;
    private static final long NOW = 10 * HOUR;

    private static QuietTabs.Candidate idle(String id) {
        QuietTabs.Candidate c = new QuietTabs.Candidate(id);
        c.lastShownMillis = NOW - HOUR;
        return c;
    }

    @Test
    public void aBackgroundTabIdleForAnHourGoesQuiet() {
        QuietTabs.Candidate recent = idle("recent");
        recent.lastShownMillis = NOW - HOUR + 1;
        assertEquals(List.of("old"), QuietTabs.candidates(List.of(idle("old"), recent), NOW, QuietTabs.DELAY_MILLIS));
    }

    @Test
    public void tabsInUseNeverGoQuiet() {
        QuietTabs.Candidate active = idle("active");
        active.active = true;
        QuietTabs.Candidate loading = idle("loading");
        loading.loading = true;
        QuietTabs.Candidate media = idle("media");
        media.media = true;
        QuietTabs.Candidate muted = idle("muted");
        muted.muted = true;
        QuietTabs.Candidate pinned = idle("pinned");
        pinned.pinned = true;
        QuietTabs.Candidate capturing = idle("capturing");
        capturing.capturing = true;
        QuietTabs.Candidate unload = idle("unload");
        unload.needsUnload = true;
        QuietTabs.Candidate quiet = idle("quiet");
        quiet.frozen = true;
        assertEquals(List.of(), QuietTabs.candidates(
                List.of(active, loading, media, muted, pinned, capturing, unload, quiet), NOW, QuietTabs.DELAY_MILLIS));
    }

    @Test
    public void theSweepRunsEveryThirtySeconds() {
        assertEquals(30_000, QuietTabs.SWEEP_MILLIS);
        assertEquals(HOUR, QuietTabs.DELAY_MILLIS);
    }
}

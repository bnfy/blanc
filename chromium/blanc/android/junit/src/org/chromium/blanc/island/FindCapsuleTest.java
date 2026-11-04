// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.island;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;

import android.app.Activity;

import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.shadows.ShadowLooper;

import org.chromium.base.test.BaseRobolectricTestRunner;
import org.chromium.blanc.find.FindCapsule;

import java.util.ArrayList;
import java.util.List;

/** Find in page: desktop's capsule (find.*), over Chromium's find bridge. */
@RunWith(BaseRobolectricTestRunner.class)
public class FindCapsuleTest {
    private Activity mActivity;
    private final List<String> mCalls = new ArrayList<>();
    private final FindCapsule.Finder mFinder =
            new FindCapsule.Finder() {
                @Override
                public void find(String text, boolean forward) {
                    mCalls.add((forward ? "next " : "previous ") + text);
                }

                @Override
                public void stop() {
                    mCalls.add("stop");
                }
            };

    @Before
    public void setUp() {
        mActivity = Robolectric.buildActivity(Activity.class).setup().get();
    }

    private FindCapsule show() {
        FindCapsule capsule = FindCapsule.show(mActivity, mFinder);
        ShadowLooper.idleMainLooper();
        return capsule;
    }

    @Test
    public void typingFindsAsYouGo() {
        FindCapsule capsule = show();
        capsule.field().setText("dom");
        capsule.field().setText("");
        assertEquals(List.of("next dom", "stop"), mCalls);
    }

    @Test
    public void previousAndNextStepThroughTheMatches() {
        FindCapsule capsule = show();
        capsule.field().setText("dom");
        capsule.nextButton().performClick();
        capsule.previousButton().performClick();
        assertEquals(List.of("next dom", "next dom", "previous dom"), mCalls);
    }

    @Test
    public void theCountReadsLikeDesktops() {
        FindCapsule capsule = show();
        capsule.field().setText("dom");
        capsule.setResult(2, 5);
        assertEquals("2/5", capsule.count().getText().toString());
        capsule.setResult(0, 0);
        assertEquals("", capsule.count().getText().toString());
    }

    @Test
    public void backOrDoneClosesItAndClearsTheHighlight() {
        FindCapsule capsule = show();
        capsule.cancel();
        ShadowLooper.idleMainLooper();
        assertFalse(capsule.isShowing());
        assertEquals(List.of("stop"), mCalls);
        FindCapsule again = show();
        again.doneButton().performClick();
        ShadowLooper.idleMainLooper();
        assertEquals(List.of("stop", "stop"), mCalls);
    }

    @Test
    public void controlsHaveDesktopsLabels() {
        FindCapsule capsule = show();
        assertEquals("Find in page", capsule.field().getHint().toString());
        assertEquals("Previous match", capsule.previousButton().getContentDescription().toString());
        assertEquals("Next match", capsule.nextButton().getContentDescription().toString());
    }
}

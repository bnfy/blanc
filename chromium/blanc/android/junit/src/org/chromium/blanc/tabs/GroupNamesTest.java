// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.tabs;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;
import org.junit.runner.RunWith;

import org.chromium.base.test.BaseRobolectricTestRunner;

/** Group names as desktop's group-name-case.js and the iPhone's GroupNames treat them. */
@RunWith(BaseRobolectricTestRunner.class)
public class GroupNamesTest {
    @Test
    public void matchesDesktopOnEveryFixture() {
        assertTrue("the fixtures are all there", GroupNamesFixtures.ROWS.length > 300);
        for (String[] row : GroupNamesFixtures.ROWS) {
            assertEquals("normalize " + row[0], row[1], GroupNames.normalize(row[0]));
            assertEquals("key " + row[0], row[2], GroupNames.key(row[0]));
        }
    }

    @Test
    public void namesCompareWithoutCase() {
        assertTrue(GroupNames.same("Research", "research"));
        assertTrue(GroupNames.same(" Research", "RESEARCH "));
        assertFalse(GroupNames.same("Research", "Reading"));
        assertEquals(40, GroupNames.MAX_LENGTH);
        assertEquals(40, GroupNames.normalize("x".repeat(41)).length());
    }

    @Test
    public void colorsAreTheEightSpacePresets() {
        assertEquals(8, GroupColors.PRESETS.size());
        assertEquals("#426c4c", GroupColors.PRESETS.get("sage"));
        assertEquals("#3a3a3a", GroupColors.PRESETS.get("graphite"));
        assertEquals("#376694", GroupColors.sanitize(" #376694 "));
        assertEquals("#376694", GroupColors.sanitize("#376694".toUpperCase()));
        assertEquals(null, GroupColors.sanitize("#ffffff"));
        assertEquals(null, GroupColors.sanitize(null));
    }
}

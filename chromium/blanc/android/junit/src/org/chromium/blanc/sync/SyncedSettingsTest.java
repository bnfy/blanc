// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.sync;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.annotation.Config;

import org.chromium.base.test.BaseRobolectricTestRunner;

import java.util.Map;

@RunWith(BaseRobolectricTestRunner.class)
@Config(manifest = Config.NONE)
public class SyncedSettingsTest {
    private static final Map<String, String> DARK = Map.of("theme", "dark", "adblockEnabled", "true");
    private static final Map<String, String> LIGHT = Map.of("theme", "light", "adblockEnabled", "true");

    @Test
    public void aRemoteChangeApplies() {
        SyncedSettings.Plan plan = SyncedSettings.plan(LIGHT, DARK, LIGHT);
        assertEquals(Map.of("theme", "dark"), plan.apply);
        assertTrue(plan.publish.isEmpty());
    }

    @Test
    public void aLocalChangePublishes() {
        SyncedSettings.Plan plan = SyncedSettings.plan(DARK, LIGHT, LIGHT);
        assertEquals(Map.of("theme", "dark"), plan.publish);
        assertTrue(plan.apply.isEmpty());
    }

    @Test
    public void bothChangedLetsTheRunnerDecide() {
        SyncedSettings.Plan plan = SyncedSettings.plan(DARK, Map.of("theme", "system", "adblockEnabled", "true"), LIGHT);
        assertEquals(Map.of("theme", "system"), plan.apply);
        assertTrue(plan.publish.isEmpty());
    }

    @Test
    public void aValueThisPhoneCantShowIsLeftAlone() {
        SyncedSettings.Plan plan = SyncedSettings.plan(LIGHT, Map.of("theme", "sepia", "adblockEnabled", "true"), LIGHT);
        assertTrue(plan.apply.isEmpty());
        assertTrue(plan.publish.isEmpty());
    }

    @Test
    public void aKeyThisPhoneDoesntHaveIsLeftAlone() {
        SyncedSettings.Plan plan = SyncedSettings.plan(LIGHT, Map.of("theme", "light", "adblockEnabled", "true", "newtabLayout", "shelf"), LIGHT);
        assertTrue(plan.apply.isEmpty());
        assertTrue(plan.publish.isEmpty());
    }

    @Test
    public void nothingAgreedYetTakesTheRunners() {
        SyncedSettings.Plan plan = SyncedSettings.plan(LIGHT, DARK, Map.of());
        assertEquals(Map.of("theme", "dark"), plan.apply);
        assertTrue(plan.publish.isEmpty());
    }
}

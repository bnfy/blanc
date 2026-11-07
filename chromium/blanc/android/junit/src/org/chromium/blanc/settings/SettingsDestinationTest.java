// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.settings;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import org.junit.Test;
import org.junit.runner.RunWith;

import org.chromium.base.test.BaseRobolectricTestRunner;

/** SettingsDestination.resolve in SettingsSheet.swift, for the addresses a person can type or tap. */
@RunWith(BaseRobolectricTestRunner.class)
public class SettingsDestinationTest {
    @Test
    public void fragmentsPickTheSameDestinationsAsTheIphone() {
        assertEquals(SettingsDestination.SYNC, SettingsDestination.resolve("blanc://settings#sync"));
        assertEquals(SettingsDestination.SYNC, SettingsDestination.resolve("blanc://settings#group-sync"));
        assertEquals(SettingsDestination.PRIVACY, SettingsDestination.resolve("blanc://settings#privacy"));
        assertEquals(SettingsDestination.START_PAGE, SettingsDestination.resolve("blanc://settings#start-page"));
        assertEquals(SettingsDestination.START_PAGE, SettingsDestination.resolve("blanc://settings#startpage"));
        assertEquals(SettingsDestination.START_PAGE, SettingsDestination.resolve("blanc://settings#group-startpage"));
    }

    @Test
    public void schemeHostAndFragmentIgnoreCase() {
        assertEquals(SettingsDestination.PRIVACY, SettingsDestination.resolve("BLANC://Settings#Group-Privacy"));
    }

    @Test
    public void noFragmentOrAnUnknownOneIsTheRoot() {
        assertEquals(SettingsDestination.ROOT, SettingsDestination.resolve("blanc://settings"));
        assertEquals(SettingsDestination.ROOT, SettingsDestination.resolve("blanc://settings/"));
        assertEquals(SettingsDestination.ROOT, SettingsDestination.resolve("blanc://settings#nonsense"));
    }

    @Test
    public void anythingElseIsNotSettings() {
        assertNull(SettingsDestination.resolve("https://settings"));
        assertNull(SettingsDestination.resolve("blanc://history"));
        assertNull(SettingsDestination.resolve("blanc://settings.evil.example/"));
        assertNull(SettingsDestination.resolve(""));
    }
}

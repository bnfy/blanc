// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.tabs;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

import org.chromium.base.test.BaseRobolectricTestRunner;

import java.util.HashMap;
import java.util.Map;

/** What Blanc keeps across a restart that Chromium doesn't (A2 spike): the active tab and mute. */
@RunWith(BaseRobolectricTestRunner.class)
public class BlancTabStateTest {
    private FakeTabStore mStore;
    private final Map<String, String> mPrefs = new HashMap<>();
    private final BlancTabState.Prefs mPrefsApi =
            new BlancTabState.Prefs() {
                @Override
                public String get(String key) {
                    return mPrefs.get(key);
                }

                @Override
                public void put(String key, String value) {
                    if (value == null) mPrefs.remove(key); else mPrefs.put(key, value);
                }
            };
    private String mA;
    private String mB;
    private String mC;

    @Before
    public void setUp() {
        mStore = new FakeTabStore();
        mA = mStore.create("https://a.example/", false, null, -1);
        mB = mStore.create("https://b.example/", false, null, -1);
        mC = mStore.create("https://c.example/", false, null, -1);
    }

    @Test
    public void theActiveTabAndMuteComeBack() {
        mStore.select(mB);
        mStore.setMuted(mC, true);
        BlancTabState.save(mStore, mPrefsApi);
        // Chromium selects the first tab and forgets mute.
        mStore.select(mA);
        mStore.setMuted(mC, false);
        BlancTabState.restore(mStore, mPrefsApi, false);
        assertEquals(mB, mStore.activeId(false));
        assertTrue(mStore.tabs(false).get(2).muted);
    }

    @Test
    public void privateTabsCloseOnAColdStartOnly() {
        mStore.create("https://p.example/", true, null, -1);
        BlancTabState.restore(mStore, mPrefsApi, false);
        assertEquals(1, mStore.tabs(true).size());
        BlancTabState.restore(mStore, mPrefsApi, true);
        assertTrue(mStore.tabs(true).isEmpty());
        assertFalse(mStore.privateSelected());
    }

    @Test
    public void stateForTabsThatAreGoneIsDropped() {
        mStore.select(mB);
        mStore.setMuted(mC, true);
        BlancTabState.save(mStore, mPrefsApi);
        mStore.close(mB, false);
        mStore.close(mC, false);
        BlancTabState.restore(mStore, mPrefsApi, true);
        assertEquals(mA, mStore.activeId(false));
        BlancTabState.save(mStore, mPrefsApi);
        assertNull(mPrefs.get(BlancTabState.MUTED));
    }
}

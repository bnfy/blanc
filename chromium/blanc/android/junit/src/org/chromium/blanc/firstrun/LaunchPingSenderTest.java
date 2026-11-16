// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.firstrun;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.json.JSONObject;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;
import org.junit.runner.RunWith;

import org.chromium.base.test.BaseRobolectricTestRunner;

import java.io.File;
import java.util.ArrayList;
import java.util.List;
import java.util.Random;

/** One ping per process, only after a saved yes; no install id before the first send. */
@RunWith(BaseRobolectricTestRunner.class)
public class LaunchPingSenderTest {
    private static final String HOST = "http://127.0.0.1:8123/";

    @Rule public TemporaryFolder mFolder = new TemporaryFolder();
    private final List<String[]> mSent = new ArrayList<>();

    private LaunchPingSender sender(File dir, boolean testLaunch) {
        return new LaunchPingSender((url, json) -> mSent.add(new String[] {url, json}), dir,
                new LaunchPingSender.Device(testLaunch, HOST, "0.1.0-test", "x86_64", "16", 411), new Random(1));
    }

    @Test
    public void nothingLeavesBeforeASavedYesAndNoIdIsMade() throws Exception {
        File dir = mFolder.newFolder();
        LaunchPingSender sender = sender(dir, true);
        assertFalse(sender.sendIfAllowed(null));
        assertFalse(sender.sendIfAllowed(false));
        assertTrue(mSent.isEmpty());
        assertFalse(new File(dir, LaunchPing.INSTALL_FILE).exists());
    }

    @Test
    public void aSavedYesSendsOnceThisProcess() throws Exception {
        File dir = mFolder.newFolder();
        LaunchPingSender sender = sender(dir, true);
        assertTrue(sender.sendIfAllowed(true));
        assertFalse(sender.sendIfAllowed(true));
        assertEquals(1, mSent.size());
        assertEquals("http://127.0.0.1:8123/ping", mSent.get(0)[0]);
        JSONObject body = new JSONObject(mSent.get(0)[1]);
        assertEquals("android", body.getString("platform"));
        assertEquals("x64", body.getString("arch"));
        assertEquals("0.1.0-test", body.getString("version"));
        assertEquals(LaunchPing.installId(dir), body.getString("installId"));
    }

    @Test
    public void theNextProcessSendsAgainWithTheSameInstallAndANewSession() throws Exception {
        File dir = mFolder.newFolder();
        sender(dir, true).sendIfAllowed(true);
        new LaunchPingSender((url, json) -> mSent.add(new String[] {url, json}), dir,
                new LaunchPingSender.Device(true, HOST, "0.1.0-test", "x86_64", "16", 411), new Random(2))
                .sendIfAllowed(true);
        JSONObject first = new JSONObject(mSent.get(0)[1]);
        JSONObject second = new JSONObject(mSent.get(1)[1]);
        assertEquals(first.getString("installId"), second.getString("installId"));
        assertFalse(first.getInt("sessionId") == second.getInt("sessionId"));
    }

    @Test
    public void aBuildWithoutAReleaseVersionNeverSendsOutsideATest() throws Exception {
        File dir = mFolder.newFolder();
        assertFalse(sender(dir, false).sendIfAllowed(true));
        assertTrue(mSent.isEmpty());
        assertFalse(new File(dir, LaunchPing.INSTALL_FILE).exists());
    }
}

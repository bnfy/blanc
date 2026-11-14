// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.firstrun;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.json.JSONObject;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;
import org.junit.runner.RunWith;

import org.chromium.base.test.BaseRobolectricTestRunner;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.Random;

/** The launch ping's rules: desktop's shape, the iPhone's consent, the desktop fork's preview rule. */
@RunWith(BaseRobolectricTestRunner.class)
public class LaunchPingTest {
    @Rule public TemporaryFolder mFolder = new TemporaryFolder();

    @Test
    public void onlyASavedYesSendsAndOnlyOnce() {
        assertTrue(LaunchPing.shouldSend(true, false));
        assertFalse(LaunchPing.shouldSend(true, true));
        assertFalse(LaunchPing.shouldSend(false, false));
        assertFalse(LaunchPing.shouldSend(null, false));
    }

    @Test
    public void aPreviewWithNoReleaseVersionSendsNowhere() {
        assertNull(LaunchPing.RELEASE_VERSION);
        assertNull(LaunchPing.endpoint(false, null));
        assertNull(LaunchPing.version(false, null));
    }

    @Test
    public void aTestLaunchSendsOnlyToTheLoopbackCollectorItNames() {
        assertEquals("http://127.0.0.1:8123/ping", LaunchPing.endpoint(true, "http://127.0.0.1:8123/"));
        assertEquals("http://[::1]:8123/ping", LaunchPing.endpoint(true, "http://[::1]:8123/"));
        for (String host : new String[] {"https://127.0.0.1:8123/", "http://10.0.2.2:8123/", "http://127.0.0.1/",
                     "http://127.0.0.1:8123", "http://127.0.0.1:8123/x", "http://127.0.0.1:99999/",
                     "http://user@127.0.0.1:8123/", "https://blanc-ping.bnfy-441.workers.dev/"}) {
            assertNull(host, LaunchPing.endpoint(true, host));
        }
        assertNull("no host never falls back to production", LaunchPing.endpoint(true, null));
    }

    @Test
    public void theVersionIsOneTheWorkerTakes() {
        assertEquals("1.0.0", LaunchPing.version(true, "1.0.0"));
        assertEquals("0.1.0-test", LaunchPing.version(true, "0.1.0-test"));
        assertNull(LaunchPing.version(true, "156.0.8078.79"));
        assertNull(LaunchPing.version(true, null));
    }

    @Test
    public void architectureOsMajorAndDeviceAreCoarse() {
        assertEquals("arm64", LaunchPing.arch("arm64-v8a"));
        assertEquals("x64", LaunchPing.arch("x86_64"));
        assertNull(LaunchPing.arch("armeabi-v7a"));
        assertEquals("16", LaunchPing.osMajor("16"));
        assertEquals("16", LaunchPing.osMajor("16.1"));
        assertEquals("unknown", LaunchPing.osMajor("Baklava"));
        assertEquals("phone", LaunchPing.device(411));
        assertEquals("tablet", LaunchPing.device(600));
    }

    @Test
    public void theBodyIsDesktopsShapeForAndroid() throws Exception {
        JSONObject body = LaunchPing.body("01234567-89ab-4cde-8f01-23456789abcd", 42, "1.0.0", "arm64", "16", "phone");
        assertEquals(7, body.length());
        assertEquals("android", body.getString("platform"));
        assertEquals(42, body.getInt("sessionId"));
        assertEquals("16", body.getString("osVersion"));
    }

    @Test
    public void sessionIdsArePositive31BitNumbers() {
        Random random = new Random(7);
        for (int i = 0; i < 1000; i++) {
            int id = LaunchPing.sessionId(random);
            assertTrue(id >= 1 && id <= Integer.MAX_VALUE);
        }
    }

    @Test
    public void theInstallIdIsKeptAndADamagedOneReplaced() throws Exception {
        File dir = mFolder.newFolder();
        String id = LaunchPing.installId(dir);
        assertEquals(36, id.length());
        assertEquals(id, LaunchPing.installId(dir));
        Files.write(new File(dir, LaunchPing.INSTALL_FILE).toPath(), "nonsense".getBytes(StandardCharsets.UTF_8));
        String fresh = LaunchPing.installId(dir);
        assertFalse(fresh.equals(id));
        assertEquals(fresh, LaunchPing.installId(dir));
    }
}

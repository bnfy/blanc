// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.sync;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.json.JSONArray;
import org.json.JSONException;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.annotation.Config;

import org.chromium.base.test.BaseRobolectricTestRunner;
import org.chromium.blanc.tabs.TabStore;

import java.util.List;

@RunWith(BaseRobolectricTestRunner.class)
@Config(manifest = Config.NONE)
public class OtherDevicesTest {
    @Test
    public void aDeviceListsItsWebTabsAndAnEmptyOneIsLeftOut() throws JSONException {
        List<OtherDevices.Device> devices = OtherDevices.parseDevices(
                "[{\"name\":\"Mac\",\"tabs\":[{\"url\":\"https://a.example/\",\"title\":\"A\"},{\"url\":\"file:///etc\",\"title\":\"F\"}]},"
                + "{\"name\":\"Empty\",\"tabs\":[]}]");
        assertEquals(1, devices.size());
        assertEquals("Mac", devices.get(0).name);
        assertEquals(1, devices.get(0).tabs.size());
    }

    @Test
    public void aSentPageThatIsntAWebPageIsLeftOut() throws JSONException {
        List<OtherDevices.Sent> sent = OtherDevices.parseSent(
                "[{\"id\":\"1\",\"url\":\"https://a.example/\",\"title\":\"A\",\"fromName\":\"Mac\",\"sentAt\":5},"
                + "{\"id\":\"2\",\"url\":\"javascript:alert(1)\",\"title\":\"B\",\"fromName\":\"Mac\",\"sentAt\":6}]");
        assertEquals(1, sent.size());
        assertEquals("Mac", sent.get(0).from);
    }

    @Test
    public void privateTabsNeverReachTheSnapshot() throws JSONException {
        String args = SyncedTabs.arguments(List.of(
                new TabStore.Entry("1", "https://a.example/", "A", "g", true, false, false),
                new TabStore.Entry("2", "https://secret.example/", "S", null, false, false, true)),
                List.of(new TabStore.Group("g", "Work", null, false)));
        assertFalse(args, args.contains("secret"));
        JSONArray parsed = new JSONArray(args);
        assertEquals(1, parsed.getJSONArray(0).length());
        assertTrue(parsed.getJSONArray(0).getJSONObject(0).getBoolean("pinned"));
        assertEquals("Work", parsed.getJSONArray(1).getJSONObject(0).getString("name"));
    }
}

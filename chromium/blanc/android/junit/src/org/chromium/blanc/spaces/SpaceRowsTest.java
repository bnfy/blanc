// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.spaces;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.annotation.Config;

import org.chromium.base.test.BaseRobolectricTestRunner;
import org.chromium.blanc.spaces.BlancSpaces.SavedGroup;
import org.chromium.blanc.spaces.BlancSpaces.SavedSet;
import org.chromium.blanc.spaces.BlancSpaces.SavedTab;
import org.chromium.blanc.spaces.BlancSpaces.Space;

@RunWith(BaseRobolectricTestRunner.class)
@Config(manifest = Config.NONE)
public class SpaceRowsTest {
    private static final String SHARED = "a".repeat(32);
    private static final String GROUP = "b".repeat(32);

    private final BlancSpaces mLibrary = new BlancSpaces();
    private Space mSpace;

    @Before
    public void setUp() {
        mLibrary.create("Work", BlancSpaces.COLORS[0], BlancSpaces.SYMBOLS[0]);
        mSpace = mLibrary.lastCreated;
        mSpace.set.tabs.add(new SavedTab("7", "https://a.example/", "A", true, "token"));
        mSpace.set.groups.add(new SavedGroup("token", "Reading", null, false));
    }

    @Test
    public void aSetBecomesWorkspaceColumns() throws JSONException {
        JSONObject columns = SpaceRows.columns(mSpace.set);
        assertEquals("https://a.example/", columns.getJSONArray("urls").getString(0));
        assertTrue(columns.getJSONArray("tabIds").isNull(0));
        assertEquals("7", columns.getJSONArray("localIds").getString(0));
        assertTrue(columns.getJSONArray("pinned").getBoolean(0));
        assertEquals("token", columns.getJSONArray("groupIds").getString(0));
        assertEquals(1, columns.getInt("documentPolicy"));
        assertFalse(columns.getJSONArray("inheritsDocumentPolicy").getBoolean(0));
    }

    @Test
    public void aBoundGroupGoesOutUnderItsRecord() throws JSONException {
        mSpace.set.groups.get(0).sharedId = GROUP;
        JSONObject columns = SpaceRows.columns(mSpace.set);
        assertEquals(GROUP, columns.getJSONArray("groups").getJSONObject(0).getString("id"));
        assertEquals(GROUP, columns.getJSONArray("groupIds").getString(0));
    }

    private JSONArray rows() throws JSONException {
        return SpaceRows.rows(mLibrary, new SavedSet());
    }

    @Test
    public void aSharedHiddenSpaceKeepsItsChromiumTab() throws JSONException {
        JSONArray rows = rows();
        JSONObject row = rows.getJSONObject(0);
        row.put("sharedId", SHARED).put("sharedLink", "active");
        row.put("tabIds", new JSONArray().put("c".repeat(32)));
        assertNull(SpaceRows.absorb(mLibrary, rows, new SavedSet(), 0));
        SavedTab tab = mSpace.set.tabs.get(0);
        assertEquals("7", tab.id);
        assertEquals("c".repeat(32), tab.sharedId);
        assertEquals(SHARED, mSpace.sharedId);
    }

    @Test
    public void aRemoteTabInAHiddenSpaceHasNoChromiumTabYet() throws JSONException {
        JSONArray rows = rows();
        JSONObject row = rows.getJSONObject(0);
        row.getJSONArray("urls").put("https://new.example/");
        row.getJSONArray("tabIds").put("d".repeat(32));
        row.getJSONArray("meta").put(new JSONObject().put("title", "New"));
        row.getJSONArray("pinned").put(false);
        row.getJSONArray("groupIds").put(JSONObject.NULL);
        SpaceRows.absorb(mLibrary, rows, new SavedSet(), 0);
        SavedTab tab = mSpace.set.tabs.get(1);
        assertEquals("r" + "d".repeat(32), tab.id);
        assertEquals("New", tab.title);
    }

    @Test
    public void aDroppedHiddenSpaceGoesToRecentlyDeleted() throws JSONException {
        SpaceRows.absorb(mLibrary, new JSONArray(), new SavedSet(), 5);
        assertTrue(mLibrary.spaces.isEmpty());
        assertEquals(1, mLibrary.deleted.size());
    }

    @Test
    public void aDroppedShownSpaceIsLeftForTheCaller() throws JSONException {
        mLibrary.shownId = mSpace.id;
        assertEquals(mSpace.id, SpaceRows.absorb(mLibrary, new JSONArray(), new SavedSet(), 5));
        assertNotNull(mLibrary.space(mSpace.id));
    }

    @Test
    public void theShownSpaceTakesOnlyRecordIds() throws JSONException {
        mLibrary.shownId = mSpace.id;
        SavedSet shown = new SavedSet();
        shown.tabs.add(new SavedTab("9", "https://live.example/", "", false, null));
        shown.groups.add(new SavedGroup("token", "Reading", null, false));
        JSONArray rows = SpaceRows.rows(mLibrary, shown);
        rows.getJSONObject(0).put("tabIds", new JSONArray().put(SHARED));
        rows.getJSONObject(0).getJSONArray("groups").getJSONObject(0).put("id", GROUP);
        SpaceRows.absorb(mLibrary, rows, shown, 0);
        assertEquals(SHARED, mLibrary.tabBindings.get("9"));
        assertEquals(GROUP, mLibrary.groupBindings.get("token"));
        assertEquals("7", mSpace.set.tabs.get(0).id);
    }

    @Test
    public void bindingsAndLinksSurviveARestart() throws JSONException {
        mSpace.sharedId = SHARED;
        mSpace.sharedLink = "active";
        mSpace.set.tabs.get(0).sharedId = "c".repeat(32);
        mLibrary.tabBindings.put("9", SHARED);
        BlancSpaces back = BlancSpaces.read(mLibrary.toJson());
        assertEquals(SHARED, back.tabBindings.get("9"));
        assertEquals("active", back.spaces.get(0).sharedLink);
        assertEquals("c".repeat(32), back.spaces.get(0).set.tabs.get(0).sharedId);
    }

    @Test
    public void aTabPastTheBudgetIsMarkedOnlyInTheSharedSpaceOnShow() throws JSONException {
        mSpace.sharedId = SHARED;
        mSpace.sharedLink = "active";
        mLibrary.tabBindings.put("7", "c".repeat(32));
        mLibrary.tabBindings.put("8", "d".repeat(32));
        JSONObject each = new JSONObject().put(mSpace.id,
                new JSONObject().put("unsyncedTabIds", new JSONArray().put("d".repeat(32))));
        mLibrary.shownId = mSpace.id;
        assertEquals(java.util.Set.of("8"), SpaceRows.unsynced(mLibrary, each));
        mSpace.sharedLink = "dormant";
        assertTrue(SpaceRows.unsynced(mLibrary, each).isEmpty());
        mSpace.sharedLink = "active";
        mLibrary.shownId = null;
        assertTrue(SpaceRows.unsynced(mLibrary, each).isEmpty());
    }
}

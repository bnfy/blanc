// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.spaces;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.annotation.Config;

import org.chromium.base.test.BaseRobolectricTestRunner;
import org.chromium.blanc.tabs.FakeTabStore;
import org.chromium.blanc.tabs.TabStore;

import java.util.ArrayList;
import java.util.List;

@RunWith(BaseRobolectricTestRunner.class)
@Config(manifest = Config.NONE)
public class SharedRowsTest {
    private static final String TAB = "a".repeat(32);
    private static final String OTHER = "b".repeat(32);
    private static final String GROUP = "c".repeat(32);

    private final BlancSpaces mLibrary = new BlancSpaces();
    private final FakeTabStore mStore = new FakeTabStore();
    private final List<String> mClosed = new ArrayList<>();
    private SharedRows mRows;
    private String mBound;

    @Before
    public void setUp() {
        mRows = new SharedRows(mLibrary, mStore, row -> mClosed.add(row.optString("id")));
        mBound = mStore.create("https://one.example/", false, null, -1);
        mLibrary.tabBindings.put(mBound, TAB);
    }

    private static JSONObject field(Object value) throws JSONException {
        return new JSONObject().put("v", value).put("c", 1).put("by", "d");
    }

    private static JSONObject create(String id, String url, Object group) throws JSONException {
        JSONObject nav = new JSONObject().put("url", url).put("title", "T");
        JSONObject record = new JSONObject().put("nav", field(nav)).put("pinned", field(false)).put("groupId", field(group));
        return new JSONObject().put("op", "create").put("kind", "tabs").put("id", id).put("record", record);
    }

    @Test
    public void aNewRemoteTabStaysQuietAndIsBound() throws JSONException {
        assertTrue(mRows.apply(create(OTHER, "https://two.example/", JSONObject.NULL)));
        assertEquals(2, mStore.tabs(false).size());
        String made = mStore.tabs(false).get(1).id;
        assertTrue(mStore.quiet.contains(made));
        assertEquals(OTHER, mLibrary.tabBindings.get(made));
    }

    @Test
    public void aCreateForATabHereNeverDoublesIt() throws JSONException {
        assertTrue(mRows.apply(create(TAB, "https://one.example/", JSONObject.NULL)));
        assertEquals(1, mStore.tabs(false).size());
    }

    @Test
    public void aNewTabInAGroupThisPhoneLacksMakesTheGroup() throws JSONException {
        JSONObject row = create(OTHER, "https://two.example/", GROUP);
        row.put("group", new JSONObject().put("name", field("Reading")).put("color", field("#376694")));
        assertTrue(mRows.apply(row));
        TabStore.Group group = mStore.groups().get(0);
        assertEquals("Reading", group.name);
        assertEquals("#376694", group.color);
        assertEquals(GROUP, mLibrary.groupBindings.get(group.id));
    }

    @Test
    public void aRemoteCloseGoesToRecentlyClosedAndLeavesATab() throws JSONException {
        assertTrue(mRows.apply(new JSONObject().put("op", "close").put("kind", "tabs").put("id", TAB).put("field", "deleted")));
        assertEquals(List.of(TAB), mClosed);
        assertEquals(1, mStore.tabs(false).size());
        assertEquals(TabStore.START_PAGE, mStore.tabs(false).get(0).url);
        assertFalse(mLibrary.tabBindings.containsKey(mBound));
    }

    @Test
    public void aRowForATabNoLongerHereIsDone() throws JSONException {
        assertTrue(mRows.apply(new JSONObject().put("op", "close").put("kind", "tabs").put("id", OTHER)));
        assertTrue(mClosed.isEmpty());
    }

    @Test
    public void aNavigationFollows() throws JSONException {
        JSONObject nav = new JSONObject().put("url", "https://moved.example/").put("title", "M");
        assertTrue(mRows.apply(new JSONObject().put("op", "nav").put("kind", "tabs").put("id", TAB).put("field", "nav")
                .put("value", field(nav))));
        assertEquals("https://moved.example/", mStore.tabs(false).get(0).url);
    }

    @Test
    public void aRenameAndAColorReachTheLiveGroup() throws JSONException {
        String local = mStore.createGroup(mBound, "Old");
        mLibrary.groupBindings.put(local, GROUP);
        mRows.apply(new JSONObject().put("op", "field").put("kind", "groups").put("id", GROUP).put("field", "name").put("value", field("New")));
        mRows.apply(new JSONObject().put("op", "field").put("kind", "groups").put("id", GROUP).put("field", "color").put("value", field("#6757a3")));
        assertEquals("New", mStore.groups().get(0).name);
        assertEquals("#6757a3", mStore.groups().get(0).color);
    }

    @Test
    public void aDeletedGroupLeavesItsTabs() throws JSONException {
        String local = mStore.createGroup(mBound, "Old");
        mLibrary.groupBindings.put(local, GROUP);
        mRows.apply(new JSONObject().put("op", "delete-group").put("kind", "groups").put("id", GROUP));
        assertEquals(1, mStore.tabs(false).size());
        assertTrue(mStore.groups().isEmpty());
    }

    @Test
    public void layoutPutsBoundTabsInTheRecordsOrder() throws JSONException {
        String second = mStore.create("https://two.example/", false, null, -1);
        mLibrary.tabBindings.put(second, OTHER);
        mRows.layout(new JSONObject().put("order", new JSONArray().put(OTHER).put(TAB)));
        assertEquals(second, mStore.tabs(false).get(0).id);
    }

    private static JSONObject onTab(String op, String field, Object value) throws JSONException {
        JSONObject row = new JSONObject().put("op", op).put("kind", "tabs").put("id", TAB);
        if (field != null) row.put("field", field).put("value", field(value));
        return row;
    }

    @Test
    public void theTabOnScreenIsNeverClosedOrMovedFromUnderThePerson() throws JSONException {
        String other = mStore.create("https://other.example/", false, null, -1);
        mStore.select(mBound);
        assertFalse(mRows.apply(onTab("close", null, null)));
        assertFalse(mRows.apply(onTab("update", "nav", new JSONObject().put("url", "https://next.example/").put("title", ""))));
        assertEquals("https://one.example/", mStore.tabs(false).get(0).url);
        mStore.select(other);
        assertTrue(mRows.apply(onTab("close", null, null)));
        assertEquals(1, mStore.tabs(false).size());
    }

    @Test
    public void aRecordBoundTwiceFindsTheTabStillOpen() throws JSONException {
        mStore.create("https://other.example/", false, null, -1);
        mLibrary.tabBindings.clear();
        mLibrary.tabBindings.put("gone", TAB);
        mLibrary.tabBindings.put(mBound, TAB);
        String other = mStore.tabs(false).get(1).id;
        mStore.select(other);
        assertTrue(mRows.apply(onTab("close", null, null)));
        assertEquals(1, mStore.tabs(false).size());
        assertEquals(other, mStore.tabs(false).get(0).id);
    }
}

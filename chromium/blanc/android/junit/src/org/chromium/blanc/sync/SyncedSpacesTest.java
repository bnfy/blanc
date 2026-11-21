// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.sync;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.annotation.Config;
import org.robolectric.shadows.ShadowLooper;

import org.chromium.base.Callback;
import org.chromium.base.test.BaseRobolectricTestRunner;
import org.chromium.blanc.spaces.BlancSpaces;
import org.chromium.blanc.spaces.SpaceSwitcher;
import org.chromium.blanc.spaces.SpacesController;

import java.lang.reflect.Proxy;
import java.util.ArrayList;
import java.util.List;

@RunWith(BaseRobolectricTestRunner.class)
@Config(manifest = Config.NONE)
public class SyncedSpacesTest {
    private static final class Call {
        final String method;
        final String args;
        final Callback<String> done;

        Call(String method, String args, Callback<String> done) {
            this.method = method;
            this.args = args;
            this.done = done;
        }
    }

    private final List<Call> mCalls = new ArrayList<>();
    private final BlancSpaces mLibrary = new BlancSpaces();
    private SpacesController mSpaces;
    private String mWork;

    private static SpaceSwitcher.Tabs tabs() {
        return (SpaceSwitcher.Tabs) Proxy.newProxyInstance(SpaceSwitcher.Tabs.class.getClassLoader(),
                new Class<?>[] {SpaceSwitcher.Tabs.class}, (proxy, method, args) -> {
                    Class<?> type = method.getReturnType();
                    if (type == List.class) return List.of();
                    if (type == String.class) return "";
                    return type == boolean.class ? Boolean.TRUE : null;
                });
    }

    @Before
    public void setUp() {
        SyncedSpaces.useBridge(new SyncedSpaces.Bridge() {
            @Override
            public boolean on() {
                return true;
            }

            @Override
            public void call(String method, String args, Callback<String> done) {
                if (method.equals("spaces.status")) done.onResult("{\"ok\":true,\"value\":{}}");
                else if (method.equals("spaces.remote")) done.onResult("{\"ok\":true,\"value\":[]}");
                else mCalls.add(new Call(method, args, done));
            }
        });
        SyncedSpaces.start();
        mLibrary.create("Work", BlancSpaces.COLORS[0], BlancSpaces.SYMBOLS[0]);
        mWork = mLibrary.lastCreated.id;
        mSpaces = new SpacesController(mLibrary, tabs());
        SpacesController.setCurrent(mSpaces);
    }

    @After
    public void tearDown() {
        SpacesController.setHook(null);
        SpacesController.setCurrent(null);
        SyncedSpaces.useBridge(null);
    }

    private static void answer(Call call, String value) {
        call.done.onResult("{\"ok\":true,\"value\":" + value + "}");
    }

    private Call last() {
        return mCalls.get(mCalls.size() - 1);
    }

    private void settle() {
        while (!mCalls.isEmpty() && last().method.matches("spaces\\.(push|prepare)")) {
            Call call = last();
            mCalls.clear();
            answer(call, "{\"revision\":0}");
        }
    }

    @Test
    public void aSecondPushWaitsForTheFirst() {
        SyncedSpaces.push();
        SyncedSpaces.push();
        assertEquals(1, mCalls.size());
        answer(mCalls.get(0), "{\"revision\":0}");
        assertEquals(2, mCalls.size());
    }

    @Test
    public void aSwitchWaitsForTheRunnerAndTakesWhatItBoundFirst() throws JSONException {
        mLibrary.tabBindings.clear();
        mSpaces.show(mWork);
        assertEquals("spaces.prepare", last().method);
        assertNull(mLibrary.shownId);
        JSONObject bindings = new JSONObject().put("localIds", new JSONArray().put("7"))
                .put("tabIds", new JSONArray().put("a".repeat(32)));
        answer(last(), new JSONObject().put("bindings", bindings).toString());
        assertEquals(mWork, mLibrary.shownId);
    }

    @Test
    public void aBusyRunnerIsAskedAgain() {
        SyncedSpaces.push();
        answer(mCalls.get(0), "{\"busy\":true}");
        assertEquals(1, mCalls.size());
        ShadowLooper.runUiThreadTasksIncludingDelayedTasks();
        assertEquals(2, mCalls.size());
    }

    @Test
    public void aRunnerThatNeverAnswersCantStopASwitch() {
        mSpaces.show(mWork);
        assertNull(mLibrary.shownId);
        ShadowLooper.runUiThreadTasksIncludingDelayedTasks();
        assertEquals(mWork, mLibrary.shownId);
    }

    @Test
    public void undoSaysSoUntilThePushIsTaken() throws JSONException {
        mSpaces.delete(mWork, 1);
        settle();
        mSpaces.restore(mWork);
        assertTrue(last().args.contains(mWork));
        assertEquals(mWork, new JSONArray(last().args).getJSONObject(0).getString("restoring"));
        answer(last(), "{\"stale\":true,\"revision\":1,\"rows\":"
                + new JSONArray(last().args).getJSONObject(0).getJSONArray("rows") + "}");
        assertEquals(mWork, new JSONArray(last().args).getJSONObject(0).getString("restoring"));
        answer(last(), "{\"revision\":1}");
        SyncedSpaces.push();
        assertTrue(new JSONArray(last().args).getJSONObject(0).isNull("restoring"));
        assertFalse(mLibrary.spaces.isEmpty());
    }
}

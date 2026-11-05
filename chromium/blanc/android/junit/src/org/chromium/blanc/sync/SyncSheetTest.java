// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.sync;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.app.Activity;
import android.app.Dialog;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.EditText;
import android.widget.TextView;

import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.annotation.Config;
import org.robolectric.shadows.ShadowDialog;

import org.chromium.base.Callback;
import org.chromium.base.test.BaseRobolectricTestRunner;
import org.chromium.blanc.island.R;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RunWith(BaseRobolectricTestRunner.class)
@Config(manifest = Config.NONE)
public class SyncSheetTest {
    private final Map<String, String> mReplies = new HashMap<>();
    private final List<String> mCalls = new ArrayList<>();
    private Activity mActivity;
    private String mScanned;

    private void reply(String method, String value) {
        mReplies.put(method, "{\"ok\":true,\"value\":" + value + "}");
    }

    private void call(String method, String args, Callback<String> done) {
        mCalls.add(method + " " + args);
        done.onResult(mReplies.getOrDefault(method, "{\"ok\":true,\"value\":{\"ok\":true}}"));
    }

    @Before
    public void setUp() {
        mActivity = Robolectric.buildActivity(Activity.class).setup().get();
        reply("sync.status", "{\"enabled\":false}");
    }

    private final SyncSheet.Runner mRunner = new SyncSheet.Runner() {
        @Override
        public void call(String method, String args, Callback<String> done) {
            SyncSheetTest.this.call(method, args, done);
        }

        @Override
        public boolean keyLost() {
            return mKeyLost;
        }
    };
    private boolean mKeyLost = true;

    private void open() {
        new SyncSheet(mActivity, mRunner, done -> done.onResult(mScanned)).show();
    }

    private void collect(View view, List<View> out) {
        out.add(view);
        if (view instanceof ViewGroup group) {
            for (int i = 0; i < group.getChildCount(); i++) collect(group.getChildAt(i), out);
        }
    }

    private List<View> views() {
        Dialog dialog = ShadowDialog.getLatestDialog();
        List<View> out = new ArrayList<>();
        collect(dialog.getWindow().getDecorView(), out);
        return out;
    }

    private Button button(int id) {
        String label = mActivity.getString(id);
        for (View view : views()) {
            if (view instanceof Button b && label.contentEquals(b.getText())) return b;
        }
        return null;
    }

    private boolean shows(int id) {
        String label = mActivity.getString(id);
        for (View view : views()) {
            if (view instanceof TextView t && label.contentEquals(t.getText())) return true;
        }
        return false;
    }

    private EditText field(int hint) {
        String label = mActivity.getString(hint);
        for (View view : views()) {
            if (view instanceof EditText e && label.contentEquals(e.getHint())) return e;
        }
        return null;
    }

    @Test
    public void offOffersPairingFirst() {
        open();
        
        assertNotNull(button(R.string.blanc_ios_settings_pair_with_blanc));
        assertNotNull(button(R.string.blanc_ios_settings_other_ways));
        assertEquals(null, field(R.string.blanc_ios_settings_pairing_code));
    }

    @Test
    public void aTypedCodeJoinsWithWhatWasTyped() {
        open();
        button(R.string.blanc_ios_settings_other_ways).performClick();
        field(R.string.blanc_ios_settings_pairing_code).setText("k7mr-4px2");
        button(R.string.blanc_settings_sync_switch_connect).performClick();
        assertTrue(mCalls.toString(), mCalls.contains("sync.joinWithCode [\"k7mr-4px2\"]"));
    }

    @Test
    public void aRefusedCodeSaysWhyAndKeepsTheField() {
        reply("sync.joinWithCode", "{\"ok\":false,\"error\":\"pair-not-found\"}");
        open();
        button(R.string.blanc_ios_settings_other_ways).performClick();
        field(R.string.blanc_ios_settings_pairing_code).setText("K7MR4PX2");
        button(R.string.blanc_settings_sync_switch_connect).performClick();
        assertTrue(shows(R.string.blanc_sync_error_pair_not_found));
        assertEquals("K7MR4PX2", field(R.string.blanc_ios_settings_pairing_code).getText().toString());
    }

    @Test
    public void aScannedCodeJoinsAndNoScanShowsTheField() {
        mScanned = "K7MR4PX2";
        open();
        button(R.string.blanc_ios_settings_pair_with_blanc).performClick();
        assertTrue(mCalls.contains("sync.joinWithCode [\"K7MR4PX2\"]"));
        mCalls.clear();
        mScanned = null;
        open();
        button(R.string.blanc_ios_settings_pair_with_blanc).performClick();
        assertNotNull(field(R.string.blanc_ios_settings_pairing_code));
        assertTrue(shows(R.string.blanc_ios_settings_type_code_shown));
        assertFalse(mCalls.toString().contains("joinWithCode"));
    }

    @Test
    public void onShowsTheAccountAndSwitchingUsesSwitchWithCode() {
        reply("sync.status", "{\"enabled\":true,\"handle\":\"tester\",\"lastSyncedAt\":1793909442722,\"deviceNamePublished\":\"Android\"}");
        open();
        assertNotNull(button(R.string.blanc_ios_settings_disconnect));
        assertEquals("Android", field(R.string.blanc_ios_settings_device_name).getText().toString());
        button(R.string.blanc_ios_settings_switch_account).performClick();
        field(R.string.blanc_ios_settings_pairing_code).setText("K7MR4PX2");
        button(R.string.blanc_ios_settings_switch_account).performClick();
        assertTrue(mCalls.toString(), mCalls.contains("sync.switchWithCode [\"K7MR4PX2\"]"));
    }

    @Test
    public void aLostKeyTurnsSyncOffAndAsksForACode() {
        reply("sync.status", "{\"enabled\":true,\"handle\":\"tester\",\"lastError\":\"local-key-unlock\"}");
        mReplies.put("sync.disable", "{\"ok\":true,\"value\":{\"ok\":true}}");
        SyncSheet.Runner disabling = new SyncSheet.Runner() {
            @Override
            public void call(String method, String args, Callback<String> done) {
                if (method.equals("sync.disable")) reply("sync.status", "{\"enabled\":false}");
                SyncSheetTest.this.call(method, args, done);
            }

            @Override
            public boolean keyLost() {
                return true;
            }
        };
        new SyncSheet(mActivity, disabling, done -> done.onResult(null)).show();
        assertTrue(mCalls.toString(), mCalls.contains("sync.disable [{\"wipeRemote\":false}]"));
        assertTrue(shows(R.string.blanc_sync_error_local_key_unlock));
        assertNotNull(field(R.string.blanc_ios_settings_pairing_code));
    }

    @Test
    public void aKeystoreHiccupLeavesSyncOn() {
        mKeyLost = false;
        reply("sync.status", "{\"enabled\":true,\"handle\":\"tester\",\"lastError\":\"key:decryption-failed\"}");
        open();
        assertFalse(mCalls.toString().contains("sync.disable"));
    }

    @Test
    public void anOrdinaryErrorLeavesSyncOn() {
        reply("sync.status", "{\"enabled\":true,\"handle\":\"tester\",\"lastError\":\"offline\"}");
        open();
        assertFalse(mCalls.toString().contains("sync.disable"));
        assertTrue(shows(R.string.blanc_sync_error_offline));
    }
}

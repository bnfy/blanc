// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.sync;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;

import org.chromium.base.CommandLine;
import org.chromium.base.ContextUtils;
import org.chromium.base.Log;
import org.chromium.build.annotations.NullMarked;

import java.io.IOException;
import java.security.GeneralSecurityException;
import java.security.KeyStore;

/**
 * For chromium/tests/android/sync.mjs: `adb shell am broadcast` calls the runner, and the answer
 * goes to logcat. Needs the switch, which Chromium reads from a file only on debuggable builds.
 */
@NullMarked
public final class SyncTestDriver {
    private static final String ACTION = "me.bnfy.blanc.SYNC_TEST";
    private static final String TAG = "BlancSync";
    private static boolean sStarted;

    private SyncTestDriver() {}

    private static boolean loseKey() {
        try {
            KeyStore store = KeyStore.getInstance("AndroidKeyStore");
            store.load(null);
            store.deleteEntry(BlancKeyStore.ALIAS);
            return true;
        } catch (GeneralSecurityException | IOException e) {
            return false;
        }
    }

    public static void maybeStart() {
        if (sStarted || !CommandLine.getInstance().hasSwitch("blanc-sync-test")) return;
        sStarted = true;
        ContextUtils.registerExportedBroadcastReceiver(
                ContextUtils.getApplicationContext(),
                new BroadcastReceiver() {
                    @Override
                    public void onReceive(Context context, Intent intent) {
                        String id = intent.getStringExtra("id");
                        if ("test.loseKey".equals(intent.getStringExtra("method"))) {
                            Log.w(TAG, "result " + id + " {\"ok\":" + loseKey() + ",\"value\":null}");
                            return;
                        }
                        if ("test.favorites".equals(intent.getStringExtra("method"))) {
                            Log.w(TAG, "result " + id + " {\"ok\":true,\"value\":" + SyncBridge.favoritesList() + "}");
                            return;
                        }
                        SyncBridge.call(
                                String.valueOf(intent.getStringExtra("method")),
                                String.valueOf(intent.getStringExtra("args")),
                                result -> Log.w(TAG, "result " + id + " " + result));
                    }
                },
                new IntentFilter(ACTION),
                null);
    }
}

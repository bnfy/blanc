// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.sync;

import android.content.Context;

import org.chromium.build.annotations.NullMarked;
import org.chromium.components.background_task_scheduler.NativeBackgroundTask;
import org.chromium.components.background_task_scheduler.TaskParameters;

/**
 * A sync while Blanc is out of sight, like the iPhone's Background App Refresh: Android decides when
 * it runs. It fetches and keeps. With no window there's no tab model, so shipping's session store
 * stays a no-op and this phone's tab list on other devices is left as it was.
 */
@NullMarked
public final class BlancSyncTask extends NativeBackgroundTask {
    @Override
    protected int onStartTaskBeforeNativeLoaded(
            Context context, TaskParameters parameters, TaskFinishedCallback callback) {
        return SyncBridge.on() ? StartBeforeNativeResult.LOAD_NATIVE : StartBeforeNativeResult.DONE;
    }

    @Override
    protected void onStartTaskWithNative(
            Context context, TaskParameters parameters, TaskFinishedCallback callback) {
        SyncBridge.call("sync.syncNow", "[]",
                reply -> SyncBridge.reconcileThen(() -> callback.taskFinished(false)));
    }

    @Override
    protected boolean onStopTaskBeforeNativeLoaded(Context context, TaskParameters parameters) {
        return false;
    }

    @Override
    protected boolean onStopTaskWithNative(Context context, TaskParameters parameters) {
        return false;
    }
}

// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.sync;

import org.chromium.base.ContextUtils;
import org.chromium.build.annotations.NullMarked;
import org.chromium.components.background_task_scheduler.BackgroundTaskSchedulerFactory;
import org.chromium.components.background_task_scheduler.TaskIds;
import org.chromium.components.background_task_scheduler.TaskInfo;

/** Background sync exists only while Sync is on: every 15 minutes at best, as on the iPhone. */
@NullMarked
final class SyncSchedule {
    static final long INTERVAL_MS = 15 * 60 * 1000;

    private SyncSchedule() {}

    static void set(boolean on) {
        if (!on) {
            BackgroundTaskSchedulerFactory.getScheduler()
                    .cancel(ContextUtils.getApplicationContext(), TaskIds.BLANC_SYNC_JOB_ID);
            return;
        }
        TaskInfo task = TaskInfo.createTask(
                        TaskIds.BLANC_SYNC_JOB_ID,
                        TaskInfo.PeriodicInfo.create().setIntervalMs(INTERVAL_MS).build())
                .setRequiredNetworkType(TaskInfo.NetworkType.ANY)
                .setUpdateCurrent(true)
                .setIsPersisted(true)
                .build();
        BackgroundTaskSchedulerFactory.getScheduler().schedule(ContextUtils.getApplicationContext(), task);
    }
}

// Copyright 2026 Bananify Creative. MIT; see LICENSE.

#ifndef BLANC_ANDROID_BROWSER_SYNC_START_DATA_H_
#define BLANC_ANDROID_BROWSER_SYNC_START_DATA_H_

#include "base/values.h"

namespace blanc {
// What the Start Page shows from other devices: the last lists the runner gave.
base::ListValue SyncRemoteDevices();
base::ListValue SyncSentItems();
}  // namespace blanc

#endif  // BLANC_ANDROID_BROWSER_SYNC_START_DATA_H_

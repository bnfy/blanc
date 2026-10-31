#ifndef BLANC_SYNC_TAB_PULL_MODEL_H_
#define BLANC_SYNC_TAB_PULL_MODEL_H_
#include "blob_exchange.h"
#include "tab_sync_coordinator.h"
namespace blanc::sync {
// Native-only pull building block. Caller must bind account/revision to the
// credential session and route this only through guarded BlobExchange.
// This does not publish this device's snapshot or implement full Tab Sync.
BlobModelHooks TabPullModel(std::shared_ptr<TabSyncCoordinator> coordinator,
    std::string account,int revision,std::function<double()> clock);
}
#endif

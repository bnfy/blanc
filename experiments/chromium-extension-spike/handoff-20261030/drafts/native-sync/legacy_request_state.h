#ifndef BLANC_SYNC_LEGACY_REQUEST_STATE_H_
#define BLANC_SYNC_LEGACY_REQUEST_STATE_H_
#include "request_state_store.h"
#include <string_view>
namespace blanc::sync {
// Extracts only the shipping shared-spaces request ledger. Source backup,
// identity/model reconciliation and atomic import remain the caller's duty.
// Missing/unreadable requestLog is not an empty allowance.
std::optional<SchedulerState> ParseLegacyRequestState(std::string_view bytes);
}
#endif

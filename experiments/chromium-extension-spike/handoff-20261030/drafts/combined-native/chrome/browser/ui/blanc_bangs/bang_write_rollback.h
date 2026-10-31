#ifndef BLANC_BANGS_DRAFT_WRITE_ROLLBACK_H_
#define BLANC_BANGS_DRAFT_WRITE_ROLLBACK_H_

#include <optional>
#include <cstdint>
#include "base/values.h"
#include "bang_disk_confirmation.h"

class PrefService;
namespace blanc::bangs::draft {
// Restore only if this mutation is still the current user value and policy
// still permits changes. This does not assert that the disk is writable.
bool RestoreBangPrefIfUnchanged(PrefService* prefs, SavedBangPref key,
                                const base::Value& expected,
                                const std::optional<base::Value>& previous,
                                uint64_t expected_epoch, uint64_t current_epoch);
}  // namespace blanc::bangs::draft
#endif

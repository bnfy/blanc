#ifndef BLANC_SYNC_LEGACY_SYNC_RECORD_H_
#define BLANC_SYNC_LEGACY_SYNC_RECORD_H_
#include <optional>
#include <string>
#include <string_view>
namespace blanc::sync {
// Read-only migration input, never a native state bundle or proof that the OS
// can decrypt this Electron safeStorage record. No raw key field is returned.
struct LegacySyncRecord {
  bool enabled = false, tabs = false, spaces = false, erasure_pending = false;
  bool recovery_dismissed = false, status_mapping_required = false;
  double last_synced_at = 0;
  std::string handle, account, protected_key, device_id, origin, last_error;
};
enum class LegacySyncStatus { kParsed, kInvalid, kTooLarge, kNeedsLegacyKeyProtection };
struct LegacySyncParsed {
  LegacySyncStatus status = LegacySyncStatus::kInvalid;
  std::optional<LegacySyncRecord> record;
};
LegacySyncParsed ParseLegacySyncRecord(std::string_view bytes);
}
#endif

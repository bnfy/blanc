#ifndef BLANC_SYNC_LEGACY_SNAPSHOT_H_
#define BLANC_SYNC_LEGACY_SNAPSHOT_H_
#include "base/files/file_path.h"
#include <optional>
#include <string>
namespace blanc::sync {
struct LegacySnapshot {
  LegacySnapshot() = default;
  LegacySnapshot(LegacySnapshot&&) = default;
  LegacySnapshot(const LegacySnapshot&) = delete;
  ~LegacySnapshot();
  std::string sync_json, shared_json;
  std::string sync_sha256, shared_sha256;
};
enum class LegacySnapshotStatus { kRead, kInvalidRoot, kMissing, kReadError,
                                  kNotRegular, kTooLarge, kChanged };
struct LegacySnapshotRead { LegacySnapshotStatus status; std::optional<LegacySnapshot> snapshot; };
// Native filesystem primitive only, NOT proof of a closed source or authority
// to import. Caller must establish trusted Personal userData root + closed
// source/backup/consent separately. Never falls back to named profiles/defaults.
LegacySnapshotRead ReadLegacySnapshot(const base::FilePath& personal_root);
}
#endif

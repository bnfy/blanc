#ifndef BLANC_BANGS_DRAFT_DISK_CONFIRMATION_H_
#define BLANC_BANGS_DRAFT_DISK_CONFIRMATION_H_
#include "base/files/file_path.h"
#include "base/values.h"
namespace blanc::bangs::draft {
enum class SavedBangPref { kEnabled, kCustom };
// Blocking operation; call on a may-block worker after the write barrier.
// This is a value readback, not an fsync or full-disk-integrity guarantee.
bool ConfirmBangPrefOnDisk(const base::FilePath& path, SavedBangPref pref,
                           const base::Value& expected);
}  // namespace blanc::bangs::draft
#endif

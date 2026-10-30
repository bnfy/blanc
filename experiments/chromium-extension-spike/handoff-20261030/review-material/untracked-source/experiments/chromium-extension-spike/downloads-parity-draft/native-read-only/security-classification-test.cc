#include "security-classification.h"

#include <cassert>
#include "chrome/browser/download/download_ui_model.h"
#include "components/download/public/common/download_danger_type.h"
#include "components/download/public/common/download_item.h"

using blanc::downloads_projection::ClassifySecurity;
using blanc::downloads_projection::SecurityClassification;
using blanc::downloads_projection::SecuritySnapshot;
using Item = download::DownloadItem;
using Pattern = DownloadUIModel::DangerUiPattern;

int main() {
  SecuritySnapshot s{download::DOWNLOAD_DANGER_TYPE_NOT_DANGEROUS, Item::SAFE,
                     static_cast<int>(Pattern::kNormal), false, false};
  assert(ClassifySecurity(s) == SecurityClassification::kUnknown);
  s.danger_type = download::DOWNLOAD_DANGER_TYPE_DEEP_SCANNED_SAFE;
  assert(ClassifySecurity(s) == SecurityClassification::kSafe);
  // Enumerate every current value, including deprecated 18 and MAX, to verify
  // only the explicitly positive value is classified safe.
  for (int danger = -1; danger <= download::DOWNLOAD_DANGER_TYPE_MAX + 1; ++danger) {
    s.danger_type = danger;
    const bool positive = danger == download::DOWNLOAD_DANGER_TYPE_DEEP_SCANNED_SAFE;
    assert((ClassifySecurity(s) == SecurityClassification::kSafe) == positive);
  }
  for (int danger : {download::DOWNLOAD_DANGER_TYPE_ASYNC_SCANNING,
                     download::DOWNLOAD_DANGER_TYPE_ASYNC_LOCAL_PASSWORD_SCANNING,
                     download::DOWNLOAD_DANGER_TYPE_DEEP_SCANNED_FAILED,
                     download::DOWNLOAD_DANGER_TYPE_BLOCKED_SCAN_FAILED,
                     download::DOWNLOAD_DANGER_TYPE_DEEP_SCANNED_OPENED_DANGEROUS}) {
    s.danger_type = danger;
    assert(ClassifySecurity(s) == SecurityClassification::kNeedsReview);
  }
  s.danger_type = download::DOWNLOAD_DANGER_TYPE_DEEP_SCANNED_SAFE;
  for (int status = -1; status <= Item::SILENT_BLOCK + 1; ++status) {
    s.insecure_status = status;
    assert((ClassifySecurity(s) == SecurityClassification::kSafe) == (status == Item::SAFE));
  }
  s.insecure_status = Item::SILENT_BLOCK;
  assert(ClassifySecurity(s) == SecurityClassification::kSilentBlock);
  s.insecure_status = Item::SAFE;
  for (int pattern = -1; pattern <= static_cast<int>(Pattern::kOther) + 1; ++pattern) {
    s.danger_ui_pattern = pattern;
    assert((ClassifySecurity(s) == SecurityClassification::kSafe) ==
           (pattern == static_cast<int>(Pattern::kNormal)));
  }
  s.danger_ui_pattern = static_cast<int>(Pattern::kNormal);
  s.is_dangerous = true;
  assert(ClassifySecurity(s) == SecurityClassification::kNeedsReview);
  s.is_dangerous = false;
  s.is_insecure = true;
  assert(ClassifySecurity(s) == SecurityClassification::kNeedsReview);
  s.is_insecure = false;
  s.danger_type = download::DOWNLOAD_DANGER_TYPE_USER_VALIDATED;
  assert(ClassifySecurity(s) == SecurityClassification::kUnknown);
  s.danger_type = download::DOWNLOAD_DANGER_TYPE_ALLOWLISTED_BY_POLICY;
  assert(ClassifySecurity(s) == SecurityClassification::kUnknown);
}

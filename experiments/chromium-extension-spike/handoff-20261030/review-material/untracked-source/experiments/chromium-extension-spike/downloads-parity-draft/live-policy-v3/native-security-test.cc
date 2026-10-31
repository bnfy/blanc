#include "native-security.h"
#include <cassert>
using namespace blanc::downloads_projection;
using Item = download::DownloadItem;
using Pattern = DownloadUIModel::DangerUiPattern;
int main() {
  SecuritySnapshot s{download::DOWNLOAD_DANGER_TYPE_DEEP_SCANNED_SAFE,
                     Item::SAFE, static_cast<int>(Pattern::kOther), false, false};
  assert(ClassifySecurity(s) == SecurityClassification::kUnknown);
  assert(ClassifyNativeSecurity(s, Phase::kInterrupted, true) == SecurityClassification::kSafe);
  assert(ClassifyNativeSecurity(s, Phase::kInterrupted, false) != SecurityClassification::kSafe);
  s.danger_ui_pattern = static_cast<int>(Pattern::kNormal);
  assert(ClassifyNativeSecurity(s, Phase::kComplete, false) == SecurityClassification::kNeedsReview);
  s.insecure_status = Item::SILENT_BLOCK;
  assert(ClassifyNativeSecurity(s, Phase::kComplete, false) == SecurityClassification::kSilentBlock);
  s.insecure_status = Item::SAFE; s.danger_ui_pattern = static_cast<int>(Pattern::kOther);
  assert(ClassifyNativeSecurity(s, Phase::kCancelled, true) != SecurityClassification::kSafe);
  s.danger_type = download::DOWNLOAD_DANGER_TYPE_NOT_DANGEROUS;
  assert(ClassifyNativeSecurity(s, Phase::kInterrupted, true) == SecurityClassification::kUnknown);
  s.danger_type = download::DOWNLOAD_DANGER_TYPE_DEEP_SCANNED_FAILED;
  assert(ClassifyNativeSecurity(s, Phase::kInterrupted, true) == SecurityClassification::kNeedsReview);
  s.danger_type = download::DOWNLOAD_DANGER_TYPE_DANGEROUS_CONTENT;
  assert(ClassifyNativeSecurity(s, Phase::kInterrupted, true) == SecurityClassification::kNeedsReview);
  s.danger_type = download::DOWNLOAD_DANGER_TYPE_DEEP_SCANNED_SAFE;
  s.insecure_status = Item::WARN;
  assert(ClassifyNativeSecurity(s, Phase::kInterrupted, true) == SecurityClassification::kNeedsReview);
  s.insecure_status = Item::SAFE; s.is_dangerous = true;
  assert(ClassifyNativeSecurity(s, Phase::kInterrupted, true) == SecurityClassification::kNeedsReview);
  s.is_dangerous = false; s.is_insecure = true;
  assert(ClassifyNativeSecurity(s, Phase::kInterrupted, true) == SecurityClassification::kNeedsReview);
  s.is_insecure = false; s.danger_type = download::DOWNLOAD_DANGER_TYPE_NOT_DANGEROUS;
  s.danger_ui_pattern = static_cast<int>(Pattern::kNormal);
  assert(ClassifySecurity(s) == SecurityClassification::kUnknown);
  assert(WarningFreeCompletedHistory(s, true));
  assert(!WarningFreeCompletedHistory(s, false));
  s.insecure_status = Item::WARN;
  assert(!WarningFreeCompletedHistory(s, true));
  s.insecure_status = Item::SAFE; s.danger_type = download::DOWNLOAD_DANGER_TYPE_DEEP_SCANNED_FAILED;
  assert(!WarningFreeCompletedHistory(s, true));
  s.danger_type = download::DOWNLOAD_DANGER_TYPE_DANGEROUS_CONTENT;
  assert(!WarningFreeCompletedHistory(s, true));
  s.danger_type = download::DOWNLOAD_DANGER_TYPE_DEEP_SCANNED_SAFE;
  s.danger_ui_pattern = static_cast<int>(Pattern::kOther);
  assert(!WarningFreeCompletedHistory(s, true));
}

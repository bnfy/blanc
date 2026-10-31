#ifndef BLANC_DOWNLOADS_NATIVE_SECURITY_V2_H_
#define BLANC_DOWNLOADS_NATIVE_SECURITY_V2_H_
#include "policy-core.h"
#include "chrome/browser/download/download_ui_model.h"
#include "components/download/public/common/download_danger_type.h"
#include "components/download/public/common/download_item.h"
namespace blanc::downloads_projection {
// INTERRUPTED always uses kOther for its icon before Chromium evaluates the
// warning. Only normalize that icon for an independently positive clean deep
// scan, safe transport and no tailored warning. Never normalize unknown,
// failed-open, validated, policy-allowlisted or warning results.
inline SecurityClassification ClassifyNativeSecurity(
    SecuritySnapshot snapshot, Phase phase, bool no_tailored_warning) {
  // A tailored warning is independently authoritative even when another
  // field claims a normal icon or safe scan. Silent blocks stay silent.
  if (!no_tailored_warning) {
    const auto raw = ClassifySecurity(snapshot);
    return raw == SecurityClassification::kSilentBlock
               ? raw : SecurityClassification::kNeedsReview;
  }
  if (phase == Phase::kInterrupted && no_tailored_warning &&
      snapshot.danger_ui_pattern == static_cast<int>(DownloadUIModel::DangerUiPattern::kOther) &&
      snapshot.danger_type == download::DOWNLOAD_DANGER_TYPE_DEEP_SCANNED_SAFE &&
      snapshot.insecure_status == download::DownloadItem::SAFE &&
      !snapshot.is_dangerous && !snapshot.is_insecure)
    snapshot.danger_ui_pattern = static_cast<int>(DownloadUIModel::DangerUiPattern::kNormal);
  return ClassifySecurity(snapshot);
}
// Removing a completed history record is not opening a file or bypassing a
// warning. Restrict it to current native no-warning states; never remove an
// interrupted/active record or relax the separate history/child policy.
inline bool WarningFreeCompletedHistory(const SecuritySnapshot& snapshot,
                                        bool no_tailored_warning) {
  return no_tailored_warning && !snapshot.is_dangerous && !snapshot.is_insecure &&
      snapshot.insecure_status == download::DownloadItem::SAFE &&
      snapshot.danger_ui_pattern == static_cast<int>(DownloadUIModel::DangerUiPattern::kNormal) &&
      (snapshot.danger_type == download::DOWNLOAD_DANGER_TYPE_NOT_DANGEROUS ||
       snapshot.danger_type == download::DOWNLOAD_DANGER_TYPE_DEEP_SCANNED_SAFE);
}
}
#endif

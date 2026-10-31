#include "security-classification.h"

#include "chrome/browser/download/download_ui_model.h"
#include "components/download/public/common/download_danger_type.h"
#include "components/download/public/common/download_item.h"

namespace blanc::downloads_projection {
namespace {
using Item = download::DownloadItem;
using Pattern = DownloadUIModel::DangerUiPattern;

bool IsKnownWarning(int danger) {
  switch (danger) {
    case download::DOWNLOAD_DANGER_TYPE_DANGEROUS_FILE:
    case download::DOWNLOAD_DANGER_TYPE_DANGEROUS_URL:
    case download::DOWNLOAD_DANGER_TYPE_DANGEROUS_CONTENT:
    case download::DOWNLOAD_DANGER_TYPE_MAYBE_DANGEROUS_CONTENT:
    case download::DOWNLOAD_DANGER_TYPE_UNCOMMON_CONTENT:
    case download::DOWNLOAD_DANGER_TYPE_DANGEROUS_HOST:
    case download::DOWNLOAD_DANGER_TYPE_POTENTIALLY_UNWANTED:
    case download::DOWNLOAD_DANGER_TYPE_ASYNC_SCANNING:
    case download::DOWNLOAD_DANGER_TYPE_BLOCKED_PASSWORD_PROTECTED:
    case download::DOWNLOAD_DANGER_TYPE_BLOCKED_TOO_LARGE:
    case download::DOWNLOAD_DANGER_TYPE_SENSITIVE_CONTENT_WARNING:
    case download::DOWNLOAD_DANGER_TYPE_SENSITIVE_CONTENT_BLOCK:
    case download::DOWNLOAD_DANGER_TYPE_DEEP_SCANNED_OPENED_DANGEROUS:
    case download::DOWNLOAD_DANGER_TYPE_PROMPT_FOR_SCANNING:
    case download::DOWNLOAD_DANGER_TYPE_DANGEROUS_ACCOUNT_COMPROMISE:
    case download::DOWNLOAD_DANGER_TYPE_DEEP_SCANNED_FAILED:
    case download::DOWNLOAD_DANGER_TYPE_PROMPT_FOR_LOCAL_PASSWORD_SCANNING:
    case download::DOWNLOAD_DANGER_TYPE_ASYNC_LOCAL_PASSWORD_SCANNING:
    case download::DOWNLOAD_DANGER_TYPE_BLOCKED_SCAN_FAILED:
    case download::DOWNLOAD_DANGER_TYPE_FORCE_SAVE_TO_GDRIVE:
    case download::DOWNLOAD_DANGER_TYPE_FORCE_SAVE_TO_ONEDRIVE:
      return true;
    default:
      return false;
  }
}
}  // namespace

SecurityClassification ClassifySecurity(const SecuritySnapshot& snapshot) {
  if (snapshot.insecure_status == Item::SILENT_BLOCK) {
    return SecurityClassification::kSilentBlock;
  }
  if (snapshot.is_dangerous || snapshot.is_insecure ||
      IsKnownWarning(snapshot.danger_type) ||
      snapshot.insecure_status == Item::WARN ||
      snapshot.insecure_status == Item::BLOCK ||
      snapshot.danger_ui_pattern == static_cast<int>(Pattern::kDangerous) ||
      snapshot.danger_ui_pattern == static_cast<int>(Pattern::kSuspicious)) {
    return SecurityClassification::kNeedsReview;
  }

  // NOT_DANGEROUS can be provisional or result from Chromium's fail-open
  // handling of an unavailable scan. Validation and policy allowlisting also
  // do not establish a completed clean scan. These remain unknown.
  const bool positive_danger =
      snapshot.danger_type == download::DOWNLOAD_DANGER_TYPE_DEEP_SCANNED_SAFE;
  if (positive_danger && snapshot.insecure_status == Item::SAFE &&
      snapshot.danger_ui_pattern == static_cast<int>(Pattern::kNormal)) {
    return SecurityClassification::kSafe;
  }
  // kOther can mean a cancelled or interrupted item rather than a warning.
  // Future/unknown states and inconsistent combinations remain unknown.
  return SecurityClassification::kUnknown;
}
}  // namespace blanc::downloads_projection

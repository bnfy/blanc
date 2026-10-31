#include "projection-security-adapter.h"

#include <cassert>
#include "chrome/browser/download/download_ui_model.h"
#include "components/download/public/common/download_danger_type.h"
#include "components/download/public/common/download_item.h"

using namespace blanc::downloads_projection;
int main() {
  InternalRow row{};
  row.danger_type = download::DOWNLOAD_DANGER_TYPE_DEEP_SCANNED_SAFE;
  row.insecure_status = download::DownloadItem::SAFE;
  row.danger_ui_pattern = static_cast<int>(DownloadUIModel::DangerUiPattern::kNormal);
  assert(ClassifyRowSecurity(row) == SecurityClassification::kSafe);
  row.danger_type = download::DOWNLOAD_DANGER_TYPE_ASYNC_SCANNING;
  assert(ClassifyRowSecurity(row) == SecurityClassification::kNeedsReview);
  row.danger_type = download::DOWNLOAD_DANGER_TYPE_DEEP_SCANNED_SAFE;
  row.insecure_status = download::DownloadItem::UNKNOWN;
  assert(ClassifyRowSecurity(row) == SecurityClassification::kUnknown);
  row.insecure_status = download::DownloadItem::SAFE;
  row.insecure = true;
  assert(ClassifyRowSecurity(row) == SecurityClassification::kNeedsReview);
}

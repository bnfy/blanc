#include "projection-security-adapter.h"

namespace blanc::downloads_projection {
SecurityClassification ClassifyRowSecurity(const InternalRow& row) {
  return ClassifySecurity({row.danger_type, row.insecure_status,
                           row.danger_ui_pattern, row.dangerous, row.insecure});
}
}  // namespace blanc::downloads_projection

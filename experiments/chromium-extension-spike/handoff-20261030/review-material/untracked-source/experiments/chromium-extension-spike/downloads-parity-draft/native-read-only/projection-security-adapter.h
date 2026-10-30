#ifndef BLANC_DOWNLOADS_PROJECTION_SECURITY_ADAPTER_DRAFT_H_
#define BLANC_DOWNLOADS_PROJECTION_SECURITY_ADAPTER_DRAFT_H_

#include "projection.h"
#include "security-classification.h"

namespace blanc::downloads_projection {
// Classifies the copied fields from one internal native row. This does not
// validate its source, lifetime, family, document, or action eligibility.
SecurityClassification ClassifyRowSecurity(const InternalRow& row);
}  // namespace blanc::downloads_projection
#endif  // BLANC_DOWNLOADS_PROJECTION_SECURITY_ADAPTER_DRAFT_H_

#ifndef BLANC_SELECTED_SHIPPING_SEARCH_DRAFT_H_
#define BLANC_SELECTED_SHIPPING_SEARCH_DRAFT_H_
#include <optional>
#include <string>
#include "selected_custom.h"
class Profile;

namespace blanc::custom_search {
// Unregistered draft. Both snapshots must come from browser-owned state;
// renderer values are never evidence of provider choice or user intent.
enum class ShippingStatus { kReady, kRetryWhenLoaded, kNeedsInitialization, kUnavailable, kChanged };
struct ShippingResolution {
  ShippingStatus status;
  std::optional<std::string> url;
  std::string provider_guid;
};
ShippingResolution ResolveSelectedShipping(const SelectedProvider& before,
                                           const SelectedProvider& after,
                                           const std::string& query);
// Unwired UI-sequence adapter. A caller still needs independently verified
// native input intent, tab/document ownership and atomic navigation.
ShippingResolution ResolveCurrentSelectedShipping(Profile* context,
                                                  const std::string& query);
}  // namespace blanc::custom_search
#endif

#include "selected_shipping.h"
#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/search_engines/template_url_service_factory.h"
#include "components/search_engines/template_url_service.h"
#include "content/public/browser/browser_thread.h"

namespace blanc::custom_search {
namespace {
Profile* RegularForRead(Profile* context) {
  if (!context || context->ShutdownStarted()) return nullptr;
  if (context->IsOffTheRecord()) {
    if (!context->IsIncognitoProfile() || !context->IsPrimaryOTRProfile()) return nullptr;
    context = context->GetOriginalProfile();
  }
  return context && !context->ShutdownStarted() && context->IsRegularProfile() &&
                 !context->IsOffTheRecord() ? context : nullptr;
}
struct SelectionRead {
  ResolutionStatus status;
  std::optional<SelectedProvider> value;
};
SelectionRead ReadSelection(Profile* context) {
  Profile* regular = RegularForRead(context);
  auto* service = regular ? TemplateURLServiceFactory::GetForProfile(regular) : nullptr;
  auto status = EnsureServiceLoaded(service);
  if (status != ResolutionStatus::kReady) return {status, std::nullopt};
  const auto* provider = service->GetDefaultSearchProvider();
  if (!provider) return {ResolutionStatus::kUnavailable, std::nullopt};
  return {ResolutionStatus::kReady, SelectedProvider{service->default_search_provider_source(), provider->type(),
      provider->prepopulate_id(), static_cast<int>(provider->starter_pack_id()),
      service->is_default_search_managed(), service->IsExtensionControlledDefaultSearch(),
      provider->GetExtensionInfo() != nullptr, provider->id().GetUnsafeValue(), provider->sync_guid(), provider->url(),
      provider->search_url_post_params()}};
}
}  // namespace

ShippingResolution ResolveCurrentSelectedShipping(Profile* context,
                                                  const std::string& query) {
  DCHECK_CURRENTLY_ON(content::BrowserThread::UI);
  if (!context) return {ShippingStatus::kUnavailable, std::nullopt};
  auto weak = context->GetWeakPtr();
  auto first = ReadSelection(weak.get());
  if (weak && first.status == ResolutionStatus::kRetryWhenLoaded)
    return {ShippingStatus::kRetryWhenLoaded, std::nullopt};
  if (!weak || first.status != ResolutionStatus::kReady)
    return {ShippingStatus::kUnavailable, std::nullopt};
  auto provisional = ResolveSelectedShipping(*first.value, *first.value, query);
  if (provisional.status != ShippingStatus::kReady) return provisional;
  auto second = ReadSelection(weak.get());
  if (weak && second.status == ResolutionStatus::kRetryWhenLoaded)
    return {ShippingStatus::kRetryWhenLoaded, std::nullopt};
  if (!weak || second.status != ResolutionStatus::kReady)
    return {ShippingStatus::kUnavailable, std::nullopt};
  return ResolveSelectedShipping(*first.value, *second.value, query);
}
}  // namespace blanc::custom_search

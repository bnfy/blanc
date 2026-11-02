// Copyright 2026 Bananify Creative. MIT; see the Blanc repository LICENSE.
#include "blanc/browser/ui/browser_api/search_default.h"

#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/search_engines/template_url_service_factory.h"
#include "components/search_engines/default_search_manager.h"
#include "components/search_engines/template_url_service.h"

namespace blanc::browser_api {

// DuckDuckGo's prepopulated id, as in modules/selected_shipping.cc.
constexpr int kDuckDuckGoPrepopulateId = 92;

void EnsureBlancDefaultSearch(Profile* profile) {
  if (!profile || !profile->IsRegularProfile()) return;
  auto* service = TemplateURLServiceFactory::GetForProfile(profile);
  // The source comes from prefs even before the service has loaded, and the
  // setter adds the prepopulated engine if the profile lacks it.
  if (!service || service->default_search_provider_source() != DefaultSearchManager::FROM_FALLBACK ||
      service->is_default_search_managed() || service->IsExtensionControlledDefaultSearch()) {
    return;
  }
  service->SetUserSelectedDefaultSearchProviderByPrepopulateId(kDuckDuckGoPrepopulateId);
}

}  // namespace blanc::browser_api

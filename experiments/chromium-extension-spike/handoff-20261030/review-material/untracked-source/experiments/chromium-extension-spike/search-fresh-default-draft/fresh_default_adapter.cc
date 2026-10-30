#include "fresh_default_adapter.h"
#include "fresh_default_policy.h"
#include "fresh_profile_proof.h"
#include "chrome/browser/browser_process.h"
#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/search_engine_choice/search_engine_choice_service_factory.h"
#include "chrome/browser/search_engines/template_url_service_factory.h"
#include "chrome/browser/signin/identity_manager_factory.h"
#include "components/prefs/pref_service.h"
#include "components/country_codes/country_codes.h"
#include "components/regional_capabilities/enums.h"
#include "components/regional_capabilities/regional_capabilities_service.h"
#include "components/search_engines/default_search_manager.h"
#include "components/search_engines/search_engine_choice/search_engine_choice_service.h"
#include "components/search_engines/search_engines_pref_names.h"
#include "components/search_engines/template_url.h"
#include "components/search_engines/template_url_service.h"
#include "components/signin/public/identity_manager/identity_manager.h"
#include "content/public/browser/browser_thread.h"

namespace blanc::fresh_default {
namespace {
constexpr int kDuckDuckGoPrepopulatedId = 92;
constexpr char kDuckDuckGoExactTemplate[] = "https://duckduckgo.com/?q={searchTerms}";
}
Result Attempt::Advance(Profile* profile) {
  DCHECK_CURRENTLY_ON(content::BrowserThread::UI);
  if (consumed_ || !profile || profile->ShutdownStarted()) return Result::kPreserved;
  auto weak = profile->GetWeakPtr();
  auto* prefs = profile->GetPrefs();
  if (!prefs) { consumed_ = true; return Result::kPreserved; }
  Facts f;
  f.regular = profile->IsRegularProfile() && !profile->IsOffTheRecord();
  // IsNewProfile() alone is insufficient: it can be true for global first run
  // even when an installer wrote an existing preference file.
  f.genuinely_new_store = proof_.Matches(profile->GetPath()) && !prefs->ReadOnly() &&
      prefs->GetInitializationStatus() == PrefService::INITIALIZATION_STATUS_CREATED_NEW_PREF_STORE;
  const auto* default_pref = prefs->FindPreference(DefaultSearchManager::kDefaultSearchProviderDataPrefName);
  const auto* overrides_pref = prefs->FindPreference(prefs::kSearchProviderOverrides);
  const auto* guid_pref = prefs->FindPreference(prefs::kDefaultSearchProviderGUID);
  f.untouched_default_pref = default_pref && default_pref->IsDefaultValue() &&
      !prefs->GetUserPrefValue(DefaultSearchManager::kDefaultSearchProviderDataPrefName) &&
      guid_pref && guid_pref->IsDefaultValue() && !prefs->GetUserPrefValue(prefs::kDefaultSearchProviderGUID);
  f.no_provider_overrides = overrides_pref && overrides_pref->IsDefaultValue() &&
      !prefs->GetUserPrefValue(prefs::kSearchProviderOverrides);
  if (!(f.regular && f.genuinely_new_store && f.untouched_default_pref && f.no_provider_overrides)) {
    consumed_ = true; return Result::kPreserved;
  }
  auto* identity = IdentityManagerFactory::GetForProfile(profile);
  if (!weak) return Result::kPreserved;
  if (!identity) { consumed_ = true; return Result::kPreserved; }
  f.tokens_loaded = identity && identity->AreRefreshTokensLoaded();
  f.no_accounts = identity && !identity->HasPrimaryAccount(signin::ConsentLevel::kSignin) && identity->GetAccountsWithRefreshTokens().empty();
  auto* service = TemplateURLServiceFactory::GetForProfile(profile);
  if (!weak || !service) { consumed_ = true; return Result::kPreserved; }
  auto* choice = search_engines::SearchEngineChoiceServiceFactory::GetForProfile(profile);
  if (!weak) return Result::kPreserved;
  auto* policy = g_browser_process ? g_browser_process->policy_service() : nullptr;
  if (choice && policy) {
    const auto os_region = country_codes::GetCurrentCountryID();
    f.choice_known_outside_scope = os_region.IsValid() &&
        !regional_capabilities::RegionalCapabilitiesService::IsInAnySearchEngineChoiceScreenRegion(os_region) &&
        choice->GetStaticChoiceScreenConditions(*policy, *service) ==
            regional_capabilities::SearchEngineChoiceScreenConditions::kNotInRegionalScope;
  }
  if (!weak) return Result::kPreserved;
  f.service_loaded = service->loaded();
  // Before loading, the owner may register a cancellable OnLoaded callback.
  // Unknown choice eligibility is deliberately not inferred from other state.
  if (Decide(f) == Decision::kAwaitIdentity) return Result::kWaitingForIdentity;
  if (Decide(f) == Decision::kAwaitModel) return Result::kWaitingForModel;
  if (!f.service_loaded) { consumed_ = true; return Result::kPreserved; }
  f.effective_fallback = service->default_search_provider_source() == DefaultSearchManager::FROM_FALLBACK &&
      !service->is_default_search_managed() && !service->IsExtensionControlledDefaultSearch();
  TemplateURL* candidate = nullptr;
  CandidateMatches matches;
  for (const auto& entry : service->GetTemplateURLs()) {
    TemplateURL* url = entry.get();
    const bool same_id = url->prepopulate_id() == kDuckDuckGoPrepopulatedId;
    const bool exact = same_id && url->type() == TemplateURL::NORMAL &&
        url->url() == kDuckDuckGoExactTemplate && url->search_url_post_params().empty() && !url->GetExtensionInfo();
    matches.Add(same_id, exact);
    if (exact) candidate = url;
  }
  f.exact_unique_builtin_ddg = matches.IsUnique();
  f.candidate_allowed = candidate && service->CanMakeDefault(candidate);
  if (!weak || Decide(f) != Decision::kSelectDuckDuckGo) { consumed_ = true; return Result::kPreserved; }
  // Re-check immediately before the mutation; never replace an intervening
  // selection, override, policy, extension, account, or region decision.
  default_pref = prefs->FindPreference(DefaultSearchManager::kDefaultSearchProviderDataPrefName);
  overrides_pref = prefs->FindPreference(prefs::kSearchProviderOverrides);
  guid_pref = prefs->FindPreference(prefs::kDefaultSearchProviderGUID);
  const auto current_os_region = country_codes::GetCurrentCountryID();
  if (prefs->ReadOnly() || !default_pref || !default_pref->IsDefaultValue() || prefs->GetUserPrefValue(DefaultSearchManager::kDefaultSearchProviderDataPrefName) ||
      !guid_pref || !guid_pref->IsDefaultValue() || prefs->GetUserPrefValue(prefs::kDefaultSearchProviderGUID) ||
      !overrides_pref || !overrides_pref->IsDefaultValue() || prefs->GetUserPrefValue(prefs::kSearchProviderOverrides) ||
      service->default_search_provider_source() != DefaultSearchManager::FROM_FALLBACK ||
      !service->CanMakeDefault(candidate) || !identity->AreRefreshTokensLoaded() ||
      identity->HasPrimaryAccount(signin::ConsentLevel::kSignin) || !identity->GetAccountsWithRefreshTokens().empty() ||
      !current_os_region.IsValid() ||
      regional_capabilities::RegionalCapabilitiesService::IsInAnySearchEngineChoiceScreenRegion(current_os_region) ||
      choice->GetStaticChoiceScreenConditions(*policy, *service) != regional_capabilities::SearchEngineChoiceScreenConditions::kNotInRegionalScope) {
    consumed_ = true; return Result::kPreserved;
  }
  if (!weak || weak->ShutdownStarted() || !proof_.Matches(weak->GetPath())) return Result::kPreserved;
  bool candidate_still_present = false;
  int matching_ids = 0;
  for (const auto& entry : service->GetTemplateURLs()) {
    candidate_still_present |= entry.get() == candidate;
    if (entry->prepopulate_id() == kDuckDuckGoPrepopulatedId) ++matching_ids;
  }
  if (!candidate_still_present || matching_ids != 1 || !service->CanMakeDefault(candidate) ||
      candidate->prepopulate_id() != kDuckDuckGoPrepopulatedId || candidate->type() != TemplateURL::NORMAL ||
      candidate->url() != kDuckDuckGoExactTemplate || !candidate->search_url_post_params().empty() || candidate->GetExtensionInfo() ||
      service->default_search_provider_source() != DefaultSearchManager::FROM_FALLBACK ||
      prefs->GetUserPrefValue(DefaultSearchManager::kDefaultSearchProviderDataPrefName) ||
      prefs->GetUserPrefValue(prefs::kDefaultSearchProviderGUID) ||
      prefs->GetUserPrefValue(prefs::kSearchProviderOverrides)) {
    consumed_ = true; return Result::kPreserved;
  }
  consumed_ = true;
  service->SetUserSelectedDefaultSearchProvider(candidate);
  if (!weak) return Result::kSelectionNotPersisted;
  const auto* selected = service->GetDefaultSearchProvider();
  const auto* written = prefs->GetUserPrefValue(DefaultSearchManager::kDefaultSearchProviderDataPrefName);
  return service->default_search_provider_source() == DefaultSearchManager::FROM_USER &&
          selected && selected->prepopulate_id() == kDuckDuckGoPrepopulatedId &&
          selected->url() == kDuckDuckGoExactTemplate && written
      ? Result::kSelectedAndPrefObserved : Result::kSelectionNotPersisted;
}
}  // namespace blanc::fresh_default

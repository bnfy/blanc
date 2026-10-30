from pathlib import Path
import hashlib, json
root=Path(__file__).resolve().parent
src=Path('<local-home>/Projects/BlancChromium158/src/components/search_engines')
files=['default_search_manager.cc','default_search_manager.h','template_url_prepopulate_data_resolver.cc','template_url_prepopulate_data_resolver.h','template_url_service.cc','template_url_service.h']
text={n:(src/n).read_text() for n in files}
def replace(n,a,b):
    assert text[n].count(a)==1, (n,a)
    text[n]=text[n].replace(a,b,1)
replace('default_search_manager.cc','#include "components/search_engines/default_search_manager.h"','#include "default_search_manager.h"')
replace('default_search_manager.cc','#include "components/search_engines/search_engines_pref_names.h"','#include "cohort_policy.h"\n#include "components/search_engines/search_engines_pref_names.h"')
replace('default_search_manager.cc','    pref_change_registrar_.Init(pref_service_);','    pref_change_registrar_.Init(pref_service_);\n    pref_change_registrar_.Add(\n        blanc_cohort::kPrefName,\n        base::BindRepeating(&DefaultSearchManager::OnBlancCohortChanged,\n                            base::Unretained(this)));')
replace('default_search_manager.cc','  registry->RegisterDictionaryPref(kDefaultSearchProviderDataPrefName);','  registry->RegisterIntegerPref(blanc_cohort::kPrefName, 0);\n  registry->RegisterDictionaryPref(kDefaultSearchProviderDataPrefName);')
replace('default_search_manager.cc','void DefaultSearchManager::OnOverridesPrefChanged() {','void DefaultSearchManager::OnBlancCohortChanged() {\n  LoadPrepopulatedFallbackSearch();\n  if (GetDefaultSearchEngineSource() == FROM_FALLBACK)\n    NotifyObserver();\n}\n\nvoid DefaultSearchManager::OnOverridesPrefChanged() {')
replace('default_search_manager.h','  void OnOverridesPrefChanged();','  void OnBlancCohortChanged();\n  void OnOverridesPrefChanged();')
replace('template_url_prepopulate_data_resolver.cc','#include "base/debug/crash_logging.h"','#include "cohort_policy.h"\n#include "components/country_codes/country_codes.h"\n#include "components/search_engines/search_engines_pref_names.h"\n#include "base/debug/crash_logging.h"')
a='''std::unique_ptr<TemplateURLData> Resolver::GetFallbackSearch() const {
  return TemplateURLPrepopulateData::GetPrepopulatedFallbackSearch(
      profile_prefs_.get(),
      regional_capabilities_->GetRegionalPrepopulatedEngines());
}'''
b='''std::unique_ptr<TemplateURLData> Resolver::GetFallbackSearch() const {
  auto native_fallback = [&]() {
    return TemplateURLPrepopulateData::GetPrepopulatedFallbackSearch(
        profile_prefs_.get(),
        regional_capabilities_->GetRegionalPrepopulatedEngines());
  };
  const auto* marker = profile_prefs_->FindPreference(blanc_cohort::kPrefName);
  const auto* overrides = profile_prefs_->FindPreference(prefs::kSearchProviderOverrides);
  const auto os_country = country_codes::GetCurrentCountryID();
  const blanc_cohort::Facts facts{
      .eligible_marker = marker && marker->IsUserControlled() &&
          profile_prefs_->GetInteger(blanc_cohort::kPrefName) == 1,
      .overrides_absent = overrides && overrides->IsDefaultValue() &&
          !profile_prefs_->GetUserPrefValue(prefs::kSearchProviderOverrides),
      .native_choice_region = regional_capabilities_->IsInSearchEngineChoiceScreenRegion(),
      .os_country_valid = os_country.IsValid(),
      .os_choice_region = regional_capabilities::RegionalCapabilitiesService::
          IsInAnySearchEngineChoiceScreenRegion(os_country),
  };
  if (!blanc_cohort::Eligible(facts)) return native_fallback();
  auto engines = GetPrepopulatedEngines();
  std::unique_ptr<TemplateURLData> selected;
  int count = 0;
  for (auto& engine : engines) {
    if (engine->prepopulate_id != 92) continue;
    ++count;
    if (engine->url() == "https://duckduckgo.com/?q={searchTerms}" &&
        engine->search_url_post_params.empty())
      selected = std::move(engine);
  }
  if (!blanc_cohort::AcceptCanonicalDdg(count, !!selected)) return native_fallback();
  return selected;
}'''
replace('template_url_prepopulate_data_resolver.cc',a,b)
replace('template_url_prepopulate_data_resolver.h','  std::unique_ptr<TemplateURLData> GetFallbackSearch() const;', '  std::unique_ptr<TemplateURLData> GetFallbackSearch() const;\n  bool IntroducesBlancDdgFallback() const;')
replace('template_url_prepopulate_data_resolver.cc', 'std::optional<BuiltinKeywordsMetadata>\nResolver::ComputeDatabaseUpdateRequirements(', """bool Resolver::IntroducesBlancDdgFallback() const {
  auto chosen = GetFallbackSearch();
  auto native = TemplateURLPrepopulateData::GetPrepopulatedFallbackSearch(
      profile_prefs_.get(),
      regional_capabilities_->GetRegionalPrepopulatedEngines());
  return chosen && chosen->prepopulate_id == 92 &&
         (!native || native->prepopulate_id != 92);
}

std::optional<BuiltinKeywordsMetadata>
Resolver::ComputeDatabaseUpdateRequirements(""")
replace('template_url_service.cc','#include "components/search_engines/template_url_service.h"','#include "components/search_engines/template_url_service.h"\n#include "cohort_policy.h"')
replace('template_url_service.h','  bool loaded_ = false;','  bool loaded_ = false;\n  bool blanc_cohort_preload_deferred_ = false;')
replace('template_url_service.cc','  if (!data) {\n    default_search_provider_ = nullptr;\n  } else if (source == DefaultSearchManager::FROM_EXTENSION) {', """  // Do not explicitly add a missing model entry or select/overwrite an edited
  // one here. Earlier WebData reconciliation can still recreate a deletion;
  // pre-merge persisted-row provenance remains unresolved.
  const bool introduced =
      source == DefaultSearchManager::FROM_FALLBACK && data &&
      data->prepopulate_id == 92 &&
      prepopulate_data_resolver_->IntroducesBlancDdgFallback();
  TemplateURL* collision = introduced ? FindPrepopulatedTemplateURL(92) : nullptr;
  if (blanc_cohort::RejectEditedCollision(
          source == DefaultSearchManager::FROM_FALLBACK,
          data ? data->prepopulate_id : 0, introduced,
          collision != nullptr, collision && collision->safe_for_autoreplace())) {
    default_search_provider_ = nullptr;
  } else if (!data) {
    default_search_provider_ = nullptr;
  } else if (source == DefaultSearchManager::FROM_EXTENSION) {""")
replace('template_url_service.cc','  if (!loaded_) {\n    // Set pre-loading default search provider from the preferences.', """  if (!loaded_) {
    // The WebData row has not been examined yet. Do not make a newly
    // introduced cohort fallback routable before checking for deletion/edit.
    blanc_cohort_preload_deferred_ =
        source == DefaultSearchManager::FROM_FALLBACK && data &&
        data->prepopulate_id == 92 &&
        prepopulate_data_resolver_->IntroducesBlancDdgFallback();
    if (blanc_cohort_preload_deferred_) data = nullptr;
    // Set pre-loading default search provider from the preferences.""")
replace('template_url_service.cc', """  ApplyDefaultSearchChangeNoMetrics(
      pre_loading_providers_->default_search_provider()
          ? &pre_loading_providers_->default_search_provider()->data()
          : nullptr,
      default_search_provider_source_);""", """  if (blanc_cohort_preload_deferred_) {
    blanc_cohort_preload_deferred_ = false;
    DefaultSearchManager::Source source;
    const TemplateURLData* current =
        default_search_manager_.GetDefaultSearchEngine(&source);
    ApplyDefaultSearchChangeNoMetrics(current, source);
  } else {
    ApplyDefaultSearchChangeNoMetrics(
        pre_loading_providers_->default_search_provider()
            ? &pre_loading_providers_->default_search_provider()->data()
            : nullptr,
        default_search_provider_source_);
  }""")
for n,v in text.items(): (root/n).write_text(v)
(root/'source-hashes.json').write_text(json.dumps({n:{'input':hashlib.sha256((src/n).read_bytes()).hexdigest(),'candidate':hashlib.sha256((root/n).read_bytes()).hexdigest()} for n in files},indent=2)+'\n')

overlay=root/'overlay/components/search_engines'
overlay.mkdir(parents=True, exist_ok=True)
for n in ['template_url_prepopulate_data_resolver.h','default_search_manager.h','template_url_service.h']:
 (overlay/n).write_text(text[n])

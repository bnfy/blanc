#include "enrollment_candidate.h"
#include "cohort_policy.h"
#include "chrome/browser/profiles/profile.h"
#include "components/prefs/pref_service.h"
#include "components/search_engines/default_search_manager.h"
#include "components/search_engines/search_engines_pref_names.h"
#include "content/public/browser/browser_thread.h"
namespace blanc::cohort_candidate {
ImportResolution::ImportResolution(base::WeakPtr<Profile> profile)
    : profile_(std::move(profile)) {}
ImportResolution::~ImportResolution() = default;
Result Enrollment::Run(Profile* profile, const ImportResolution& import) {
  DCHECK_CURRENTLY_ON(content::BrowserThread::UI);
  if (consumed_) return Result::kPreserved;
  consumed_ = true;
  if (!profile || import.profile_.get() != profile || profile->ShutdownStarted() ||
      !profile->IsRegularProfile() || profile->IsOffTheRecord() ||
      !proof_.Matches(profile->GetPath())) return Result::kPreserved;
  auto* prefs = profile->GetPrefs();
  if (!prefs || prefs->ReadOnly() ||
      prefs->GetInitializationStatus() !=
          PrefService::INITIALIZATION_STATUS_CREATED_NEW_PREF_STORE)
    return Result::kPreserved;
  auto untouched = [prefs](const char* name) {
    const auto* pref = prefs->FindPreference(name);
    return pref && pref->IsDefaultValue() && !prefs->GetUserPrefValue(name);
  };
  if (!untouched(blanc_cohort::kPrefName) ||
      !untouched(DefaultSearchManager::kDefaultSearchProviderDataPrefName) ||
      !untouched(prefs::kDefaultSearchProviderGUID) ||
      !untouched(prefs::kSearchProviderOverrides)) return Result::kPreserved;
  // SetInteger may notify observers synchronously. Never dereference profile
  // or prefs after it: the caller must handle later shutdown and persistence.
  prefs->SetInteger(blanc_cohort::kPrefName, 1);
  return Result::kSetInMemoryNotDurable;
}
}

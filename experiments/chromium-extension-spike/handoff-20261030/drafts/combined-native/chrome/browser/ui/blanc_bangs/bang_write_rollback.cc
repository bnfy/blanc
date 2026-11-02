#include "bang_write_rollback.h"
#include "bang_pref_registration.h"
#include "components/prefs/pref_service.h"

namespace blanc::bangs::draft {
bool RestoreBangPrefIfUnchanged(PrefService* prefs, SavedBangPref key,
                                const base::Value& expected,
                                const std::optional<base::Value>& previous,
                                uint64_t expected_epoch, uint64_t current_epoch) {
  const char* name = key == SavedBangPref::kEnabled ? kBangEnabled : kBangCustom;
  if (expected_epoch != current_epoch || !prefs || !prefs->FindPreference(name) ||
      !prefs->IsUserModifiablePreference(name))
    return false;
  const auto* current = prefs->GetUserPrefValue(name);
  if (!current || *current != expected)
    return false;
  if (previous)
    prefs->Set(name, *previous);
  else
    prefs->ClearPref(name);
  return true;
}
}  // namespace blanc::bangs::draft

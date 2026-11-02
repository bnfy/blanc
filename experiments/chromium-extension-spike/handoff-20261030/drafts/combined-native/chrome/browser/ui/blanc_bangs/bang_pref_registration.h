#ifndef BLANC_BANGS_DRAFT_PREF_REGISTRATION_H_
#define BLANC_BANGS_DRAFT_PREF_REGISTRATION_H_
#include "components/prefs/pref_registry_simple.h"
namespace blanc::bangs::draft {
inline constexpr char kBangEnabled[] = "blanc.bangs.enabled";
inline constexpr char kBangCustom[] = "blanc.bangs.custom_utf16_v1";
inline constexpr char kBangRecents[] = "blanc.bangs.recent";
inline void RegisterBangPrefs(PrefRegistrySimple* registry) {
  registry->RegisterBooleanPref(kBangEnabled, true);
  registry->RegisterListPref(kBangCustom);
  registry->RegisterListPref(kBangRecents);
}
}  // namespace blanc::bangs::draft
#endif

#ifndef BLANC_BANGS_DRAFT_PREFS_H_
#define BLANC_BANGS_DRAFT_PREFS_H_
#include "bang_custom.h"
#include "bang_pref_registration.h"
#include <optional>
#include <string>
#include <vector>
class PrefService;
namespace blanc::bangs::draft {
struct BangPrefSnapshot { bool enabled; std::vector<BangEntry> custom; std::vector<std::string> recent; };
// Internal primitive only. An actual browser owner must supply the original
// profile's PrefService and derive private state from the actual target tab.
std::optional<BangPrefSnapshot> ReadBangPrefs(PrefService* prefs);
bool SetBangEnabled(PrefService* prefs,bool enabled);
bool SetBangCustom(PrefService* prefs,const std::vector<CustomBangInput>& custom);
// These return accepted in-memory mutations, not a durable disk-write receipt.
bool RecordBangRecent(PrefService* prefs,std::string_view code,bool is_private);
bool ClearBangRecents(PrefService* prefs,bool is_private);
}  // namespace blanc::bangs::draft
#endif

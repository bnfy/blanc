#ifndef BLANC_BANGS_DRAFT_PREFS_H_
#define BLANC_BANGS_DRAFT_PREFS_H_
#include "bang_custom.h"
#include <optional>
#include <string>
#include <vector>
class PrefRegistrySimple;
class PrefService;
namespace blanc::bangs::draft {
inline constexpr char kBangEnabled[]="blanc.bangs.enabled";
inline constexpr char kBangCustom[]="blanc.bangs.custom_utf16_v1";
inline constexpr char kBangRecents[]="blanc.bangs.recent";
struct BangPrefSnapshot { bool enabled; std::vector<BangEntry> custom; std::vector<std::string> recent; };
// Internal primitive only. An actual browser owner must supply the original
// profile's PrefService and derive private state from the actual target tab.
void RegisterBangPrefs(PrefRegistrySimple* registry);
std::optional<BangPrefSnapshot> ReadBangPrefs(PrefService* prefs);
bool SetBangEnabled(PrefService* prefs,bool enabled);
bool SetBangCustom(PrefService* prefs,const std::vector<CustomBangInput>& custom);
// These return accepted in-memory mutations, not a durable disk-write receipt.
bool RecordBangRecent(PrefService* prefs,std::string_view code,bool is_private);
bool ClearBangRecents(PrefService* prefs,bool is_private);
}  // namespace blanc::bangs::draft
#endif

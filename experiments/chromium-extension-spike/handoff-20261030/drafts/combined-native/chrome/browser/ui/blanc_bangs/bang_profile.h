#ifndef BLANC_BANGS_DRAFT_PROFILE_H_
#define BLANC_BANGS_DRAFT_PROFILE_H_
#include "bang_prefs.h"
#include "bang_mutation.h"
class Profile;
namespace blanc::bangs::draft {
// Caller must be trusted browser code and pass the actual source tab profile.
// This adapter does not establish WebUI, window or tab ownership.
std::optional<BangPrefSnapshot> ReadProfileBangPrefs(Profile* source);
bool SetProfileBangEnabled(Profile* source,bool enabled);
bool SetProfileBangCustom(Profile* source,const std::vector<CustomBangInput>& custom);
bool RecordProfileBangRecent(Profile* source,std::string_view code);
bool ClearProfileBangRecents(Profile* source);
CustomMutation AddProfileCustomBang(Profile* source, const CustomBangInput& input);
CustomMutation RemoveProfileCustomBang(Profile* source, std::string_view code);
}  // namespace blanc::bangs::draft
#endif

#include "bang_profile.h"
#include "chrome/browser/profiles/profile.h"
namespace blanc::bangs::draft {
namespace {
Profile* Owner(Profile* source){
 if(!source || source->IsGuestSession() || source->IsSystemProfile())return nullptr;
 if(source->IsOffTheRecord() && (!source->IsIncognitoProfile() || !source->IsPrimaryOTRProfile()))return nullptr;
 if(!source->IsOffTheRecord() && !source->IsRegularProfile())return nullptr;
 auto* owner=source->GetOriginalProfile();
 if(!owner || owner->IsOffTheRecord() || !owner->IsRegularProfile() || owner->IsGuestSession() || owner->IsSystemProfile())return nullptr;
 return owner;
}
}  // namespace
std::optional<BangPrefSnapshot> ReadProfileBangPrefs(Profile* source){auto* p=Owner(source);return p?ReadBangPrefs(p->GetPrefs()):std::nullopt;}
bool SetProfileBangEnabled(Profile* source,bool enabled){auto* p=Owner(source);return p&&SetBangEnabled(p->GetPrefs(),enabled);}
bool SetProfileBangCustom(Profile* source,const std::vector<CustomBangInput>& custom){auto* p=Owner(source);return p&&SetBangCustom(p->GetPrefs(),custom);}
bool RecordProfileBangRecent(Profile* source,std::string_view code){auto* p=Owner(source);return p&&RecordBangRecent(p->GetPrefs(),code,source->IsOffTheRecord());}
bool ClearProfileBangRecents(Profile* source){auto* p=Owner(source);return p&&ClearBangRecents(p->GetPrefs(),source->IsOffTheRecord());}
CustomMutation AddProfileCustomBang(Profile* source,const CustomBangInput& input){auto* p=Owner(source);return p?AddCustomBang(p->GetPrefs(),input):CustomMutation::kUnavailable;}
CustomMutation RemoveProfileCustomBang(Profile* source,std::string_view code){auto* p=Owner(source);return p?RemoveCustomBang(p->GetPrefs(),code):CustomMutation::kUnavailable;}
}  // namespace blanc::bangs::draft

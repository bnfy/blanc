#include "bang_prefs.h"
#include <algorithm>
#include <set>
#include <utility>
#include "base/strings/utf_string_conversions.h"
#include "base/values.h"
#include "components/prefs/pref_registry_simple.h"
#include "components/prefs/pref_service.h"
namespace blanc::bangs::draft {
namespace {
bool Registered(PrefService* prefs,std::string_view key){return prefs&&prefs->FindPreference(key);}
bool Writable(PrefService* prefs,std::string_view key){return Registered(prefs,key)&&prefs->IsUserModifiablePreference(key);}
bool ValidCode(std::string_view code){
 if(code.empty()||code.size()>32)return false;
 for(size_t i=0;i<code.size();++i){auto c=code[i];if(!((c>='a'&&c<='z')||(c>='A'&&c<='Z')||(c>='0'&&c<='9')||(i>0&&(c=='_'||c=='-'))))return false;}
 return true;
}
base::ListValue ToUnits(std::u16string_view text){base::ListValue v;v.reserve(text.size());for(auto c:text)v.Append(static_cast<int>(c));return v;}
std::optional<std::u16string> FromUnits(const base::ListValue* list,size_t limit){
 if(!list||list->size()>limit)return std::nullopt;std::u16string out;out.reserve(list->size());
 for(const auto& x:*list){auto n=x.GetIfInt();if(!n||*n<0||*n>0xffff)return std::nullopt;out.push_back(static_cast<char16_t>(*n));}
 return out;
}
std::vector<std::string> Recents(const base::ListValue& values){
 std::vector<std::string> out;std::set<std::string> seen;
 for(const auto& value:values){const auto* code=value.GetIfString();if(!code||!ValidCode(*code)||!seen.insert(*code).second)continue;out.push_back(*code);if(out.size()==10)break;}
 return out;
}
base::ListValue EncodeRecents(const std::vector<std::string>& values){base::ListValue out;for(const auto& x:values)out.Append(x);return out;}
}  // namespace
void RegisterBangPrefs(PrefRegistrySimple* registry){registry->RegisterBooleanPref(kBangEnabled,true);registry->RegisterListPref(kBangCustom);registry->RegisterListPref(kBangRecents);}
std::optional<BangPrefSnapshot> ReadBangPrefs(PrefService* prefs){
 if(!Registered(prefs,kBangEnabled)||!Registered(prefs,kBangCustom)||!Registered(prefs,kBangRecents))return std::nullopt;
 const auto& values=prefs->GetList(kBangCustom);if(values.size()>1000)return std::nullopt;
 std::vector<CustomBangInput> rows;rows.reserve(values.size());
 for(const auto& value:values){const auto* d=value.GetIfDict();if(!d)continue;const auto* code=d->FindString("code");auto name=FromUnits(d->FindList("name_units"),60);auto templ=FromUnits(d->FindList("template_units"),2048);if(!code||!ValidCode(*code)||!name||!templ)continue;rows.push_back({base::UTF8ToUTF16(*code),std::move(*name),std::move(*templ)});}
 return BangPrefSnapshot{prefs->GetBoolean(kBangEnabled),NormalizeCustomBangs(rows),Recents(prefs->GetList(kBangRecents))};
}
bool SetBangEnabled(PrefService* prefs,bool enabled){if(!Writable(prefs,kBangEnabled))return false;prefs->SetBoolean(kBangEnabled,enabled);return true;}
bool SetBangCustom(PrefService* prefs,const std::vector<CustomBangInput>& custom){
 if(!Writable(prefs,kBangCustom))return false;auto normalized=NormalizeCustomBangs(custom);base::ListValue values;
 for(const auto& row:normalized){base::DictValue v;v.Set("code",row.code);v.Set("name_units",ToUnits(row.name));v.Set("template_units",ToUnits(row.template_url));values.Append(std::move(v));}
 prefs->SetList(kBangCustom,std::move(values));return true;
}
bool RecordBangRecent(PrefService* prefs,std::string_view code,bool is_private){
 if(is_private||!ValidCode(code)||!Writable(prefs,kBangRecents))return false;
 auto rows=Recents(prefs->GetList(kBangRecents));const auto before=rows;rows.erase(std::remove(rows.begin(),rows.end(),code),rows.end());rows.insert(rows.begin(),std::string(code));if(rows.size()>10)rows.resize(10);if(rows==before)return false;prefs->SetList(kBangRecents,EncodeRecents(rows));return true;
}
bool ClearBangRecents(PrefService* prefs,bool is_private){if(is_private||!Writable(prefs,kBangRecents)||Recents(prefs->GetList(kBangRecents)).empty())return false;prefs->SetList(kBangRecents,base::ListValue());return true;}
}  // namespace blanc::bangs::draft

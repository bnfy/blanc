#include "bang_catalog.h"
#include <set>
#include <utility>
#include "base/json/json_reader.h"
#include "base/strings/string_number_conversions.h"
#include "base/strings/string_util.h"
#include "base/strings/utf_string_conversions.h"
#include "base/values.h"
#include "crypto/hash.h"
namespace blanc::bangs::draft {
namespace {
constexpr size_t kMaxBytes = 2 * 1024 * 1024;
constexpr size_t kMaxFieldBytes = 4096;
constexpr size_t kEntryCount = 10624;
constexpr size_t kPopularCount = 19;
constexpr char kCatalogHash[] = "6B59AA17E2A8466BA812A06C0B3D81A39FE4D97D497EDFAE5061D184CAA8FE7E";
bool ValidCode(std::string_view s) {
  if(s.empty() || s.size()>32)return false;
  for(size_t i=0;i<s.size();++i) {
    const char c=s[i];
    if(!((c>='a'&&c<='z')||(c>='0'&&c<='9')||(i>0&&(c=='_'||c=='-'))))return false;
  }
  return true;
}
const std::string* StringAt(const base::ListValue& row,size_t index) {
  const auto* value=row[index].GetIfString();
  if(!value || value->size()>kMaxFieldBytes || !base::IsStringUTF8(*value))return nullptr;
  return value;
}
}  // namespace
std::optional<BangCatalog> ParsePinnedCatalog(std::string_view bytes) {
  if(bytes.empty() || bytes.size()>kMaxBytes ||
      base::HexEncode(crypto::hash::Sha256(bytes))!=kCatalogHash) return std::nullopt;
  auto root=base::JSONReader::ReadDict(bytes,base::JSON_PARSE_RFC);
  if(!root || root->FindInt("version")!=1)return std::nullopt;
  const auto* entries=root->FindList("entries");const auto* popular=root->FindList("popular");
  if(!entries || entries->size()!=kEntryCount || !popular || popular->size()!=kPopularCount)return std::nullopt;
  BangCatalog out;out.entries.reserve(entries->size());out.popular.reserve(popular->size());
  std::set<std::string> available;
  for(const auto& value:*entries) {
    const auto* row=value.GetIfList();if(!row || row->size()!=7)return std::nullopt;
    const auto* code=StringAt(*row,0);const auto* aliases=(*row)[1].GetIfList();
    const auto* name=StringAt(*row,2);const auto* domain=StringAt(*row,3);
    const auto* templ=StringAt(*row,4);const auto bits=(*row)[5].GetIfInt();
    const auto* home=StringAt(*row,6);
    if(!code||!ValidCode(*code)||!aliases||aliases->size()>32||!name||!domain||!templ||
       !bits||*bits<0||*bits>3||!home)return std::nullopt;
    BangEntry entry{*code,{},base::UTF8ToUTF16(*name),base::UTF8ToUTF16(*templ),base::UTF8ToUTF16(*home),*bits,base::UTF8ToUTF16(*domain)};
    available.insert(*code);
    for(const auto& alias:*aliases) {
      const auto* a=alias.GetIfString();if(!a||!ValidCode(*a))return std::nullopt;
      entry.aliases.push_back(*a);available.insert(*a);
    }
    out.entries.push_back(std::move(entry));
  }
  for(const auto& value:*popular){
    const auto* code=value.GetIfString();if(!code||!ValidCode(*code)||!available.contains(*code))return std::nullopt;
    out.popular.push_back(*code);
  }
  return out;
}
}  // namespace blanc::bangs::draft

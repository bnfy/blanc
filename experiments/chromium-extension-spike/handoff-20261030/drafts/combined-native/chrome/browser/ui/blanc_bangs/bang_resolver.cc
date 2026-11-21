#include "bang_resolver.h"
#include <algorithm>
namespace blanc::bangs::draft {
BangResolution ResolveBang(std::u16string_view input, bool enabled,
                           const std::vector<BangEntry>& custom,
                           const std::vector<BangEntry>& catalog) {
  auto parsed=ParseBang(input);
  if(!parsed)return {ResolveStatus::kNotBang,false,{},{},{},{}};
  if(!enabled)return {ResolveStatus::kDisabled,true,{},{},{},{}};
  const BangEntry* entry=nullptr;
  for(const auto& item:custom)if(item.code==parsed->code){entry=&item;break;}
  if(!entry)for(const auto& item:catalog) {
    if(item.code==parsed->code || std::find(item.aliases.begin(),item.aliases.end(),parsed->code)!=item.aliases.end()) {
      entry=&item;break;
    }
  }
  if(!entry)return {ResolveStatus::kUnknown,true,{},{},{},{}};
  std::u16string url=entry->home;
  if(!parsed->query.empty()) {
    auto encoded=EncodeBangQuery(parsed->query,entry->encoding);
    if(!encoded)return {ResolveStatus::kInvalidEncoding,true,{},{},{},{}};
    url=entry->template_url;
    const auto at=url.find(u"%s");
    if(at!=std::u16string::npos)url.replace(at,2,*encoded);
  }
  return {ResolveStatus::kResolved,true,entry->code,entry->name,parsed->query,std::move(url)};
}
}  // namespace blanc::bangs::draft

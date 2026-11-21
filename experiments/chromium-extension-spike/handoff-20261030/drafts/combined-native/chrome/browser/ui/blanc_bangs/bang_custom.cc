#include "bang_custom.h"
#include <algorithm>
#include <set>
#include <string_view>
#include "base/strings/utf_string_conversions.h"
#include "net/base/ip_address.h"
#include "url/gurl.h"
#include "url/origin.h"
namespace blanc::bangs::draft {
namespace {
bool Space(char16_t c) {
  return (c>=0x09 && c<=0x0d) || c==0x20 || c==0xa0 || c==0x1680 ||
      (c>=0x2000 && c<=0x200a) || c==0x2028 || c==0x2029 ||
      c==0x202f || c==0x205f || c==0x3000 || c==0xfeff;
}
std::u16string Trim(std::u16string_view s) {
  while(!s.empty()&&Space(s.front()))s.remove_prefix(1);
  while(!s.empty()&&Space(s.back()))s.remove_suffix(1);
  return std::u16string(s);
}
std::optional<std::string> Code(std::u16string_view s) {
  if(s.empty()||s.size()>32)return std::nullopt;
  std::string code;
  for(size_t i=0;i<s.size();++i) {
    char16_t c=s[i];
    if(c>=u'A'&&c<=u'Z')c+=u'a'-u'A';
    if(!((c>=u'a'&&c<=u'z')||(c>=u'0'&&c<=u'9')||(i>0&&(c==u'_'||c==u'-'))))return std::nullopt;
    code.push_back(static_cast<char>(c));
  }
  return code;
}
bool EndsWith(std::string_view str,std::string_view suffix) {
  return str.size()>=suffix.size() && str.substr(str.size()-suffix.size())==suffix;
}
bool LocalHost(std::string_view host) {
  if(host.empty())return false;
  if(host=="localhost" || EndsWith(host,".localhost"))return true;
  if(host.front()=='[' && host.back()==']')host=host.substr(1,host.size()-2);
  auto ip=net::IPAddress::FromIPLiteral(host);
  if(ip) {
    if(ip->IsIPv4()) {
      auto b=ip->bytes();const auto a=b[0],second=b[1];
      return a==127||a==10||(a==172&&second>=16&&second<=31)||
          (a==192&&second==168)||(a==169&&second==254)||
          (a==100&&second>=64&&second<=127);
    }
    if(ip->IsIPv6()) {
      if(ip->IsLoopback())return true;
      auto b=ip->bytes();return (b[0]&0xfe)==0xfc || (b[0]==0xfe && (b[1]&0xc0)==0x80);
    }
    return false;
  }
  // A malformed numeric host must not be treated as a single-label intranet.
  if(std::all_of(host.begin(),host.end(),[](char c){return (c>='0'&&c<='9')||c=='.';}))return false;
  return host.find('.')==std::string_view::npos || EndsWith(host,".local") ||
      EndsWith(host,".lan") || EndsWith(host,".internal") || EndsWith(host,".home.arpa");
}
}  // namespace
std::vector<BangEntry> NormalizeCustomBangs(const std::vector<CustomBangInput>& input) {
  std::vector<BangEntry> out;std::set<std::string> seen;
  for(const auto& row:input) {
    auto code=Code(Trim(row.code));auto name=Trim(row.name);auto templ=Trim(row.template_url);
    if(!code || seen.contains(*code) || name.empty() || name.size()>60 ||
       templ.empty() || templ.size()>2048)continue;
    const auto marker=templ.find(u"%s");
    if(marker==std::u16string::npos || templ.find(u"%s",marker+2)!=std::u16string::npos)continue;
    auto probe=templ;probe.replace(marker,2,u"blancsearchprobe");
    GURL url(base::UTF16ToUTF8(probe));
    if(!url.is_valid() || !url.username().empty() || !url.password().empty() ||
       url.host().find("blancsearchprobe")!=std::string::npos ||
       !(url.SchemeIs("https") || (url.SchemeIs("http") && LocalHost(url.host()))))continue;
    auto home=url::Origin::Create(url).GetURL();if(!home.is_valid())continue;
    std::string domain(url.host());if(url.has_port()){domain.push_back(':');domain.append(url.port());}
    out.push_back(BangEntry{*code,{},std::move(name),std::move(templ),
        base::UTF8ToUTF16(home.spec()),3,base::UTF8ToUTF16(domain)});
    seen.insert(*code);if(out.size()==100)break;
  }
  return out;
}
}  // namespace blanc::bangs::draft

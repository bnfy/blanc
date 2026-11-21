#include "bang_syntax.h"
#include <utility>
#include <vector>
namespace blanc::bangs::draft {
namespace {
bool Space(char16_t c) {
  return (c>=0x09 && c<=0x0d) || c==0x20 || c==0xa0 || c==0x1680 ||
      (c>=0x2000 && c<=0x200a) || c==0x2028 || c==0x2029 ||
      c==0x202f || c==0x205f || c==0x3000 || c==0xfeff;
}
bool CodeChar(char16_t c) {
  return (c>=u'a' && c<=u'z') || (c>=u'A' && c<=u'Z') ||
      (c>=u'0' && c<=u'9') || c==u'_' || c==u'-';
}
bool FirstCodeChar(char16_t c) {return CodeChar(c) && c!=u'_' && c!=u'-';}
std::optional<std::string> Code(std::u16string_view token) {
  if (token.size()<2 || token.size()>33 || token[0]!=u'!' ||
      !FirstCodeChar(token[1])) return std::nullopt;
  std::string out;
  for(size_t i=1;i<token.size();++i) {
    auto c=token[i]; if(!CodeChar(c))return std::nullopt;
    if(c>=u'A'&&c<=u'Z')c+=u'a'-u'A';
    out.push_back(static_cast<char>(c));
  }
  return out;
}
bool Safe(unsigned char c) {
  return (c>='A'&&c<='Z')||(c>='a'&&c<='z')||(c>='0'&&c<='9')||
      c=='-'||c=='_'||c=='.'||c=='!'||c=='~'||c=='*'||c=='\''||c=='('||c==')';
}
void AppendEncoded(std::u16string& out,unsigned char c) {
  constexpr char hex[]="0123456789ABCDEF";
  if(Safe(c)){out.push_back(c);return;}
  out.push_back(u'%');out.push_back(hex[c>>4]);out.push_back(hex[c&15]);
}
}  // namespace
std::optional<ParsedBang> ParseBang(std::u16string_view text) {
  std::vector<std::u16string_view> tokens;
  for(size_t i=0;i<text.size();) {
    while(i<text.size()&&Space(text[i]))++i;
    if(i==text.size())break;
    const size_t start=i;while(i<text.size()&&!Space(text[i]))++i;
    tokens.push_back(text.substr(start,i-start));
  }
  if(tokens.empty())return std::nullopt;
  auto code=Code(tokens.front());bool at_start=true;
  if(!code&&tokens.size()>1){code=Code(tokens.back());at_start=false;}
  if(!code)return std::nullopt;
  const size_t begin=at_start?1:0,end=at_start?tokens.size():tokens.size()-1;
  std::u16string query;
  for(size_t i=begin;i<end;++i){if(i!=begin)query.push_back(u' ');query.append(tokens[i]);}
  return ParsedBang{*code,std::move(query),at_start};
}
std::optional<std::u16string> EncodeBangQuery(std::u16string_view query,int bits) {
  std::u16string out;
  if(!(bits&1)) {
    out=std::u16string(query);
    if(bits&2)for(auto& c:out)if(c==u' ')c=u'+';
    return out;
  }
  for(size_t i=0;i<query.size();++i) {
    uint32_t cp=query[i];
    if(cp>=0xd800 && cp<=0xdbff) {
      if(i+1>=query.size()||query[i+1]<0xdc00||query[i+1]>0xdfff)return std::nullopt;
      cp=0x10000+((cp-0xd800)<<10)+(query[++i]-0xdc00);
    } else if(cp>=0xdc00&&cp<=0xdfff) return std::nullopt;
    if(cp==0x20 && (bits&2)){out.push_back(u'+');continue;}
    if(cp<=0x7f)AppendEncoded(out,static_cast<unsigned char>(cp));
    else if(cp<=0x7ff){AppendEncoded(out,0xc0|(cp>>6));AppendEncoded(out,0x80|(cp&0x3f));}
    else if(cp<=0xffff){AppendEncoded(out,0xe0|(cp>>12));AppendEncoded(out,0x80|((cp>>6)&0x3f));AppendEncoded(out,0x80|(cp&0x3f));}
    else {AppendEncoded(out,0xf0|(cp>>18));AppendEncoded(out,0x80|((cp>>12)&0x3f));AppendEncoded(out,0x80|((cp>>6)&0x3f));AppendEncoded(out,0x80|(cp&0x3f));}
  }
  return out;
}
}  // namespace blanc::bangs::draft

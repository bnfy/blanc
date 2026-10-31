#include "bang_custom.h"
#include <string>
#include <vector>
using namespace blanc::bangs::draft;
int main(){
 std::vector<CustomBangInput> rows={
  {u"  YOUTUBE ",u" Custom ",u"https://search.example/find?q=%s"},
  {u"youtube",u"duplicate",u"https://ignored.example/?q=%s"},
  {u"bad",u"Bad",u"http://remote.example/?q=%s"},
  {u"leak",u"Leak",u"https://%s.example/"},
  {u"auth",u"Auth",u"https://user:<redacted-email>/?q=%s"},
  {u"local",u"Local",u"http://localhost:8080/?q=%s"},
  {u"rfc1918",u"Local IP",u"http://192.168.2.1/?q=%s"},
  {u"ipv6",u"Local v6",u"http://[fd00::1]/?q=%s"},
  {u"dupe",u"Bad",u"https://x.example/?q=%s&other=%s"},
  {u"invalid",u"Bad",u"https://x.example/?q=%S"}};
 auto result=NormalizeCustomBangs(rows);
 if(result.size()!=4)return 2;
 if(result[0].code!="youtube"||result[0].name!=u"Custom"||
    result[0].home!=u"https://search.example/"||result[0].domain!=u"search.example")return 3;
 if(result[1].code!="local"||result[1].home!=u"http://localhost:8080/"||
    result[1].domain!=u"localhost:8080")return 4;
 if(result[2].code!="rfc1918"||result[3].code!="ipv6")return 5;
 std::u16string lone(1,static_cast<char16_t>(0xd800));
 auto weird=NormalizeCustomBangs({{u"ok",lone,u"https://example.com/?q=%s"}});
 if(weird.size()!=1||weird[0].name!=lone)return 6;
 std::vector<CustomBangInput> many;
 for(int i=0;i<105;i++)many.push_back({u"b"+std::u16string(i+1,u'a'),u"N",u"https://example.com/?q=%s"});
 // Codes longer than 32 are rejected; only the first 31 remain.
 if(NormalizeCustomBangs(many).size()!=31)return 7;
 return 0;
}

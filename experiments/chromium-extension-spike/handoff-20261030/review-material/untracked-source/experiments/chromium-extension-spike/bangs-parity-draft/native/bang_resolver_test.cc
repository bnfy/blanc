#include "bang_resolver.h"
#include <cassert>
using namespace blanc::bangs::draft;
int main(){
 std::vector<BangEntry> catalog={{"yt",{"youtube","ty"},u"YouTube",u"https://www.youtube.com/results?search_query=%s",u"https://www.youtube.com/",3},{"w",{},u"Wiki",u"https://wiki.example/%s",u"https://wiki.example/",1}};
 std::vector<BangEntry> custom={{"youtube",{},u"Custom",u"https://custom.example/?q=%s",u"https://custom.example/",3}};
 auto a=ResolveBang(u"!yt snow & ice",true,{},catalog);assert(a.status==ResolveStatus::kResolved&&a.url==u"https://www.youtube.com/results?search_query=snow+%26+ice"&&a.code=="yt");
 auto b=ResolveBang(u"snow !youtube",true,custom,catalog);assert(b.status==ResolveStatus::kResolved&&b.url==u"https://custom.example/?q=snow"&&b.code=="youtube");
 auto c=ResolveBang(u"!youtube",true,{},catalog);assert(c.status==ResolveStatus::kResolved&&c.url==u"https://www.youtube.com/"&&c.code=="yt");
 assert(ResolveBang(u"!yt x",false,{},catalog).status==ResolveStatus::kDisabled);
 assert(ResolveBang(u"!unknown x",true,{},catalog).status==ResolveStatus::kUnknown);
 assert(ResolveBang(u"normal words",true,{},catalog).status==ResolveStatus::kNotBang);
 std::u16string bad=u"!yt ";bad.push_back(0xd800);assert(ResolveBang(bad,true,{},catalog).status==ResolveStatus::kInvalidEncoding);
 auto duplicate=catalog;duplicate.push_back({"other",{"youtube"},u"Other",u"https://other/?q=%s",u"https://other/",3});
 assert(ResolveBang(u"!youtube x",true,{},duplicate).code=="yt");
}

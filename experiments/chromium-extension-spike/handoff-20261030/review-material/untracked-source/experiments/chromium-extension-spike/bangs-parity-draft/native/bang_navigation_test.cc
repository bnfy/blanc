#include "bang_navigation.h"
#include <string>
using namespace blanc::bangs::draft;
int main() {
  BangPrefSnapshot prefs{true, {}, {}};
  BangCatalog catalog{{{"yt", {"youtube"}, u"YouTube", u"https://www.youtube.com/results?search_query=%s", u"https://www.youtube.com/", 3}}, {}};
  auto r=ResolveNavigation(u"!yt music", &prefs, &catalog);
  if(r.status!=NavigationStatus::kBang || !r.suppress_suggestions || !r.url || r.url->spec()!="https://www.youtube.com/results?search_query=music" || r.recent_code!="yt")return 1;
  r=ResolveNavigation(u"words !youtube", &prefs, &catalog);
  if(r.status!=NavigationStatus::kBang || !r.url || r.recent_code!="yt")return 2;
  r=ResolveNavigation(u"!unknown private words", &prefs, &catalog);
  if(r.status!=NavigationStatus::kSearch || !r.suppress_suggestions || r.url)return 3;
  r=ResolveNavigation(u"ordinary query", nullptr, nullptr);
  if(r.status!=NavigationStatus::kSearch || r.suppress_suggestions)return 4;
  r=ResolveNavigation(u"!yt private words", nullptr, &catalog);
  if(r.status!=NavigationStatus::kUnavailable || !r.suppress_suggestions)return 5;
  r=ResolveNavigation(u"!yt private words", &prefs, nullptr);
  if(r.status!=NavigationStatus::kUnavailable || !r.suppress_suggestions)return 6;
  prefs.enabled=false; r=ResolveNavigation(u"!yt words", &prefs, nullptr);
  if(r.status!=NavigationStatus::kSearch || !r.suppress_suggestions)return 7;
  prefs.enabled=true; prefs.custom.push_back({"yt",{},u"Custom",u"https://example.com/?q=%s",u"https://example.com/",3});
  r=ResolveNavigation(u"!yt two words", &prefs, &catalog);
  if(r.status!=NavigationStatus::kBang || !r.url || r.url->spec()!="https://example.com/?q=two+words")return 8;
  std::u16string unpaired=u"!yt ";unpaired.push_back(0xd800);r=ResolveNavigation(unpaired,&prefs,&catalog);
  if(r.status!=NavigationStatus::kInvalid || !r.suppress_suggestions || r.url)return 9;
  prefs.custom[0].template_url=u"javascript:%s";r=ResolveNavigation(u"!yt x",&prefs,&catalog);
  if(r.status!=NavigationStatus::kInvalid || r.url)return 10;
  return 0;
}

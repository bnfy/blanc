#include "bang_catalog.h"
#include <fstream>
#include <iterator>
#include <string>
using namespace blanc::bangs::draft;
int main(int argc, char** argv) {
  if(argc!=2)return 2;
  std::ifstream input(argv[1],std::ios::binary);
  if(!input)return 3;
  std::string data((std::istreambuf_iterator<char>(input)),std::istreambuf_iterator<char>());
  auto catalog=ParsePinnedCatalog(data);
  if(!catalog || catalog->entries.size()!=10624 || catalog->popular.size()!=19)return 4;
  bool found_domain=false;
  for(const auto& item:catalog->entries)
    if(item.code=="yt") found_domain=item.domain==u"www.youtube.com";
  if(!found_domain)return 5;
  auto result=ResolveBang(u"!youtube snow & ice",true,{},catalog->entries);
  if(result.status!=ResolveStatus::kResolved || result.code!="yt" ||
     result.url!=u"https://www.youtube.com/results?search_query=snow+%26+ice")return 6;
  if(ParsePinnedCatalog({}))return 7;
  std::string mutated=data;mutated[mutated.size()/2]^=1;
  if(ParsePinnedCatalog(mutated))return 8;
  mutated=data;mutated.push_back(' ');if(ParsePinnedCatalog(mutated))return 9;
  if(ParsePinnedCatalog(std::string(2*1024*1024+1,' ')))return 10;
  return 0;
}

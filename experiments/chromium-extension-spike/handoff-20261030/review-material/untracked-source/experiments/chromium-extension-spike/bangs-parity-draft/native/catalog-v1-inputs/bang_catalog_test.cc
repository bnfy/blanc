#include "bang_catalog.h"
#include <cassert>
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
  assert(catalog && catalog->entries.size()==10624 && catalog->popular.size()==19);
  auto result=ResolveBang(u"!youtube snow & ice",true,{},catalog->entries);
  assert(result.status==ResolveStatus::kResolved && result.code=="yt" &&
         result.url==u"https://www.youtube.com/results?search_query=snow+%26+ice");
  assert(!ParsePinnedCatalog({}));
  std::string mutated=data;mutated[mutated.size()/2]^=1;
  assert(!ParsePinnedCatalog(mutated));
  mutated=data;mutated.push_back(' ');assert(!ParsePinnedCatalog(mutated));
  assert(!ParsePinnedCatalog(std::string(2*1024*1024+1,' ')));
}

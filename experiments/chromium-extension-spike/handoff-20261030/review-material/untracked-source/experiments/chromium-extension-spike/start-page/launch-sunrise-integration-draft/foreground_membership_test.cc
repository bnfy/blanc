#include "foreground_membership.h"
#include <cassert>
#include <cstdio>
#include <optional>
#include <vector>

struct Contents {};
struct Model {
  std::vector<Contents*> tabs;
  int selected=0;
  std::vector<std::optional<int>> splits;
  bool valid_split=true;
  int GetIndexOfWebContents(const Contents* c) const {for(size_t i=0;i<tabs.size();++i)if(tabs[i]==c)return static_cast<int>(i);return -1;}
  int active_index() const {return selected;}
  bool ContainsIndex(int i) const {return i>=0 && static_cast<size_t>(i)<tabs.size();}
  std::optional<int> GetSplitForTab(int i) const {return splits.at(i);}
  bool ContainsSplit(int) const {return valid_split;}
};

int main() {
  Contents active, background, other_pane;
  Model model{{&active,&background,&other_pane},0,{std::nullopt,std::nullopt,std::nullopt}};
  assert(SunriseForegroundMember(&model,&active));
  assert(!SunriseForegroundMember(&model,&background));
  assert((!SunriseForegroundMember<Model, Contents>(nullptr,&active)));
  assert(!SunriseForegroundMember(&model,static_cast<Contents*>(nullptr)));
  model.splits={42,std::nullopt,42};
  assert(SunriseForegroundMember(&model,&active));
  assert(SunriseForegroundMember(&model,&other_pane));
  assert(!SunriseForegroundMember(&model,&background));
  model.selected=1;
  assert(!SunriseForegroundMember(&model,&active));
  assert(!SunriseForegroundMember(&model,&other_pane));
  assert(SunriseForegroundMember(&model,&background));
  model.splits={42,99,42};
  assert(!SunriseForegroundMember(&model,&active));
  assert(!SunriseForegroundMember(&model,&other_pane));
  assert(SunriseForegroundMember(&model,&background));
  model.splits={42,std::nullopt,42};
  model.selected=0;model.valid_split=false;
  assert(!SunriseForegroundMember(&model,&active));
  assert(!SunriseForegroundMember(&model,&other_pane));
  model.selected=-1;assert(!SunriseForegroundMember(&model,&active));
  model.selected=40;assert(!SunriseForegroundMember(&model,&active));
  std::puts("PASS active, background, split/Glance-model, split deselection, inconsistent split and null cases");
}

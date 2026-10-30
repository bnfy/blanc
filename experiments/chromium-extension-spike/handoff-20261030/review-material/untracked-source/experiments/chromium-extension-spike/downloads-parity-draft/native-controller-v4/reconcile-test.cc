#include "reconcile.h"
#include <cassert>
#include <map>
#include <vector>
using blanc::downloads_projection::ReconcileSnapshot;
int main() {
  std::map<int,bool> handles{{1,true},{2,true},{3,false}};
  auto live=[](bool value){return value;};
  auto original=handles;
  assert(!ReconcileSnapshot(handles,std::vector<int>{1,4},live));
  assert(handles==original);
  assert(!ReconcileSnapshot(handles,std::vector<int>{1,1},live));
  assert(handles==original);
  assert(!ReconcileSnapshot(handles,std::vector<int>{3},live));
  assert(handles==original);
  assert(ReconcileSnapshot(handles,std::vector<int>{1,2},live));
  assert((handles==std::map<int,bool>{{1,true},{2,true}}));
  assert(ReconcileSnapshot(handles,std::vector<int>{2},live));
  assert((handles==std::map<int,bool>{{2,true}}));
  assert(ReconcileSnapshot(handles,std::vector<int>{},live));
  assert(handles.empty());
}

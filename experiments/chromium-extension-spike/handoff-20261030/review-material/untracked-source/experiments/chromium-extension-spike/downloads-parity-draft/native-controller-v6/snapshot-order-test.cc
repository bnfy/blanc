#include "snapshot-gate.h"
#include "reconcile.h"
#include <cassert>
#include <cstdint>
#include <functional>
#include <memory>
#include <map>
#include <vector>
using blanc::downloads_projection::SnapshotGate;
using blanc::downloads_projection::ReconcileSnapshot;
struct Item {
  std::function<void()> on_destroy;
  ~Item() { if (on_destroy) on_destroy(); }
};
int main() {
  SnapshotGate<int, uint8_t> gate;
  gate.Reset(42);
  std::map<int, bool> handles{{1,true},{2,true},{3,true}};
  auto live=[](bool x){return x;};
  auto apply=[&](const auto& ticket, std::vector<int> visible) {
    return gate.Take(ticket) && ReconcileSnapshot(handles, visible, live);
  };
  auto old=*gate.Begin();
  auto newest=*gate.Begin();
  assert(apply(newest, {1,2}));
  assert((handles==std::map<int,bool>{{1,true},{2,true}}));
  // The late older result must not remove 2.
  assert(!apply(old, {1}));
  assert(!apply(newest, {1}));  // duplicate completion with same generation
  assert((handles==std::map<int,bool>{{1,true},{2,true}}));
  auto in_flight=*gate.Begin();
  assert(!apply(newest, {1}));  // superseded before next result arrives
  assert(!apply(in_flight, {1,1}));  // invalid snapshot consumes ticket, keeps map
  assert((handles==std::map<int,bool>{{1,true},{2,true}}));
  assert(!apply(in_flight, {2}));
  auto corrected=*gate.Begin();
  assert(apply(corrected, {2}));
  assert((handles==std::map<int,bool>{{2,true}}));
  gate.Reset(43);
  auto new_doc=*gate.Begin();
  assert(!apply(corrected, {}));
  assert((handles==std::map<int,bool>{{2,true}}));
  assert(apply(new_doc, {}));
  assert(handles.empty());
  // Destruction of a removed entry may start a later snapshot and mutate
  // the map; no reconciliation iterator may remain active at that point.
  gate.Reset(45);
  auto current=*gate.Begin();
  std::map<int,std::unique_ptr<Item>> observed;
  observed[1]=std::make_unique<Item>();
  observed[2]=std::make_unique<Item>();
  observed[3]=std::make_unique<Item>();
  observed[1]->on_destroy=[&] {
    assert(gate.Begin());
    observed.emplace(4,std::make_unique<Item>());
  };
  assert(gate.Take(current));
  assert(ReconcileSnapshot(observed,std::vector<int>{3},
                           [](const auto& entry){return bool(entry);}));
  assert(observed.size()==2 && observed.contains(3) && observed.contains(4));
  assert(!gate.Current(current));
  // No generation wrap can resurrect an earlier ticket in the same epoch.
  gate.Reset(44);
  auto first=*gate.Begin();
  for (int i=1;i<255;++i) assert(gate.Begin());
  assert(!gate.Begin());
  assert(!gate.Current(first));
}

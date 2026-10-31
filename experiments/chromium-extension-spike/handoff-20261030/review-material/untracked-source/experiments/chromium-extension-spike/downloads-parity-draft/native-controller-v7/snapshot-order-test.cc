#include "snapshot-gate.h"
#include "reconcile.h"
#include "reset-state.h"
#include <cassert>
#include <cstdint>
#include <functional>
#include <memory>
#include <map>
#include <vector>
using blanc::downloads_projection::SnapshotGate;
using blanc::downloads_projection::ReconcileSnapshot;
using blanc::downloads_projection::ResetSnapshotState;
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
    if (!gate.Take(ticket) || !ReconcileSnapshot(handles, visible, live)) return false;
    return gate.Commit(ticket);
  };
  auto old=*gate.Begin();
  auto newest=*gate.Begin();
  assert(apply(newest, {1,2}));
  assert(gate.CanPublish(newest));
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
  assert(!gate.Commit(current));
  assert(!gate.CanPublish(current));
  // Reset during observer destruction also invalidates the old publication.
  gate.Reset(46);
  auto resetting=*gate.Begin();
  assert(gate.Take(resetting));
  std::map<int,std::unique_ptr<Item>> reset_observed;
  reset_observed[1]=std::make_unique<Item>();
  reset_observed[1]->on_destroy=[&] { gate.Reset(47); };
  assert(ReconcileSnapshot(reset_observed,std::vector<int>{},
                           [](const auto& entry){return bool(entry);}));
  assert(!gate.Commit(resetting) && !gate.CanPublish(resetting));
  // Epoch is revoked and map detached before old observer destruction. A
  // reentrant callback sees no old item and can install a new one safely.
  int epoch=50; gate.Reset(epoch); auto before_reset=*gate.Begin();
  assert(gate.Take(before_reset) && gate.Commit(before_reset));
  std::map<int,std::unique_ptr<Item>> reset_handles;
  reset_handles[1]=std::make_unique<Item>();
  reset_handles[1]->on_destroy=[&] {
    assert(epoch==51 && !gate.CanPublish(before_reset));
    assert(reset_handles.empty());
    reset_handles.emplace(2,std::make_unique<Item>());
    assert(gate.Begin());
  };
  ResetSnapshotState(epoch,gate,reset_handles,51);
  assert(epoch==51 && reset_handles.size()==1 && reset_handles.contains(2));
  // No generation wrap can resurrect an earlier ticket in the same epoch.
  gate.Reset(44);
  auto first=*gate.Begin();
  for (int i=1;i<255;++i) assert(gate.Begin());
  assert(!gate.Begin());
  assert(!gate.Current(first));
}

#include "reset-state.h"
#include "snapshot-gate.h"
#include <cassert>
#include <cstdint>
#include <functional>
#include <map>
#include <memory>
using blanc::downloads_projection::ResetSnapshotState;
using blanc::downloads_projection::SnapshotGate;
struct Object {};
struct Observer { std::function<void()> on_destroy; ~Observer() { if (on_destroy) on_destroy(); } };
int main() {
  // Simulate each host/document/profile disappearing while controller state
  // remains alive and a detached observer is being destroyed. This uses C++
  // weak_ptr, not Chromium WeakDocumentPtr; it is not a browser lifecycle test.
  for (int destroy_mask=1;destroy_mask<8;++destroy_mask) {
    auto host=std::make_shared<Object>();
    auto document=std::make_shared<Object>();
    auto context=std::make_shared<Object>();
    std::weak_ptr<Object> weak_host=host, weak_document=document, weak_context=context;
    SnapshotGate<int,uint8_t> gate; int epoch=1; gate.Reset(epoch);
    auto old=*gate.Begin(); assert(gate.Take(old) && gate.Commit(old));
    bool old_binding_active=true;
    std::map<int,std::unique_ptr<Observer>> handles;
    handles[1]=std::make_unique<Observer>();
    handles[1]->on_destroy=[&] {
      assert(!old_binding_active && epoch==2 && !gate.CanPublish(old) && handles.empty());
      if (destroy_mask & 1) host.reset();
      if (destroy_mask & 2) document.reset();
      if (destroy_mask & 4) context.reset();
    };
    old_binding_active=false;
    ResetSnapshotState(epoch,gate,handles,2);
    assert(epoch==2 && !gate.CanPublish(old));
    assert(weak_host.expired()==bool(destroy_mask&1));
    assert(weak_document.expired()==bool(destroy_mask&2));
    assert(weak_context.expired()==bool(destroy_mask&4));
    // A rebind must reject if any captured identity has expired.
    assert(!(weak_host.lock() && weak_document.lock() && weak_context.lock()));
  }
}

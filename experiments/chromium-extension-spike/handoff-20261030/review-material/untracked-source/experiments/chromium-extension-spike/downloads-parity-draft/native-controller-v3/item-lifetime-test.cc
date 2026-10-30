#include "item-lifetime.h"
#include <cassert>
#include <new>

struct FakeItem {
  struct Observer {
    virtual ~Observer() = default;
    virtual void OnDownloadRemoved(FakeItem*) = 0;
    virtual void OnDownloadDestroyed(FakeItem*) = 0;
  };
  Observer* observer = nullptr;
  void AddObserver(Observer* value) { assert(!observer); observer = value; }
  void RemoveObserver(Observer* value) { assert(observer == value); observer = nullptr; }
  void Remove() { if (observer) observer->OnDownloadRemoved(this); }
  ~FakeItem() { if (observer) observer->OnDownloadDestroyed(this); }
};
using Lease = ItemLifetime<FakeItem, FakeItem::Observer, FakeItem*>;

int main() {
  {
    FakeItem item;
    { Lease lease(&item); assert(lease.IsLive() && lease.Matches(&item)); }
    assert(!item.observer);
  }
  {
    FakeItem item;
    Lease lease(&item);
    item.Remove();
    assert(!lease.IsLive() && !lease.Matches(&item));
    assert(!item.observer);
  }
  // Same-address replacement must not revive the old lease.
  alignas(FakeItem) unsigned char storage[sizeof(FakeItem)];
  auto* first = new (storage) FakeItem;
  Lease old(first);
  first->~FakeItem();
  auto* replacement = new (storage) FakeItem;
  assert(!old.IsLive() && !old.Matches(replacement));
  { Lease current(replacement); assert(current.Matches(replacement)); }
  replacement->~FakeItem();
}

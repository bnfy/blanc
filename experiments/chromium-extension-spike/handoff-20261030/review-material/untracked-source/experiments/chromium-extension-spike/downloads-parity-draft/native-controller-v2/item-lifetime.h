#ifndef BLANC_DOWNLOADS_ITEM_LIFETIME_H_
#define BLANC_DOWNLOADS_ITEM_LIFETIME_H_

// The concrete Chromium item must synchronously notify this observer before
// its memory can be reused. This is not an authorization or visibility check.
// Pointer is raw_ptr<Item> in production; tests use a fake's raw pointer.
template <typename Item, typename Observer, typename Pointer>
class ItemLifetime final : public Observer {
 public:
  explicit ItemLifetime(Item* item) : item_(item) {
    if (item_) item_->AddObserver(this);
  }
  ~ItemLifetime() override { Detach(); }
  ItemLifetime(const ItemLifetime&) = delete;
  ItemLifetime& operator=(const ItemLifetime&) = delete;
  bool Matches(Item* item) const { return item && item_ == item; }
  void OnDownloadRemoved(Item* item) override { Invalidate(item); }
  void OnDownloadDestroyed(Item* item) override { Invalidate(item); }
 private:
  void Invalidate(Item* item) {
    if (item_ != item) return;
    Detach();
  }
  void Detach() {
    Item* item = item_;
    item_ = nullptr;
    if (item) item->RemoveObserver(this);
  }
  Pointer item_;
};
#endif

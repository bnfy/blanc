#ifndef BLANC_SERVICES_BLOCKER_SHIELD_PAGE_COUNT_H_
#define BLANC_SERVICES_BLOCKER_SHIELD_PAGE_COUNT_H_

#include <cstdint>
#include <limits>
#include <map>

namespace blanc {

// Which page a tab's blocks belong to. A page's first requests can reach the
// browser before it has processed the commit, so they're held for that
// navigation and join the count when it commits. A page is known by the
// navigation that first made its document, which outlives a stay in the
// back-forward cache. Pure, so tools/shield-page-count-test.cc can pin it.
class ShieldPageCount {
 public:
  // For a block already known to belong to the page on show.
  static constexpr int64_t kShownPage = 0;

  ShieldPageCount();
  ~ShieldPageCount();

  // The navigation is about to commit: its subresource factories come next.
  void BeginCommit(int64_t navigation) { held_[navigation] = 0; }

  // A commit that never landed loses what it held.
  void Abandoned(int64_t navigation) { held_.erase(navigation); }

  // A new page is on show. `Committed` follows at once and names it.
  void PageChanged() {
    value_ = 0;
    shown_ = kShownPage;
  }

  // `navigation` committed and put the page known as `page` on show.
  void Committed(int64_t navigation, int64_t page) {
    auto held = held_.find(navigation);
    if (held != held_.end()) {
      value_ = Sum(value_, held->second);
      held_.erase(held);
    }
    shown_ = page;
  }

  // Charges a block to its navigation's page. False if that page is gone.
  bool Record(int64_t navigation) {
    if (navigation == kShownPage || navigation == shown_) {
      value_ = Sum(value_, 1);
      return true;
    }
    auto held = held_.find(navigation);
    if (held == held_.end()) return false;
    held->second = Sum(held->second, 1);
    return true;
  }

  // The page on show lost its renderer or was discarded.
  void Reset() { value_ = 0; }

  int value() const { return value_; }

 private:
  static int Sum(int a, int b) {
    return a > std::numeric_limits<int>::max() - b ? std::numeric_limits<int>::max() : a + b;
  }

  int value_ = 0;
  int64_t shown_ = kShownPage;
  std::map<int64_t, int> held_;
};

inline ShieldPageCount::ShieldPageCount() = default;
inline ShieldPageCount::~ShieldPageCount() = default;

}  // namespace blanc

#endif  // BLANC_SERVICES_BLOCKER_SHIELD_PAGE_COUNT_H_

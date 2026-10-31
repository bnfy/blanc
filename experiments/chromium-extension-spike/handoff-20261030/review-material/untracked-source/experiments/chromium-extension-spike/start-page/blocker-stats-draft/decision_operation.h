#ifndef BLANC_BLOCKER_STATS_DECISION_OPERATION_H_
#define BLANC_BLOCKER_STATS_DECISION_OPERATION_H_

#include <utility>

namespace blanc::blocker_stats {
// Unwired, UI-sequence-confined state for ONE browser-owned operation. Each
// redirect hop of a URLLoader must reuse its Request's instance. Distinct
// operations, even to the same URL, must never share an instance. Separate
// loader/navigation/activation objects may share one only when a browser-owned
// identity proves they represent the same operation. No URL or profile data
// is stored here. Not threadsafe; the owning integration must enforce sequence.
class DecisionOperation final {
 public:
  DecisionOperation() = default;
  DecisionOperation(const DecisionOperation&) = delete;
  DecisionOperation& operator=(const DecisionOperation&) = delete;

  // result 0 continues the same operation (for example, a redirect). Any
  // nonzero result ends it. Only engine result 1 is a matching rule block;
  // errors, timeouts and unsupported decisions never become blocked counts.
  // The browser-owned callback MUST independently validate the live regular
  // profile at the instant of write. This class knows no privacy context.
  template <class OnRuleBlock>
  bool OnDecision(int result, OnRuleBlock&& on_rule_block) {
    if (terminal_ || result == 0) return false;
    terminal_ = true;  // Set before callback: reentrancy cannot emit twice.
    if (result != 1) return false;
    std::forward<OnRuleBlock>(on_rule_block)();
    // Callback may destroy this object. Never access members afterward.
    return true;  // Decision emitted, not a claim of persistence or coverage.
  }
 private:
  bool terminal_ = false;
};
}  // namespace blanc::blocker_stats
#endif

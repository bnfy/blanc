#ifndef BLANC_BANGS_DRAFT_DISPATCH_GUARD_H_
#define BLANC_BANGS_DRAFT_DISPATCH_GUARD_H_
#include <cstddef>
#include <cstdint>
#include <map>
#include <optional>
namespace blanc::bangs::draft {
// All identities and the revision must be generated and re-read by the native
// owner on one sequence, never supplied by page/renderer data. IDs and the
// settings revision must be nonzero and unique for their actual lifetimes.
// This class is
// only a lifecycle gate: it does not validate URLs, resolve, persist or navigate.
struct Context {
  uint64_t window, profile, tab, document, settings_revision;
  bool is_private;
  bool operator==(const Context&) const = default;
};
enum class Completion { kRegular, kPrivate, kNoResolution, kStale };
class DispatchGuard {
 public:
  std::optional<uint64_t> Begin(const Context& context);
  // resolved may only come from the pinned trusted model. The owner must
  // recheck native URL policy and use a current native tab before dispatch.
  // Do not yield between the final recheck and use; recheck again after any
  // asynchronous work. Private completions must never write recent usage.
  Completion Complete(uint64_t token, const Context& current, bool resolved);
  void CancelTab(uint64_t tab);
  void CancelWindow(uint64_t window);
  void Shutdown();
  size_t pending() const { return pending_.size(); }
 private:
  uint64_t next_token_=0;
  bool shutdown_=false;
  std::map<uint64_t,Context> pending_;
};
}  // namespace blanc::bangs::draft
#endif

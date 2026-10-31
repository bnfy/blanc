#include "dispatch_guard.h"
#include <limits>
namespace blanc::bangs::draft {
std::optional<uint64_t> DispatchGuard::Begin(const Context& context) {
  if (shutdown_ || !context.window || !context.profile || !context.tab ||
      !context.document || !context.settings_revision ||
      next_token_ == std::numeric_limits<uint64_t>::max()) return std::nullopt;
  // A newer request for a tab makes any older asynchronous answer stale.
  CancelTab(context.tab);
  constexpr size_t kMaxPending = 32;
  if (pending_.size() >= kMaxPending) return std::nullopt;
  const auto token = ++next_token_;
  pending_.emplace(token, context);
  return token;
}
Completion DispatchGuard::Complete(uint64_t token, const Context& current,
                                    bool resolved) {
  auto it=pending_.find(token);
  if (shutdown_ || it==pending_.end()) return Completion::kStale;
  const Context started=it->second;
  pending_.erase(it);
  if (!(started==current)) return Completion::kStale;
  if (!resolved) return Completion::kNoResolution;
  return current.is_private ? Completion::kPrivate : Completion::kRegular;
}
void DispatchGuard::CancelTab(uint64_t tab) {
  for(auto it=pending_.begin();it!=pending_.end();) {
    if(it->second.tab==tab) it=pending_.erase(it); else ++it;
  }
}
void DispatchGuard::CancelWindow(uint64_t window) {
  for(auto it=pending_.begin();it!=pending_.end();) {
    if(it->second.window==window) it=pending_.erase(it); else ++it;
  }
}
void DispatchGuard::Shutdown() {shutdown_=true;pending_.clear();}
}  // namespace blanc::bangs::draft

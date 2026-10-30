#ifndef BLANC_SYNC_REQUEST_SCHEDULER_H_
#define BLANC_SYNC_REQUEST_SCHEDULER_H_
#include <algorithm>
#include <array>
#include <cmath>
#include <functional>
#include <map>
#include <memory>
#include <limits>
#include <optional>
#include <string>
#include <vector>

namespace blanc::sync {
// Wire/selection semantics from shipping sync-scheduler.js, v1.45.1.
// Sequence-confined core only: the transport must persist reservations before
// dispatch and settlements after completion. This class performs no I/O.
enum class RequestClass { kIndex, kSpace, kFixed, kRemote };
inline constexpr std::array<RequestClass, 4> kClasses = {
    RequestClass::kIndex, RequestClass::kSpace,
    RequestClass::kFixed, RequestClass::kRemote};
struct SchedulerState {
  std::vector<double> log;
  RequestClass next = RequestClass::kIndex;
  std::map<RequestClass, std::string> cursors;
  int window_limit = 10;
  std::optional<double> backoff_until;
};
struct PendingWork {
  bool index = false;
  // IDs are validated ASCII protocol identifiers, not display names. Space
  // lists retain the caller's pending-first order, as in the released queue.
  std::map<RequestClass, std::vector<std::string>> items;
};
struct SelectedRequest { RequestClass kind; std::string item; };
class RequestScheduler {
 public:
  struct Reservation {
   private:
    friend class RequestScheduler;
    double wall = 0;
    double at = 0;
  };
  using Clock = std::function<double()>;
  RequestScheduler(Clock wall, Clock monotonic, int limit = 10,
                   double window_ms = 60000,
                   std::optional<SchedulerState> restored = std::nullopt)
      : wall_(std::move(wall)), mono_(std::move(monotonic)),
        limit_(limit), window_ms_(window_ms),
        next_(restored ? restored->next : RequestClass::kIndex),
        cursors_(restored ? std::move(restored->cursors) : std::map<RequestClass, std::string>{}) {
    valid_ = wall_ && mono_ && limit >= 1 && std::isfinite(window_ms) && window_ms > 0;
    if (!valid_) return;
    SchedulerState initial = restored.value_or(SchedulerState{});
    cap_ = std::clamp(restored ? initial.window_limit : limit_, std::min(3, limit_), limit_);
    const double start = mono_();
    for (double timestamp : initial.log) {
      if (std::isfinite(timestamp) &&
          (timestamp > wall_() || wall_() - timestamp < window_ms_)) {
        auto event = std::make_shared<Reservation>();
        event->wall = timestamp; event->at = start; events_.push_back(event);
      }
    }
    if (events_.size() > static_cast<size_t>(limit_))
      events_.erase(events_.begin(), events_.end() - limit_);
    if (cap_ < limit_) {
      const double until = initial.backoff_until &&
          std::isfinite(*initial.backoff_until) ?
          *initial.backoff_until : wall_() + 300000;
      recover_at_ = start + std::max(0.0, until - wall_()) + 60000;
    }
  }
  bool IsValid() const { return valid_; }
  bool CanRequest() { if (!valid_) return false; Refresh(); return events_.size() < static_cast<size_t>(cap_); }
  double WindowFreesAt() {
    if (!valid_) return std::numeric_limits<double>::infinity();
    Refresh();
    if (events_.size() < static_cast<size_t>(cap_)) return wall_();
    return wall_() + std::max(0.0, window_ms_ -
        (mono_() - events_[events_.size() - cap_]->at));
  }
  std::shared_ptr<Reservation> Record() {
    if (!CanRequest()) return nullptr;
    auto event = std::make_shared<Reservation>();
    event->wall = wall_(); event->at = mono_(); events_.push_back(event);
    return event;
  }
  bool Settle(const std::shared_ptr<Reservation>& event) {
    if (!valid_ || !event) return false;
    event->wall = wall_(); event->at = mono_();
    if (std::find(events_.begin(), events_.end(), event) == events_.end())
      events_.push_back(event);
    return true;
  }
  void MarkIndexDue() { index_due_ = true; }
  void OnRateLimited() {
    if (!valid_) return;
    Refresh(); cap_ = std::max(std::min(3, limit_), cap_ / 2);
    recover_at_ = mono_() + 360000;
  }
  std::optional<SelectedRequest> Next(const PendingWork& work) {
    if (!CanRequest()) return std::nullopt;
    const auto begin = std::find(kClasses.begin(), kClasses.end(), next_);
    const size_t offset = begin == kClasses.end() ? 0 : begin - kClasses.begin();
    for (size_t n = 0; n < kClasses.size(); ++n) {
      const auto kind = kClasses[(offset + n) % kClasses.size()];
      std::vector<std::string> candidates;
      if (kind == RequestClass::kIndex) {
        if (work.index || index_due_) candidates.push_back("spaces");
      } else if (const auto it = work.items.find(kind); it != work.items.end()) {
        for (const auto& id : it->second)
          if (std::find(candidates.begin(), candidates.end(), id) == candidates.end())
            candidates.push_back(id);
      }
      if (candidates.empty()) continue;
      if (kind == RequestClass::kFixed)
        std::sort(candidates.begin(), candidates.end(), [](const auto& a, const auto& b) {
          return FixedRank(a) == FixedRank(b) ? a < b : FixedRank(a) < FixedRank(b);
        });
      size_t index = 0;
      if (const auto cursor = cursors_.find(kind); cursor != cursors_.end()) {
        const auto found = std::find(candidates.begin(), candidates.end(), cursor->second);
        if (found != candidates.end()) index = (found - candidates.begin() + 1) % candidates.size();
        else {
          const auto following = std::find_if(candidates.begin(), candidates.end(), [&](const auto& id) {
            return kind == RequestClass::kFixed ? FixedRank(id) > FixedRank(cursor->second) : id > cursor->second;
          });
          if (following != candidates.end()) index = following - candidates.begin();
        }
      }
      const auto item = candidates[index]; cursors_[kind] = item;
      next_ = kClasses[(offset + n + 1) % kClasses.size()];
      if (kind == RequestClass::kIndex) index_due_ = false;
      return SelectedRequest{kind, item};
    }
    return std::nullopt;
  }
  SchedulerState Snapshot() {
    Refresh(); SchedulerState out;
    for (const auto& event : events_) out.log.push_back(event->wall);
    out.next = next_; out.cursors = cursors_; out.window_limit = cap_;
    if (recover_at_) out.backoff_until = wall_() + std::max(0.0, *recover_at_ - mono_() - 60000);
    return out;
  }
 private:
  static size_t FixedRank(const std::string& id) {
    static constexpr std::array<const char*, 7> order = {
        "bookmarks", "settings", "session", "icons", "sends", "closed", "shared"};
    const auto it = std::find(order.begin(), order.end(), id);
    return it - order.begin();
  }
  void Refresh() {
    if (!valid_) return;
    const double now = mono_();
    std::erase_if(events_, [&](const auto& event) { return now - event->at >= window_ms_; });
    if (recover_at_ && now >= *recover_at_) {
      const int steps = static_cast<int>(std::min<double>(limit_, 1 + std::floor((now - *recover_at_) / 60000)));
      cap_ += std::min(steps, limit_ - cap_);
      if (cap_ == limit_) recover_at_.reset();
      else *recover_at_ += steps * 60000.0;
    }
  }
  Clock wall_, mono_;
  int limit_, cap_ = 0;
  double window_ms_;
  RequestClass next_;
  std::map<RequestClass, std::string> cursors_;
  bool index_due_ = false;
  bool valid_ = false;
  std::optional<double> recover_at_;
  std::vector<std::shared_ptr<Reservation>> events_;
};
}  // namespace blanc::sync
#endif

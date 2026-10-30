#ifndef BLANC_DOWNLOADS_SNAPSHOT_GATE_H_
#define BLANC_DOWNLOADS_SNAPSHOT_GATE_H_
#include <limits>
#include <optional>

namespace blanc::downloads_projection {
// UI-sequence confined. Epoch must be freshly unique for each new document.
// Ticket issuance precedes enumeration. Only the newest ticket can issue
// handles or enter reconciliation. Publish is allowed only after a completed
// reconciliation survives a second epoch/generation check.
template <class Epoch, class Counter>
class SnapshotGate {
 public:
  struct Ticket { Epoch epoch; Counter generation; };
  void Reset(const Epoch& epoch) { epoch_ = epoch; generation_ = 0; phase_ = Phase::kEmpty; }
  std::optional<Ticket> Begin() {
    if (generation_ == std::numeric_limits<Counter>::max()) return std::nullopt;
    ++generation_;
    phase_ = Phase::kOpen;
    return Ticket{epoch_, generation_};
  }
  bool Current(const Ticket& ticket) const { return Matches(ticket) && phase_ == Phase::kOpen; }
  bool Take(const Ticket& ticket) {
    if (!Current(ticket)) return false;
    phase_ = Phase::kTaken;
    return true;
  }
  bool Commit(const Ticket& ticket) {
    if (!Matches(ticket) || phase_ != Phase::kTaken) return false;
    phase_ = Phase::kCommitted;
    return true;
  }
  bool CanPublish(const Ticket& ticket) const {
    return Matches(ticket) && phase_ == Phase::kCommitted;
  }
 private:
  enum class Phase { kEmpty, kOpen, kTaken, kCommitted };
  bool Matches(const Ticket& ticket) const {
    return generation_ != 0 && ticket.generation == generation_ && ticket.epoch == epoch_;
  }
  Epoch epoch_{};
  Counter generation_ = 0;
  Phase phase_ = Phase::kEmpty;
};
}  // namespace blanc::downloads_projection
#endif

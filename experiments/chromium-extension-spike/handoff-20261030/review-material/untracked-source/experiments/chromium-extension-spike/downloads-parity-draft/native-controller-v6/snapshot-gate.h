#ifndef BLANC_DOWNLOADS_SNAPSHOT_GATE_H_
#define BLANC_DOWNLOADS_SNAPSHOT_GATE_H_
#include <limits>
#include <optional>

namespace blanc::downloads_projection {
// Sequence-confined. Epoch must be freshly unique for every new document.
// A ticket is minted before the asynchronous snapshot begins, and only the
// newest issued ticket may issue rows or reconcile the visible snapshot.
// Exhaustion fails closed; no counter wrap may make an old ticket current.
template <class Epoch, class Counter>
class SnapshotGate {
 public:
  struct Ticket { Epoch epoch; Counter generation; };
  void Reset(const Epoch& epoch) { epoch_ = epoch; generation_ = 0; consumed_ = false; }
  std::optional<Ticket> Begin() {
    if (generation_ == std::numeric_limits<Counter>::max()) return std::nullopt;
    ++generation_;
    consumed_ = false;
    return Ticket{epoch_, generation_};
  }
  bool Current(const Ticket& ticket) const {
    return !consumed_ && generation_ != 0 && ticket.generation == generation_ && ticket.epoch == epoch_;
  }
  // Reconciliation may commit only once for each ticket. Call before map
  // mutation so a duplicate completion cannot apply an older partial result.
  bool Take(const Ticket& ticket) {
    if (!Current(ticket)) return false;
    consumed_ = true;
    return true;
  }
 private:
  Epoch epoch_{};
  Counter generation_ = 0;
  bool consumed_ = false;
};
}  // namespace blanc::downloads_projection
#endif

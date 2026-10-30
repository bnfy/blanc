#ifndef BLANC_BANGS_DRAFT_WRITE_GATE_H_
#define BLANC_BANGS_DRAFT_WRITE_GATE_H_

#include <memory>
#include <mutex>
#include <set>
#include <string>
#include <utility>

namespace blanc::bangs::draft {
// A process-local, profile-keyed exclusion lease. A lease may outlive the
// owning window while its asynchronous persistence callback is still pending.
// It does not coordinate writers that do not use this gate.
template <typename Key>
class BangWriteGate {
 private:
  struct State {
    std::mutex lock;
    std::set<Key> active;
  };

 public:
  class Lease {
   public:
    ~Lease();
    Lease(const Lease&) = delete;
    Lease& operator=(const Lease&) = delete;

   private:
    friend class BangWriteGate;
    Lease(std::shared_ptr<State> state, Key key);
    std::shared_ptr<State> state_;
    Key key_;
  };

  BangWriteGate();
  ~BangWriteGate();
  BangWriteGate(const BangWriteGate&) = delete;
  BangWriteGate& operator=(const BangWriteGate&) = delete;

  std::shared_ptr<Lease> Acquire(const Key& profile_key);

 private:
  std::shared_ptr<State> state_;
};

template <typename Key>
BangWriteGate<Key>::BangWriteGate() : state_(std::make_shared<State>()) {}

template <typename Key>
BangWriteGate<Key>::~BangWriteGate() = default;

template <typename Key>
BangWriteGate<Key>::Lease::Lease(std::shared_ptr<State> state, Key key)
    : state_(std::move(state)), key_(std::move(key)) {}

template <typename Key>
BangWriteGate<Key>::Lease::~Lease() {
  std::lock_guard lock(state_->lock);
  state_->active.erase(key_);
}

template <typename Key>
std::shared_ptr<typename BangWriteGate<Key>::Lease> BangWriteGate<Key>::Acquire(
    const Key& profile_key) {
  if (profile_key.empty())
    return {};
  std::lock_guard lock(state_->lock);
  if (!state_->active.insert(profile_key).second)
    return {};
  return std::shared_ptr<Lease>(new Lease(state_, profile_key));
}
}  // namespace blanc::bangs::draft

#endif

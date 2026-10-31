#ifndef BLANC_SYNC_REQUEST_QUEUE_H_
#define BLANC_SYNC_REQUEST_QUEUE_H_
#include <cstdint>
#include <functional>
#include <limits>
#include <optional>
#include <type_traits>
#include "request_scheduler.h"

namespace blanc::sync {
// Released sync-request-queue.js semantics, with injected native adapters.
// Own on one MayBlock sequence. Post and ArmTimer must defer, never run inline;
// Post must be thread-safe so transport completions can return to that sequence.
// Persist returns an error unless it durably committed. All adapters use
// explicit results, not C++ exceptions. No transport, storage,
// credential access or renderer API is implemented by this core.
template <class Payload>
class RequestQueue : public std::enable_shared_from_this<RequestQueue<Payload>> {
  static_assert(std::is_copy_constructible_v<Payload>);
 public:
  struct Result {
    std::optional<Payload> outcome;
    bool retry = false;
    std::string error;
  };
  using Task = std::function<void()>;
  using Completed = std::function<void(const Result&)>;
  using Observer = std::function<bool(const Result&)>;
  using TransportCompleted = std::function<void(Result)>;
  struct Request {
    RequestClass kind = RequestClass::kFixed;
    std::string item;
    std::string generation;
    int priority = 1;
    // Best-effort departure work must never leave a delayed GET behind when
    // its caller disables sync. Normal background operations still wait.
    bool immediate_only = false;
    std::function<std::string()> cancelled;
    // Native multi-await transports must use the final controller/worker
    // guard, not their original pre-wrapping cancellation callback.
    std::function<void(std::function<std::string()>)> bind_cancellation;
    std::function<void(size_t, TransportCompleted)> run;
    Observer on_outcome;
  };
  struct Status {
    size_t waiting;
    bool running;
    double window_frees_at;
    bool backoff;
    uint64_t consecutive_rate_limits;
  };
  using Persist = std::function<std::optional<std::string>(const SchedulerState&)>;
  using Post = std::function<void(Task)>;
  using ArmTimer = std::function<void(double, Task)>;
  static std::shared_ptr<RequestQueue> Create(
      std::shared_ptr<RequestScheduler> scheduler, Persist persist,
      Post post, ArmTimer arm_timer, Task cancel_timer,
      RequestScheduler::Clock now) {
    if (!scheduler || !scheduler->IsValid() || !persist || !post || !arm_timer || !cancel_timer || !now)
      return nullptr;
    return std::shared_ptr<RequestQueue>(new RequestQueue(
        std::move(scheduler), std::move(persist), std::move(post),
        std::move(arm_timer), std::move(cancel_timer), std::move(now)));
  }
  void Enqueue(Request request, Completed completed) {
    auto observer = std::move(request.on_outcome);
    auto found = std::find_if(waiting_.begin(), waiting_.end(), [&](const auto& op) {
      return op->request.kind == request.kind && op->request.item == request.item &&
             op->request.generation == request.generation;
    });
    std::shared_ptr<Operation> op;
    if (found == waiting_.end()) {
      op = std::make_shared<Operation>(); op->request = std::move(request);
      op->id = ++last_id_; waiting_.push_back(op);
    } else op = *found;
    // The first queued operation retains its runner/cancellation/priority;
    // each coalesced caller retains its own observer and completion.
    op->waiters.push_back({std::move(observer), std::move(completed)});
    Wake();
  }
  void CancelWhere(const std::function<bool(const Request&)>& predicate,
                   const std::string& reason) {
    std::vector<std::shared_ptr<Operation>> cancelled, kept;
    for (auto& op : waiting_)
      (predicate(op->request) ? cancelled : kept).push_back(std::move(op));
    waiting_ = std::move(kept);
    // Detach first: an observer may re-enter cancellation/drain. Never hold an
    // index/iterator into the live waiting list while invoking callbacks.
    for (auto it = cancelled.rbegin(); it != cancelled.rend(); ++it)
      Complete(*it, Failure("cancelled:" + reason));
    SettleDrain(); Wake();
  }
  bool CanRunImmediately() {
    return !running_ && waiting_.empty() && scheduler_->CanRequest();
  }
  Status GetStatus() {
    const auto frees = scheduler_->WindowFreesAt();
    return {waiting_.size(), !!running_, frees,
            scheduler_->Snapshot().window_limit < 10, consecutive_rate_limits_};
  }
  void Settled(Task callback) {
    if (!running_ && waiting_.empty()) post_(std::move(callback));
    else drains_.push_back(std::move(callback));
  }
  void RunningSettled(Task callback) {
    if (!running_) post_(std::move(callback));
    else running_->waiters.push_back({{}, [callback = std::move(callback)](const Result&) { callback(); }});
  }
 private:
  struct Waiter { Observer observer; Completed completed; };
  struct Operation {
    uint64_t id = 0;
    size_t attempt = 0;
    Request request;
    std::vector<Waiter> waiters;
    std::shared_ptr<RequestScheduler::Reservation> reservation;
  };
  RequestQueue(std::shared_ptr<RequestScheduler> scheduler, Persist persist,
               Post post, ArmTimer arm_timer, Task cancel_timer,
               RequestScheduler::Clock now)
      : scheduler_(std::move(scheduler)), persist_(std::move(persist)),
        post_(std::move(post)), arm_timer_(std::move(arm_timer)),
        cancel_timer_(std::move(cancel_timer)), now_(std::move(now)) {}
  static Result Failure(std::string error) { return {{}, false, std::move(error)}; }
  static std::string Cancellation(const Request& request) {
    return request.cancelled ? request.cancelled() : "";
  }
  static void Complete(const std::shared_ptr<Operation>& op, const Result& result) {
    while (!op->waiters.empty()) {
      auto waiters = std::move(op->waiters); op->waiters.clear();
      for (const auto& waiter : waiters) {
        if (waiter.observer) static_cast<void>(waiter.observer(result));
        if (waiter.completed) waiter.completed(result);
      }
    }
  }
  void SettleDrain() {
    if (running_ || !waiting_.empty()) return;
    auto drains = std::move(drains_); drains_.clear();
    for (const auto& callback : drains) callback();
  }
  void Wake() {
    if (scheduled_ || running_) return;
    if (timer_) { ++timer_epoch_; cancel_timer_(); timer_ = false; }
    scheduled_ = true;
    post_([weak = this->weak_from_this()] {
      if (const auto self = weak.lock()) { self->scheduled_ = false; self->Pump(); }
    });
  }
  void Pump() {
    if (running_) return;
    std::vector<std::pair<std::shared_ptr<Operation>, std::string>> cancelled;
    auto pending = std::move(waiting_); waiting_.clear();
    for (auto& op : pending) {
      auto reason = Cancellation(op->request);
      if (reason.empty()) waiting_.push_back(std::move(op));
      else cancelled.emplace_back(std::move(op), std::move(reason));
    }
    for (auto it = cancelled.rbegin(); it != cancelled.rend(); ++it)
      Complete(it->first, Failure("cancelled:" + it->second));
    if (waiting_.empty()) { SettleDrain(); return; }
    if (!scheduler_->CanRequest()) {
      std::vector<std::shared_ptr<Operation>> expired, kept;
      for (auto& op : waiting_)
        (op->request.immediate_only ? expired : kept).push_back(std::move(op));
      waiting_ = std::move(kept);
      // Detach before completion: observers may re-enter drain/cancellation.
      for (auto& op : expired) Complete(op, Failure("request-budget-unavailable"));
      if (waiting_.empty()) { SettleDrain(); return; }
      timer_ = true;
      const auto epoch = ++timer_epoch_;
      arm_timer_(std::max(1.0, scheduler_->WindowFreesAt() - now_()),
          [weak = this->weak_from_this(), epoch] { if (const auto self = weak.lock(); self && self->timer_epoch_ == epoch) { self->timer_ = false; self->Wake(); } });
      return;
    }
    PendingWork work;
    for (const auto& op : waiting_) {
      if (op->request.kind == RequestClass::kIndex) work.index = true;
      else work.items[op->request.kind].push_back(op->request.item);
    }
    for (auto kind : {RequestClass::kSpace, RequestClass::kRemote}) {
      auto& ids = work.items[kind];
      const auto priority = [&](const auto& id) {
        const auto op = std::find_if(waiting_.begin(), waiting_.end(), [&](const auto& v) { return v->request.kind == kind && v->request.item == id; });
        return op == waiting_.end() ? 1 : (*op)->request.priority;
      };
      std::stable_sort(ids.begin(), ids.end(), [&](const auto& a, const auto& b) {
        return priority(a) == priority(b) ? a < b : priority(a) < priority(b);
      });
    }
    const auto chosen = scheduler_->Next(work);
    const auto position = std::find_if(waiting_.begin(), waiting_.end(), [&](const auto& op) {
      return chosen && op->request.kind == chosen->kind && op->request.item == chosen->item;
    });
    if (position == waiting_.end()) { Wake(); return; }
    auto op = *position; waiting_.erase(position); running_ = op;
    op->reservation = scheduler_->Record();
    if (!op->reservation) { Finish(op, Failure("Sync request window exhausted")); return; }
    if (const auto error = persist_(scheduler_->Snapshot())) { Finish(op, Failure(*error)); return; }
    auto completed = [weak = this->weak_from_this(), post = post_, id = op->id, attempt = op->attempt](Result result) {
      post([weak, id, attempt, result = std::move(result)]() mutable {
        if (const auto self = weak.lock()) self->TransportFinished(id, attempt, std::move(result));
      });
    };
    if (op->request.bind_cancellation)
      op->request.bind_cancellation(op->request.cancelled);
    if (op->request.run) op->request.run(op->attempt, completed);
    else completed(Failure("missing-runner"));
  }
  void TransportFinished(uint64_t id, size_t attempt, Result result) {
    if (!running_ || running_->id != id || running_->attempt != attempt) return;
    auto op = running_;
    if (!scheduler_->Settle(op->reservation)) result = Failure("invalid-reservation");
    else if (const auto error = persist_(scheduler_->Snapshot())) result = Failure(*error);
    Finish(op, std::move(result));
  }
  void Finish(const std::shared_ptr<Operation>& op, Result result) {
    if (result.error.empty()) consecutive_rate_limits_ = 0;
    else if (result.error == "rate-limited" || result.error == "http-429") {
      if (consecutive_rate_limits_ != std::numeric_limits<uint64_t>::max()) ++consecutive_rate_limits_;
      scheduler_->OnRateLimited();
      if (const auto error = persist_(scheduler_->Snapshot())) result = Failure(*error);
    }
    const auto cancelled = Cancellation(op->request);
    if (!cancelled.empty()) Complete(op, Failure("cancelled:" + cancelled));
    else if (result.error.empty() && result.retry) { ++op->attempt; waiting_.push_back(op); }
    else Complete(op, result);
    running_.reset(); SettleDrain(); Wake();
  }
  std::shared_ptr<RequestScheduler> scheduler_;
  Persist persist_; Post post_; ArmTimer arm_timer_; Task cancel_timer_;
  RequestScheduler::Clock now_;
  bool scheduled_ = false, timer_ = false;
  uint64_t last_id_ = 0, timer_epoch_ = 0, consecutive_rate_limits_ = 0;
  std::vector<std::shared_ptr<Operation>> waiting_;
  std::shared_ptr<Operation> running_;
  std::vector<Task> drains_;
};
}  // namespace blanc::sync
#endif

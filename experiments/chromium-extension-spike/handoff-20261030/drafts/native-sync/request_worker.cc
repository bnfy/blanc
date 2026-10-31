#include "request_worker.h"
#include "base/check.h"
#include "base/functional/bind.h"
#include "base/location.h"
#include "base/task/thread_pool.h"
#include "base/time/time.h"

namespace blanc::sync {
namespace {
bool ValidRequest(const RequestWorker::Queue::Request& request,
                  const std::string& binding) {
  if (!request.run || request.generation != binding ||
      (request.priority != 0 && request.priority != 1)) return false;
  if (request.kind == RequestClass::kIndex) return request.item == "spaces";
  if (request.kind == RequestClass::kFixed) {
    static constexpr std::array<const char*, 7> names = {
        "bookmarks", "settings", "session", "icons", "sends", "closed", "shared"};
    return std::find(names.begin(), names.end(), request.item) != names.end();
  }
  if (request.kind != RequestClass::kSpace && request.kind != RequestClass::kRemote)
    return false;
  return !request.item.empty() && request.item.size() <= 256 &&
      std::all_of(request.item.begin(), request.item.end(), [](unsigned char c) {
        return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') ||
               (c >= '0' && c <= '9') || c == '-' || c == '_';
      });
}
}  // namespace
scoped_refptr<base::SequencedTaskRunner> RequestWorker::CreateTaskRunner() {
  return base::ThreadPool::CreateSequencedTaskRunner({base::MayBlock(),
      base::TaskPriority::USER_VISIBLE, base::TaskShutdownBehavior::BLOCK_SHUTDOWN});
}
void RequestWorker::Reply(scoped_refptr<base::SequencedTaskRunner> runner,
                          Queue::Task task) {
  CHECK(runner);
  // The profile service must retain its reply sequence through the shutdown
  // handshake. Rejected delivery is a lifecycle error, never silent success.
  CHECK(runner->PostTask(FROM_HERE, base::BindOnce(
      [](Queue::Task task) { if (task) task(); }, std::move(task))));
}
RequestWorker::RequestWorker(base::FilePath path, std::string binding, StartMode mode)
    : RequestWorker(std::make_unique<RequestStateStore>(std::move(path), binding), binding, mode) {}
RequestWorker::RequestWorker(std::unique_ptr<RequestLedger> ledger,
                             std::string binding, StartMode mode)
    : binding_(std::move(binding)),
      runner_(base::SequencedTaskRunner::GetCurrentDefault()),
      store_(std::move(ledger)), status_(store_ ? store_->Load().status
          : RequestStateStore::Status::kInvalidBinding) {
  if (binding_.size() != 64 || !std::all_of(binding_.begin(), binding_.end(), [](char c) {
        return (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f');
      })) { status_ = RequestStateStore::Status::kInvalidBinding; return; }
  if (store_ && mode == StartMode::kExplicitNewAccount) status_ = store_->InitializeNew();
  if (status_ != RequestStateStore::Status::kLoaded) return;
  auto loaded = store_->Load(); status_ = loaded.status;
  if (!loaded.state) return;
  auto scheduler = std::make_shared<RequestScheduler>(
      [] { return base::Time::Now().InMillisecondsFSinceUnixEpoch(); },
      [] { return base::TimeTicks::Now().since_origin().InMillisecondsF(); },
      10, 60000, std::move(loaded.state));
  queue_ = Queue::Create(scheduler, [this](const auto& state)
      -> std::optional<std::string> {
    if (status_ != RequestStateStore::Status::kLoaded)
      return "request-log-save-failed";
    const auto status = store_->Commit(state);
    if (status == RequestStateStore::Status::kLoaded) return std::nullopt;
    status_ = status;
    return "request-log-save-failed";
  }, [runner = runner_](auto task) { Reply(runner, std::move(task)); },
  [this](double delay, auto task) {
    timer_.Start(FROM_HERE, base::Milliseconds(static_cast<int64_t>(
        std::clamp(std::ceil(delay), 1.0, 60000.0))),
        base::BindOnce([](Queue::Task task) { task(); }, std::move(task)));
  }, [this] { timer_.Stop(); },
  [] { return base::Time::Now().InMillisecondsFSinceUnixEpoch(); });
}
RequestWorker::~RequestWorker() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  CHECK(shutdown_complete_ || !queue_);
}
RequestStateStore::Status RequestWorker::start_status() const {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  return status_;
}
void RequestWorker::Enqueue(Queue::Request request,
    scoped_refptr<base::SequencedTaskRunner> reply_runner, Queue::Completed completed) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  const auto reply = [reply_runner, completed](const Queue::Result& result) {
    Reply(reply_runner, [completed, result] { if (completed) completed(result); });
  };
  if (stopping_) { reply({{}, false, "cancelled:shutdown"}); return; }
  if (draining_) { reply({{}, false, "cancelled:draining"}); return; }
  if (!queue_ || status_ != RequestStateStore::Status::kLoaded) {
    reply({{}, false, "request-state-not-ready"}); return;
  }
  if (!ValidRequest(request, binding_)) {
    reply({{}, false, "invalid-sync-request"}); return;
  }
  auto cancelled = std::move(request.cancelled);
  request.cancelled = [weak = weak_factory_.GetWeakPtr(), cancelled] {
    return !weak || weak->stopping_ ? "shutdown" :
        (weak->draining_ ? "draining" : (cancelled ? cancelled() : ""));
  };
  const auto token = std::make_shared<int>(0);
  auto run = std::move(request.run);
  request.run = [this, run, token](size_t attempt, auto complete) {
    active_token_ = token;
    active_completion_ = complete;
    run(attempt, std::move(complete));
  };
  auto observer = std::move(request.on_outcome);
  request.on_outcome = [this, observer, token](const auto& result) {
    if (active_token_ == token) { active_completion_ = {}; active_token_.reset(); }
    return observer ? observer(result) : true;
  };
  queue_->Enqueue(std::move(request), reply);
}
void RequestWorker::Drain(scoped_refptr<base::SequencedTaskRunner> reply_runner,
                          std::function<void(DrainStatus)> completed) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  if (stopping_ || shutdown_complete_) {
    Reply(reply_runner, [completed] { completed(DrainStatus::kInterrupted); }); return;
  }
  draining_ = true; drained_ = false;
  timer_.Stop();
  if (queue_) queue_->CancelWhere([](const auto&) { return true; }, "draining");
  const auto finish = [this, reply_runner, completed] {
    drained_ = !stopping_;
    const auto result = stopping_ ? DrainStatus::kInterrupted : DrainStatus::kSettled;
    Reply(reply_runner, [completed, result] { completed(result); });
  };
  if (queue_) queue_->Settled(finish); else finish();
}
bool RequestWorker::Resume() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  if (stopping_ || !draining_ || !drained_ || !queue_ ||
      status_ != RequestStateStore::Status::kLoaded) return false;
  draining_ = false; drained_ = false;
  return true;
}
bool RequestWorker::CanRunImmediately() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  return !stopping_ && queue_ && status_ == RequestStateStore::Status::kLoaded &&
      (!draining_ || drained_) && queue_->CanRunImmediately();
}
void RequestWorker::Shutdown(scoped_refptr<base::SequencedTaskRunner> reply_runner,
                             Queue::Task completed) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  if (shutdown_complete_) { Reply(reply_runner, std::move(completed)); return; }
  shutdown_waiters_.emplace_back(std::move(reply_runner), std::move(completed));
  if (stopping_) return;
  stopping_ = true;
  timer_.Stop();
  if (queue_) {
    // Retire local transport completion only; not a server-settlement barrier.
    const auto active = active_completion_;
    queue_->CancelWhere([](const auto&) { return true; }, "shutdown");
    if (active) active({{}, false, "cancelled:shutdown"});
  }
  const auto finish = [this] {
    timer_.Stop(); queue_.reset(); active_completion_ = {}; active_token_.reset();
    shutdown_complete_ = true;
    auto waiters = std::move(shutdown_waiters_);
    for (auto& [runner, task] : waiters) Reply(std::move(runner), std::move(task));
  };
  if (queue_) queue_->Settled(finish);
  else finish();
}
}  // namespace blanc::sync

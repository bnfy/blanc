#ifndef BLANC_SYNC_REQUEST_WORKER_H_
#define BLANC_SYNC_REQUEST_WORKER_H_
#include "base/memory/scoped_refptr.h"
#include "base/memory/weak_ptr.h"
#include "base/sequence_checker.h"
#include "base/task/sequenced_task_runner.h"
#include "base/timer/timer.h"
#include "request_queue.h"
#include "request_state_store.h"

namespace blanc::sync {
// Internal native worker, intended for SequenceBound ownership by the profile
// service. Construct, call, shut down and destroy on CreateTaskRunner()'s sequence.
// The future service enforces consent/Personal-profile/private exclusions and
// owns/cancels URLLoaders. This adapter itself exposes no network or renderer API.
// Production service supplies the profile-wide ledger backend; account identity
// is separate from quota ownership. The path constructor remains a standalone
// account-bound fixture adapter, not the account-switching integration path.
class RequestWorker {
 public:
  using Queue = RequestQueue<std::string>;
  enum class StartMode { kExistingAccount, kExplicitNewAccount };
  enum class DrainStatus { kSettled, kInterrupted };
  static scoped_refptr<base::SequencedTaskRunner> CreateTaskRunner();
  RequestWorker(base::FilePath path, std::string account_binding, StartMode mode);
  RequestWorker(std::unique_ptr<RequestLedger> ledger, std::string account_binding,
                StartMode mode = StartMode::kExistingAccount);
  RequestWorker(const RequestWorker&) = delete;
  RequestWorker& operator=(const RequestWorker&) = delete;
  ~RequestWorker();
  RequestStateStore::Status start_status() const;
  // Runner must accept callbacks until Shutdown's completion has been delivered.
  // All externally observable completions are posted, never inline. Internal
  // outcome observers run on this worker, before the completion is posted.
  void Enqueue(Queue::Request request,
               scoped_refptr<base::SequencedTaskRunner> reply_runner,
               Queue::Completed completed);
  // Disable/erase/account-change barrier: stop new work, cancel waiting work,
  // and wait for the actual dispatched transport completion. A successful
  // drain may be resumed after a failed remote wipe; no quota is reset.
  void Drain(scoped_refptr<base::SequencedTaskRunner> reply_runner,
             std::function<void(DrainStatus)> completed);
  bool Resume();
  // Check the existing profile-wide budget without reserving or resetting it.
  // A drained worker is eligible only after its transport barrier settled.
  bool CanRunImmediately();
  // Profile teardown only. This retires local operations; it does NOT prove a
  // dispatched server mutation has finished. Never use it as a DELETE barrier.
  void Shutdown(scoped_refptr<base::SequencedTaskRunner> reply_runner,
                Queue::Task completed);
 private:
  static void Reply(scoped_refptr<base::SequencedTaskRunner> runner,
                    Queue::Task task);
  std::string binding_;
  scoped_refptr<base::SequencedTaskRunner> runner_;
  std::unique_ptr<RequestLedger> store_;
  RequestStateStore::Status status_;
  std::shared_ptr<Queue> queue_;
  Queue::TransportCompleted active_completion_;
  std::shared_ptr<int> active_token_;
  base::OneShotTimer timer_;
  bool stopping_ = false;
  bool shutdown_complete_ = false;
  bool draining_ = false;
  bool drained_ = false;
  std::vector<std::pair<scoped_refptr<base::SequencedTaskRunner>, Queue::Task>> shutdown_waiters_;
  SEQUENCE_CHECKER(sequence_checker_);
  base::WeakPtrFactory<RequestWorker> weak_factory_{this};
};
}  // namespace blanc::sync
#endif

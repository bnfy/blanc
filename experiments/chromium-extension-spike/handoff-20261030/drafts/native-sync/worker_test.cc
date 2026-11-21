#include "request_worker.h"
#include "base/at_exit.h"
#include "base/check.h"
#include "base/files/file_util.h"
#include "base/functional/bind.h"
#include "base/location.h"
#include "base/synchronization/waitable_event.h"
#include "base/task/thread_pool/thread_pool_instance.h"
#include "base/time/time.h"
#include <atomic>
#include <iostream>
using namespace blanc::sync;
using Queue = RequestWorker::Queue;
using Mode = RequestWorker::StartMode;
using Status = RequestStateStore::Status;
void Post(scoped_refptr<base::SequencedTaskRunner> runner, Queue::Task task) {
  CHECK(runner->PostTask(FROM_HERE, base::BindOnce(
      [](Queue::Task task) { task(); }, std::move(task))));
}
void Wait(base::WaitableEvent& event, int seconds = 10) {
  CHECK(event.TimedWait(base::Seconds(seconds)));
}
int main(int argc, char** argv) {
  base::AtExitManager at_exit;
  CHECK(argc == 2 || (argc == 3 && std::string(argv[2]) == "--lifecycle-only"));
  const auto folder = base::FilePath::FromUTF8Unsafe(argv[1]);
  CHECK(folder.IsAbsolute() && base::CreateDirectory(folder));
  base::ThreadPoolInstance::CreateAndStartWithDefaultParams("BlancSyncWorkerCheck");
  const auto runner = RequestWorker::CreateTaskRunner();
  const auto reply = RequestWorker::CreateTaskRunner();
  const std::string account(64, 'a');
  const auto path = folder.AppendASCII("state.json");
  std::unique_ptr<RequestWorker> worker;
  const auto request = [&](std::string item) {
    Queue::Request r; r.kind = RequestClass::kSpace; r.item = std::move(item);
    r.generation = account;
    r.run = [runner](auto, auto complete) {
      CHECK(runner->RunsTasksInCurrentSequence()); complete({"ok", false, {}});
    };
    return r;
  };
  base::WaitableEvent invalid_done, started, result_done, destroyed;
  Queue::TransportCompleted transport;
  std::atomic<int> completed = 0, dispatched = 0;
  Post(runner, [&] {
    worker = std::make_unique<RequestWorker>(path, account, Mode::kExplicitNewAccount);
    CHECK(worker->start_status() == Status::kLoaded);
    auto invalid = request("invalid"); invalid.generation = "old-account";
    invalid.run = [](auto, auto) { CHECK(false); };
    worker->Enqueue(invalid, reply, [&](const auto& result) {
      CHECK(reply->RunsTasksInCurrentSequence());
      CHECK_EQ(result.error, "invalid-sync-request"); invalid_done.Signal();
    });
    auto first = request("first");
    first.run = [&](auto, auto complete) {
      CHECK(runner->RunsTasksInCurrentSequence()); ++dispatched;
      RequestStateStore disk(path, account);
      const auto loaded = disk.Load(); CHECK(loaded.status == Status::kLoaded);
      CHECK_EQ(loaded.state->log.size(), 1u);
      transport = complete; started.Signal();
    };
    worker->Enqueue(first, reply, [&](const auto& result) {
      CHECK(reply->RunsTasksInCurrentSequence());
      CHECK(result.error.empty() && result.outcome == "ok");
      ++completed; result_done.Signal();
    });
  });
  Wait(invalid_done); Wait(started);
  // Complete from the caller thread: queue persistence must return to the worker.
  transport({"ok", false, {}}); Wait(result_done);
  base::WaitableEvent inflight, closed;
  std::atomic<int> cancelled = 0, shutdown_callbacks = 0;
  Post(runner, [&] {
    auto active = request("active");
    active.run = [&](auto, auto complete) {
      ++dispatched; transport = complete; inflight.Signal();
    };
    const auto cancelled_reply = [&](const auto& result) {
      CHECK(reply->RunsTasksInCurrentSequence());
      CHECK_EQ(result.error, "cancelled:shutdown"); ++cancelled;
    };
    worker->Enqueue(active, reply, cancelled_reply);
  });
  Wait(inflight);
  Post(runner, [&] {
    auto waiting = request("waiting"); waiting.run = [](auto, auto) { CHECK(false); };
    worker->Enqueue(waiting, reply, [&](const auto& result) {
      CHECK(reply->RunsTasksInCurrentSequence());
      CHECK_EQ(result.error, "cancelled:shutdown"); ++cancelled;
    });
    const auto done = [&] {
      CHECK(reply->RunsTasksInCurrentSequence());
      if (++shutdown_callbacks == 2) closed.Signal();
    };
    worker->Shutdown(reply, done); worker->Shutdown(reply, done);
  });
  Wait(closed); CHECK_EQ(cancelled, 2); CHECK_EQ(dispatched, 2);
  Post(runner, [&] { worker.reset(); destroyed.Signal(); }); Wait(destroyed);
  // Late duplicate completions after destruction have no object to call.
  transport({"late", false, {}}); transport({"late", false, {}});
  base::WaitableEvent late_barrier;
  Post(runner, [&] { late_barrier.Signal(); }); Wait(late_barrier);
  CHECK_EQ(completed, 1); CHECK_EQ(cancelled, 2);
  if (argc == 3) {
    base::ThreadPoolInstance::Get()->Shutdown();
    std::cout << "affected worker lifecycle checks passed; unaffected rate-window repetition skipped\n";
    return 0;
  }
  // Real deferred rate timer: ten unique immediate requests, then one minute
  // before the eleventh. This uses the production window, not an accelerated
  // clock or a changed scheduling policy.
  base::WaitableEvent first_ten, timer_fired, timer_closed;
  std::atomic<int> timer_runs = 0, timer_results = 0;
  double began = 0;
  const auto timer_path = folder.AppendASCII("timer.json");
  Post(runner, [&] {
    worker = std::make_unique<RequestWorker>(timer_path, account, Mode::kExplicitNewAccount);
    CHECK(worker->start_status() == Status::kLoaded);
    began = base::TimeTicks::Now().since_origin().InMillisecondsF();
    for (int i = 0; i < 11; ++i) {
      auto r = request("space-" + std::to_string(i));
      r.run = [&](auto, auto complete) {
        const int n = ++timer_runs;
        if (n == 11) CHECK_GE(base::TimeTicks::Now().since_origin().InMillisecondsF() - began, 60000.);
        complete({"ok", false, {}});
      };
      worker->Enqueue(r, reply, [&](const auto& result) {
        CHECK(result.error.empty());
        const int n = ++timer_results;
        if (n == 10) first_ten.Signal();
        if (n == 11) timer_fired.Signal();
      });
    }
  });
  Wait(first_ten); CHECK_EQ(timer_runs, 10);
  std::cout << "first ten persisted; production 60-second timer waiting" << std::endl;
  Wait(timer_fired, 70);
  Post(runner, [&] { worker->Shutdown(reply, [&] { timer_closed.Signal(); }); });
  Wait(timer_closed);
  base::WaitableEvent all_destroyed;
  Post(runner, [&] { worker.reset(); all_destroyed.Signal(); }); Wait(all_destroyed);
  base::ThreadPoolInstance::Get()->Shutdown();
  std::cout << "worker sequence, deferred replies, foreign-thread completion, shutdown, late completion and real timer passed\n";
}

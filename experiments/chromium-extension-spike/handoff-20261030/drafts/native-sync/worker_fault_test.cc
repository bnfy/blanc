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
using Status = RequestStateStore::Status;
using Mode = RequestWorker::StartMode;
void Post(scoped_refptr<base::SequencedTaskRunner> runner, Queue::Task task) {
  CHECK(runner->PostTask(FROM_HERE, base::BindOnce(
      [](Queue::Task task) { task(); }, std::move(task))));
}
void Wait(base::WaitableEvent& event) { CHECK(event.TimedWait(base::Seconds(10))); }
int main(int argc, char** argv) {
  base::AtExitManager at_exit; CHECK_EQ(argc, 2);
  const auto folder = base::FilePath::FromUTF8Unsafe(argv[1]);
  CHECK(folder.IsAbsolute() && base::CreateDirectory(folder));
  base::ThreadPoolInstance::CreateAndStartWithDefaultParams("BlancSyncFaultCheck");
  const auto runner = RequestWorker::CreateTaskRunner();
  const auto reply = RequestWorker::CreateTaskRunner();
  const std::string account(64, 'a');
  std::unique_ptr<RequestWorker> worker;
  const auto request = [&] {
    Queue::Request r; r.kind = RequestClass::kFixed; r.item = "settings";
    r.generation = account; r.run = [](auto, auto) { CHECK(false); }; return r;
  };
  const auto close = [&] {
    base::WaitableEvent closed, destroyed;
    Post(runner, [&] { worker->Shutdown(reply, [&] { closed.Signal(); }); }); Wait(closed);
    Post(runner, [&] { worker.reset(); destroyed.Signal(); }); Wait(destroyed);
  };
  // Existing-account startup must not create a missing/corrupt state file.
  for (bool corrupt : {false, true}) {
    const auto path = folder.AppendASCII(corrupt ? "corrupt.json" : "missing.json");
    if (corrupt) CHECK(base::WriteFile(path, "{"));
    base::WaitableEvent refused;
    Post(runner, [&] {
      worker = std::make_unique<RequestWorker>(path, account, Mode::kExistingAccount);
      CHECK(worker->start_status() == (corrupt ? Status::kCorrupt : Status::kMissing));
      worker->Enqueue(request(), reply, [&](const auto& result) {
        CHECK_EQ(result.error, "request-state-not-ready"); refused.Signal();
      });
    });
    Wait(refused); close();
    if (!corrupt) CHECK(!base::PathExists(path));
  }
  // A failed settlement latches the worker closed to further dispatch even if
  // somebody restores a syntactically valid old file. Recovery is explicit.
  const auto fault_path = folder.AppendASCII("fault.json");
  base::WaitableEvent settlement_failed;
  std::atomic<int> runs = 0;
  std::string saved;
  Post(runner, [&] {
    worker = std::make_unique<RequestWorker>(fault_path, account, Mode::kExplicitNewAccount);
    CHECK(worker->start_status() == Status::kLoaded);
    CHECK(base::ReadFileToString(fault_path, &saved));
    auto r = request(); r.run = [&](auto, auto complete) {
      ++runs; CHECK(base::DeleteFile(fault_path)); complete({"ok", false, {}});
    };
    worker->Enqueue(r, reply, [&](const auto& result) {
      CHECK_EQ(result.error, "request-log-save-failed"); settlement_failed.Signal();
    });
  });
  Wait(settlement_failed);
  base::WaitableEvent latched;
  Post(runner, [&] {
    CHECK(worker->start_status() == Status::kMissing);
    CHECK(base::WriteFile(fault_path, saved));
    worker->Enqueue(request(), reply, [&](const auto& result) {
      CHECK_EQ(result.error, "request-state-not-ready"); latched.Signal();
    });
  });
  Wait(latched); CHECK_EQ(runs, 1); close();
  // Restore a fully charged ledger. Shutdown happens after Pump has deferred
  // for the actual rate window, but before that timer fires. No transport runs.
  const auto timer_path = folder.AppendASCII("timer-cancel.json");
  base::WaitableEvent cancelled, shutdown_done, destroyed;
  Post(runner, [&] {
    RequestStateStore disk(timer_path, account);
    CHECK(disk.InitializeNew() == Status::kLoaded);
    SchedulerState full; full.log.assign(10, base::Time::Now().InMillisecondsFSinceUnixEpoch());
    CHECK(disk.Commit(full) == Status::kLoaded);
    worker = std::make_unique<RequestWorker>(timer_path, account, Mode::kExistingAccount);
    worker->Enqueue(request(), reply, [&](const auto& result) {
      CHECK_EQ(result.error, "cancelled:shutdown"); cancelled.Signal();
    });
    // Queue's first Pump was posted ahead of this task on the same sequence.
    Post(runner, [&] { worker->Shutdown(reply, [&] { shutdown_done.Signal(); }); });
  });
  Wait(cancelled); Wait(shutdown_done);
  Post(runner, [&] { worker.reset(); destroyed.Signal(); }); Wait(destroyed);
  base::ThreadPoolInstance::Get()->Shutdown();
  std::cout << "missing/corrupt startup, settlement disk failure, fault latch, pending rate timer shutdown passed\n";
}

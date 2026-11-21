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
using DrainStatus = RequestWorker::DrainStatus;
void Post(scoped_refptr<base::SequencedTaskRunner> runner, Queue::Task task) {
  CHECK(runner->PostTask(FROM_HERE, base::BindOnce(
      [](Queue::Task task) { task(); }, std::move(task))));
}
void Wait(base::WaitableEvent& event) { CHECK(event.TimedWait(base::Seconds(10))); }
int main(int argc, char** argv) {
  base::AtExitManager at_exit; CHECK_EQ(argc, 2);
  const auto folder = base::FilePath::FromUTF8Unsafe(argv[1]);
  CHECK(folder.IsAbsolute() && base::CreateDirectory(folder));
  base::ThreadPoolInstance::CreateAndStartWithDefaultParams("BlancSyncDrainCheck");
  const auto runner = RequestWorker::CreateTaskRunner(), reply = RequestWorker::CreateTaskRunner();
  const std::string account(64, 'a');
  std::unique_ptr<RequestWorker> worker;
  Queue::TransportCompleted transport;
  const auto request = [&](std::string item) {
    Queue::Request r; r.kind = RequestClass::kSpace; r.item = std::move(item);
    r.generation = account; r.run = [](auto, auto) { CHECK(false); }; return r;
  };
  base::WaitableEvent started, barrier, drained, active_done, queued_done, rejected;
  std::atomic<int> completed = 0;
  Post(runner, [&] {
    worker = std::make_unique<RequestWorker>(folder.AppendASCII("state.json"), account,
        RequestWorker::StartMode::kExplicitNewAccount);
    auto active = request("active");
    active.run = [&](auto, auto complete) { transport = complete; started.Signal(); };
    worker->Enqueue(active, reply, [&](const auto& result) {
      CHECK_EQ(result.error, "cancelled:draining"); ++completed; active_done.Signal();
    });
  }); Wait(started);
  Post(runner, [&] {
    worker->Enqueue(request("waiting"), reply, [&](const auto& result) {
      CHECK_EQ(result.error, "cancelled:draining"); ++completed; queued_done.Signal();
    });
    worker->Drain(reply, [&](auto result) { CHECK(result == DrainStatus::kSettled); drained.Signal(); });
    CHECK(!worker->Resume());
    worker->Enqueue(request("new"), reply, [&](const auto& result) {
      CHECK_EQ(result.error, "cancelled:draining"); rejected.Signal();
    });
    Post(runner, [&] { barrier.Signal(); });
  });
  Wait(barrier); Wait(queued_done); Wait(rejected);
  CHECK(!drained.IsSignaled()); CHECK(!active_done.IsSignaled());
  // No drain acknowledgement before the actual transport callback arrives.
  transport({"late response", false, {}}); Wait(active_done); Wait(drained);
  CHECK_EQ(completed, 2);
  base::WaitableEvent resumed;
  Post(runner, [&] {
    CHECK(worker->Resume()); CHECK(!worker->Resume());
    auto r = request("resumed"); r.run = [](auto, auto complete) { complete({"ok", false, {}}); };
    worker->Enqueue(r, reply, [&](const auto& result) {
      CHECK(result.error.empty() && result.outcome == "ok"); resumed.Signal();
    });
  }); Wait(resumed);
  base::WaitableEvent active2, interrupted, shutdown, destroyed;
  Post(runner, [&] {
    RequestStateStore disk(folder.AppendASCII("state.json"), account);
    const auto saved = disk.Load();
    CHECK(saved.status == RequestStateStore::Status::kLoaded);
    CHECK_EQ(saved.state->log.size(), 2u);  // pre-drain + resumed request
    auto r = request("active2");
    r.run = [&](auto, auto complete) { transport = complete; active2.Signal(); };
    worker->Enqueue(r, reply, [](const auto& result) { CHECK_EQ(result.error, "cancelled:shutdown"); });
  }); Wait(active2);
  Post(runner, [&] {
    worker->Drain(reply, [&](auto result) { CHECK(result == DrainStatus::kInterrupted); interrupted.Signal(); });
    worker->Shutdown(reply, [&] { shutdown.Signal(); });
  });
  Wait(interrupted); Wait(shutdown);
  Post(runner, [&] { CHECK(!worker->Resume()); worker.reset(); destroyed.Signal(); }); Wait(destroyed);
  transport({"after teardown", false, {}});
  base::ThreadPoolInstance::Get()->Shutdown();
  std::cout << "real transport drain, waiting/new refusal, quota-preserving resume and teardown interruption passed\n";
}

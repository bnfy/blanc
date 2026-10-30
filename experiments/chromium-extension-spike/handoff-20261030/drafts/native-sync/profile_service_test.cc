#include "profile_service.h"
#include "base/at_exit.h"
#include "base/check.h"
#include "base/files/file_util.h"
#include "base/functional/bind.h"
#include "base/location.h"
#include "base/synchronization/waitable_event.h"
#include "base/task/thread_pool/thread_pool_instance.h"
#include "base/time/time.h"
#include <iostream>
using namespace blanc::sync;
void Wait(base::WaitableEvent& event) { CHECK(event.TimedWait(base::Seconds(10))); }
void Post(scoped_refptr<base::SequencedTaskRunner> runner, std::function<void()> task) {
  CHECK(runner->PostTask(FROM_HERE, base::BindOnce([](auto task) { task(); }, std::move(task))));
}
base::OnceCallback<void(AccountController::View)> Status(std::function<void(AccountController::View)> task) {
  return base::BindOnce([](std::function<void(AccountController::View)> task, AccountController::View view) { task(std::move(view)); }, std::move(task));
}
int main(int argc, char** argv) {
  base::AtExitManager at_exit; CHECK_EQ(argc, 2);
  const auto root = base::FilePath::FromUTF8Unsafe(argv[1]); CHECK(root.IsAbsolute());
  CHECK(!base::PathExists(root)); CHECK(base::CreateDirectory(root));
  base::ThreadPoolInstance::CreateAndStartWithDefaultParams("BlancSyncServiceCheck");
  const auto ui = RequestWorker::CreateTaskRunner();
  std::unique_ptr<ProfileService> service;
  const std::string binding(64, 'a');
  int revision = -1;
  base::WaitableEvent missing;
  Post(ui, [&] {
    service = std::make_unique<ProfileService>(root.AppendASCII("missing"), binding,
                                             AccountController::Hooks{});
    service->ReadStatus(Status([&](AccountController::View view) {
      CHECK(!view.ready); CHECK_EQ(view.error, "local-state-error"); missing.Signal();
    }));
  }); Wait(missing); CHECK(!base::PathExists(root.AppendASCII("missing")));
  base::WaitableEvent ready;
  Post(ui, [&] {
    service.reset();
    auto store = std::make_shared<ProfileStateStore>(root, binding, true, false);
    CHECK(store->Bootstrap(ProfileStateStore::BootstrapMode::kKnownFirstNativeSetup) == RequestLedger::Status::kLoaded);
    service = std::make_unique<ProfileService>(root, binding, AccountController::Hooks{});
    service->ReadStatus(Status([&](AccountController::View view) {
      CHECK(view.ready); CHECK(!view.enabled); CHECK(view.handle.empty()); revision = view.revision; ready.Signal();
    }));
  }); Wait(ready);
  base::WaitableEvent consent, stale;
  Post(ui, [&] {
    service->SetConsents(revision, true, false, [&](auto result) {
      CHECK(result.ok); CHECK(ui->RunsTasksInCurrentSequence()); consent.Signal();
    });
  }); Wait(consent);
  Post(ui, [&] {
    service->SetConsents(revision, false, false, [&](auto result) {
      CHECK(!result.ok); CHECK_EQ(result.error, "stale"); stale.Signal();
    });
  }); Wait(stale);
  // A mutation is accepted while a read reply is queued. Even a rejected
  // stale mutation invalidates that read; it must not expose an older identity.
  base::WaitableEvent invalidated, rejected_mutation, fresh;
  Post(ui, [&] {
    service->ReadStatus(Status([&](AccountController::View view) {
      CHECK(!view.ready && !view.enabled); CHECK(view.handle.empty());
      CHECK_EQ(view.error, "stale"); invalidated.Signal();
    }));
    service->SetConsents(revision, false, false, [&](auto result) {
      CHECK(!result.ok); CHECK_EQ(result.error, "stale"); rejected_mutation.Signal();
    });
  }); Wait(invalidated); Wait(rejected_mutation);
  Post(ui, [&] {
    service->ReadStatus(Status([&](AccountController::View view) {
      CHECK(view.ready); CHECK(view.sync_tabs); CHECK(view.error.empty());
      revision = view.revision; fresh.Signal();
    }));
  }); Wait(fresh);
  // Status was accepted before destruction, but must not publish stale state
  // after Shutdown. Its callback outlives the UI owner without capturing it.
  base::WaitableEvent cancelled, after_shutdown;
  Post(ui, [&] {
    service->ReadStatus(Status([&](AccountController::View view) {
      CHECK(!view.ready && !view.enabled); CHECK(view.handle.empty());
      CHECK_EQ(view.error, "shutdown"); cancelled.Signal();
    }));
    service->Shutdown(); service->Shutdown();
    service->SetTabStateReady(true);
    service->Disable(revision, false, [](auto result) {
      CHECK(!result.ok); CHECK_EQ(result.error, "shutdown");
    });
    service->ReadStatus(Status([&](AccountController::View view) {
      CHECK(!view.ready); CHECK_EQ(view.error, "shutdown"); after_shutdown.Signal();
    }));
    service.reset();
  }); Wait(cancelled); Wait(after_shutdown);
  base::ThreadPoolInstance::Get()->FlushForTesting();
  base::ThreadPoolInstance::Get()->Shutdown();
  std::cout << "profile service missing-state refusal, existing startup, queued status redaction and asynchronous destruction passed\n";
}

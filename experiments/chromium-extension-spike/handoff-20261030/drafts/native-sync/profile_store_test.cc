#include "profile_state_store.h"
#include "request_worker.h"
#include "base/at_exit.h"
#include "base/base64.h"
#include "base/check.h"
#include "base/files/file_util.h"
#include "base/functional/bind.h"
#include "base/json/json_reader.h"
#include "base/json/json_writer.h"
#include "base/location.h"
#include "base/synchronization/waitable_event.h"
#include "base/task/thread_pool/thread_pool_instance.h"
#include "base/time/time.h"
#include "base/uuid.h"
#include <iostream>
using namespace blanc::sync;
using Status = RequestLedger::Status;
void Post(scoped_refptr<base::SequencedTaskRunner> runner, RequestWorker::Queue::Task task) {
  CHECK(runner->PostTask(FROM_HERE, base::BindOnce(
      [](auto task) { task(); }, std::move(task))));
}
void Wait(base::WaitableEvent& event) { CHECK(event.TimedWait(base::Seconds(10))); }
int main(int argc, char** argv) {
  base::AtExitManager at_exit; CHECK_EQ(argc, 3);
  const std::string mode = argv[1], profile(64, 'a'), a(64, 'b'), b(64, 'c');
  const auto root = base::FilePath::FromUTF8Unsafe(argv[2]); CHECK(root.IsAbsolute());
  const auto folder = root.AppendASCII("Blanc Sync"), path = folder.AppendASCII("state.json");
  const auto blob = [](const std::string& name) { return base::Base64Encode("v10SYNTHETIC-OPAQUE-FIXTURE-" + name); };
  if (mode == "worker") {
    base::ThreadPoolInstance::CreateAndStartWithDefaultParams("BlancProfileLedgerCheck");
    const auto runner = RequestWorker::CreateTaskRunner(), reply = RequestWorker::CreateTaskRunner();
    std::unique_ptr<RequestWorker> worker;
    base::WaitableEvent cancelled, closed, destroyed;
    Post(runner, [&] {
      auto store = std::make_shared<ProfileStateStore>(root, profile, true, false);
      CHECK(store->Read().state->account_id == b);
      worker = std::make_unique<RequestWorker>(store->MakeLedger(), b);
      CHECK(worker->start_status() == Status::kLoaded);
      RequestWorker::Queue::Request request;
      request.kind = RequestClass::kFixed; request.item = "settings"; request.generation = b;
      request.run = [](auto, auto) { CHECK(false); };  // A->B must not refill quota.
      worker->Enqueue(request, reply, [&](const auto& result) {
        CHECK_EQ(result.error, "cancelled:shutdown"); cancelled.Signal();
      });
      Post(runner, [&] { worker->Shutdown(reply, [&] { closed.Signal(); }); });
    });
    Wait(cancelled); Wait(closed);
    Post(runner, [&] { worker.reset(); destroyed.Signal(); }); Wait(destroyed);
    base::ThreadPoolInstance::Get()->Shutdown();
    std::cout << "real worker B remained quota-blocked after account A->B and process restart\n"; return 0;
  }
  auto store = std::make_shared<ProfileStateStore>(root, profile, true, false);
  if (mode == "seed") {
    CHECK(base::CreateDirectory(root));
    CHECK(!store->MakeLedger());
    CHECK(store->Read().status == Status::kMissing);
    CHECK(store->Bootstrap(ProfileStateStore::BootstrapMode::kKnownFirstNativeSetup) == Status::kLoaded);
    CHECK(store->Bootstrap(ProfileStateStore::BootstrapMode::kKnownFirstNativeSetup) == Status::kLoaded);
    const auto initial = *store->Read().state;
    CHECK(!initial.enabled && !initial.sync_tabs && !initial.sync_spaces);
    CHECK(base::Uuid::ParseLowercase(initial.device_id).is_valid());
    auto ledger = store->MakeLedger(); CHECK(ledger);
    CHECK(ledger->InitializeNew() == Status::kNotAllowed);
    SchedulerState full; const double now = base::Time::Now().InMillisecondsFSinceUnixEpoch();
    full.log.assign(10, now); full.window_limit = 5; full.backoff_until = now + 300000;
    full.cursors[RequestClass::kSpace] = "old-space";
    CHECK(ledger->Commit(full) == Status::kLoaded);
    CHECK(store->SetConsents(store->Read().state->identity_revision, true, false) == Status::kLoaded);
    CHECK(ledger->Commit(SchedulerState{}) == Status::kWrongAccount);
    CHECK(store->Adopt(store->Read().state->identity_revision, "Account A", a, blob("A"), false) == Status::kLoaded);
    CHECK(store->SetConsents(store->Read().state->identity_revision, true, true) == Status::kLoaded);
    auto old_account = store->MakeLedger();
    CHECK(store->Adopt(store->Read().state->identity_revision, "Account B", b, blob("B"), false) == Status::kLoaded);
    CHECK(old_account->Commit(SchedulerState{}) == Status::kWrongAccount);
    const auto switched = *store->Read().state;
    CHECK(switched.enabled && switched.account_id == b && switched.sync_tabs && !switched.sync_spaces);
    CHECK_EQ(switched.device_id, initial.device_id);
    CHECK(switched.quota.log == full.log && switched.quota.window_limit == 5);
    CHECK(switched.quota.backoff_until == full.backoff_until && switched.quota.cursors.empty());
    CHECK(base::WriteFile(root.AppendASCII("expected-device.txt"), initial.device_id));
    std::cout << "atomic profile state seeded through A->B with unchanged charges/device/tab consent\n"; return 0;
  }
  CHECK_EQ(mode, "verify");
  auto state = *store->Read().state;
  CHECK(state.enabled && state.account_id == b && state.sync_tabs && !state.sync_spaces);
  CHECK_EQ(state.quota.log.size(), 10u); CHECK_EQ(state.quota.window_limit, 5);
  std::string expected; CHECK(base::ReadFileToString(root.AppendASCII("expected-device.txt"), &expected));
  CHECK_EQ(state.device_id, expected);
  CHECK(store->SetErasurePending(store->Read().state->identity_revision, true) == Status::kLoaded);
  state = *store->Read().state; CHECK(state.enabled && state.erasure_pending && state.protected_key == blob("B"));
  CHECK(store->ClearCredentials(store->Read().state->identity_revision) == Status::kLoaded);
  state = *store->Read().state;
  CHECK(!state.enabled && state.account_id.empty() && state.protected_key.empty());
  CHECK(state.sync_tabs && !state.sync_spaces && state.device_id == expected && state.quota.log.size() == 10);
  CHECK(store->Adopt(store->Read().state->identity_revision, "Account B", b, blob("B"), false) == Status::kLoaded);
  CHECK(store->RecordResult(store->Read().state->identity_revision, 1234567, "") == Status::kLoaded);
  CHECK(store->RecordResult(store->Read().state->identity_revision, 0, "offline") == Status::kLoaded);
  CHECK(store->Read().state->last_synced_at == 1234567);
  CHECK(store->RecordResult(store->Read().state->identity_revision, 0, "unredacted arbitrary error") == Status::kCorrupt);
  CHECK(store->DismissRecoveryPrompt(store->Read().state->identity_revision) == Status::kLoaded);
  const int revision = store->Read().state->identity_revision;
  CHECK(store->ClearCredentials(revision - 1) == Status::kWrongAccount);
  CHECK(store->SetErasurePending(revision - 1, true) == Status::kWrongAccount);
  CHECK(store->RecordResult(revision - 1, 9999999, "") == Status::kWrongAccount);
  CHECK(store->Adopt(revision - 1, "Stale", a, blob("stale"), false) == Status::kWrongAccount);
  CHECK(store->RewrapProtectedKey(revision - 1, blob("stale")) == Status::kWrongAccount);
  CHECK(store->RewrapProtectedKey(revision, blob("B-rewrapped")) == Status::kLoaded);
  CHECK(store->Read().state->recovery_prompt_dismissed);
  CHECK(store->RewrapProtectedKey(revision, blob("B")) == Status::kLoaded);
  std::string good; CHECK(base::ReadFileToString(path, &good));
  // Deny directory writes while leaving the existing bundle readable.
  CHECK(base::SetPosixFilePermissions(folder, 0500));
  const auto failed = store->Adopt(store->Read().state->identity_revision, "Account C", std::string(64, 'd'), blob("C"), true);
  CHECK(base::SetPosixFilePermissions(folder, 0700));
  CHECK(failed == Status::kWriteError);
  std::string after; CHECK(base::ReadFileToString(path, &after)); CHECK_EQ(good, after);
  CHECK(store->Read().state->account_id == b);
  CHECK(ProfileStateStore(root, std::string(64, 'd'), true, false).Read().status == Status::kWrongProfile);
  const auto private_root = root.AppendASCII("never-create-private");
  ProfileStateStore private_store(private_root, profile, true, true);
  CHECK(private_store.Bootstrap(ProfileStateStore::BootstrapMode::kKnownFirstNativeSetup) == Status::kNotAllowed);
  CHECK(!base::PathExists(private_root));
  for (const auto& corrupt : {std::string(), std::string("{"), std::string(16385, 'x')}) {
    CHECK(base::WriteFile(path, corrupt));
    CHECK(store->Read().status == Status::kCorrupt);
    CHECK(store->Bootstrap(ProfileStateStore::BootstrapMode::kKnownFirstNativeSetup) == Status::kCorrupt);
    CHECK(store->ClearCredentials(0) == Status::kCorrupt);
  }
  auto future = base::JSONReader::ReadDict(good, base::JSON_PARSE_RFC); CHECK(future);
  future->Set("version", 2); CHECK(base::WriteFile(path, *base::WriteJson(*future)));
  CHECK(store->Bootstrap(ProfileStateStore::BootstrapMode::kKnownFirstNativeSetup) == Status::kCorrupt);
  CHECK(base::WriteFile(path, good));
  CHECK(base::DeleteFile(path));
  CHECK(store->Read().status == Status::kMissing);
  CHECK(store->Bootstrap(ProfileStateStore::BootstrapMode::kKnownFirstNativeSetup) == Status::kMissing);
  CHECK(base::WriteFile(path, good));
  std::cout << "restart, failed adoption byte preservation, disable retention, erasure state, private/context/corruption refusal passed\n";
}

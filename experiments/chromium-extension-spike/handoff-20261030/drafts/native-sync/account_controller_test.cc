#include "account_controller.h"
#include "base/at_exit.h"
#include "base/base64.h"
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
using Core = AccountController;
using Queue = RequestWorker::Queue;
void Post(scoped_refptr<base::SequencedTaskRunner> runner, std::function<void()> task) {
  CHECK(runner->PostTask(FROM_HERE, base::BindOnce([](auto task) { task(); }, std::move(task))));
}
void Wait(base::WaitableEvent& event) { CHECK(event.TimedWait(base::Seconds(10))); }
int main(int argc, char** argv) {
  base::AtExitManager at_exit; CHECK_EQ(argc, 2);
  const auto root = base::FilePath::FromUTF8Unsafe(argv[1]); CHECK(root.IsAbsolute());
  CHECK(base::CreateDirectory(root));
  const std::string profile(64, 'a'), a(64, 'b'), b(64, 'c');
  const auto blob = [](const char* value) { return base::Base64Encode(std::string("v10SYNTHETIC-") + value); };
  base::ThreadPoolInstance::CreateAndStartWithDefaultParams("BlancAccountControllerCheck");
  const auto owner = RequestWorker::CreateTaskRunner(), reply = RequestWorker::CreateTaskRunner();
  std::unique_ptr<Core> core;
  std::atomic<Core::Gate> gate = Core::Gate::kReady;
  std::atomic<int> erase_calls = 0, invalidations = 0, identities = 0, cancels = 0;
  std::function<void(WipeOutcome)> erase_done;
  base::WaitableEvent erase_started;
  std::vector<std::string> retractions;
  Core::Hooks hooks;
  hooks.gate = [&] { return gate.load(); };
  hooks.erase = [&](std::string account, auto done) {
    CHECK(owner->RunsTasksInCurrentSequence()); CHECK(account == a || account == b);
    ++erase_calls; erase_done = done; erase_started.Signal();
  };
  hooks.retract = [&](std::string kind, std::string account, auto done) {
    CHECK(owner->RunsTasksInCurrentSequence()); CHECK_EQ(account, b);
    retractions.push_back(kind); done(); done();  // duplicate callbacks ignored
  };
  hooks.invalidate_models = [&] { ++invalidations; };
  hooks.identity_changed = [&] { ++identities; };
  hooks.cancel = [&] { ++cancels; };
  const auto command = [&](std::function<void(Core::Completed)> start) {
    struct State { base::WaitableEvent done; Core::Result result; std::atomic<int> calls = 0; };
    auto state = std::make_shared<State>();
    Post(owner, [&, state, start] { start([&, state](auto result) {
      CHECK(reply->RunsTasksInCurrentSequence()); CHECK_EQ(++state->calls, 1);
      state->result = result; state->done.Signal();
    }); }); Wait(state->done); return state->result;
  };
  const auto view = [&] {
    base::WaitableEvent done; Core::View value;
    Post(owner, [&] { value = core->Status(); done.Signal(); }); Wait(done); return value;
  };
  const auto disk = [&] {
    ProfileStateStore store(root, profile, true, false); auto value = store.Read();
    CHECK(value.state); return *value.state;
  };
  const auto adopt = [&](const std::string& account, const char* label) {
    const int revision = view().revision;
    return command([&, revision, account, label](auto done) {
      core->AdoptPrepared(revision, label, account, blob(label), false, done);
    });
  };
  base::WaitableEvent opened;
  Post(owner, [&] {
    core = std::make_unique<Core>(std::make_shared<ProfileStateStore>(root, profile, true, false),
        ProfileStateStore::BootstrapMode::kKnownFirstNativeSetup, reply, hooks);
    opened.Signal();
  }); Wait(opened);
  CHECK(view().ready && !view().enabled); CHECK(adopt(a, "Account A").ok);
  const auto consent = [&](bool tabs, bool spaces) {
    const int revision = view().revision;
    return command([&, revision, tabs, spaces](auto done) { core->SetConsents(revision, tabs, spaces, done); });
  };
  CHECK(consent(true, true).ok);
  const auto rejected_request = [&](const char* item, Core::Role role) {
    base::WaitableEvent done; Queue::Result result;
    Post(owner, [&] {
      Queue::Request request; request.item = item; request.run = [](auto, auto) { CHECK(false); };
      core->Enqueue(request, role, [&](const auto& value) { result = value; done.Signal(); });
    }); Wait(done); return result.error;
  };
  CHECK_EQ(rejected_request("session", Core::Role::kTabPublish), "consent-or-snapshot-not-ready");
  CHECK_EQ(rejected_request("icons", Core::Role::kGeneral), "consent-or-snapshot-not-ready");
  CHECK(consent(false, true).ok);
  base::WaitableEvent retracted;
  Post(owner, [&] {
    Queue::Request request; request.item = "session";
    request.run = [](auto, auto done) { done({"retracted", false, {}}); };
    core->Enqueue(request, Core::Role::kTabRetraction, [&](const auto& result) {
      CHECK(result.error.empty()); retracted.Signal();
    });
  }); Wait(retracted); CHECK(consent(true, true).ok);
  // Hold a real queued operation. DELETE must not start before its completion.
  Queue::TransportCompleted transport;
  base::WaitableEvent request_started, request_done, barrier, wipe_done;
  std::atomic<int> applied = 0; Core::Result wipe_result;
  Post(owner, [&] {
    Queue::Request request; request.item = "settings";
    request.run = [&](auto, auto done) { transport = done; request_started.Signal(); };
    request.on_outcome = [&](const auto&) { ++applied; return true; };
    core->Enqueue(request, Core::Role::kGeneral, [&](const auto& result) {
      CHECK_EQ(result.error, "cancelled:generation"); request_done.Signal();
    });
  }); Wait(request_started);
  const int revision_a = view().revision;
  Post(owner, [&] { core->Disable(revision_a, true, [&](auto result) { wipe_result = result; wipe_done.Signal(); }); });
  Post(owner, [&] { barrier.Signal(); }); Wait(barrier);
  CHECK(!erase_started.IsSignaled()); CHECK(view().busy);
  CHECK_EQ(command([&](auto done) { core->SetConsents(revision_a, false, false, done); }).error, "busy");
  transport({"old account payload", false, {}}); Wait(request_done); Wait(erase_started);
  CHECK_EQ(applied, 0); CHECK(disk().account_id == a && disk().enabled);
  erase_done({false, 500, {}}); Wait(wipe_done);
  CHECK(!wipe_result.ok && wipe_result.error == "wipe-failed:500");
  CHECK(disk().account_id == a && disk().enabled);
  // A duplicate success for the failed operation must not clear anything.
  erase_done({false, 200, {}}); base::WaitableEvent duplicate_barrier;
  Post(owner, [&] { duplicate_barrier.Signal(); }); Wait(duplicate_barrier); CHECK_EQ(disk().account_id, a);
  // DELETE requires the locator, not decryption of the OS-wrapped key.
  gate = Core::Gate::kKeyUnavailable;
  erase_started.Reset(); wipe_done.Reset();
  Post(owner, [&] { core->Disable(revision_a, true, [&](auto result) { wipe_result = result; wipe_done.Signal(); }); });
  Wait(erase_started); erase_done({false, 503, "{\"error\":\"quota erasure pending\"}"}); Wait(wipe_done);
  CHECK(!wipe_result.ok && wipe_result.error == "erasure-pending");
  CHECK(disk().erasure_pending && disk().enabled && !disk().protected_key.empty());
  gate = Core::Gate::kReady;
  erase_started.Reset(); wipe_done.Reset();
  Post(owner, [&] { core->Disable(revision_a, true, [&](auto result) { wipe_result = result; wipe_done.Signal(); }); });
  Wait(erase_started); erase_done({false, 204, {}}); Wait(wipe_done);
  CHECK(wipe_result.ok); CHECK(!view().enabled && disk().protected_key.empty() && disk().sync_tabs);
  CHECK(adopt(b, "Account B").ok);
  const int revision_b = view().revision;
  CHECK(command([&](auto done) { core->Disable(revision_b, false, done); }).ok);
  CHECK((retractions == std::vector<std::string>{"sends", "closed", "session"}));
  CHECK(!disk().enabled && disk().sync_tabs); CHECK(adopt(b, "Account B").ok);
  // Live native gate changes while queued are rechecked before dispatch.
  base::WaitableEvent gate_active, gate_pending, gate_barrier;
  Post(owner, [&] {
    Queue::Request request; request.item = "bookmarks";
    request.run = [&](auto, auto done) { transport = done; gate_active.Signal(); };
    core->Enqueue(request, Core::Role::kGeneral, [](const auto&) {});
  }); Wait(gate_active);
  Post(owner, [&] {
    Queue::Request request; request.item = "settings"; request.run = [](auto, auto) { CHECK(false); };
    core->Enqueue(request, Core::Role::kGeneral, [&](const auto& result) {
      CHECK_EQ(result.error, "cancelled:service-or-key-unavailable"); gate_pending.Signal();
    });
    gate_barrier.Signal();
  }); Wait(gate_barrier); gate = Core::Gate::kServiceUnavailable;
  transport({"ok", false, {}}); Wait(gate_pending); gate = Core::Gate::kReady;
  CHECK(base::SetPosixFilePermissions(root.AppendASCII("Blanc Sync"), 0500));
  const auto failed = adopt(a, "Failed Account A");
  CHECK(base::SetPosixFilePermissions(root.AppendASCII("Blanc Sync"), 0700));
  CHECK(!failed.ok && failed.error == "local-state-error");
  CHECK_EQ(disk().account_id, b); CHECK(!view().ready && !view().enabled);
  CHECK_EQ(rejected_request("settings", Core::Role::kGeneral), "local-state-error");
  CHECK(command([&](auto done) { core->Shutdown(done); }).ok);
  base::WaitableEvent destroyed;
  Post(owner, [&] { core.reset(); destroyed.Signal(); }); Wait(destroyed);
  // Teardown during DELETE keeps the persisted identity and strands late success.
  base::WaitableEvent reopened;
  Post(owner, [&] {
    core = std::make_unique<Core>(std::make_shared<ProfileStateStore>(root, profile, true, false),
        ProfileStateStore::BootstrapMode::kExistingOnly, reply, hooks); reopened.Signal();
  }); Wait(reopened);
  erase_started.Reset(); wipe_done.Reset(); const int current_revision = view().revision;
  Post(owner, [&] { core->Disable(current_revision, true, [&](auto result) { wipe_result = result; wipe_done.Signal(); }); });
  Wait(erase_started);
  CHECK(command([&](auto done) { core->Shutdown(done); }).ok); Wait(wipe_done);
  CHECK(!wipe_result.ok && wipe_result.error == "shutdown");
  destroyed.Reset(); Post(owner, [&] { core.reset(); destroyed.Signal(); }); Wait(destroyed);
  erase_done({false, 200, {}}); base::WaitableEvent late_barrier;
  Post(owner, [&] { late_barrier.Signal(); }); Wait(late_barrier); CHECK_EQ(disk().account_id, b);
  const auto private_root = root.AppendASCII("private-never-create");
  base::WaitableEvent private_open;
  Post(owner, [&] {
    core = std::make_unique<Core>(std::make_shared<ProfileStateStore>(private_root, profile, true, true),
        ProfileStateStore::BootstrapMode::kKnownFirstNativeSetup, reply, hooks); private_open.Signal();
  }); Wait(private_open);
  CHECK(!view().ready && !view().enabled);
  CHECK_EQ(command([&](auto done) { core->AdoptPrepared(-1, "Private", a, blob("private"), false, done); }).error,
      "local-state-error");
  CHECK(!base::PathExists(private_root));
  CHECK(command([&](auto done) { core->Shutdown(done); }).ok);
  destroyed.Reset(); Post(owner, [&] { core.reset(); destroyed.Signal(); }); Wait(destroyed);
  CHECK_GE(invalidations, 8); CHECK_GE(identities, 5); CHECK_EQ(cancels, 3);
  base::ThreadPoolInstance::Get()->Shutdown();
  std::cout << "controller drain/wipe retention, retractions, generation/gate/snapshot checks, failed-write latch and late teardown callback passed\n";
}

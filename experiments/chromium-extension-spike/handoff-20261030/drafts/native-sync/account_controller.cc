#include "account_controller.h"
#include "blob_exchange.h"
#include "base/check.h"
#include "base/functional/bind.h"
#include "base/location.h"
#include <limits>

namespace blanc::sync {
namespace {
bool Post(scoped_refptr<base::SequencedTaskRunner> runner, std::function<void()> task) {
  return runner->PostTask(FROM_HERE, base::BindOnce([](auto task) { task(); }, std::move(task)));
}
}  // namespace
AccountController::AccountController(std::shared_ptr<ProfileStateStore> store,
    ProfileStateStore::BootstrapMode mode, scoped_refptr<base::SequencedTaskRunner> reply, Hooks hooks)
    : store_(std::move(store)), runner_(base::SequencedTaskRunner::GetCurrentDefault()),
      reply_(std::move(reply)), hooks_(std::move(hooks)),
      bootstrap_(store_ ? store_->Bootstrap(mode) : StoreStatus::kInvalidBinding) {
  CHECK(reply_);
  if (bootstrap_ == StoreStatus::kLoaded && !BuildWorker()) blocked_ = true;
}
AccountController::~AccountController() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_); CHECK(closed_);
}
AccountController::Gate AccountController::CurrentGate() const {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  return hooks_.gate ? hooks_.gate() : Gate::kServiceUnavailable;
}
void AccountController::PostReply(Completed done, Result result) {
  CHECK(Post(reply_, [done = std::move(done), result = std::move(result)] {
    if (done) done(result);
  }));
}
AccountController::View AccountController::Status() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  View view; view.busy = busy_;
  if (stopping_) { view.error = "shutdown"; return view; }
  if (bootstrap_ != StoreStatus::kLoaded || blocked_) { view.error = "local-state-error"; return view; }
  const auto loaded = store_->Read();
  if (!loaded.state) { blocked_ = true; view.error = "local-state-error"; return view; }
  const auto& state = *loaded.state;
  view.ready = true; view.enabled = state.enabled; view.sync_tabs = state.sync_tabs;
  view.sync_spaces = state.sync_spaces; view.revision = state.identity_revision;
  view.erasure_pending = state.erasure_pending;
  view.recovery_prompt_dismissed = state.recovery_prompt_dismissed;
  view.last_synced_at = state.last_synced_at; view.handle = state.handle; view.origin = state.origin;
  view.error = state.erasure_pending ? "erasure-pending" : !last_error_.empty() ? last_error_ : state.last_error;
  if (state.enabled && CurrentGate() == Gate::kKeyUnavailable) view.error = "key:encryption-unavailable";
  if (state.enabled && CurrentGate() == Gate::kServiceUnavailable) view.error = "service-unavailable";
  return view;
}
void AccountController::SetTabStateReady(bool ready) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_); tab_ready_ = ready;
}
bool AccountController::BuildWorker() {
  const auto loaded = store_->Read(); if (!loaded.state) return false;
  if (!loaded.state->enabled) return true;
  worker_ = std::make_unique<RequestWorker>(store_->MakeLedger(), loaded.state->account_id);
  return worker_->start_status() == StoreStatus::kLoaded;
}
bool AccountController::Current(uint64_t token) const {
  return !stopping_ && busy_ && generation_ == token;
}
bool AccountController::Begin(int revision, Completed done, std::function<void(uint64_t)> action) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  if (stopping_) { PostReply(std::move(done), {false, "shutdown"}); return false; }
  if (busy_) { PostReply(std::move(done), {false, "busy"}); return false; }
  if (bootstrap_ != StoreStatus::kLoaded || blocked_) {
    PostReply(std::move(done), {false, "local-state-error"}); return false;
  }
  const auto loaded = store_->Read();
  if (!loaded.state) { blocked_ = true; PostReply(std::move(done), {false, "local-state-error"}); return false; }
  if (loaded.state->identity_revision != revision) { PostReply(std::move(done), {false, "stale"}); return false; }
  if (generation_ == std::numeric_limits<uint64_t>::max()) {
    blocked_ = true; PostReply(std::move(done), {false, "local-state-error"}); return false;
  }
  const auto token = ++generation_; revision_ = revision;
  departure_resumed_ = false; departure_preparing_ = false;
  operation_account_ = loaded.state->account_id; busy_ = true; pending_ = std::move(done);
  if (hooks_.invalidate_models) hooks_.invalidate_models();
  const auto drained = [weak = weak_factory_.GetWeakPtr(), action, token](auto status) {
    if (!weak || !weak->Current(token)) return;
    if (status != RequestWorker::DrainStatus::kSettled) weak->Failure(token, "shutdown");
    else action(token);
  };
  if (worker_) worker_->Drain(runner_, drained);
  else CHECK(Post(runner_, [drained] { drained(RequestWorker::DrainStatus::kSettled); }));
  return true;
}
void AccountController::AdoptPrepared(int revision, std::string handle, std::string account,
    std::string protected_key, bool generated, Completed done) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  if (CurrentGate() != Gate::kReady) { PostReply(std::move(done), {false, "service-or-key-unavailable"}); return; }
  Begin(revision, std::move(done), [this, handle, account, protected_key, generated](uint64_t token) {
    if (CurrentGate() != Gate::kReady) { Failure(token, "service-or-key-unavailable"); return; }
    CommitFinished(token, store_->Adopt(revision_, handle, account, protected_key, generated));
  });
}
void AccountController::SetConsents(int revision, bool tabs, bool spaces, Completed done) {
  Begin(revision, std::move(done), [this, tabs, spaces](uint64_t token) {
    CommitFinished(token, store_->SetConsents(revision_, tabs, spaces));
  });
}
void AccountController::Disable(int revision, bool wipe_remote, Completed done) {
  Begin(revision, std::move(done), [this, wipe_remote](uint64_t token) {
    if (operation_account_.empty()) { CommitFinished(token, store_->ClearCredentials(revision_)); return; }
    if (wipe_remote) {
      const bool available=hooks_.erase_available ? hooks_.erase_available() :
          CurrentGate()!=Gate::kServiceUnavailable;
      if (!available || !hooks_.erase) {
        Failure(token, "service-unavailable"); return;
      }
      hooks_.erase(operation_account_, [weak = weak_factory_.GetWeakPtr(), runner = runner_, token](auto outcome) {
        // Late delivery after profile teardown is harmless; Shutdown already
        // resolves the user's pending command. Never call the owner off-sequence.
        Post(runner, [weak, token, outcome = std::move(outcome)] {
          if (weak && weak->Current(token)) weak->Erased(token, outcome);
        });
      });
    } else { retract_step_ = 0; departure_resumed_ = false; departure_preparing_ = false; RetractNext(token, 0); }
  });
}
void AccountController::Erased(uint64_t token, WipeOutcome outcome) {
  const auto decision = DecideWipe(outcome);
  if (decision.clear_credentials) { CommitFinished(token, store_->ClearCredentials(revision_)); return; }
  if (decision.erasure_pending && store_->SetErasurePending(revision_, true) != StoreStatus::kLoaded) {
    Failure(token, "local-state-error", true); return;
  }
  Failure(token, decision.error);
}
void AccountController::RetractNext(uint64_t token, size_t step) {
  if (!Current(token) || step != retract_step_) return;
  static constexpr std::array<const char*, 3> names = {"sends", "closed", "session"};
  if (step == names.size()) {
    CommitFinished(token, store_->ClearCredentials(revision_)); return;
  }
  if (hooks_.prepare_departure) {
    const auto loaded = store_->Read();
    if (!loaded.state || loaded.state->identity_revision != revision_ ||
        loaded.state->account_id != operation_account_) {
      Failure(token, "local-state-error", true); return;
    }
    if (blocked_ || (worker_ && worker_->start_status() != StoreStatus::kLoaded)) {
      Failure(token, "local-state-error", true); return;
    }
    if (!loaded.state->enabled || loaded.state->protected_key.empty() ||
        !worker_ || !worker_->CanRunImmediately()) {
      CommitFinished(token, store_->ClearCredentials(revision_)); return;
    }
    departure_preparing_ = true;
    hooks_.prepare_departure(names[step], operation_account_, revision_,
        [weak = weak_factory_.GetWeakPtr(), runner = runner_, token, step](auto material) {
      CHECK(Post(runner, [weak, token, step, material = std::move(material)]() mutable {
        if (weak) weak->DeparturePrepared(token, step, std::move(material));
      }));
    });
    return;
  }
  if (CurrentGate() != Gate::kReady || !hooks_.retract) {
    CommitFinished(token, store_->ClearCredentials(revision_)); return;
  }
  hooks_.retract(names[step], operation_account_,
      [weak = weak_factory_.GetWeakPtr(), runner = runner_, token, step] {
    Post(runner, [weak, token, step] {
      if (!weak || !weak->Current(token) || weak->retract_step_ != step) return;
      weak->retract_step_ = step + 1; weak->RetractNext(token, step + 1);
    });
  });
}
void AccountController::DeparturePrepared(uint64_t token, size_t step,
    std::optional<DepartureMaterial> material) {
  if (!Current(token) || step != retract_step_ || !departure_preparing_) return;
  departure_preparing_ = false;
  const auto loaded = store_->Read();
  if (!loaded.state || loaded.state->identity_revision != revision_ ||
      loaded.state->account_id != operation_account_) {
    Failure(token, "local-state-error", true); return;
  }
  if (!material || !material->transport || !material->key ||
      material->key_account != operation_account_ ||
      material->erasure_pending != loaded.state->erasure_pending) {
    ++retract_step_; RetractNext(token, retract_step_); return;
  }
  if (!departure_resumed_) {
    if (!worker_ || !worker_->Resume()) { Failure(token, "local-state-error", true); return; }
    departure_resumed_ = true;
  }
  static constexpr std::array<const char*, 3> names = {"sends", "closed", "session"};
  auto cancelled = std::move(material->model.cancelled);
  material->model.stored = {};  // Departure must not acknowledge a normal sync.
  material->model.cancelled = [weak = weak_factory_.GetWeakPtr(), token, step, cancelled,
                               expected_pending = material->erasure_pending] {
    if (!weak || !weak->Current(token) || weak->retract_step_ != step || weak->blocked_)
      return std::string("generation");
    const auto loaded = weak->store_->Read();
    if (!loaded.state || loaded.state->identity_revision != weak->revision_ ||
        loaded.state->account_id != weak->operation_account_ ||
        loaded.state->erasure_pending != expected_pending)
      return std::string("identity");
    return cancelled ? cancelled() : std::string();
  };
  auto request = MakeBlobExchange(std::move(material->transport), std::move(material->key),
      operation_account_, names[step], operation_account_, RequestClass::kFixed, false,
      std::move(material->model), BlobExchangeMode::kDeparture);
  worker_->Enqueue(std::move(request), runner_,
      [weak = weak_factory_.GetWeakPtr(), token, step](const auto& result) {
    if (!weak || !weak->Current(token) || weak->retract_step_ != step) return;
    if (result.error == "request-log-save-failed" || result.error == "request-state-not-ready") {
      weak->Failure(token, "local-state-error", true); return;
    }
    ++weak->retract_step_; weak->RetractNext(token, weak->retract_step_);
  });
}
void AccountController::CommitFinished(uint64_t token, StoreStatus status) {
  if (!Current(token)) return;
  if (status != StoreStatus::kLoaded) { Failure(token, "local-state-error", true); return; }
  const auto install = [weak = weak_factory_.GetWeakPtr(), token] {
    if (!weak || !weak->Current(token)) return;
    weak->worker_.reset();
    if (!weak->BuildWorker()) { weak->Failure(token, "local-state-error", true); return; }
    const auto current = weak->store_->Read();
    if (!current.state) { weak->Failure(token, "local-state-error", true); return; }
    if (current.state->account_id != weak->operation_account_ && weak->hooks_.identity_changed)
      weak->hooks_.identity_changed();
    weak->Finish(token, {true, {}});
  };
  if (worker_) worker_->Shutdown(runner_, install); else CHECK(Post(runner_, install));
}
void AccountController::Failure(uint64_t token, std::string error, bool storage_failure) {
  if (!Current(token)) return;
  blocked_ |= storage_failure;
  if (!blocked_ && worker_ && !departure_resumed_ && !worker_->Resume()) { blocked_ = true; error = "local-state-error"; }
  Finish(token, {false, std::move(error)});
}
void AccountController::Finish(uint64_t token, Result result) {
  if (!Current(token)) return;
  busy_ = false; last_error_ = result.error;
  auto done = std::move(pending_); pending_ = {}; PostReply(std::move(done), std::move(result));
}
void AccountController::Enqueue(RequestWorker::Queue::Request request, Role role,
                                 RequestWorker::Queue::Completed done) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  const auto reject = [&](const std::string& error) {
    CHECK(Post(reply_, [done, error] { if (done) done({{}, false, error}); }));
  };
  if (stopping_ || busy_) { reject("cancelled:suspended"); return; }
  if (blocked_ || bootstrap_ != StoreStatus::kLoaded) { reject("local-state-error"); return; }
  const auto loaded = store_->Read();
  if (!loaded.state) { blocked_ = true; reject("local-state-error"); return; }
  const auto& state = *loaded.state;
  if (!state.enabled || !worker_) { reject("sync-off"); return; }
  if (state.erasure_pending) { reject("erasure-pending"); return; }
  if (CurrentGate() != Gate::kReady) { reject("service-or-key-unavailable"); return; }
  const bool needs_snapshot = role == Role::kTabPublish ||
      ((request.item == "session" || request.item == "icons") && state.sync_tabs);
  if ((needs_snapshot && !tab_ready_) || (role == Role::kTabPublish && !state.sync_tabs) ||
      (role == Role::kTabRetraction && state.sync_tabs) ||
      (role == Role::kSpacePublish && !state.sync_spaces)) { reject("consent-or-snapshot-not-ready"); return; }
  request.generation = state.account_id;
  const auto token = generation_;
  auto cancelled = std::move(request.cancelled);
  request.cancelled = [weak = weak_factory_.GetWeakPtr(), token, cancelled, needs_snapshot,
                       revision = state.identity_revision, account = state.account_id] {
    if (!weak || weak->generation_ != token) return std::string("generation");
    if (weak->blocked_ || weak->busy_ || weak->stopping_) return std::string("suspended");
    const auto current = weak->store_->Read();
    if (!current.state || !current.state->enabled || current.state->erasure_pending ||
        current.state->identity_revision != revision || current.state->account_id != account)
      return std::string("identity-or-erasure");
    if (weak->CurrentGate() != Gate::kReady) return std::string("service-or-key-unavailable");
    if (needs_snapshot && !weak->tab_ready_) return std::string("snapshot-not-ready");
    return cancelled ? cancelled() : std::string();
  };
  auto observer = std::move(request.on_outcome);
  request.on_outcome = [weak = weak_factory_.GetWeakPtr(), token, observer](const auto& result) {
    if (!weak || weak->generation_ != token || weak->blocked_ || weak->stopping_) return false;
    if (result.error == "request-log-save-failed") {
      weak->blocked_ = true; weak->last_error_ = "local-state-error"; return false;
    }
    return observer ? observer(result) : true;
  };
  worker_->Enqueue(std::move(request), runner_,
      [weak = weak_factory_.GetWeakPtr(), token, done, reply = reply_](const auto& result) {
    if (weak && (result.error == "request-log-save-failed" || result.error == "request-state-not-ready")) {
      weak->blocked_ = true; weak->last_error_ = "local-state-error";
    }
    const auto delivered = weak && weak->generation_ == token && !weak->blocked_ ? result
        : RequestWorker::Queue::Result{{}, false, "cancelled:generation"};
    CHECK(Post(reply, [done, delivered] { if (done) done(delivered); }));
  });
}
void AccountController::EnqueueBlob(int expected_revision, std::shared_ptr<BlobTransport> transport,
    std::shared_ptr<const ProtocolKey> key, std::string key_account,
    std::string store, RequestClass kind, bool optional_store, Role role,
    BlobModelHooks hooks, RequestWorker::Queue::Completed done) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  const auto loaded = store_->Read();
  if (!loaded.state || !key || loaded.state->account_id != key_account) {
    const auto error = loaded.state ? "key-account-mismatch" : "local-state-error";
    CHECK(Post(reply_, [done, error] { if (done) done({{}, false, error}); }));
    return;
  }
  if (loaded.state->identity_revision != expected_revision) {
    CHECK(Post(reply_, [done] { if (done) done({{}, false, "stale-credential-session"}); }));
    return;
  }
  auto request = MakeBlobExchange(std::move(transport), std::move(key),
      loaded.state->account_id, std::move(store), loaded.state->account_id,
      kind, optional_store, std::move(hooks));
  Enqueue(std::move(request), role, std::move(done));
}
void AccountController::Shutdown(Completed done) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  if (closed_) { PostReply(std::move(done), {true, {}}); return; }
  shutdown_waiters_.push_back(std::move(done)); if (stopping_) return;
  stopping_ = true; weak_factory_.InvalidateWeakPtrs();
  if (pending_) { auto pending = std::move(pending_); pending_ = {}; PostReply(std::move(pending), {false, "shutdown"}); }
  busy_ = false;
  if (hooks_.invalidate_models) hooks_.invalidate_models();
  if (hooks_.cancel) hooks_.cancel();
  const auto finish = [weak = weak_factory_.GetWeakPtr()] { if (weak) weak->FinishShutdown(); };
  if (worker_) worker_->Shutdown(runner_, finish); else CHECK(Post(runner_, finish));
}
void AccountController::FinishShutdown() {
  worker_.reset(); closed_ = true;
  auto waiters = std::move(shutdown_waiters_);
  for (auto& done : waiters) PostReply(std::move(done), {true, {}});
}
}  // namespace blanc::sync

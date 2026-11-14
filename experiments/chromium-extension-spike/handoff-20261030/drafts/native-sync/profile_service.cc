#include "profile_service.h"
#include "base/check.h"
#include "base/functional/bind.h"
#include "base/location.h"

namespace blanc::sync {
struct ProfileService::Backend {
  std::unique_ptr<AccountController> standalone_controller;
  std::unique_ptr<ProfileEngine> engine;
  AccountController* controller = nullptr;
};
ProfileService::ProfileService(base::FilePath root, std::string binding,
                              AccountController::Hooks hooks)
    : ProfileService(std::move(root), std::move(binding), std::move(hooks),
                     ProfileStateStore::BootstrapMode::kExistingOnly) {}
ProfileService::ProfileService(base::FilePath root, std::string binding,
                              AccountController::Hooks hooks,
                              ProfileStateStore::BootstrapMode mode)
    : ProfileService(std::move(root), std::move(binding), std::move(hooks), mode, std::nullopt) {}
ProfileService::ProfileService(base::FilePath root, std::string binding,
                              AccountController::Hooks hooks, EngineInputs inputs)
    : ProfileService(std::move(root), std::move(binding), std::move(hooks),
                     ProfileStateStore::BootstrapMode::kExistingOnly, std::move(inputs)) {}
ProfileService::ProfileService(base::FilePath root, std::string binding,
                              AccountController::Hooks hooks,
                              ProfileStateStore::BootstrapMode mode,
                              std::optional<EngineInputs> inputs)
    : backend_(std::make_shared<Backend>()),
      worker_(RequestWorker::CreateTaskRunner()),
      reply_(base::SequencedTaskRunner::GetCurrentDefault()) {
  if (inputs) {
    if (inputs->provider_owner)
      provider_ = std::make_shared<CredentialProviderHandle>(inputs->process_crypto,
                                                           inputs->provider_owner);
    inputs->process_crypto = nullptr;
    inputs->provider_owner.reset();
  }
  auto identity_changed = std::move(hooks.identity_changed);
  hooks.identity_changed = [generation = read_generation_,
                            changed = std::move(identity_changed)] {
    generation->fetch_add(1);
    if (changed) changed();
  };
  CHECK(worker_->PostTask(FROM_HERE, base::BindOnce(
      [](auto backend, auto root, auto binding, auto hooks, auto mode, auto inputs, auto provider) {
        auto store = std::make_shared<ProfileStateStore>(
            std::move(root), binding, true, false);
        // Creation authority comes only from the native factory. Existing
        // profiles never infer first setup from the absence of state files.
        if (inputs) {
          VaultContext context{binding, {}, true, false};
          backend->engine = std::make_unique<ProfileEngine>(store, std::move(context),
              std::move(provider),
              std::move(inputs->network_clone), std::move(hooks),
              std::move(inputs->departure_factory), mode);
          backend->controller = &backend->engine->account();
        } else {
          backend->standalone_controller = std::make_unique<AccountController>(store,
              mode, base::SequencedTaskRunner::GetCurrentDefault(), std::move(hooks));
          backend->controller = backend->standalone_controller.get();
        }
      }, backend_, std::move(root), std::move(binding), std::move(hooks), mode, std::move(inputs), provider_)));
}
ProfileService::~ProfileService() { Shutdown(); }
void ProfileService::ReadStatus(base::OnceCallback<void(AccountController::View)> done) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  CHECK(done);
  if (stopping_) {
    AccountController::View view; view.error = "shutdown";
    CHECK(reply_->PostTask(FROM_HERE, base::BindOnce(std::move(done), std::move(view))));
    return;
  }
  CHECK(worker_->PostTask(FROM_HERE, base::BindOnce(
      [](auto backend, auto reply, auto stopped, auto generation, uint64_t expected, auto done) {
        auto view = backend->controller->Status();
        CHECK(reply->PostTask(FROM_HERE, base::BindOnce(
            [](auto stopped, auto generation, uint64_t expected, auto done, AccountController::View view) {
              // A queued status may arrive after KeyedService shutdown or
              // destruction. Never publish an enabled identity from that owner.
              if (stopped->load()) { view = {}; view.error = "shutdown"; }
              else if (generation->load() != expected) {
                view = {}; view.error = "stale";
              }
              std::move(done).Run(std::move(view));
            }, std::move(stopped), std::move(generation), expected, std::move(done), std::move(view))));
      }, backend_, reply_, stopped_, read_generation_, read_generation_->load(), std::move(done))));
}
void ProfileService::SetTabStateReady(bool ready) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  if (stopping_) return;
  CHECK(worker_->PostTask(FROM_HERE, base::BindOnce(
      [](auto backend, bool ready) { backend->controller->SetTabStateReady(ready); }, backend_, ready)));
}
AccountController::Completed ProfileService::Reply(AccountController::Completed done) {
  CHECK(done);
  return [reply = reply_, stopped = stopped_, done = std::move(done)](auto result) {
    CHECK(reply->PostTask(FROM_HERE, base::BindOnce(
        [](auto stopped, auto done, AccountController::Result result) {
          if (stopped->load()) result = {false, "shutdown"};
          done(std::move(result));
        }, stopped, done, std::move(result))));
  };
}
void ProfileService::SetConsents(int revision, bool tabs, bool spaces,
                               AccountController::Completed done) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  auto reply = Reply(std::move(done));
  if (stopping_) { reply({false, "shutdown"}); return; }
  read_generation_->fetch_add(1);
  CHECK(worker_->PostTask(FROM_HERE, base::BindOnce(
      [](auto backend, int revision, bool tabs, bool spaces, auto done) {
        backend->controller->SetConsents(revision, tabs, spaces, std::move(done));
      }, backend_, revision, tabs, spaces, std::move(reply))));
}
void ProfileService::Disable(int revision, bool wipe_remote, AccountController::Completed done) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  auto reply = Reply(std::move(done));
  if (stopping_) { reply({false, "shutdown"}); return; }
  read_generation_->fetch_add(1);
  CHECK(worker_->PostTask(FROM_HERE, base::BindOnce(
      [](auto backend, int revision, bool wipe_remote, auto done) {
        backend->controller->Disable(revision, wipe_remote, std::move(done));
      }, backend_, revision, wipe_remote, std::move(reply))));
}
void ProfileService::Sync(std::string store, RequestClass kind, bool optional_store,
                          AccountController::Role role, BlobModelHooks model,
                          RequestWorker::Queue::Completed done) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_); CHECK(done);
  auto reply = [runner = reply_, stopped = stopped_, done = std::move(done)](const RequestWorker::Queue::Result& result) {
    CHECK(runner->PostTask(FROM_HERE, base::BindOnce(
        [](auto stopped, auto done, RequestWorker::Queue::Result result) {
          if (stopped->load()) result = {{}, false, "cancelled:shutdown"};
          done(result);
        }, stopped, done, result)));
  };
  if (stopping_) { reply({{}, false, "cancelled:shutdown"}); return; }
  CHECK(worker_->PostTask(FROM_HERE, base::BindOnce(
      [](auto backend, std::string store, RequestClass kind, bool optional_store,
         AccountController::Role role, BlobModelHooks model, auto done) {
        if (!backend->engine) { done({{}, false, "service-unavailable"}); return; }
        backend->engine->Sync(std::move(store), kind, optional_store, role,
                              std::move(model), std::move(done));
      }, backend_, std::move(store), kind, optional_store, role, std::move(model), std::move(reply))));
}
void ProfileService::Shutdown() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  if (stopping_) return;
  stopping_ = true; stopped_->store(true);
  if (provider_) { provider_->Invalidate(); provider_.reset(); }
  // Retain the backend until asynchronous local retirement finishes. The
  // KeyedService may be destroyed before this callback; never capture `this`.
  CHECK(worker_->PostTask(FROM_HERE, base::BindOnce([](auto backend) {
    if (backend->engine) {
      backend->engine->Shutdown([backend](auto) {
        backend->controller = nullptr; backend->engine.reset();
      });
    } else {
      backend->controller->Shutdown([backend](auto) {
        backend->controller = nullptr; backend->standalone_controller.reset();
      });
    }
  }, std::move(backend_))));
}
}  // namespace blanc::sync

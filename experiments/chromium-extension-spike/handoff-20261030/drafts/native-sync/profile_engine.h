#ifndef BLANC_SYNC_PROFILE_ENGINE_H_
#define BLANC_SYNC_PROFILE_ENGINE_H_
#include "account_controller.h"
#include "blob_exchange.h"
#include "credential_broker.h"
namespace blanc::sync {
// Worker-owned composition for an already initialized native Personal profile.
// Native factory must establish routing/brand authority. No renderer entry.
// Network clone is consumed on this sequence; the provider owner revokes its
// handle before destroying the process crypto service.
// Owner MUST retain engine until Shutdown completion, then destroy on owner.
class ProfileEngine {
 public:
  // Trusted native factory for fixed released departure projections; no
  // renderer-controlled script or credential crosses this interface.
  using DepartureFactory = std::function<BlobModelHooks(std::string, std::string)>;
  ProfileEngine(std::shared_ptr<ProfileStateStore> store,VaultContext context,
      std::shared_ptr<CredentialProviderHandle> provider,
      std::unique_ptr<network::PendingSharedURLLoaderFactory> network_clone,
      AccountController::Hooks native_hooks, DepartureFactory departure_factory = {},
      ProfileStateStore::BootstrapMode mode = ProfileStateStore::BootstrapMode::kExistingOnly);
  ~ProfileEngine();
  AccountController& account() { return *controller_; }
  void Sync(std::string store,RequestClass kind,bool optional_store,
      AccountController::Role role,BlobModelHooks model,RequestWorker::Queue::Completed done);
  void Shutdown(AccountController::Completed done);
 private:
  using Queue=RequestWorker::Queue;
  void Acquired(std::string store,RequestClass kind,bool optional_store,
      AccountController::Role role,BlobModelHooks model,Queue::Completed done,
      CredentialBroker::Result result);
  void PrepareDeparture(std::string store, std::string account, int revision,
      std::function<void(std::optional<AccountController::DepartureMaterial>)> done);
  void DepartureAcquired(std::string store, std::string account, int revision,
      std::function<void(std::optional<AccountController::DepartureMaterial>)> done,
      CredentialBroker::Result result);
  Queue::Completed Reply(Queue::Completed done);
  void MaybeClosed();
  std::shared_ptr<ProfileStateStore> store_;
  std::shared_ptr<BlobTransport> transport_;
  std::unique_ptr<CredentialBroker> broker_;
  std::unique_ptr<AccountController> controller_;
  std::function<AccountController::Gate()> policy_;
  DepartureFactory departure_factory_;
  scoped_refptr<base::SequencedTaskRunner> runner_;
  std::shared_ptr<std::atomic<bool>> stopped_=std::make_shared<std::atomic<bool>>(false);
  bool profile_allowed_=false,key_ready_=false,controller_closed_=false,closed_=false;
  size_t acquiring_=0;
  std::vector<AccountController::Completed> shutdown_waiters_;
  SEQUENCE_CHECKER(sequence_checker_);
  base::WeakPtrFactory<ProfileEngine> weak_factory_{this};
};
}  // namespace blanc::sync
#endif

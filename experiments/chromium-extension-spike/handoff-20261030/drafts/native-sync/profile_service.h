#ifndef BLANC_SYNC_PROFILE_SERVICE_H_
#define BLANC_SYNC_PROFILE_SERVICE_H_
#include <atomic>
#include <cstdint>
#include "profile_engine.h"
#include "base/functional/callback.h"
#include "components/keyed_service/core/keyed_service.h"

namespace blanc::sync {
// UI-sequence profile owner. No Profile, WebContents, or other UI object crosses
// to the MayBlock sequence. Hooks must be native, worker-safe adapters.
class ProfileService : public KeyedService {
 public:
  // Trusted native dependencies assembled on the profile owner sequence.
  // The process crypto service must remain alive until synchronous UI-sequence
  // Shutdown revokes its handle. This is not a renderer interface.
  struct EngineInputs {
    os_crypt_async::OSCryptAsync* process_crypto = nullptr;
    scoped_refptr<base::SequencedTaskRunner> provider_owner;
    std::unique_ptr<network::PendingSharedURLLoaderFactory> network_clone;
    ProfileEngine::DepartureFactory departure_factory;
  };
  ProfileService(base::FilePath root, std::string binding,
                 AccountController::Hooks hooks);
  ~ProfileService() override;
  void ReadStatus(base::OnceCallback<void(AccountController::View)> done);
  void SetTabStateReady(bool ready);
  // Native caller only, after trusted Personal-context routing. Revision comes
  // from ReadStatus; controller serializes mutations and rejects stale views.
  void SetConsents(int revision, bool tabs, bool spaces, AccountController::Completed done);
  void Disable(int revision, bool wipe_remote, AccountController::Completed done);
  // Native model callbacks execute on the worker; never supply renderer code.
  void Sync(std::string store, RequestClass kind, bool optional_store,
            AccountController::Role role, BlobModelHooks model,
            RequestWorker::Queue::Completed done);
  void Shutdown() override;
 private:
  friend class ProfileServiceFactory;
  friend class ProfileServiceEngineTestAccess;
  // Live engine creation is withheld from general callers until the native
  // factory has established the actual Personal-profile authority.
  ProfileService(base::FilePath root, std::string binding,
                 AccountController::Hooks hooks, EngineInputs inputs);
  // Only the native factory can supply creation authority. Normal native
  // callers and renderer-facing adapters always use existing-only startup.
  ProfileService(base::FilePath root, std::string binding,
                 AccountController::Hooks hooks, ProfileStateStore::BootstrapMode mode);
  ProfileService(base::FilePath root, std::string binding,
                 AccountController::Hooks hooks, ProfileStateStore::BootstrapMode mode,
                 std::optional<EngineInputs> inputs);
  struct Backend;
  AccountController::Completed Reply(AccountController::Completed done);
  std::shared_ptr<Backend> backend_;
  std::shared_ptr<CredentialProviderHandle> provider_;
  scoped_refptr<base::SequencedTaskRunner> worker_, reply_;
  std::shared_ptr<std::atomic<bool>> stopped_ = std::make_shared<std::atomic<bool>>(false);
  // UI mutations and backend identity changes invalidate queued read replies.
  // Shared ownership allows queued work to enforce this after owner teardown.
  std::shared_ptr<std::atomic<uint64_t>> read_generation_ =
      std::make_shared<std::atomic<uint64_t>>(0);
  bool stopping_ = false;
  SEQUENCE_CHECKER(sequence_checker_);
};
}  // namespace blanc::sync
#endif

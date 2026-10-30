#ifndef BLANC_SYNC_CREDENTIAL_BROKER_H_
#define BLANC_SYNC_CREDENTIAL_BROKER_H_
#include <atomic>
#include "key_vault.h"
#include "profile_state_store.h"
#include "base/functional/callback.h"
#include "base/memory/weak_ptr.h"
#include "base/sequence_checker.h"
#include "base/task/sequenced_task_runner.h"
#include "components/os_crypt/async/browser/os_crypt_async.h"
namespace blanc::sync {
// Only the provider owner sequence may inspect or revoke the process pointer.
// Posted lookup tasks retain this gate, never the process service itself.
class CredentialProviderHandle {
 public:
  CredentialProviderHandle(os_crypt_async::OSCryptAsync* service,
                           scoped_refptr<base::SequencedTaskRunner> owner);
  void Invalidate();
  void GetInstance(os_crypt_async::OSCryptAsync::InitCallback done);
  scoped_refptr<base::SequencedTaskRunner> owner() const { return owner_; }
 private:
  os_crypt_async::OSCryptAsync* service_;
  const scoped_refptr<base::SequencedTaskRunner> owner_;
  SEQUENCE_CHECKER(sequence_checker_);
};
// Native worker-sequence broker; no renderer serialization or WebUI entry.
// Its owner-sequence provider gate must be invalidated before process service
// destruction. Context is native Personal routing with an empty account
// binding (read from disk).
class CredentialBroker {
 public:
  enum class Status { kReady,kNotAllowed,kStale,kUnavailable,kBusy,kShutdown,kLocalState };
  struct Session { int revision; std::string account; std::shared_ptr<const ProtocolKey> key; bool erasure_pending = false; };
  struct Result { Status status; std::optional<Session> session; };
  using Completed=base::OnceCallback<void(Result)>;
  CredentialBroker(std::shared_ptr<ProfileStateStore> store,VaultContext context,
                   std::shared_ptr<CredentialProviderHandle> provider);
  ~CredentialBroker();
  void Acquire(int expected_revision,Completed done);
  void Shutdown();
 private:
  friend class ProfileEngine;
  // Available only to the native disable coordinator, not ordinary Sync.
  void AcquireForDeparture(int expected_revision,Completed done);
  void AcquireInternal(int expected_revision, bool departure, Completed done);
  void ProviderReady(scoped_refptr<os_crypt_async::Encryptor> encryptor);
  void Reply(Completed done,Result result,std::string protected_blob = {});
  void Finish(Result result,std::string protected_blob = {});
  std::shared_ptr<ProfileStateStore> store_;
  VaultContext context_;
  std::shared_ptr<CredentialProviderHandle> provider_;
  scoped_refptr<base::SequencedTaskRunner> runner_;
  std::optional<ProfileSyncState> snapshot_;
  Completed pending_;
  bool departure_ = false;
  std::shared_ptr<std::atomic<bool>> stopped_=std::make_shared<std::atomic<bool>>(false);
  SEQUENCE_CHECKER(sequence_checker_);
  base::WeakPtrFactory<CredentialBroker> weak_factory_{this};
};
}  // namespace blanc::sync
#endif

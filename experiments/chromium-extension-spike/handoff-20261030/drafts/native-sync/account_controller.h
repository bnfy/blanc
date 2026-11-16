#ifndef BLANC_SYNC_ACCOUNT_CONTROLLER_H_
#define BLANC_SYNC_ACCOUNT_CONTROLLER_H_
#include "profile_state_store.h"
#include "request_worker.h"
#include "wipe_policy.h"
#include "blob_exchange.h"
#include "base/memory/weak_ptr.h"

namespace blanc::sync {
class BlobTransport;
class ProtocolKey;
struct BlobModelHooks;
// Sequence-confined coordinator, to be owned by the actual ProfileKeyedService.
// It composes real storage/worker behavior; OS provider, models and URLLoaders
// remain native adapters. No renderer API or credential derivation is exposed.
class AccountController {
 public:
  enum class Gate { kReady, kServiceUnavailable, kKeyUnavailable };
  enum class Role { kGeneral, kTabPublish, kTabRetraction, kSpacePublish };
  struct Result { bool ok; std::string error; };
  using Completed = std::function<void(Result)>;
  struct DepartureMaterial {
    std::shared_ptr<BlobTransport> transport;
    std::shared_ptr<const ProtocolKey> key;
    std::string key_account;
    BlobModelHooks model;
    bool erasure_pending = false;
  };
  struct Hooks {
    // Trusted native policy/vault state, not renderer-provided booleans.
    std::function<Gate()> gate;
    std::function<void(std::string, std::function<void(WipeOutcome)>)> erase;
    // Explicit native erasure availability can differ from sync publication:
    // a renamed/service-disabled build must still erase an existing copy.
    std::function<bool()> erase_available;
    // Best-effort cleanup, with completion on failure too. No startup snapshot
    // is required to retract this device's sends/closed/session records.
    std::function<void(std::string, std::string, std::function<void()>)> retract;
    // Native-only async preparation. The controller owns all queue admission,
    // identity checks and dispatch; missing credentials/models are best effort.
    std::function<void(std::string, std::string, int,
                       std::function<void(std::optional<DepartureMaterial>)>)> prepare_departure;
    std::function<void()> cancel;
    std::function<void()> invalidate_models;
    std::function<void()> identity_changed;
  };
  struct View {
    bool ready = false, enabled = false, busy = false, sync_tabs = false, sync_spaces = false;
    bool erasure_pending = false, recovery_prompt_dismissed = false;
    int revision = -1;
    double last_synced_at = 0;
    std::string handle, origin, error;
    // Deliberately no account locator, protected blob, raw key or password.
  };
  AccountController(std::shared_ptr<ProfileStateStore> store,
                    ProfileStateStore::BootstrapMode mode,
                    scoped_refptr<base::SequencedTaskRunner> reply_runner, Hooks hooks);
  ~AccountController();
  View Status();
  void SetTabStateReady(bool ready);
  // Internal broker must already have authenticated/prepared this record with
  // the qualified vault. This method does not validate an arbitrary blob's key.
  void AdoptPrepared(int revision, std::string handle, std::string account,
                      std::string protected_key, bool generated, Completed done);
  void SetConsents(int revision, bool tabs, bool spaces, Completed done);
  void Disable(int revision, bool wipe_remote, Completed done);
  void Enqueue(RequestWorker::Queue::Request request, Role role,
               RequestWorker::Queue::Completed done);
  // Native broker supplies the key's account binding. URL account is read
  // from the persisted identity, never taken from model/renderer input.
  void EnqueueBlob(int expected_revision, std::shared_ptr<BlobTransport> transport,
      std::shared_ptr<const ProtocolKey> key, std::string key_account,
      std::string store, RequestClass kind, bool optional_store, Role role,
      BlobModelHooks hooks, RequestWorker::Queue::Completed done);
  void Shutdown(Completed done);
 private:
  using StoreStatus = RequestLedger::Status;
  void PostReply(Completed done, Result result);
  bool Begin(int revision, Completed done, std::function<void(uint64_t)> action);
  bool Current(uint64_t token) const;
  Gate CurrentGate() const;
  bool BuildWorker();
  void CommitFinished(uint64_t token, StoreStatus status);
  void Failure(uint64_t token, std::string error, bool storage_failure = false);
  void Finish(uint64_t token, Result result);
  void Erased(uint64_t token, WipeOutcome outcome);
  void RetractNext(uint64_t token, size_t step);
  void DeparturePrepared(uint64_t token, size_t step,
                         std::optional<DepartureMaterial> material);
  void FinishShutdown();
  std::shared_ptr<ProfileStateStore> store_;
  scoped_refptr<base::SequencedTaskRunner> runner_, reply_;
  Hooks hooks_;
  StoreStatus bootstrap_;
  std::unique_ptr<RequestWorker> worker_;
  bool blocked_ = false, busy_ = false, stopping_ = false, closed_ = false, tab_ready_ = false;
  uint64_t generation_ = 0;
  int revision_ = -1;
  size_t retract_step_ = 0;
  bool departure_resumed_ = false, departure_preparing_ = false;
  std::string operation_account_, last_error_;
  Completed pending_;
  std::vector<Completed> shutdown_waiters_;
  SEQUENCE_CHECKER(sequence_checker_);
  base::WeakPtrFactory<AccountController> weak_factory_{this};
};
}  // namespace blanc::sync
#endif

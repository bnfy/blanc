#ifndef BLANC_SYNC_LEGACY_RECOVERY_BROKER_H_
#define BLANC_SYNC_LEGACY_RECOVERY_BROKER_H_
#include <atomic>
#include "legacy_preparation.h"
#include "base/functional/callback.h"
#include "base/memory/weak_ptr.h"
#include "base/task/sequenced_task_runner.h"
#include "components/os_crypt/async/browser/os_crypt_async.h"
namespace blanc::sync {
// Native owned sequence only. Calling Recover is an explicit migration action,
// after trusted Personal source binding/closed backup and user consent. No WebUI
// entry point is supplied here. Output is in-memory preparation, never import.
class LegacyRecoveryBroker {
 public:
  enum class Status { kPrepared, kRejected, kBusy, kShutdown };
  struct Result { Status status; std::optional<LegacyPreparation> preparation; };
  using Completed = base::OnceCallback<void(Result)>;
  LegacyRecoveryBroker(VaultContext context, scoped_refptr<os_crypt_async::Encryptor> destination);
  ~LegacyRecoveryBroker();
  void Recover(std::string sync_json, std::string shared_json, Completed done);
  void Shutdown();
 private:
  friend class LegacyRecoveryBrokerTest;
  using SourceFactory = std::function<std::unique_ptr<os_crypt_async::OSCryptAsync>()>;
  LegacyRecoveryBroker(VaultContext context, scoped_refptr<os_crypt_async::Encryptor> destination,
                       SourceFactory source_factory);
  void SourceReady(scoped_refptr<os_crypt_async::Encryptor> source);
  void Finish(Result result);
  void Reply(Completed done, Result result);
  void ClearInputs();
  KeyVault destination_;
  SourceFactory source_factory_;
  std::unique_ptr<os_crypt_async::OSCryptAsync> source_;
  scoped_refptr<base::SequencedTaskRunner> runner_;
  std::string sync_, shared_;
  Completed pending_;
  std::shared_ptr<std::atomic<bool>> stopped_ = std::make_shared<std::atomic<bool>>(false);
  bool stopping_ = false;
  SEQUENCE_CHECKER(sequence_checker_);
  base::WeakPtrFactory<LegacyRecoveryBroker> weak_factory_{this};
};
}
#endif

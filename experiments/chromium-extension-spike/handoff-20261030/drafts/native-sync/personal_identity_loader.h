#ifndef BLANC_SYNC_PERSONAL_IDENTITY_LOADER_H_
#define BLANC_SYNC_PERSONAL_IDENTITY_LOADER_H_
#include <atomic>
#include <memory>
#include "personal_identity_store.h"
#include "base/functional/callback.h"
#include "base/memory/weak_ptr.h"
#include "base/task/sequenced_task_runner.h"
namespace blanc::sync {
// Owner-sequence read-only loader. Only the worker touches disk. No missing
// record ever authorizes initialization. The future ProfileManager observer
// must revoke the lease before a Personal Profile can be destroyed/reused.
class PersonalIdentityLoader {
 public:
  enum class State { kReady, kUnavailable, kBusy, kCancelled, kShutdown };
  struct Result { State state; PersonalIdentityStore::Status store_status; };
  using Completed=base::OnceCallback<void(Result)>;
  PersonalIdentityLoader(base::FilePath root,scoped_refptr<base::SequencedTaskRunner> worker);
  ~PersonalIdentityLoader();
  void Load(Completed done);
  void Invalidate();
  void Shutdown();
  std::optional<base::FilePath> path() const;
  std::optional<PersonalIdentityStore::Identity> identity() const;
  base::RepeatingCallback<std::optional<base::FilePath>()> Resolver();
 private:
  friend class PersonalIdentityLoaderTestAccess;
  void Loaded(PersonalIdentityStore::Result result);
  void Finish(Result result);
  base::FilePath root_;
  scoped_refptr<base::SequencedTaskRunner> worker_,owner_;
  std::optional<PersonalIdentityStore::Identity> identity_;
  Completed pending_;
  std::shared_ptr<std::atomic<bool>> stopped_=std::make_shared<std::atomic<bool>>(false);
  std::shared_ptr<std::atomic<uint64_t>> epoch_=std::make_shared<std::atomic<uint64_t>>(0);
  SEQUENCE_CHECKER(sequence_checker_);
  base::WeakPtrFactory<PersonalIdentityLoader> weak_factory_{this};
};
}  // namespace blanc::sync
#endif

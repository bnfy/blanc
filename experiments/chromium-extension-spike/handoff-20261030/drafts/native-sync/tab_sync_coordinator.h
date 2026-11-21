#ifndef BLANC_SYNC_TAB_SYNC_COORDINATOR_H_
#define BLANC_SYNC_TAB_SYNC_COORDINATOR_H_
#include "tab_cache_store.h"
#include "v8-model-draft/model_runner.h"
#include "base/memory/weak_ptr.h"

namespace blanc::sync {
// Native-only draft, confined to the same MayBlock sequence as profile and
// cache. The caller MUST authenticate the remote payload to this account.
// This is not a renderer entry point or a production utility-process boundary.
class TabSyncCoordinator {
 public:
  enum class Result { kSaved, kBusy, kStale, kCancelled, kCacheError, kModelError, kShutdown };
  using Completed=base::OnceCallback<void(Result)>;
  TabSyncCoordinator(std::shared_ptr<ProfileStateStore> profile,
                     std::shared_ptr<draft::ModelRunner> model);
  ~TabSyncCoordinator();
  // The credential owner passes the account and captured revision from the
  // authenticated session; the device id is read from the profile itself.
  // guard is the native request's live cancellation/generation check, called
  // on this owner sequence. It must not reenter or destroy this coordinator.
  // An absent guard fails closed; an empty return means still current.
  void Merge(int revision,std::string account,std::string remote_json,
             double now,std::function<std::string()> guard,Completed done);
  // Session wire blob: the fixed model extracts its devices map as JSON data.
  void MergeBlob(int revision,std::string account,std::string blob_json,
                 double now,std::function<std::string()> guard,Completed done);
  void Shutdown();
 private:
  void MergeImpl(int revision,std::string account,std::string remote_json,
                 double now,bool remote_is_blob,std::function<std::string()> guard,Completed done);
  void Merged(int revision,std::string account,draft::ModelRunner::Result result);
  void Finish(Result result);
  std::shared_ptr<ProfileStateStore> profile_;
  std::shared_ptr<draft::ModelRunner> model_;
  TabCacheStore cache_;
  Completed pending_;
  std::function<std::string()> pending_guard_;
  bool stopped_=false;
  SEQUENCE_CHECKER(sequence_checker_);
  base::WeakPtrFactory<TabSyncCoordinator> weak_factory_{this};
};
}  // namespace blanc::sync
#endif

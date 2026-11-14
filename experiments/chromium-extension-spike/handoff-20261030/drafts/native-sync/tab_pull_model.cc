#include "tab_pull_model.h"
#include <cmath>
#include "base/functional/bind.h"
#include "crypto/secure_util.h"
namespace blanc::sync {
BlobModelHooks TabPullModel(std::shared_ptr<TabSyncCoordinator> coordinator,
    std::string account,int revision,std::function<double()> clock){
 BlobModelHooks hooks;
 hooks.plan_guarded_async=[coordinator=std::move(coordinator),account=std::move(account),revision,clock=std::move(clock)](
     std::optional<std::string> remote,BlobModelHooks::Guard guard,BlobModelHooks::Planned done){
  const double now=clock?clock():NAN;
  if(!coordinator||!guard||!std::isfinite(now)){
   if(remote)crypto::SecureZeroBuffer(base::as_writable_byte_span(*remote));
   std::move(done).Run({{},"service-unavailable"});return;
  }
  coordinator->MergeBlob(revision,account,remote?std::move(*remote):"null",now,std::move(guard),
      base::BindOnce([](BlobModelHooks::Planned done,TabSyncCoordinator::Result result){
       using R=TabSyncCoordinator::Result;
       const char* error=result==R::kSaved?"":result==R::kCancelled?"cancelled:model":
           result==R::kStale?"stale-identity":result==R::kBusy?"busy":
           result==R::kShutdown?"cancelled:shutdown":"model-error";
       std::move(done).Run({{},error});
      },std::move(done)));
 };
 return hooks;
}
}

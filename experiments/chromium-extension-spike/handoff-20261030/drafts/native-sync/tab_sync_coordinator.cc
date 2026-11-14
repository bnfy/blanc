#include "tab_sync_coordinator.h"
#include <cmath>
#include "base/check.h"
#include "base/functional/bind.h"
#include "base/json/json_writer.h"
#include "base/values.h"
#include "crypto/secure_util.h"

namespace blanc::sync {
namespace {
void Wipe(std::string& s){crypto::SecureZeroBuffer(base::as_writable_byte_span(s));}
TabSyncCoordinator::Result Error(TabCacheStore::Status status){
 return status==TabCacheStore::Status::kWrongAccount || status==TabCacheStore::Status::kNotAllowed
     ? TabSyncCoordinator::Result::kStale : TabSyncCoordinator::Result::kCacheError;
}
}
TabSyncCoordinator::TabSyncCoordinator(std::shared_ptr<ProfileStateStore> profile,
    std::shared_ptr<draft::ModelRunner> model)
    :profile_(std::move(profile)),model_(std::move(model)),cache_(profile_){}
TabSyncCoordinator::~TabSyncCoordinator(){Shutdown();}
void TabSyncCoordinator::Merge(int revision,std::string account,std::string remote,double now,
                               std::function<std::string()> guard,Completed done){
 MergeImpl(revision,std::move(account),std::move(remote),now,false,std::move(guard),std::move(done));
}
void TabSyncCoordinator::MergeBlob(int revision,std::string account,std::string remote,double now,
                                   std::function<std::string()> guard,Completed done){
 MergeImpl(revision,std::move(account),std::move(remote),now,true,std::move(guard),std::move(done));
}
void TabSyncCoordinator::MergeImpl(int revision,std::string account,std::string remote,double now,
                                  bool remote_is_blob,std::function<std::string()> guard,Completed done){
 DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);CHECK(done);
 if(stopped_){Wipe(remote);std::move(done).Run(Result::kShutdown);return;}
 if(pending_){Wipe(remote);std::move(done).Run(Result::kBusy);return;}
 if(!guard||!guard().empty()){Wipe(remote);std::move(done).Run(Result::kCancelled);return;}
 if(!model_||!profile_||!std::isfinite(now)){Wipe(remote);std::move(done).Run(Result::kModelError);return;}
 auto cached=cache_.Read(revision,account);
 if(cached.status!=TabCacheStore::Status::kLoaded && cached.status!=TabCacheStore::Status::kMissing){
  Wipe(remote);std::move(done).Run(Error(cached.status));return;
 }
 const auto state=profile_->Read();
 if(!state.state || state.state->identity_revision!=revision || state.state->account_id!=account ||
    !state.state->enabled || state.state->erasure_pending){
  Wipe(remote);if(cached.raw_json)Wipe(*cached.raw_json);std::move(done).Run(Result::kStale);return;
 }
 base::DictValue args;args.Set("accountId",account);args.Set("ownId",state.state->device_id);
 args.Set("now",now);args.Set("cacheJson",cached.raw_json?*cached.raw_json:"{}");args.Set("remoteJson",remote);args.Set("remoteIsBlob",remote_is_blob);
 auto request=base::WriteJson(args);Wipe(remote);if(cached.raw_json)Wipe(*cached.raw_json);
 if(!request){std::move(done).Run(Result::kModelError);return;}
 if(!guard().empty()){Wipe(*request);std::move(done).Run(Result::kCancelled);return;}
 pending_=std::move(done);
 pending_guard_=std::move(guard);
 model_->Run(draft::ModelRunner::Method::kMergeBoundDevices,std::move(*request),
     base::BindOnce([](base::WeakPtr<TabSyncCoordinator> self,int revision,
                       std::string account,draft::ModelRunner::Result result){
       if(self)self->Merged(revision,std::move(account),std::move(result));
       else Wipe(result.json);
     },weak_factory_.GetWeakPtr(),revision,std::move(account)));
}
void TabSyncCoordinator::Merged(int revision,std::string account,draft::ModelRunner::Result result){
 DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
 if(!pending_){Wipe(result.json);return;}
 if(!pending_guard_||!pending_guard_().empty()){Wipe(result.json);Finish(Result::kCancelled);return;}
 if(!result.error.empty()){Wipe(result.json);Finish(Result::kModelError);return;}
 // Commit checks ready state, exact account, revision and erasure again, after
 // the asynchronous model callback and on the profile's owning sequence.
 const auto status=cache_.Commit(revision,account,result.json);Wipe(result.json);
 Finish(status==TabCacheStore::Status::kLoaded?Result::kSaved:Error(status));
}
void TabSyncCoordinator::Finish(Result result){auto done=std::move(pending_);pending_guard_={};if(done)std::move(done).Run(result);}
void TabSyncCoordinator::Shutdown(){
 DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);if(stopped_)return;stopped_=true;
 weak_factory_.InvalidateWeakPtrs();Finish(Result::kShutdown);
}
}  // namespace blanc::sync

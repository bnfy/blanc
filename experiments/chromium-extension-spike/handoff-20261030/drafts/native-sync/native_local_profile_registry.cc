#include "native_local_profile_registry.h"
#include "profile_service_factory.h"
#include "base/check.h"
#include "base/functional/bind.h"
#include "base/location.h"
#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/profiles/profile_manager.h"
namespace blanc::sync {
NativeLocalProfileRegistry::NativeLocalProfileRegistry(ProfileManager* manager,scoped_refptr<base::SequencedTaskRunner> worker,
    std::shared_ptr<PersonalDeletionGuard> deletion_guard)
 :manager_(manager),deletion_guard_(std::move(deletion_guard)),owner_(base::SequencedTaskRunner::GetCurrentDefault()){
 CHECK(manager_&&worker&&owner_&&deletion_guard_);manager_observation_.Observe(manager_);
 loader_=std::make_unique<PersonalIdentityLoader>(manager_->user_data_dir(),std::move(worker));
}
NativeLocalProfileRegistry::~NativeLocalProfileRegistry(){Shutdown();}
void NativeLocalProfileRegistry::Finish(Result result){
 DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);auto done=std::move(pending_);if(!done)return;
 CHECK(owner_->PostTask(FROM_HERE,base::BindOnce([](auto stopped,auto epoch,uint64_t expected,Completed done,Result result){
  if(stopped->load())result.state=State::kShutdown;else if(epoch->load()!=expected)result.state=State::kRevoked;
  std::move(done).Run(result);
 },stopped_,epoch_,epoch_->load(),std::move(done),result)));
}
void NativeLocalProfileRegistry::LoadExisting(Completed done){
 DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);CHECK(done);
 if(active_&&!Resolve())Revoke();
 if(stopped_->load()||revoked_||pending_||active_){const auto state=stopped_->load()?State::kShutdown:revoked_?State::kRevoked:pending_?State::kBusy:State::kReady;
  CHECK(owner_->PostTask(FROM_HERE,base::BindOnce([](auto stopped,auto epoch,uint64_t expected,Completed done,State state){
   if(stopped->load())state=State::kShutdown;else if(epoch->load()!=expected)state=State::kRevoked;
   std::move(done).Run({state,state==State::kReady?PersonalIdentityStore::Status::kLoaded:PersonalIdentityStore::Status::kMissing});
  },stopped_,epoch_,epoch_->load(),std::move(done),state)));return;}
 pending_=std::move(done);loader_->Load(base::BindOnce(&NativeLocalProfileRegistry::Loaded,weak_factory_.GetWeakPtr()));
}
void NativeLocalProfileRegistry::Loaded(PersonalIdentityLoader::Result result){
 DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);if(stopped_->load()||revoked_||!pending_)return;
 if(result.state!=PersonalIdentityLoader::State::kReady){deletion_guard_->Invalidate();Finish({State::kUnavailable,result.store_status});return;}
 const auto identity=loader_->identity();
 if(!identity||deleted_.contains(identity->profile_path)||!deletion_guard_->Confirm(*identity)){Revoke();return;}
 const auto path=std::optional<base::FilePath>(identity->profile_path);
 auto* profile=manager_->GetProfileByPath(*path);
 // Never call CreateProfileAsync or LoadProfileByPath here. The latter checks
 // the attributes entry before calling CreateProfileAsync and its filesystem
 // behavior has not yet been qualified for a vanished profile directory.
 if(!profile){loader_->Invalidate();Finish({State::kNotLoaded,result.store_status});return;}
 if(profile->IsOffTheRecord()||!profile->IsRegularProfile()||profile->GetPath()!=*path||
    profile->lifecycle_state()!=Profile::LifecycleState::kRegistered){Revoke();return;}
 active_=profile;profile_observation_.Observe(profile);
 ProfileServiceFactory::InstallPersonalProfileResolver(base::BindRepeating(
   [](base::WeakPtr<NativeLocalProfileRegistry> registry)->std::optional<base::FilePath>{return registry?registry->Resolve():std::nullopt;},
   weak_factory_.GetWeakPtr()),base::PassKey<NativeLocalProfileRegistry>());
 Finish({State::kReady,result.store_status});
}
std::optional<base::FilePath> NativeLocalProfileRegistry::Resolve() const{
 DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
 if(stopped_->load()||revoked_||!manager_||!active_)return {};
 const auto path=loader_->path();
 if(!path||deleted_.contains(*path)||manager_->GetProfileByPath(*path)!=active_||
    active_->IsOffTheRecord()||!active_->IsRegularProfile()||
    active_->lifecycle_state()!=Profile::LifecycleState::kRegistered)return {};
 return path;
}
void NativeLocalProfileRegistry::Revoke(){
 DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);if(revoked_)return;
 revoked_=true;epoch_->fetch_add(1);deletion_guard_->Invalidate();profile_observation_.Reset();active_=nullptr;loader_->Invalidate();
 Finish({State::kRevoked,PersonalIdentityStore::Status::kMissing});
}
void NativeLocalProfileRegistry::OnProfileMarkedForPermanentDeletion(Profile* profile){
 DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);if(!profile)return;deleted_.insert(profile->GetPath());
 const auto path=loader_->path();if(path&&*path==profile->GetPath())Revoke();
}
void NativeLocalProfileRegistry::OnProfileWillBeDestroyed(Profile* profile){
 DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);if(profile==active_)Revoke();
}
void NativeLocalProfileRegistry::OnProfileManagerDestroying(){Shutdown();}
void NativeLocalProfileRegistry::Shutdown(){
 DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);if(stopped_->exchange(true))return;
 epoch_->fetch_add(1);profile_observation_.Reset();manager_observation_.Reset();active_=nullptr;manager_=nullptr;
 weak_factory_.InvalidateWeakPtrs();loader_->Shutdown();Finish({State::kShutdown,PersonalIdentityStore::Status::kMissing});
}
}  // namespace blanc::sync

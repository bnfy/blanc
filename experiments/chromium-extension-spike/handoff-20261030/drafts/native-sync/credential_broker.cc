#include "credential_broker.h"
#include <algorithm>
#include "base/check.h"
#include "base/functional/bind.h"
#include "base/location.h"
#include "base/task/bind_post_task.h"
namespace blanc::sync {
namespace {
bool Binding(const std::string& s) {
 return s.size()==64 && std::ranges::all_of(s,[](char c){return (c>='a'&&c<='f')||(c>='0'&&c<='9');});
}
bool Same(const ProfileSyncState& a,const ProfileSyncState& b,bool departure) {
 return a.enabled && b.enabled && (departure || !a.erasure_pending) &&
     a.erasure_pending==b.erasure_pending &&
     a.identity_revision==b.identity_revision && a.account_id==b.account_id &&
     a.protected_key==b.protected_key;
}
}
CredentialProviderHandle::CredentialProviderHandle(os_crypt_async::OSCryptAsync* service,
    scoped_refptr<base::SequencedTaskRunner> owner)
    :service_(service),owner_(std::move(owner)) { CHECK(owner_ && owner_->RunsTasksInCurrentSequence()); }
void CredentialProviderHandle::Invalidate(){
 DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);CHECK(owner_->RunsTasksInCurrentSequence());service_=nullptr;
}
void CredentialProviderHandle::GetInstance(os_crypt_async::OSCryptAsync::InitCallback done){
 DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);CHECK(owner_->RunsTasksInCurrentSequence());
 if(!service_){std::move(done).Run(nullptr);return;}
 service_->GetInstance(std::move(done));
}
CredentialBroker::CredentialBroker(std::shared_ptr<ProfileStateStore> store,
    VaultContext context,std::shared_ptr<CredentialProviderHandle> provider)
    :store_(std::move(store)),context_(std::move(context)),provider_(std::move(provider)),
     runner_(base::SequencedTaskRunner::GetCurrentDefault()) {}
CredentialBroker::~CredentialBroker(){Shutdown();}
void CredentialBroker::Reply(Completed done,Result result,std::string protected_blob) {
 CHECK(runner_->PostTask(FROM_HERE,base::BindOnce(
   [](auto stopped,auto store,Completed done,Result result,std::string blob) {
    if(stopped->load())result={Status::kShutdown,{}};
    else if(result.session){
     const auto current=store->Read();const auto& session=*result.session;
     if(!current.state)result={Status::kLocalState,{}};
     else if(!current.state->enabled || current.state->erasure_pending!=session.erasure_pending ||
         current.state->identity_revision!=session.revision ||
         current.state->account_id!=session.account || current.state->protected_key!=blob)
       result={Status::kStale,{}};
    }
    std::move(done).Run(std::move(result));
   },stopped_,store_,std::move(done),std::move(result),std::move(protected_blob))));
}
void CredentialBroker::Finish(Result result,std::string protected_blob){
 auto done=std::move(pending_);snapshot_.reset();Reply(std::move(done),std::move(result),std::move(protected_blob));
}
void CredentialBroker::Acquire(int revision,Completed done){
 AcquireInternal(revision,false,std::move(done));
}
void CredentialBroker::AcquireForDeparture(int revision,Completed done){
 AcquireInternal(revision,true,std::move(done));
}
void CredentialBroker::AcquireInternal(int revision,bool departure,Completed done){
 DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);CHECK(done);
 if(stopped_->load()){Reply(std::move(done),{Status::kShutdown,{}});return;}
 if(pending_){Reply(std::move(done),{Status::kBusy,{}});return;}
 if(!context_.personal_profile || context_.off_the_record || !Binding(context_.profile_binding) ||
     !context_.account_binding.empty() || !store_ || !provider_){Reply(std::move(done),{Status::kNotAllowed,{}});return;}
 auto loaded=store_->Read();
 if(!loaded.state){Reply(std::move(done),{Status::kLocalState,{}});return;}
 if(!loaded.state->enabled || (!departure && loaded.state->erasure_pending) || loaded.state->identity_revision!=revision){Reply(std::move(done),{Status::kStale,{}});return;}
 snapshot_=std::move(*loaded.state);departure_=departure;pending_=std::move(done);
 auto reply=base::BindPostTask(runner_,base::BindOnce(
     &CredentialBroker::ProviderReady,weak_factory_.GetWeakPtr()));
 const bool posted = provider_->owner()->PostTask(FROM_HERE,base::BindOnce(
   [](auto stopped,std::shared_ptr<CredentialProviderHandle> provider,
      os_crypt_async::OSCryptAsync::InitCallback done) {
     // Shutdown owns completion locally; do not start a credential lookup for
     // a profile that has already retired while this task was queued.
     if(stopped->load())return;
     provider->GetInstance(std::move(done));
   },stopped_,provider_,std::move(reply)));
 if(!posted)Finish({Status::kUnavailable,{}});
}
void CredentialBroker::ProviderReady(scoped_refptr<os_crypt_async::Encryptor> encryptor){
 DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
 auto current=store_->Read();
 if(!current.state){Finish({Status::kLocalState,{}});return;}
 if(!Same(*snapshot_,*current.state,departure_)){Finish({Status::kStale,{}});return;}
 auto context=context_;context.account_binding=snapshot_->account_id;
 KeyVault vault(std::move(encryptor),std::move(context));
 auto unwrapped=vault.Unprotect(snapshot_->protected_key);
 if(unwrapped.status!=KeyVault::Status::kOk || !unwrapped.key){Finish({Status::kUnavailable,{}});return;}
 std::string protected_blob=snapshot_->protected_key;
 if(unwrapped.should_reencrypt){
  auto wrapped=vault.Protect(*unwrapped.key);
  if(wrapped.status!=KeyVault::Status::kOk){Finish({Status::kUnavailable,{}});return;}
  if(store_->RewrapProtectedKey(snapshot_->identity_revision,wrapped.blob)!=ProfileStateStore::Status::kLoaded){Finish({Status::kLocalState,{}});return;}
  protected_blob=std::move(wrapped.blob);
 }
 Session session{snapshot_->identity_revision,snapshot_->account_id,
     std::make_shared<ProtocolKey>(std::move(*unwrapped.key)),snapshot_->erasure_pending};
 Finish({Status::kReady,std::move(session)},std::move(protected_blob));
}
void CredentialBroker::Shutdown(){
 DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
 if(stopped_->exchange(true))return;
 weak_factory_.InvalidateWeakPtrs();snapshot_.reset();
 if(pending_)Reply(std::move(pending_),{Status::kShutdown,{}});
}
}  // namespace blanc::sync

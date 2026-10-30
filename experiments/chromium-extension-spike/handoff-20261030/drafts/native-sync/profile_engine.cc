#include "profile_engine.h"
#include "base/check.h"
#include "base/functional/bind.h"
#include "base/location.h"
namespace blanc::sync {
ProfileEngine::ProfileEngine(std::shared_ptr<ProfileStateStore> store,VaultContext context,
    std::shared_ptr<CredentialProviderHandle> provider,
    std::unique_ptr<network::PendingSharedURLLoaderFactory> clone,
    AccountController::Hooks hooks,DepartureFactory departure_factory,ProfileStateStore::BootstrapMode mode)
    :store_(std::move(store)),policy_(std::move(hooks.gate)),departure_factory_(std::move(departure_factory)),
     runner_(base::SequencedTaskRunner::GetCurrentDefault()),
     profile_allowed_(context.personal_profile&&!context.off_the_record) {
 if(profile_allowed_&&clone)transport_=std::make_shared<BlobTransport>(network::SharedURLLoaderFactory::Create(std::move(clone)));
 broker_=std::make_unique<CredentialBroker>(store_,std::move(context),std::move(provider));
 hooks.gate=[this]{
  if(stopped_->load()||!profile_allowed_||!transport_||!policy_)return AccountController::Gate::kServiceUnavailable;
  const auto policy=policy_();if(policy!=AccountController::Gate::kReady)return policy;
  return key_ready_?AccountController::Gate::kReady:AccountController::Gate::kKeyUnavailable;
 };
 hooks.erase_available=[this]{return !stopped_->load()&&profile_allowed_&&transport_!=nullptr;};
 hooks.erase=[transport=transport_](std::string account,std::function<void(WipeOutcome)> done){
  if(!transport){done({true,0,{}});return;}
  transport->Start({BlobTransport::Method::kDeleteAccount,std::move(account),{},{}},
      base::BindOnce([](std::function<void(WipeOutcome)> done,BlobTransport::Response response){
        done({response.net_error!=0||!response.error.empty(),response.status,std::move(response.body)});
      },std::move(done)));
 };
 if(departure_factory_)hooks.prepare_departure=[this](std::string store,std::string account,int revision,auto done){
  PrepareDeparture(std::move(store),std::move(account),revision,std::move(done));
 };
 auto cancel=std::move(hooks.cancel);
 hooks.cancel=[this,cancel]{if(transport_)transport_->Cancel();if(cancel)cancel();};
 controller_=std::make_unique<AccountController>(profile_allowed_?store_:nullptr,mode,runner_,std::move(hooks));
}
void ProfileEngine::PrepareDeparture(std::string store,std::string account,int revision,
    std::function<void(std::optional<AccountController::DepartureMaterial>)> done){
 DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
 if(stopped_->load()||!profile_allowed_||!transport_||!departure_factory_){done({});return;}
 ++acquiring_;
 broker_->AcquireForDeparture(revision,base::BindOnce(&ProfileEngine::DepartureAcquired,
     weak_factory_.GetWeakPtr(),std::move(store),std::move(account),revision,std::move(done)));
}
void ProfileEngine::DepartureAcquired(std::string store,std::string account,int revision,
    std::function<void(std::optional<AccountController::DepartureMaterial>)> done,
    CredentialBroker::Result result){
 DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);CHECK_GT(acquiring_,0u);--acquiring_;
 const auto current=store_->Read();
 if(stopped_->load()||result.status!=CredentialBroker::Status::kReady||!result.session||
    result.session->revision!=revision||result.session->account!=account||!current.state||
    current.state->identity_revision!=revision||current.state->account_id!=account||
    current.state->erasure_pending!=result.session->erasure_pending){
  done({});MaybeClosed();return;
 }
 AccountController::DepartureMaterial material;
 material.transport=transport_;material.key=std::move(result.session->key);
 material.key_account=std::move(result.session->account);
 material.erasure_pending=result.session->erasure_pending;
 material.model=departure_factory_(std::move(store),current.state->device_id);
 done(std::move(material));
}
ProfileEngine::~ProfileEngine(){DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);CHECK(closed_);}
ProfileEngine::Queue::Completed ProfileEngine::Reply(Queue::Completed done){
 return [runner=runner_,stopped=stopped_,done=std::move(done)](const Queue::Result& result){
  CHECK(runner->PostTask(FROM_HERE,base::BindOnce([](auto stopped,auto done,Queue::Result result){
   if(stopped->load())result={{},false,"cancelled:shutdown"};if(done)done(result);
  },stopped,done,result)));
 };
}
void ProfileEngine::Sync(std::string store,RequestClass kind,bool optional_store,
    AccountController::Role role,BlobModelHooks model,Queue::Completed done){
 DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
 auto reply=Reply(std::move(done));
 if(stopped_->load()){reply({{},false,"cancelled:shutdown"});return;}
 if(!policy_||policy_()!=AccountController::Gate::kReady||!transport_){reply({{},false,"service-unavailable"});return;}
 const auto status=controller_->Status();
 if(!status.ready||!status.enabled||status.busy||status.erasure_pending){reply({{},false,"sync-not-ready"});return;}
 ++acquiring_;
 broker_->Acquire(status.revision,base::BindOnce(&ProfileEngine::Acquired,
     weak_factory_.GetWeakPtr(),std::move(store),kind,optional_store,role,
     std::move(model),std::move(reply)));
}
void ProfileEngine::Acquired(std::string store,RequestClass kind,bool optional_store,
    AccountController::Role role,BlobModelHooks model,Queue::Completed done,
    CredentialBroker::Result result){
 DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);CHECK_GT(acquiring_,0u);--acquiring_;
 if(stopped_->load()){done({{},false,"cancelled:shutdown"});MaybeClosed();return;}
 if(result.status!=CredentialBroker::Status::kReady||!result.session){
  if(result.status!=CredentialBroker::Status::kBusy)key_ready_=false;
  done({{},false,result.status==CredentialBroker::Status::kBusy?"busy":
      result.status==CredentialBroker::Status::kStale?"stale-credential-session":"key:encryption-unavailable"});return;
 }
 key_ready_=true;auto session=std::move(*result.session);
 controller_->EnqueueBlob(session.revision,transport_,std::move(session.key),
     std::move(session.account),std::move(store),kind,optional_store,role,std::move(model),std::move(done));
}
void ProfileEngine::Shutdown(AccountController::Completed done){
 DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
 if(closed_){CHECK(runner_->PostTask(FROM_HERE,base::BindOnce([](auto done){if(done)done({true,{}});},std::move(done))));return;}
 shutdown_waiters_.push_back(std::move(done));if(stopped_->exchange(true))return;
 key_ready_=false;broker_->Shutdown();if(transport_)transport_->Cancel();
 controller_->Shutdown([weak=weak_factory_.GetWeakPtr()](auto result){
  CHECK(result.ok);if(weak){weak->controller_closed_=true;weak->MaybeClosed();}
 });
}
void ProfileEngine::MaybeClosed(){
 if(!stopped_->load()||!controller_closed_||acquiring_||closed_)return;
 closed_=true;auto waiters=std::move(shutdown_waiters_);
 for(auto& done:waiters)CHECK(runner_->PostTask(FROM_HERE,base::BindOnce([](auto done){if(done)done({true,{}});},std::move(done))));
}
}  // namespace blanc::sync

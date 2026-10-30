#include "personal_identity_loader.h"
#include "base/check.h"
#include "base/functional/bind.h"
#include "base/location.h"
namespace blanc::sync {
PersonalIdentityLoader::PersonalIdentityLoader(base::FilePath root,scoped_refptr<base::SequencedTaskRunner> worker)
 :root_(std::move(root)),worker_(std::move(worker)),owner_(base::SequencedTaskRunner::GetCurrentDefault()){CHECK(worker_&&owner_);}
PersonalIdentityLoader::~PersonalIdentityLoader(){Shutdown();}
void PersonalIdentityLoader::Finish(Result result){
 DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);auto done=std::move(pending_);if(!done)return;
 CHECK(owner_->PostTask(FROM_HERE,base::BindOnce([](auto stopped,auto epoch,uint64_t expected,Completed done,Result result){
  if(stopped->load())result.state=State::kShutdown;
  else if(epoch->load()!=expected)result.state=State::kCancelled;
  std::move(done).Run(result);
 },stopped_,epoch_,epoch_->load(),std::move(done),result)));
}
void PersonalIdentityLoader::Load(Completed done){
 DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);CHECK(done);
 if(stopped_->load()||pending_){const auto state=stopped_->load()?State::kShutdown:State::kBusy;
  CHECK(owner_->PostTask(FROM_HERE,base::BindOnce([](auto stopped,Completed done,State state){std::move(done).Run({stopped->load()?State::kShutdown:state,PersonalIdentityStore::Status::kMissing});},stopped_,std::move(done),state)));return;}
 identity_.reset();epoch_->fetch_add(1);pending_=std::move(done);
 const bool posted=worker_->PostTaskAndReplyWithResult(FROM_HERE,
  base::BindOnce([](base::FilePath root){PersonalIdentityStore store(std::move(root));return store.Read();},root_),
  base::BindOnce(&PersonalIdentityLoader::Loaded,weak_factory_.GetWeakPtr()));
 if(!posted)Finish({State::kUnavailable,PersonalIdentityStore::Status::kReadError});
}
void PersonalIdentityLoader::Loaded(PersonalIdentityStore::Result result){
 DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);if(stopped_->load()||!pending_)return;
 if(result.status==PersonalIdentityStore::Status::kLoaded&&result.identity){identity_=std::move(result.identity);Finish({State::kReady,result.status});return;}
 identity_.reset();Finish({State::kUnavailable,result.status});
}
void PersonalIdentityLoader::Invalidate(){
 DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);identity_.reset();epoch_->fetch_add(1);weak_factory_.InvalidateWeakPtrs();
 Finish({State::kCancelled,PersonalIdentityStore::Status::kMissing});
}
void PersonalIdentityLoader::Shutdown(){
 DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);if(stopped_->exchange(true))return;
 identity_.reset();epoch_->fetch_add(1);weak_factory_.InvalidateWeakPtrs();Finish({State::kShutdown,PersonalIdentityStore::Status::kMissing});
}
std::optional<base::FilePath> PersonalIdentityLoader::path() const{
 DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);return !stopped_->load()&&identity_?std::optional<base::FilePath>(identity_->profile_path):std::nullopt;
}
std::optional<PersonalIdentityStore::Identity> PersonalIdentityLoader::identity() const{
 DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);return stopped_->load()?std::nullopt:identity_;
}
base::RepeatingCallback<std::optional<base::FilePath>()> PersonalIdentityLoader::Resolver(){
 DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);return base::BindRepeating([](base::WeakPtr<PersonalIdentityLoader> weak){return weak?weak->path():std::nullopt;},weak_factory_.GetWeakPtr());
}
}  // namespace blanc::sync

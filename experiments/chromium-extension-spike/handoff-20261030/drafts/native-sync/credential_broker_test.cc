#include "credential_broker.h"
#include "base/at_exit.h"
#include "base/check.h"
#include "base/command_line.h"
#include "base/files/file_util.h"
#include "base/functional/bind.h"
#include "base/run_loop.h"
#include "base/threading/thread.h"
#include "base/synchronization/waitable_event.h"
#include "base/location.h"
#include "base/task/single_thread_task_executor.h"
#include "base/task/thread_pool/thread_pool_instance.h"
#include "components/os_crypt/async/common/algorithm.mojom.h"
#include <iostream>
using namespace blanc::sync;
using E=os_crypt_async::Encryptor;using Algorithm=os_crypt_async::mojom::Algorithm;
class FixtureEncryptor:public E{public:FixtureEncryptor(KeyRing ring,const std::string& provider):E(std::move(ring),provider){}};
scoped_refptr<E> Provider(bool rotated=false){E::KeyRing ring;ring.emplace("v10",E::Key(std::vector<uint8_t>(32,8),Algorithm::kAES256GCM));if(rotated)ring.emplace("v11",E::Key(std::vector<uint8_t>(32,9),Algorithm::kAES256GCM));return base::MakeRefCounted<FixtureEncryptor>(std::move(ring),rotated?"v11":"v10");}
class ControlledProvider:public os_crypt_async::OSCryptAsync{public:ControlledProvider():OSCryptAsync({}){}InitCallback pending;int calls=0;void GetInstance(InitCallback done)override{++calls;CHECK(!pending);pending=std::move(done);}};
using B=CredentialBroker;
auto Done(std::function<void(B::Result)> fn){return base::BindOnce([](std::function<void(B::Result)> fn,B::Result r){fn(std::move(r));},std::move(fn));}
int main(int argc,char** argv){
 base::AtExitManager at_exit;base::CommandLine::Init(argc,argv);CHECK_EQ(argc,2);
 base::SingleThreadTaskExecutor executor;base::ThreadPoolInstance::CreateAndStartWithDefaultParams("CredentialBrokerCheck");
 const auto root=base::FilePath::FromUTF8Unsafe(argv[1]);CHECK(root.IsAbsolute());CHECK(!base::PathExists(root));CHECK(base::CreateDirectory(root));
 const std::string profile(64,'a'),account(64,'b');
 auto store=std::make_shared<ProfileStateStore>(root,profile,true,false);CHECK(store->Bootstrap(ProfileStateStore::BootstrapMode::kKnownFirstNativeSetup)==RequestLedger::Status::kLoaded);
 std::array<uint8_t,32> bytes{};bytes.fill(42);auto key=ProtocolKey::Import(bytes);CHECK(key);
 auto provider=Provider();KeyVault vault(provider,{profile,account,true,false});const auto wrapped=vault.Protect(*key);CHECK(wrapped.status==KeyVault::Status::kOk);
 CHECK(store->Adopt(store->Read().state->identity_revision,"Synthetic",account,wrapped.blob,false)==RequestLedger::Status::kLoaded);
 ControlledProvider service;VaultContext context{profile,{},true,false};auto gate=std::make_shared<CredentialProviderHandle>(&service,base::SequencedTaskRunner::GetCurrentDefault());auto broker=std::make_unique<B>(store,context,gate);
 auto acquire=[&](scoped_refptr<E> p){B::Result result;base::RunLoop loop;broker->Acquire(store->Read().state->identity_revision,Done([&](auto r){result=std::move(r);loop.Quit();}));base::RunLoop().RunUntilIdle();CHECK(service.pending);std::move(service.pending).Run(std::move(p));loop.Run();return result;};
 {auto r=acquire(provider);CHECK(r.status==B::Status::kReady);CHECK(r.session);CHECK_EQ(r.session->account,account);CHECK(r.session->key->bytes()==key->bytes());}
 {base::RunLoop loop;broker->Acquire(-1,Done([&](auto r){CHECK(r.status==B::Status::kStale);CHECK(!r.session);loop.Quit();}));loop.Run();CHECK_EQ(service.calls,1);}
 {B private_broker(store,{profile,{},true,true},gate);base::RunLoop loop;private_broker.Acquire(store->Read().state->identity_revision,Done([&](auto r){CHECK(r.status==B::Status::kNotAllowed);loop.Quit();}));loop.Run();CHECK_EQ(service.calls,1);}
 {base::RunLoop loop;broker->Acquire(store->Read().state->identity_revision,Done([&](auto r){CHECK(r.status==B::Status::kStale);CHECK(!r.session);loop.Quit();}));base::RunLoop().RunUntilIdle();CHECK(service.pending);CHECK(store->SetConsents(store->Read().state->identity_revision,true,false)==RequestLedger::Status::kLoaded);std::move(service.pending).Run(provider);loop.Run();}
 {auto r=acquire(nullptr);CHECK(r.status==B::Status::kUnavailable);CHECK(!r.session);}
 {auto r=acquire(Provider(true));CHECK(r.status==B::Status::kReady);CHECK(store->Read().state->protected_key!=wrapped.blob);}
 // A completed unwrap can still be queued behind a local identity mutation.
 {base::RunLoop loop;broker->Acquire(store->Read().state->identity_revision,Done([&](auto r){CHECK(r.status==B::Status::kStale);CHECK(!r.session);loop.Quit();}));base::RunLoop().RunUntilIdle();std::move(service.pending).Run(Provider(true));CHECK(base::SequencedTaskRunner::GetCurrentDefault()->PostTask(FROM_HERE,base::BindOnce([](auto store){CHECK(store->SetConsents(store->Read().state->identity_revision,false,false)==RequestLedger::Status::kLoaded);},store)));loop.Run();}
 {base::RunLoop loop;broker->Acquire(store->Read().state->identity_revision,Done([&](auto r){CHECK(r.status==B::Status::kShutdown);CHECK(!r.session);loop.Quit();}));base::RunLoop().RunUntilIdle();auto late=std::move(service.pending);broker.reset();std::move(late).Run(provider);loop.Run();}
 // A real second sequence owns the service; Encryptor replies return here.
 base::Thread provider_thread("CredentialProviderOwner");CHECK(provider_thread.Start());
 std::atomic<int> remote_calls=0;
 class RemoteProvider:public os_crypt_async::OSCryptAsync {
  public:explicit RemoteProvider(scoped_refptr<base::SequencedTaskRunner> owner,std::atomic<int>* calls):OSCryptAsync({}),owner_(owner),calls_(calls){CHECK(owner_->RunsTasksInCurrentSequence());}
  void GetInstance(InitCallback done)override{CHECK(owner_->RunsTasksInCurrentSequence());++*calls_;std::move(done).Run(Provider(true));}
  private:scoped_refptr<base::SequencedTaskRunner> owner_;std::atomic<int>* calls_;
 };
 RemoteProvider* remote=nullptr;std::shared_ptr<CredentialProviderHandle> remote_gate;base::WaitableEvent created,deleted;
 CHECK(provider_thread.task_runner()->PostTask(FROM_HERE,base::BindOnce([](RemoteProvider** output,std::shared_ptr<CredentialProviderHandle>* gate,base::WaitableEvent* event,auto runner,std::atomic<int>* calls){*output=new RemoteProvider(runner,calls);*gate=std::make_shared<CredentialProviderHandle>(*output,runner);event->Signal();},base::Unretained(&remote),base::Unretained(&remote_gate),base::Unretained(&created),provider_thread.task_runner(),base::Unretained(&remote_calls))));created.Wait();
 {
  B cross_sequence(store,context,remote_gate);base::RunLoop loop;
  const auto owner=base::SequencedTaskRunner::GetCurrentDefault();
  cross_sequence.Acquire(store->Read().state->identity_revision,Done([&](auto r){CHECK(owner->RunsTasksInCurrentSequence());CHECK(r.status==B::Status::kReady);CHECK(r.session);loop.Quit();}));loop.Run();
 }
 CHECK_EQ(remote_calls.load(),1);
 base::WaitableEvent blocked,release,drained;
 CHECK(provider_thread.task_runner()->PostTask(FROM_HERE,base::BindOnce([](base::WaitableEvent* blocked,base::WaitableEvent* release){blocked->Signal();release->Wait();},base::Unretained(&blocked),base::Unretained(&release))));blocked.Wait();
 {
  B closing(store,context,remote_gate);base::RunLoop loop;
  closing.Acquire(store->Read().state->identity_revision,Done([&](auto r){CHECK(r.status==B::Status::kShutdown);CHECK(!r.session);loop.Quit();}));closing.Shutdown();release.Signal();loop.Run();
 }
 CHECK(provider_thread.task_runner()->PostTask(FROM_HERE,base::BindOnce([](base::WaitableEvent* done){done->Signal();},base::Unretained(&drained))));drained.Wait();CHECK_EQ(remote_calls.load(),1);
 CHECK(provider_thread.task_runner()->PostTask(FROM_HERE,base::BindOnce([](RemoteProvider* service,std::shared_ptr<CredentialProviderHandle> gate,base::WaitableEvent* event){gate->Invalidate();delete service;event->Signal();},base::Unretained(remote),remote_gate,base::Unretained(&deleted))));deleted.Wait();provider_thread.Stop();
 base::RunLoop().RunUntilIdle();base::ThreadPoolInstance::Get()->FlushForTesting();base::ThreadPoolInstance::Get()->Shutdown();
 std::cout<<"native credential broker unwrap/revision/private/unavailable/rotation/queued-reply/shutdown checks passed; synthetic provider only\n";
}

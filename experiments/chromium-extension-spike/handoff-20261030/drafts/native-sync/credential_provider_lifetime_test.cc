#include "credential_broker.h"
#include "base/at_exit.h"
#include "base/check.h"
#include "base/command_line.h"
#include "base/files/file_util.h"
#include "base/functional/bind.h"
#include "base/location.h"
#include "base/run_loop.h"
#include "base/synchronization/waitable_event.h"
#include "base/task/single_thread_task_executor.h"
#include "base/task/thread_pool/thread_pool_instance.h"
#include "base/threading/thread.h"
#include "components/os_crypt/async/common/algorithm.mojom.h"
#include <atomic>
#include <iostream>
using namespace blanc::sync;using E=os_crypt_async::Encryptor;using B=CredentialBroker;
class FixtureEncryptor:public E{public:explicit FixtureEncryptor(KeyRing ring):E(std::move(ring),"v11"){} };
class Provider:public os_crypt_async::OSCryptAsync{public:explicit Provider(std::atomic<int>* calls):OSCryptAsync({}),calls_(calls){}void GetInstance(InitCallback done)override{++*calls_;std::move(done).Run(nullptr);}private:std::atomic<int>* calls_;};
class RejectingRunner:public base::SequencedTaskRunner{public:
 bool PostDelayedTask(const base::Location&,base::OnceClosure,base::TimeDelta) override{return false;}
 bool PostNonNestableDelayedTask(const base::Location&,base::OnceClosure,base::TimeDelta) override{return false;}
 bool RunsTasksInCurrentSequence() const override{return true;}
 private:~RejectingRunner() override=default;
};
int main(int argc,char**argv){
 base::AtExitManager at_exit;base::CommandLine::Init(argc,argv);CHECK_EQ(argc,2);base::SingleThreadTaskExecutor executor;base::ThreadPoolInstance::CreateAndStartWithDefaultParams("ProviderLifetime");const auto root=base::FilePath::FromUTF8Unsafe(argv[1]);CHECK(!base::PathExists(root));CHECK(base::CreateDirectory(root));const std::string profile(64,'a'),account(64,'b');
 auto store=std::make_shared<ProfileStateStore>(root,profile,true,false);CHECK(store->Bootstrap(ProfileStateStore::BootstrapMode::kKnownFirstNativeSetup)==RequestLedger::Status::kLoaded);E::KeyRing ring;ring.emplace("v11",E::Key(std::vector<uint8_t>(32,7),os_crypt_async::mojom::Algorithm::kAES256GCM));auto crypt=base::MakeRefCounted<FixtureEncryptor>(std::move(ring));std::array<uint8_t,32> bytes{};bytes.fill(42);auto key=ProtocolKey::Import(bytes);CHECK(key);KeyVault vault(crypt,{profile,account,true,false});auto wrapped=vault.Protect(*key);CHECK(wrapped.status==KeyVault::Status::kOk);CHECK(store->Adopt(store->Read().state->identity_revision,"Synthetic",account,wrapped.blob,false)==RequestLedger::Status::kLoaded);
 base::Thread owner("ProviderOwner");CHECK(owner.Start());std::atomic<int> calls=0;Provider* provider=nullptr;std::shared_ptr<CredentialProviderHandle> gate;base::WaitableEvent created,blocked,release,deleted;
 CHECK(owner.task_runner()->PostTask(FROM_HERE,base::BindOnce([](Provider** provider,std::shared_ptr<CredentialProviderHandle>* gate,std::atomic<int>* calls,scoped_refptr<base::SequencedTaskRunner> runner,base::WaitableEvent* done){*provider=new Provider(calls);*gate=std::make_shared<CredentialProviderHandle>(*provider,runner);done->Signal();},base::Unretained(&provider),base::Unretained(&gate),base::Unretained(&calls),owner.task_runner(),base::Unretained(&created))));created.Wait();
 CHECK(owner.task_runner()->PostTask(FROM_HERE,base::BindOnce([](std::shared_ptr<CredentialProviderHandle> gate,Provider* provider,base::WaitableEvent* blocked,base::WaitableEvent* release,base::WaitableEvent* deleted){blocked->Signal();release->Wait();gate->Invalidate();delete provider;deleted->Signal();},gate,base::Unretained(provider),base::Unretained(&blocked),base::Unretained(&release),base::Unretained(&deleted))));blocked.Wait();
 B broker(store,{profile,{},true,false},gate);base::RunLoop loop;broker.Acquire(store->Read().state->identity_revision,base::BindOnce([](base::RunLoop* loop,B::Result r){CHECK(r.status==B::Status::kUnavailable);CHECK(!r.session);loop->Quit();},base::Unretained(&loop)));release.Signal();deleted.Wait();loop.Run();CHECK_EQ(calls.load(),0);broker.Shutdown();owner.Stop();
 auto rejecting=base::MakeRefCounted<RejectingRunner>();auto closed=std::make_shared<CredentialProviderHandle>(nullptr,rejecting);B blocked_broker(store,{profile,{},true,false},closed);base::RunLoop rejected;blocked_broker.Acquire(store->Read().state->identity_revision,base::BindOnce([](base::RunLoop* loop,B::Result r){CHECK(r.status==B::Status::kUnavailable);CHECK(!r.session);loop->Quit();},base::Unretained(&rejected)));rejected.Run();blocked_broker.Shutdown();
 base::RunLoop().RunUntilIdle();base::ThreadPoolInstance::Get()->FlushForTesting();base::ThreadPoolInstance::Get()->Shutdown();std::cout<<"revoked provider and rejected owner runner fail closed without hanging\n";
}

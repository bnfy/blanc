#include "credential_broker.h"
#include "base/at_exit.h"
#include "base/check.h"
#include "base/command_line.h"
#include "base/files/file_util.h"
#include "base/functional/bind.h"
#include "base/location.h"
#include "base/run_loop.h"
#include "base/task/single_thread_task_executor.h"
#include "base/task/thread_pool/thread_pool_instance.h"
#include "components/os_crypt/async/common/algorithm.mojom.h"
#include <iostream>
using namespace blanc::sync;using E=os_crypt_async::Encryptor;using B=CredentialBroker;
class FixtureEncryptor:public E{public:explicit FixtureEncryptor(KeyRing ring):E(std::move(ring),"v11"){} };
class Provider:public os_crypt_async::OSCryptAsync{public:Provider():OSCryptAsync({}){}int calls=0;InitCallback pending;void GetInstance(InitCallback cb)override{++calls;pending=std::move(cb);}};
int main(int argc,char**argv){
 base::AtExitManager at_exit;base::CommandLine::Init(argc,argv);CHECK_EQ(argc,2);base::SingleThreadTaskExecutor executor;base::ThreadPoolInstance::CreateAndStartWithDefaultParams("CredentialPending");
 const auto root=base::FilePath::FromUTF8Unsafe(argv[1]);CHECK(!base::PathExists(root));CHECK(base::CreateDirectory(root));const std::string profile(64,'a'),account(64,'b');
 auto store=std::make_shared<ProfileStateStore>(root,profile,true,false);CHECK(store->Bootstrap(ProfileStateStore::BootstrapMode::kKnownFirstNativeSetup)==RequestLedger::Status::kLoaded);
 E::KeyRing ring;ring.emplace("v11",E::Key(std::vector<uint8_t>(32,7),os_crypt_async::mojom::Algorithm::kAES256GCM));auto encryptor=base::MakeRefCounted<FixtureEncryptor>(std::move(ring));std::array<uint8_t,32> bytes{};bytes.fill(55);auto key=ProtocolKey::Import(bytes);CHECK(key);KeyVault vault(encryptor,{profile,account,true,false});auto wrapped=vault.Protect(*key);CHECK(wrapped.status==KeyVault::Status::kOk);CHECK(store->Adopt(store->Read().state->identity_revision,"Synthetic",account,wrapped.blob,false)==RequestLedger::Status::kLoaded);
 Provider provider;B broker(store,{profile,{},true,false},std::make_shared<CredentialProviderHandle>(&provider,base::SequencedTaskRunner::GetCurrentDefault()));auto done=[](base::RunLoop* loop,B::Result r){CHECK(r.status==B::Status::kStale);CHECK(!r.session);loop->Quit();};
 CHECK(store->SetErasurePending(store->Read().state->identity_revision,true)==RequestLedger::Status::kLoaded);{base::RunLoop loop;broker.Acquire(store->Read().state->identity_revision,base::BindOnce(done,base::Unretained(&loop)));loop.Run();CHECK_EQ(provider.calls,0);}
 CHECK(store->SetErasurePending(store->Read().state->identity_revision,false)==RequestLedger::Status::kLoaded);{base::RunLoop loop;broker.Acquire(store->Read().state->identity_revision,base::BindOnce(done,base::Unretained(&loop)));base::RunLoop().RunUntilIdle();CHECK(provider.pending);CHECK(store->SetErasurePending(store->Read().state->identity_revision,true)==RequestLedger::Status::kLoaded);std::move(provider.pending).Run(encryptor);loop.Run();}
 CHECK(store->SetErasurePending(store->Read().state->identity_revision,false)==RequestLedger::Status::kLoaded);{base::RunLoop loop;broker.Acquire(store->Read().state->identity_revision,base::BindOnce(done,base::Unretained(&loop)));base::RunLoop().RunUntilIdle();CHECK(provider.pending);std::move(provider.pending).Run(encryptor);CHECK(base::SequencedTaskRunner::GetCurrentDefault()->PostTask(FROM_HERE,base::BindOnce([](auto store){CHECK(store->SetErasurePending(store->Read().state->identity_revision,true)==RequestLedger::Status::kLoaded);},store)));loop.Run();}
 broker.Shutdown();base::RunLoop().RunUntilIdle();base::ThreadPoolInstance::Get()->FlushForTesting();base::ThreadPoolInstance::Get()->Shutdown();std::cout<<"ordinary broker denies pending erasure at admission, provider return and posted reply\n";
}

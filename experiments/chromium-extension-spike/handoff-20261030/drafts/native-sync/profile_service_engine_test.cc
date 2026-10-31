#include "profile_service.h"
#include "base/at_exit.h"
#include "base/check.h"
#include "base/command_line.h"
#include "base/files/file_util.h"
#include "base/functional/bind.h"
#include "base/json/json_reader.h"
#include "base/run_loop.h"
#include "base/task/single_thread_task_executor.h"
#include "base/task/thread_pool/thread_pool_instance.h"
#include "components/os_crypt/async/common/algorithm.mojom.h"
#include "mojo/core/embedder/embedder.h"
#include "net/http/http_status_code.h"
#include "services/network/public/cpp/resource_request.h"
#include "services/network/public/cpp/weak_wrapper_shared_url_loader_factory.h"
#include "services/network/test/test_url_loader_factory.h"
#include "services/network/test/test_utils.h"
#include <atomic>
#include <iostream>
using namespace blanc::sync;using E=os_crypt_async::Encryptor;
namespace blanc::sync { class ProfileServiceEngineTestAccess { public:
 static std::unique_ptr<ProfileService> Create(base::FilePath root,std::string binding,
     AccountController::Hooks hooks,ProfileService::EngineInputs inputs) {
  return std::unique_ptr<ProfileService>(new ProfileService(std::move(root),std::move(binding),std::move(hooks),std::move(inputs)));
 }
}; }
class FixtureEncryptor:public E{public:explicit FixtureEncryptor(KeyRing r):E(std::move(r),"v11"){} };
class Provider:public os_crypt_async::OSCryptAsync{public:Provider(scoped_refptr<E> key,scoped_refptr<base::SequencedTaskRunner> owner):OSCryptAsync({}),key(std::move(key)),owner(std::move(owner)){}scoped_refptr<E> key;scoped_refptr<base::SequencedTaskRunner> owner;int calls=0;bool hold=false;InitCallback pending;std::function<void()> requested;void GetInstance(InitCallback done)override{CHECK(owner->RunsTasksInCurrentSequence());++calls;if(requested)requested();if(hold)pending=std::move(done);else std::move(done).Run(key);}};
int main(int argc,char**argv){
 base::AtExitManager at_exit;base::CommandLine::Init(argc,argv);CHECK(argc==2||argc==3);base::SingleThreadTaskExecutor executor(base::MessagePumpType::IO);base::ThreadPoolInstance::CreateAndStartWithDefaultParams("ProfileServiceEngine");mojo::core::Init();const auto owner=base::SequencedTaskRunner::GetCurrentDefault();
 const auto root=base::FilePath::FromUTF8Unsafe(argv[1]);CHECK(!base::PathExists(root));CHECK(base::CreateDirectory(root));const std::string profile(64,'a'),account(64,'b');
 E::KeyRing ring;ring.emplace("v11",E::Key(std::vector<uint8_t>(32,7),os_crypt_async::mojom::Algorithm::kAES256GCM));auto encryptor=base::MakeRefCounted<FixtureEncryptor>(std::move(ring));std::array<uint8_t,32> bytes{};bytes.fill(55);auto key=ProtocolKey::Import(bytes);CHECK(key);KeyVault vault(encryptor,{profile,account,true,false});auto protected_key=vault.Protect(*key);CHECK(protected_key.status==KeyVault::Status::kOk);
 {auto store=std::make_shared<ProfileStateStore>(root,profile,true,false);CHECK(store->Bootstrap(ProfileStateStore::BootstrapMode::kKnownFirstNativeSetup)==RequestLedger::Status::kLoaded);CHECK(store->Adopt(store->Read().state->identity_revision,"Synthetic",account,protected_key.blob,false)==RequestLedger::Status::kLoaded);}
 auto provider=std::make_unique<Provider>(encryptor,owner);network::TestURLLoaderFactory factory;int gets=0,puts=0;std::atomic<int> plans=0;const std::string url="https://blanc-sync.bnfy-441.workers.dev/v1/blob/"+account+"/session";
 std::function<void(const network::ResourceRequest&)> intercept=[&](const auto&r){CHECK(owner->RunsTasksInCurrentSequence());CHECK_EQ(r.url.spec(),url);factory.ClearResponses();if(r.method=="GET"){++gets;factory.AddResponse(url,"missing",net::HTTP_NOT_FOUND);}else{CHECK_EQ(r.method,"PUT");++puts;auto body=base::JSONReader::ReadDict(network::GetUploadData(r),base::JSON_PARSE_RFC);CHECK(body);const auto*b=body->FindDict("blob");CHECK(b);auto clear=Decrypt(*key,Envelope{*b->FindInt("v"),*b->FindString("iv"),*b->FindString("ct"),*b->FindString("tag")});CHECK(clear&&*clear=="{\"service\":true}");factory.AddResponse(url,"{}",net::HTTP_OK);}};
 factory.SetInterceptor(base::BindRepeating([](std::function<void(const network::ResourceRequest&)> fn,const network::ResourceRequest&r){fn(r);},intercept));
 AccountController::Hooks hooks;hooks.gate=[]{return AccountController::Gate::kReady;};ProfileService::EngineInputs inputs;inputs.process_crypto=provider.get();inputs.provider_owner=owner;inputs.network_clone=factory.GetSafeWeakWrapper()->Clone();auto service=ProfileServiceEngineTestAccess::Create(root,profile,std::move(hooks),std::move(inputs));
 {base::RunLoop status;service->ReadStatus(base::BindOnce([](base::RunLoop* loop,AccountController::View view){CHECK(view.ready&&view.enabled);loop->Quit();},base::Unretained(&status)));status.Run();}
 if(argc==3){base::RunLoop started,finished;BlobModelHooks::Planned held;BlobModelHooks model;model.plan_async=[&](std::optional<std::string> remote,BlobModelHooks::Planned done){CHECK(!owner->RunsTasksInCurrentSequence());CHECK(!remote);CHECK(owner->PostTask(FROM_HERE,base::BindOnce([](BlobModelHooks::Planned* target,base::RunLoop* loop,BlobModelHooks::Planned done){*target=std::move(done);loop->Quit();},base::Unretained(&held),base::Unretained(&started),std::move(done))));};bool completed=false;service->Sync("session",RequestClass::kFixed,false,AccountController::Role::kGeneral,std::move(model),[&](const auto&r){CHECK_EQ(r.error,"cancelled:shutdown");completed=true;finished.Quit();});started.Run();CHECK(held);service->Shutdown();service.reset();if(!completed)finished.Run();std::move(held).Run({"{\"service\":true}",{}});base::RunLoop().RunUntilIdle();base::ThreadPoolInstance::Get()->FlushForTesting();base::RunLoop().RunUntilIdle();CHECK_EQ(gets,1);CHECK_EQ(puts,0);base::ThreadPoolInstance::Get()->Shutdown();std::cout<<"profile service late model callback cancelled after shutdown\n";return 0;}
 auto model=[&]{BlobModelHooks m;m.plan=[&](const auto&remote){CHECK(!owner->RunsTasksInCurrentSequence());CHECK(!remote);++plans;return BlobPlan{"{\"service\":true}",{}};};return m;};
 {base::RunLoop sync;service->Sync("session",RequestClass::kFixed,false,AccountController::Role::kGeneral,model(),[&](const auto&r){CHECK(owner->RunsTasksInCurrentSequence());CHECK(r.error.empty());CHECK(r.outcome=="stored");sync.Quit();});sync.Run();}
 CHECK_EQ(provider->calls,1);CHECK_EQ(gets,1);CHECK_EQ(puts,1);CHECK_EQ(plans.load(),1);
 provider->hold=true;base::RunLoop started;provider->requested=[&]{started.Quit();};base::RunLoop finished;bool completed=false;
 service->Sync("session",RequestClass::kFixed,false,AccountController::Role::kGeneral,model(),[&](const auto&r){CHECK(owner->RunsTasksInCurrentSequence());CHECK_EQ(r.error,"cancelled:shutdown");completed=true;finished.Quit();});started.Run();CHECK(provider->pending);auto late=std::move(provider->pending);service->Shutdown();service.reset();provider.reset();if(!completed)finished.Run();CHECK_EQ(gets,1);CHECK_EQ(plans.load(),1);std::move(late).Run(encryptor);base::RunLoop().RunUntilIdle();base::ThreadPoolInstance::Get()->FlushForTesting();base::RunLoop().RunUntilIdle();base::ThreadPoolInstance::Get()->Shutdown();std::cout<<"profile service worker/owner provider, encrypted fake network and shutdown redaction passed\n";
}

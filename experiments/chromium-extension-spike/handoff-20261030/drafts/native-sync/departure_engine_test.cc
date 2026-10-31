#include "profile_engine.h"
#include "base/at_exit.h"
#include "base/check.h"
#include "base/command_line.h"
#include "base/files/file_util.h"
#include "base/functional/bind.h"
#include "base/json/json_writer.h"
#include "base/run_loop.h"
#include "base/task/single_thread_task_executor.h"
#include "base/task/thread_pool/thread_pool_instance.h"
#include "components/os_crypt/async/common/algorithm.mojom.h"
#include "mojo/core/embedder/embedder.h"
#include "net/http/http_status_code.h"
#include "services/network/public/cpp/resource_request.h"
#include "services/network/public/cpp/weak_wrapper_shared_url_loader_factory.h"
#include "services/network/test/test_url_loader_factory.h"
#include <cstdlib>
#include <iostream>
using namespace blanc::sync;using E=os_crypt_async::Encryptor;using Core=AccountController;
class FixtureEncryptor:public E{public:explicit FixtureEncryptor(KeyRing r):E(std::move(r),"v11"){} };
class Provider:public os_crypt_async::OSCryptAsync{public:explicit Provider(scoped_refptr<E> k):OSCryptAsync({}),key(std::move(k)){}scoped_refptr<E> key;int calls=0;bool hold=false;InitCallback pending;void GetInstance(InitCallback done)override{++calls;if(hold)pending=std::move(done);else std::move(done).Run(key);}};
int main(int argc,char**argv){
 base::AtExitManager at_exit;base::CommandLine::Init(argc,argv);CHECK_EQ(argc,3);base::SingleThreadTaskExecutor executor(base::MessagePumpType::IO);base::ThreadPoolInstance::CreateAndStartWithDefaultParams("DepartureEngine");mojo::core::Init();
 const auto root=base::FilePath::FromUTF8Unsafe(argv[1]);CHECK(!base::PathExists(root));CHECK(base::CreateDirectory(root));const int mode=std::atoi(argv[2]);const std::string profile(64,'a'),account(64,'b');
 auto store=std::make_shared<ProfileStateStore>(root,profile,true,false);CHECK(store->Bootstrap(ProfileStateStore::BootstrapMode::kKnownFirstNativeSetup)==RequestLedger::Status::kLoaded);
 E::KeyRing ring;ring.emplace("v11",E::Key(std::vector<uint8_t>(32,7),os_crypt_async::mojom::Algorithm::kAES256GCM));auto encryptor=base::MakeRefCounted<FixtureEncryptor>(std::move(ring));
 std::array<uint8_t,32> bytes{};bytes.fill(55);auto key=ProtocolKey::Import(bytes);CHECK(key);KeyVault vault(encryptor,{profile,account,true,false});auto protected_key=vault.Protect(*key);CHECK(protected_key.status==KeyVault::Status::kOk);
 CHECK(store->Adopt(store->Read().state->identity_revision,"Synthetic",account,protected_key.blob,false)==RequestLedger::Status::kLoaded);
 if(mode>=4&&mode<=6)CHECK(store->SetErasurePending(store->Read().state->identity_revision,true)==RequestLedger::Status::kLoaded);
 Provider provider(mode==2?nullptr:encryptor);provider.hold=mode==1||mode==4;network::TestURLLoaderFactory factory;std::vector<std::string> operations;int plans=0;std::string held_response;
 const std::string endpoint="https://blanc-sync.bnfy-441.workers.dev/v1/blob/"+account+"/";
 std::function<void(const network::ResourceRequest&)> intercept=[&](const auto&r){factory.ClearResponses();if(r.method=="DELETE"){CHECK_EQ(r.url.spec(),endpoint.substr(0,endpoint.size()-1));operations.push_back("DELETE");factory.AddResponse(r.url.spec(),"{\"error\":\"quota erasure pending\"}",net::HTTP_SERVICE_UNAVAILABLE);return;}CHECK(r.url.spec().starts_with(endpoint));operations.push_back(r.method+" "+r.url.spec().substr(endpoint.size()));if(r.method=="GET"){
  if(mode==6){factory.AddResponse(r.url.spec(),"{\"error\":\"quota erasure pending\"}",net::HTTP_SERVICE_UNAVAILABLE);return;}
  auto blob=Encrypt(*key,"{\"devices\":{\"self\":{}}}");CHECK(blob);base::DictValue wire;wire.Set("v",blob->version);wire.Set("iv",blob->iv);wire.Set("ct",blob->ct);wire.Set("tag",blob->tag);base::DictValue body;body.Set("version","v1");body.Set("blob",std::move(wire));held_response=*base::WriteJson(body);if((mode!=5&&mode!=7)||operations.size()!=1)factory.AddResponse(r.url.spec(),held_response,net::HTTP_OK);
 }else{CHECK_EQ(r.method,"PUT");factory.AddResponse(r.url.spec(),"{}",net::HTTP_OK);}};
 factory.SetInterceptor(base::BindRepeating([](std::function<void(const network::ResourceRequest&)> fn,const network::ResourceRequest&r){fn(r);},intercept));
 AccountController::Hooks hooks;hooks.gate=[mode]{return mode>=3?AccountController::Gate::kReady:AccountController::Gate::kServiceUnavailable;};
 ProfileEngine::DepartureFactory models=[&](std::string name,std::string device){CHECK(name=="sends"||name=="closed"||name=="session");CHECK_EQ(device,store->Read().state->device_id);BlobModelHooks model;model.plan=[&](const auto& remote){CHECK(remote);++plans;return BlobPlan{"{\"retracted\":true}",{}};};return model;};
 auto engine=std::make_unique<ProfileEngine>(store,VaultContext{profile,{},true,false},std::make_shared<CredentialProviderHandle>(&provider,base::SequencedTaskRunner::GetCurrentDefault()),factory.GetSafeWeakWrapper()->Clone(),std::move(hooks),std::move(models));
 if(mode==7){base::RunLoop sync;BlobModelHooks model;model.plan=[&](const auto&){++plans;return BlobPlan{"{}",{}};};engine->Sync("session",RequestClass::kFixed,false,Core::Role::kGeneral,std::move(model),[&](const auto&r){CHECK_EQ(r.error,"cancelled:identity-or-erasure");sync.Quit();});base::RunLoop().RunUntilIdle();CHECK(factory.IsPending(endpoint+"session"));CHECK(store->SetErasurePending(store->Read().state->identity_revision,true)==RequestLedger::Status::kLoaded);factory.AddResponse(endpoint+"session",held_response,net::HTTP_OK);sync.Run();CHECK_EQ(plans,0);CHECK((operations==std::vector<std::string>{"GET session"}));base::RunLoop shutdown;engine->Shutdown([&](auto r){CHECK(r.ok);shutdown.Quit();});shutdown.Run();engine.reset();base::RunLoop().RunUntilIdle();base::ThreadPoolInstance::Get()->FlushForTesting();base::ThreadPoolInstance::Get()->Shutdown();std::cout<<"departure engine scenario 7 passed\n";return 0;}
 if(mode==3){base::RunLoop wipe;engine->account().Disable(engine->account().Status().revision,true,[&](auto r){CHECK(!r.ok);CHECK_EQ(r.error,"erasure-pending");wipe.Quit();});wipe.Run();CHECK(store->Read().state->enabled);CHECK(!store->Read().state->protected_key.empty());CHECK(store->Read().state->erasure_pending);CHECK((operations==std::vector<std::string>{"DELETE"}));operations.clear();}
 if(mode>=3){base::RunLoop sync;engine->Sync("session",RequestClass::kFixed,false,Core::Role::kGeneral,{},[&](const auto&r){CHECK_EQ(r.error,"sync-not-ready");sync.Quit();});sync.Run();base::RunLoop direct;RequestWorker::Queue::Request request;request.kind=RequestClass::kFixed;request.item="session";request.run=[](auto,auto){CHECK(false);};engine->account().Enqueue(std::move(request),Core::Role::kGeneral,[&](const auto&r){CHECK_EQ(r.error,"erasure-pending");direct.Quit();});direct.Run();CHECK_EQ(provider.calls,0);CHECK(operations.empty());CHECK(store->Read().state->quota.log.empty());}
 bool disabled=false;Core::Result result{};
 base::RunLoop loop;engine->account().Disable(engine->account().Status().revision,false,[&](auto r){result=r;disabled=true;loop.Quit();});
 if(mode==4){base::RunLoop().RunUntilIdle();CHECK(provider.pending);CHECK(store->SetErasurePending(store->Read().state->identity_revision,false)==RequestLedger::Status::kLoaded);std::move(provider.pending).Run(encryptor);base::RunLoop().RunUntilIdle();CHECK(provider.pending);CHECK(operations.empty());}
 if(mode==1||mode==4){base::RunLoop().RunUntilIdle();CHECK(provider.pending);CHECK(!disabled);base::RunLoop shutdown;engine->Shutdown([&](auto r){CHECK(r.ok);shutdown.Quit();});shutdown.Run();CHECK(disabled);CHECK_EQ(result.error,"shutdown");engine.reset();std::move(provider.pending).Run(encryptor);base::RunLoop().RunUntilIdle();CHECK(operations.empty());CHECK(store->Read().state->enabled);}
 else{if(mode==5){base::RunLoop().RunUntilIdle();CHECK(factory.IsPending(endpoint+"sends"));CHECK(store->SetErasurePending(store->Read().state->identity_revision,false)==RequestLedger::Status::kLoaded);factory.AddResponse(endpoint+"sends",held_response,net::HTTP_OK);}if(!disabled)loop.Run();CHECK(result.ok);CHECK(!store->Read().state->enabled);CHECK_EQ(provider.calls,3);if(mode==0||mode==3){CHECK_EQ(plans,3);CHECK((operations==std::vector<std::string>{"GET sends","PUT sends","GET closed","PUT closed","GET session","PUT session"}));CHECK_EQ(store->Read().state->quota.log.size(),3u);}else if(mode==5){CHECK_EQ(plans,2);CHECK((operations==std::vector<std::string>{"GET sends","GET closed","PUT closed","GET session","PUT session"}));CHECK_EQ(store->Read().state->quota.log.size(),3u);}else if(mode==6){CHECK_EQ(plans,0);CHECK((operations==std::vector<std::string>{"GET sends","GET closed","GET session"}));CHECK_EQ(store->Read().state->quota.log.size(),3u);}else{CHECK_EQ(plans,0);CHECK(operations.empty());CHECK(store->Read().state->quota.log.empty());}base::RunLoop shutdown;engine->Shutdown([&](auto r){CHECK(r.ok);shutdown.Quit();});shutdown.Run();engine.reset();}
 base::RunLoop().RunUntilIdle();base::ThreadPoolInstance::Get()->FlushForTesting();base::ThreadPoolInstance::Get()->Shutdown();std::cout<<"departure engine scenario "<<mode<<" passed\n";
}

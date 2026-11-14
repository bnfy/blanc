#include "profile_engine.h"
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
#include <iostream>
using namespace blanc::sync;using E=os_crypt_async::Encryptor;
class FixtureEncryptor:public E{public:FixtureEncryptor(KeyRing ring):E(std::move(ring),"v11"){} };
class Provider:public os_crypt_async::OSCryptAsync{public:Provider(scoped_refptr<E> key):OSCryptAsync({}),key(key){}scoped_refptr<E> key;int calls=0;bool hold=false;InitCallback pending;void GetInstance(InitCallback done)override{++calls;if(hold)pending=std::move(done);else std::move(done).Run(key);}};
int main(int argc,char**argv){
 base::AtExitManager at_exit;base::CommandLine::Init(argc,argv);CHECK_EQ(argc,2);base::SingleThreadTaskExecutor executor(base::MessagePumpType::IO);base::ThreadPoolInstance::CreateAndStartWithDefaultParams("ProfileEngineCheck");mojo::core::Init();
 const auto root=base::FilePath::FromUTF8Unsafe(argv[1]);CHECK(root.IsAbsolute());CHECK(!base::PathExists(root));CHECK(base::CreateDirectory(root));const std::string profile(64,'a'),account(64,'b');
 auto store=std::make_shared<ProfileStateStore>(root,profile,true,false);CHECK(store->Bootstrap(ProfileStateStore::BootstrapMode::kKnownFirstNativeSetup)==RequestLedger::Status::kLoaded);
 E::KeyRing ring;ring.emplace("v11",E::Key(std::vector<uint8_t>(32,7),os_crypt_async::mojom::Algorithm::kAES256GCM));auto encryptor=base::MakeRefCounted<FixtureEncryptor>(std::move(ring));
 std::array<uint8_t,32> bytes{};bytes.fill(55);auto key=ProtocolKey::Import(bytes);CHECK(key);KeyVault vault(encryptor,{profile,account,true,false});auto protected_key=vault.Protect(*key);CHECK(protected_key.status==KeyVault::Status::kOk);
 CHECK(store->Adopt(store->Read().state->identity_revision,"Synthetic",account,protected_key.blob,false)==RequestLedger::Status::kLoaded);CHECK(store->SetConsents(store->Read().state->identity_revision,true,false)==RequestLedger::Status::kLoaded);
 Provider provider(encryptor);network::TestURLLoaderFactory factory;bool allowed=false,hold_network=false,hold_put=false;int gets=0,puts=0,plans=0,stored=0,deletes=0;
 const auto url="https://blanc-sync.bnfy-441.workers.dev/v1/blob/"+account+"/session";
 std::function<void(const network::ResourceRequest&)> intercept=[&](const auto&r){if(r.method=="DELETE"){++deletes;CHECK_EQ(r.url.spec(),url.substr(0,url.size()-8));factory.AddResponse(r.url.spec(),"",net::HTTP_NO_CONTENT);return;}CHECK_EQ(r.url.spec(),url);if(r.method=="GET"){++gets;CHECK_EQ(store->Read().state->quota.log.size(),static_cast<size_t>(gets));if(!hold_network)factory.AddResponse(url,"missing",net::HTTP_NOT_FOUND);}else{++puts;const auto upload=base::JSONReader::ReadDict(network::GetUploadData(r),base::JSON_PARSE_RFC);CHECK(upload);CHECK(upload->Find("ifVersion")->is_none());const auto*b=upload->FindDict("blob");CHECK(b);CHECK(Decrypt(*key,Envelope{*b->FindInt("v"),*b->FindString("iv"),*b->FindString("ct"),*b->FindString("tag")})=="{\"native\":true}");if(hold_put)factory.EraseResponse(r.url);else factory.AddResponse(url,"{}",net::HTTP_OK);}};
 factory.SetInterceptor(base::BindRepeating([](std::function<void(const network::ResourceRequest&)> fn,const network::ResourceRequest&r){fn(r);},intercept));
 AccountController::Hooks hooks;hooks.gate=[&]{return allowed?AccountController::Gate::kReady:AccountController::Gate::kServiceUnavailable;};
 auto engine=std::make_unique<ProfileEngine>(store,VaultContext{profile,{},true,false},std::make_shared<CredentialProviderHandle>(&provider,base::SequencedTaskRunner::GetCurrentDefault()),factory.GetSafeWeakWrapper()->Clone(),std::move(hooks));engine->account().SetTabStateReady(true);
 auto model=[&]{BlobModelHooks h;h.plan=[&](const auto&remote){CHECK(!remote);++plans;return BlobPlan{"{\"native\":true}",{}};};h.stored=[&]{++stored;};return h;};
 {base::RunLoop loop;engine->Sync("session",RequestClass::kFixed,false,AccountController::Role::kTabPublish,model(),[&](const auto&r){CHECK_EQ(r.error,"service-unavailable");loop.Quit();});loop.Run();CHECK_EQ(provider.calls,0);CHECK_EQ(gets,0);}
 allowed=true;
 {base::RunLoop loop;engine->Sync("session",RequestClass::kFixed,false,AccountController::Role::kTabPublish,model(),[&](const auto&r){CHECK(r.error.empty());CHECK(r.outcome=="stored");loop.Quit();});loop.Run();}
 CHECK_EQ(provider.calls,1);CHECK_EQ(plans,1);CHECK_EQ(puts,1);CHECK_EQ(stored,1);
 // Consent mutation drains a dispatched GET; it must prevent merge/PUT.
 hold_network=true;factory.ClearResponses();bool sync_done=false,consent_done=false;
 {base::RunLoop loop;auto finish=[&]{if(sync_done&&consent_done)loop.Quit();};engine->Sync("session",RequestClass::kFixed,false,AccountController::Role::kTabPublish,model(),[&](const auto&r){CHECK(r.error.starts_with("cancelled:"));sync_done=true;finish();});CHECK(factory.IsPending(url));engine->account().SetConsents(engine->account().Status().revision,false,false,[&](auto r){CHECK(r.ok);consent_done=true;finish();});factory.AddResponse(url,"missing",net::HTTP_NOT_FOUND);loop.Run();}
 CHECK_EQ(plans,1);CHECK_EQ(puts,1);CHECK_EQ(stored,1);CHECK_EQ(store->Read().state->quota.log.size(),2u);
 // Shutdown must await a pending credential query, then tolerate late provider reply.
 provider.hold=true;bool shutdown_reply=false;
 engine->Sync("settings",RequestClass::kFixed,false,AccountController::Role::kGeneral,model(),[&](const auto&r){CHECK_EQ(r.error,"cancelled:shutdown");shutdown_reply=true;});base::RunLoop().RunUntilIdle();CHECK(provider.pending);
 {base::RunLoop loop;engine->Shutdown([&](auto r){CHECK(r.ok);CHECK(shutdown_reply);loop.Quit();});loop.Run();}engine.reset();std::move(provider.pending).Run(encryptor);base::RunLoop().RunUntilIdle();
 CHECK_EQ(gets,2);CHECK_EQ(store->Read().state->quota.log.size(),2u);
 // Reopen the existing profile engine and hold an actual dispatched PUT.
 // The DELETE may start only after that PUT's transport completion settles.
 provider.hold=false;hold_network=false;hold_put=true;factory.ClearResponses();
 AccountController::Hooks next_hooks;next_hooks.gate=[]{return AccountController::Gate::kReady;};
 engine=std::make_unique<ProfileEngine>(store,VaultContext{profile,{},true,false},std::make_shared<CredentialProviderHandle>(&provider,base::SequencedTaskRunner::GetCurrentDefault()),factory.GetSafeWeakWrapper()->Clone(),std::move(next_hooks));
 sync_done=false;bool erased=false;
 {base::RunLoop loop;auto finish=[&]{if(sync_done&&erased)loop.Quit();};
  engine->Sync("session",RequestClass::kFixed,false,AccountController::Role::kGeneral,model(),[&](const auto&r){CHECK(r.error.starts_with("cancelled:"));sync_done=true;finish();});
  CHECK(factory.IsPending(url));CHECK_EQ(puts,2);
  engine->account().Disable(engine->account().Status().revision,true,[&](auto r){CHECK(r.ok);erased=true;finish();});
  base::RunLoop().RunUntilIdle();CHECK_EQ(deletes,0);CHECK(!erased);
  factory.AddResponse(url,"{}",net::HTTP_OK);loop.Run();
 }
 CHECK_EQ(deletes,1);CHECK_EQ(stored,1);CHECK(!store->Read().state->enabled);CHECK(store->Read().state->protected_key.empty());CHECK_EQ(store->Read().state->quota.log.size(),3u);
 {base::RunLoop loop;engine->Shutdown([&](auto r){CHECK(r.ok);loop.Quit();});loop.Run();}engine.reset();base::RunLoop().RunUntilIdle();
base::ThreadPoolInstance::Get()->FlushForTesting();base::ThreadPoolInstance::Get()->Shutdown();
 std::cout<<"composed profile engine provider/vault/queue/encrypted URLLoader policy, consent drain and shutdown checks passed; synthetic only\n";
}

#include "profile_engine.h"
#include "tab_pull_model.h"
#include "base/at_exit.h"
#include "base/check.h"
#include "base/command_line.h"
#include "base/feature_list.h"
#include "base/files/file.h"
#include "base/files/file_util.h"
#include "base/files/memory_mapped_file.h"
#include "base/functional/bind.h"
#include "base/i18n/icu_util.h"
#include "base/json/json_writer.h"
#include "base/location.h"
#include "base/run_loop.h"
#include "base/synchronization/waitable_event.h"
#include "base/task/single_thread_task_executor.h"
#include "base/task/thread_pool.h"
#include "base/task/thread_pool/thread_pool_instance.h"
#include "base/threading/thread_restrictions.h"
#include "components/os_crypt/async/common/algorithm.mojom.h"
#include "gin/array_buffer.h"
#include "gin/public/isolate_holder.h"
#include "gin/v8_initializer.h"
#include "mojo/core/embedder/embedder.h"
#include "net/http/http_status_code.h"
#include "services/network/public/cpp/resource_request.h"
#include "services/network/public/cpp/weak_wrapper_shared_url_loader_factory.h"
#include "services/network/test/test_url_loader_factory.h"
#include "v8/include/v8.h"
#include <cstdlib>
#include <iostream>
using namespace blanc::sync;using E=os_crypt_async::Encryptor;using Core=AccountController;
class FixtureEncryptor:public E{public:explicit FixtureEncryptor(KeyRing r):E(std::move(r),"v11"){} };
class Provider:public os_crypt_async::OSCryptAsync{public:explicit Provider(scoped_refptr<E> k):OSCryptAsync({}),key(std::move(k)){}scoped_refptr<E> key;int calls=0;void GetInstance(InitCallback done)override{++calls;std::move(done).Run(key);}};
auto Closure(std::function<void()> fn){return base::BindOnce([](std::function<void()> fn){fn();},std::move(fn));}
int main(int argc,char**argv){
 base::AtExitManager at_exit;base::CommandLine::Init(argc,argv);CHECK_EQ(argc,4);base::FeatureList::InitInstance("","");base::SingleThreadTaskExecutor executor(base::MessagePumpType::IO);base::ThreadPoolInstance::CreateAndStartWithDefaultParams("TabPullEngine");mojo::core::Init();
 const auto build=base::FilePath::FromUTF8Unsafe(argv[1]);base::File icu(build.AppendASCII("icudtl.dat"),base::File::FLAG_OPEN|base::File::FLAG_READ);CHECK(icu.IsValid());CHECK(base::i18n::InitializeICUWithFileDescriptor(icu.TakePlatformFile(),base::MemoryMappedFile::Region::kWholeFile));auto region=base::MemoryMappedFile::Region::kWholeFile;gin::V8Initializer::LoadV8SnapshotFromFile(base::File(build.AppendASCII("snapshot_blob.bin"),base::File::FLAG_OPEN|base::File::FLAG_READ),&region,gin::V8SnapshotFileType::kDefault);v8::V8::SetFlagsFromString("--jitless --optimize-for-size");gin::IsolateHolder::Initialize(gin::IsolateHolder::kNonStrictMode,gin::ArrayBufferAllocator::SharedInstance());
 const auto root=base::FilePath::FromUTF8Unsafe(argv[2]);CHECK(!base::PathExists(root));CHECK(base::CreateDirectory(root));const int mode=std::atoi(argv[3]);const std::string profile(64,'a'),account(64,'b'),wrong(64,'c');
 auto store=std::make_shared<ProfileStateStore>(root,profile,true,false);CHECK(store->Bootstrap(ProfileStateStore::BootstrapMode::kKnownFirstNativeSetup)==RequestLedger::Status::kLoaded);
 E::KeyRing ring;ring.emplace("v11",E::Key(std::vector<uint8_t>(32,7),os_crypt_async::mojom::Algorithm::kAES256GCM));auto encryptor=base::MakeRefCounted<FixtureEncryptor>(std::move(ring));std::array<uint8_t,32> bytes{};bytes.fill(55);auto key=ProtocolKey::Import(bytes);CHECK(key);KeyVault vault(encryptor,{profile,account,true,false});auto protected_key=vault.Protect(*key);CHECK(protected_key.status==KeyVault::Status::kOk);CHECK(store->Adopt(0,"Synthetic",account,protected_key.blob,false)==RequestLedger::Status::kLoaded);int revision=store->Read().state->identity_revision;
 Provider provider(encryptor);network::TestURLLoaderFactory factory;int gets=0,puts=0;const std::string url="https://blanc-sync.bnfy-441.workers.dev/v1/blob/"+account+"/session";const std::string remote=R"JSON({"devices":{"peer":{"updatedAt":20,"name":"device","tabs":[{"url":"https://peer.test","title":"\ud800"}]}}})JSON";
 auto encrypted=Encrypt(*key,remote);CHECK(encrypted);base::DictValue wire;wire.Set("v",encrypted->version);wire.Set("iv",encrypted->iv);wire.Set("ct",encrypted->ct);wire.Set("tag",encrypted->tag);base::DictValue body;body.Set("version","v1");body.Set("blob",std::move(wire));const auto response=*base::WriteJson(body);
 factory.SetInterceptor(base::BindRepeating([](int* gets,int* puts,network::TestURLLoaderFactory* factory,const std::string& url,const std::string& response,const network::ResourceRequest&r){CHECK_EQ(r.url.spec(),url);if(r.method=="GET"){++*gets;factory->AddResponse(url,response,net::HTTP_OK);}else{++*puts;CHECK(false);}},&gets,&puts,&factory,url,response));
 auto sequence=base::ThreadPool::CreateSingleThreadTaskRunner({base::MayBlock(),base::TaskPriority::USER_VISIBLE,base::TaskShutdownBehavior::BLOCK_SHUTDOWN});auto model=std::make_shared<draft::ModelRunner>(sequence);auto coordinator=std::make_shared<TabSyncCoordinator>(store,model);TabCacheStore cache(store);
 AccountController::Hooks hooks;hooks.gate=[]{return Core::Gate::kReady;};auto engine=std::make_unique<ProfileEngine>(store,VaultContext{profile,{},true,false},std::make_shared<CredentialProviderHandle>(&provider,base::SequencedTaskRunner::GetCurrentDefault()),factory.GetSafeWeakWrapper()->Clone(),std::move(hooks));
 auto plan=TabPullModel(coordinator,mode==2?wrong:account,revision,[]{return 20.;});base::RunLoop started,finished;bool entered=false,completed=false,engine_closed=false;auto actual=std::move(plan.plan_guarded_async);plan.plan_guarded_async=[&](std::optional<std::string> remote,BlobModelHooks::Guard guard,BlobModelHooks::Planned done){entered=true;actual(std::move(remote),std::move(guard),std::move(done));if(mode==1||mode==3)started.Quit();};
 base::WaitableEvent blocked,release;if(mode==1||mode==3){CHECK(sequence->PostTask(FROM_HERE,Closure([&]{base::ScopedAllowBaseSyncPrimitivesForTesting allow;blocked.Signal();release.Wait();})));blocked.Wait();}
 engine->Sync("session",RequestClass::kFixed,false,Core::Role::kGeneral,std::move(plan),[&](const auto&r){completed=true;if(mode==0){CHECK(r.error.empty());CHECK(r.outcome=="unchanged");}else if(mode==2)CHECK_EQ(r.error,"stale-identity");else CHECK(r.error.starts_with("cancelled:"));finished.Quit();});
 if(mode==1||mode==3){started.Run();CHECK(entered);if(mode==1)CHECK(store->SetErasurePending(revision,true)==RequestLedger::Status::kLoaded);else{base::RunLoop shutdown;engine->Shutdown([&](auto r){CHECK(r.ok);shutdown.Quit();});shutdown.Run();engine.reset();engine_closed=true;}release.Signal();}if(!completed)finished.Run();CHECK_EQ(gets,1);CHECK_EQ(puts,0);CHECK_EQ(provider.calls,1);
 if(mode==0){auto loaded=cache.Read(revision,account);CHECK(loaded.raw_json);CHECK(loaded.raw_json->find("https://peer.test")!=std::string::npos);CHECK(loaded.raw_json->find("\\ud800")!=std::string::npos);}else CHECK(!base::PathExists(root.AppendASCII("Blanc Sync/tabs-cache.json")));
 if(!engine_closed){base::RunLoop shutdown;engine->Shutdown([&](auto r){CHECK(r.ok);shutdown.Quit();});shutdown.Run();engine.reset();}coordinator->Shutdown();coordinator.reset();{base::RunLoop loop;model->Shutdown(loop.QuitClosure());loop.Run();}model.reset();if(mode==3)CHECK(!base::PathExists(root.AppendASCII("Blanc Sync/tabs-cache.json")));base::ThreadPoolInstance::Get()->FlushForTesting();base::ThreadPoolInstance::Get()->Shutdown();std::cout<<"authenticated fake-server tab pull scenario "<<mode<<" passed\n";
}

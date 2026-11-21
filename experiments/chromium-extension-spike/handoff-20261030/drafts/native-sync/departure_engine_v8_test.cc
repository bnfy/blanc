#include "profile_engine.h"
#include "v8-model-draft/departure_adapter.h"
#include "base/feature_list.h"
#include "base/files/file.h"
#include "base/files/memory_mapped_file.h"
#include "base/i18n/icu_util.h"
#include "base/task/thread_pool.h"
#include "gin/array_buffer.h"
#include "gin/public/isolate_holder.h"
#include "gin/v8_initializer.h"
#include "v8/include/v8.h"
#include "base/json/json_reader.h"
#include "services/network/test/test_utils.h"
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
 base::AtExitManager at_exit;base::CommandLine::Init(argc,argv);CHECK_EQ(argc,4);base::FeatureList::InitInstance("","");base::SingleThreadTaskExecutor executor(base::MessagePumpType::IO);base::ThreadPoolInstance::CreateAndStartWithDefaultParams("DepartureEngine");mojo::core::Init();
 const auto build=base::FilePath::FromUTF8Unsafe(argv[3]);base::File icu(build.AppendASCII("icudtl.dat"),base::File::FLAG_OPEN|base::File::FLAG_READ);CHECK(icu.IsValid());CHECK(base::i18n::InitializeICUWithFileDescriptor(icu.TakePlatformFile(),base::MemoryMappedFile::Region::kWholeFile));auto region=base::MemoryMappedFile::Region::kWholeFile;gin::V8Initializer::LoadV8SnapshotFromFile(base::File(build.AppendASCII("snapshot_blob.bin"),base::File::FLAG_OPEN|base::File::FLAG_READ),&region,gin::V8SnapshotFileType::kDefault);v8::V8::SetFlagsFromString("--jitless --optimize-for-size");gin::IsolateHolder::Initialize(gin::IsolateHolder::kNonStrictMode,gin::ArrayBufferAllocator::SharedInstance());
 auto thread=base::ThreadPool::CreateSingleThreadTaskRunner({base::MayBlock(),base::TaskPriority::USER_VISIBLE,base::TaskShutdownBehavior::BLOCK_SHUTDOWN});auto model_runner=std::make_shared<blanc::sync::draft::ModelRunner>(thread);
 const auto root=base::FilePath::FromUTF8Unsafe(argv[1]);CHECK(!base::PathExists(root));CHECK(base::CreateDirectory(root));const int mode=std::atoi(argv[2]);const std::string profile(64,'a'),account(64,'b');
 auto store=std::make_shared<ProfileStateStore>(root,profile,true,false);CHECK(store->Bootstrap(ProfileStateStore::BootstrapMode::kKnownFirstNativeSetup)==RequestLedger::Status::kLoaded);
 E::KeyRing ring;ring.emplace("v11",E::Key(std::vector<uint8_t>(32,7),os_crypt_async::mojom::Algorithm::kAES256GCM));auto encryptor=base::MakeRefCounted<FixtureEncryptor>(std::move(ring));
 std::array<uint8_t,32> bytes{};bytes.fill(55);auto key=ProtocolKey::Import(bytes);CHECK(key);KeyVault vault(encryptor,{profile,account,true,false});auto protected_key=vault.Protect(*key);CHECK(protected_key.status==KeyVault::Status::kOk);
 CHECK(store->Adopt(store->Read().state->identity_revision,"Synthetic",account,protected_key.blob,false)==RequestLedger::Status::kLoaded);
 CHECK(store->SetErasurePending(store->Read().state->identity_revision,true)==RequestLedger::Status::kLoaded);
 Provider provider(mode==2?nullptr:encryptor);provider.hold=mode==1;network::TestURLLoaderFactory factory;std::vector<std::string> operations;int plans=0;const auto own=store->Read().state->device_id;const auto remote="{\"devices\":{\""+own+"\":{\"secret\":true},\"peer\":{\"future\":\"\\ud800\"}}}";const auto expected="{\"devices\":{\""+own+"\":{\"retracted\":true,\"updatedAt\":2000},\"peer\":{\"future\":\"\\ud800\"}}}";
 const std::string endpoint="https://blanc-sync.bnfy-441.workers.dev/v1/blob/"+account+"/";
 std::function<void(const network::ResourceRequest&)> intercept=[&](const auto&r){CHECK(r.url.spec().starts_with(endpoint));operations.push_back(r.method+" "+r.url.spec().substr(endpoint.size()));factory.ClearResponses();if(r.method=="GET"){
  auto blob=Encrypt(*key,remote);CHECK(blob);base::DictValue wire;wire.Set("v",blob->version);wire.Set("iv",blob->iv);wire.Set("ct",blob->ct);wire.Set("tag",blob->tag);base::DictValue body;body.Set("version","v1");body.Set("blob",std::move(wire));factory.AddResponse(r.url.spec(),*base::WriteJson(body),net::HTTP_OK);
 }else{CHECK_EQ(r.method,"PUT");auto body=base::JSONReader::ReadDict(network::GetUploadData(r),base::JSON_PARSE_RFC);CHECK(body);const auto*b=body->FindDict("blob");CHECK(b);auto clear=Decrypt(*key,Envelope{*b->FindInt("v"),*b->FindString("iv"),*b->FindString("ct"),*b->FindString("tag")});CHECK(clear);CHECK_EQ(*clear,expected);++plans;factory.AddResponse(r.url.spec(),"{}",net::HTTP_OK);}};
 factory.SetInterceptor(base::BindRepeating([](std::function<void(const network::ResourceRequest&)> fn,const network::ResourceRequest&r){fn(r);},intercept));
 AccountController::Hooks hooks;hooks.gate=[]{return AccountController::Gate::kServiceUnavailable;};
 ProfileEngine::DepartureFactory models=[&](std::string name,std::string device){CHECK(name=="sends"||name=="closed"||name=="session");CHECK_EQ(device,store->Read().state->device_id);return blanc::sync::draft::DepartureModel(model_runner,device,[]{return 2000.;});};
 auto engine=std::make_unique<ProfileEngine>(store,VaultContext{profile,{},true,false},std::make_shared<CredentialProviderHandle>(&provider,base::SequencedTaskRunner::GetCurrentDefault()),factory.GetSafeWeakWrapper()->Clone(),std::move(hooks),std::move(models));
 bool disabled=false;Core::Result result{};
 base::RunLoop loop;engine->account().Disable(engine->account().Status().revision,false,[&](auto r){result=r;disabled=true;loop.Quit();});
 if(mode==1){base::RunLoop().RunUntilIdle();CHECK(provider.pending);CHECK(!disabled);base::RunLoop shutdown;engine->Shutdown([&](auto r){CHECK(r.ok);shutdown.Quit();});shutdown.Run();CHECK(disabled);CHECK_EQ(result.error,"shutdown");engine.reset();std::move(provider.pending).Run(encryptor);base::RunLoop().RunUntilIdle();CHECK(operations.empty());CHECK(store->Read().state->enabled);}
 else{if(!disabled)loop.Run();CHECK(result.ok);CHECK(!store->Read().state->enabled);CHECK_EQ(provider.calls,3);if(mode==0){CHECK_EQ(plans,3);CHECK((operations==std::vector<std::string>{"GET sends","PUT sends","GET closed","PUT closed","GET session","PUT session"}));CHECK_EQ(store->Read().state->quota.log.size(),3u);}else{CHECK_EQ(plans,0);CHECK(operations.empty());CHECK(store->Read().state->quota.log.empty());}base::RunLoop shutdown;engine->Shutdown([&](auto r){CHECK(r.ok);shutdown.Quit();});shutdown.Run();engine.reset();}
 {base::RunLoop stop;model_runner->Shutdown(stop.QuitClosure());stop.Run();}model_runner.reset();base::RunLoop().RunUntilIdle();base::ThreadPoolInstance::Get()->FlushForTesting();base::ThreadPoolInstance::Get()->Shutdown();std::cout<<"departure engine scenario "<<mode<<" passed\n";
}

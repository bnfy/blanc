#include "account_controller.h"
#include "base/at_exit.h"
#include "base/base64.h"
#include "base/check.h"
#include "base/command_line.h"
#include "base/files/file_util.h"
#include "base/functional/bind.h"
#include "base/json/json_reader.h"
#include "base/json/json_writer.h"
#include "base/run_loop.h"
#include "base/task/single_thread_task_executor.h"
#include "base/task/thread_pool/thread_pool_instance.h"
#include "mojo/core/embedder/embedder.h"
#include "net/http/http_status_code.h"
#include "services/network/public/cpp/resource_request.h"
#include "services/network/public/cpp/weak_wrapper_shared_url_loader_factory.h"
#include "services/network/test/test_url_loader_factory.h"
#include "services/network/test/test_utils.h"
#include <iostream>
using namespace blanc::sync;
using Core=AccountController;
int main(int argc,char**argv){
 base::AtExitManager at_exit;base::CommandLine::Init(argc,argv);CHECK_EQ(argc,3);
 base::SingleThreadTaskExecutor executor(base::MessagePumpType::IO);
 base::ThreadPoolInstance::CreateAndStartWithDefaultParams("DepartureController");mojo::core::Init();
 const auto root=base::FilePath::FromUTF8Unsafe(argv[1]);CHECK(!base::PathExists(root));CHECK(base::CreateDirectory(root));
 const int mode=std::atoi(argv[2]);const std::string profile(64,'a'),account(64,'b');
 auto store=std::make_shared<ProfileStateStore>(root,profile,true,false);
 CHECK(store->Bootstrap(ProfileStateStore::BootstrapMode::kKnownFirstNativeSetup)==RequestLedger::Status::kLoaded);
 CHECK(store->Adopt(store->Read().state->identity_revision,"Synthetic",account,base::Base64Encode("v10SYNTHETIC"),false)==RequestLedger::Status::kLoaded);
 std::array<uint8_t,32> bytes{};bytes.fill(27);auto k=ProtocolKey::Import(bytes);CHECK(k);auto key=std::make_shared<ProtocolKey>(std::move(*k));
 network::TestURLLoaderFactory factory;auto transport=std::make_shared<BlobTransport>(factory.GetSafeWeakWrapper());
 std::vector<std::string> operations;int plans=0,prepare=0,stored=0;bool hold_publish=mode==0;
 const std::string endpoint="https://blanc-sync.bnfy-441.workers.dev/v1/blob/"+account+"/";
 std::function<void(const network::ResourceRequest&)> intercept=[&](const network::ResourceRequest&r){
  const std::string path=r.url.spec().substr(endpoint.size());CHECK(r.url.spec().starts_with(endpoint));operations.push_back(r.method+" "+path);
  factory.ClearResponses();
  if(r.method=="GET"){
   if(mode==0&&operations.size()==1){factory.AddResponse(r.url.spec(),"missing",net::HTTP_NOT_FOUND);return;}
   auto blob=Encrypt(*key,"{\"devices\":{\"self\":{}}}");CHECK(blob);
   base::DictValue wire;wire.Set("v",blob->version);wire.Set("iv",blob->iv);wire.Set("ct",blob->ct);wire.Set("tag",blob->tag);
   base::DictValue body;body.Set("version","v1");body.Set("blob",std::move(wire));factory.AddResponse(r.url.spec(),*base::WriteJson(body),net::HTTP_OK);
  }else{CHECK_EQ(r.method,"PUT");if(hold_publish){hold_publish=false;return;}factory.AddResponse(r.url.spec(),"{}",net::HTTP_OK);}
 };
 factory.SetInterceptor(base::BindRepeating([](std::function<void(const network::ResourceRequest&)> fn,const network::ResourceRequest& r){fn(r);},intercept));
 bool gate=true;std::function<void(std::optional<Core::DepartureMaterial>)> held;
 Core::Hooks hooks;hooks.gate=[&]{return gate?Core::Gate::kReady:Core::Gate::kKeyUnavailable;};
 hooks.cancel=[transport]{transport->Cancel();};
 hooks.prepare_departure=[&](std::string name,std::string a,int rev,auto done){
  ++prepare;CHECK_EQ(a,account);CHECK_EQ(rev,store->Read().state->identity_revision);
  if(mode==2){held=done;return;}
  Core::DepartureMaterial material;material.transport=transport;material.key=key;material.key_account=mode==1?std::string(64,'c'):account;
  material.model.plan=[&,name](const auto&remote){CHECK(remote);++plans;return BlobPlan{"{\"retracted\":true}",{}};};
  material.model.stored=[&]{++stored;};done(material);done(material);
 };
 auto core=std::make_unique<Core>(store,ProfileStateStore::BootstrapMode::kExistingOnly,base::SequencedTaskRunner::GetCurrentDefault(),std::move(hooks));
 bool initial_done=false,disabled=false;Core::Result disable_result{};base::RunLoop* waiting=nullptr;
 if(mode==0){
  BlobModelHooks publish;publish.plan=[](const auto&){return BlobPlan{"{\"publish\":true}",{}};};
  core->EnqueueBlob(core->Status().revision,transport,key,account,"session",RequestClass::kFixed,false,Core::Role::kGeneral,std::move(publish),[&](const auto& r){CHECK(r.error.starts_with("cancelled:"));initial_done=true;});
  base::RunLoop().RunUntilIdle();CHECK(factory.IsPending(endpoint+"session"));CHECK_EQ(operations.size(),2u);
 }
 gate=false;
 core->Disable(core->Status().revision,false,[&](auto r){disable_result=r;disabled=true;if(waiting)waiting->Quit();});
 base::RunLoop().RunUntilIdle();
 if(mode==0){CHECK_EQ(prepare,0);CHECK(!disabled);factory.AddResponse(endpoint+"session","{}",net::HTTP_OK);}
 if(mode==2){CHECK(held);CHECK(!disabled);base::RunLoop loop;core->Shutdown([&](auto r){CHECK(r.ok);loop.Quit();});loop.Run();CHECK(disabled);CHECK_EQ(disable_result.error,"shutdown");core.reset();held(std::nullopt);base::RunLoop().RunUntilIdle();CHECK(operations.empty());}
 else{
  base::RunLoop loop;waiting=&loop;if(!disabled)loop.Run();waiting=nullptr;
  CHECK(disable_result.ok);CHECK(!store->Read().state->enabled);CHECK(store->Read().state->protected_key.empty());CHECK_EQ(stored,0);
  if(mode==0){CHECK(initial_done);CHECK_EQ(prepare,3);CHECK_EQ(plans,3);CHECK((operations==std::vector<std::string>{"GET session","PUT session","GET sends","PUT sends","GET closed","PUT closed","GET session","PUT session"}));CHECK_EQ(store->Read().state->quota.log.size(),4u);}
  if(mode==1){CHECK_EQ(prepare,3);CHECK_EQ(plans,0);CHECK(operations.empty());CHECK(store->Read().state->quota.log.empty());}
  base::RunLoop stop;core->Shutdown([&](auto r){CHECK(r.ok);stop.Quit();});stop.Run();core.reset();
 }
 transport.reset();base::RunLoop().RunUntilIdle();base::ThreadPoolInstance::Get()->FlushForTesting();base::ThreadPoolInstance::Get()->Shutdown();std::cout<<"departure controller scenario "<<mode<<" passed\n";
}

#include "account_controller.h"
#include "blob_exchange.h"
#include "base/at_exit.h"
#include "base/base64.h"
#include "base/check.h"
#include "base/command_line.h"
#include "base/files/file_util.h"
#include "base/functional/bind.h"
#include "base/json/json_writer.h"
#include "base/run_loop.h"
#include "base/task/single_thread_task_executor.h"
#include "base/task/thread_pool/thread_pool_instance.h"
#include "base/values.h"
#include "mojo/core/embedder/embedder.h"
#include "net/http/http_status_code.h"
#include "services/network/public/cpp/resource_request.h"
#include "services/network/public/cpp/weak_wrapper_shared_url_loader_factory.h"
#include "services/network/test/test_url_loader_factory.h"
#include <iostream>
using namespace blanc::sync;
using Core=AccountController;using Queue=RequestWorker::Queue;
int main(int argc,char** argv) {
 base::AtExitManager at_exit;base::CommandLine::Init(argc,argv);CHECK_EQ(argc,2);
 base::SingleThreadTaskExecutor executor(base::MessagePumpType::IO);
 base::ThreadPoolInstance::CreateAndStartWithDefaultParams("BlobControllerCheck");mojo::core::Init();
 const auto root=base::FilePath::FromUTF8Unsafe(argv[1]);CHECK(root.IsAbsolute());CHECK(!base::PathExists(root));CHECK(base::CreateDirectory(root));
 const auto runner=base::SequencedTaskRunner::GetCurrentDefault();
 const std::string account(64,'a'),binding(64,'b');
 auto store=std::make_shared<ProfileStateStore>(root,binding,true,false);
 network::TestURLLoaderFactory factory;
 auto transport=std::make_shared<BlobTransport>(factory.GetSafeWeakWrapper());
 Core::Gate gate=Core::Gate::kReady;Core::Hooks hooks;hooks.gate=[&]{return gate;};hooks.cancel=[&]{transport->Cancel();};
 auto core=std::make_unique<Core>(store,ProfileStateStore::BootstrapMode::kKnownFirstNativeSetup,runner,hooks);
 auto command=[&](std::function<void(Core::Completed)> run){Core::Result result;base::RunLoop loop;run([&](auto v){result=v;loop.Quit();});loop.Run();CHECK(result.ok);};
 command([&](auto done){core->AdoptPrepared(core->Status().revision,"Synthetic",account,base::Base64Encode("v10SYNTHETIC-TEST-ONLY"),false,done);});
 command([&](auto done){core->SetConsents(core->Status().revision,true,false,done);});core->SetTabStateReady(true);
 std::array<uint8_t,32> raw{};raw.fill(9);auto imported=ProtocolKey::Import(raw);CHECK(imported);auto key=std::make_shared<ProtocolKey>(std::move(*imported));
 int gets=0,puts=0,plans=0,stored=0;bool hold=true;
 auto blob=Encrypt(*key,"{\"remote\":true}");CHECK(blob);
 base::DictValue envelope;envelope.Set("v",blob->version);envelope.Set("iv",blob->iv);envelope.Set("ct",blob->ct);envelope.Set("tag",blob->tag);
 base::DictValue response;response.Set("version","revision-1");response.Set("blob",std::move(envelope));const auto server=*base::WriteJson(response);
 const auto url="https://blanc-sync.bnfy-441.workers.dev/v1/blob/"+account+"/session";
 std::function<void(const network::ResourceRequest&)> intercept=[&](const auto& r){
   CHECK_EQ(r.url.spec(),url);
   if(r.method=="GET"){++gets;CHECK_EQ(store->Read().state->quota.log.size(),static_cast<size_t>(gets));if(!hold)factory.AddResponse(url,server,net::HTTP_OK);}
   else{++puts;CHECK_EQ(r.method,"PUT");factory.AddResponse(url,"{}",net::HTTP_OK);}
 };
 factory.SetInterceptor(base::BindRepeating([](std::function<void(const network::ResourceRequest&)> fn,const network::ResourceRequest& r){fn(r);},intercept));
 auto model=[&]{BlobModelHooks m;m.plan=[&](const auto& clear){++plans;CHECK(clear && *clear=="{\"remote\":true}");return BlobPlan{"{\"local\":true}",{}};};m.stored=[&]{++stored;};return m;};
 Queue::Result mismatch;{base::RunLoop loop;core->EnqueueBlob(core->Status().revision,transport,key,std::string(64,'c'),"session",RequestClass::kFixed,false,Core::Role::kTabPublish,model(),[&](const auto& r){mismatch=r;loop.Quit();});loop.Run();}
 CHECK_EQ(mismatch.error,"key-account-mismatch");CHECK_EQ(gets,0);CHECK(store->Read().state->quota.log.empty());
 const int stale_revision=core->Status().revision;
 command([&](auto done){core->SetConsents(core->Status().revision,true,true,done);});
 {base::RunLoop loop;core->EnqueueBlob(stale_revision,transport,key,account,"session",RequestClass::kFixed,false,Core::Role::kTabPublish,model(),[&](const auto& r){CHECK_EQ(r.error,"stale-credential-session");loop.Quit();});loop.Run();}
 CHECK_EQ(gets,0);CHECK(store->Read().state->quota.log.empty());
 Queue::Result cancelled;{base::RunLoop loop;core->EnqueueBlob(core->Status().revision,transport,key,account,"session",RequestClass::kFixed,false,Core::Role::kTabPublish,model(),[&](const auto& r){cancelled=r;loop.Quit();});CHECK(factory.IsPending(url));gate=Core::Gate::kKeyUnavailable;factory.AddResponse(url,server,net::HTTP_OK);loop.Run();}
 CHECK(cancelled.error.starts_with("cancelled:"));CHECK_EQ(plans,0);CHECK_EQ(puts,0);CHECK_EQ(stored,0);
 gate=Core::Gate::kReady;hold=false;factory.ClearResponses();
 {base::RunLoop loop;core->EnqueueBlob(core->Status().revision,transport,key,account,"session",RequestClass::kFixed,false,Core::Role::kTabPublish,model(),[&](const auto& r){CHECK(r.error.empty());CHECK(r.outcome=="stored");loop.Quit();});loop.Run();}
 CHECK_EQ(plans,1);CHECK_EQ(puts,1);CHECK_EQ(stored,1);CHECK_EQ(store->Read().state->quota.log.size(),2u);
 hold=true;factory.ClearResponses();std::function<std::string()> final_guard;
 auto request=MakeBlobExchange(transport,key,account,"session",account,RequestClass::kFixed,false,model());
 auto bind=request.bind_cancellation;request.bind_cancellation=[&](auto guard){final_guard=guard;bind(std::move(guard));};
 bool retired=false;core->Enqueue(std::move(request),Core::Role::kTabPublish,[&](const auto& r){CHECK(r.error.starts_with("cancelled:"));retired=true;});CHECK(factory.IsPending(url));CHECK(final_guard);
 command([&](auto done){core->Shutdown(done);});core.reset();base::RunLoop().RunUntilIdle();CHECK(retired);CHECK_EQ(final_guard(),"shutdown");
 core=std::make_unique<Core>(store,ProfileStateStore::BootstrapMode::kExistingOnly,runner,hooks);CHECK(core->Status().enabled);CHECK_EQ(store->Read().state->quota.log.size(),3u);
 command([&](auto done){core->Shutdown(done);});core.reset();transport.reset();base::RunLoop().RunUntilIdle();
 base::ThreadPoolInstance::Get()->FlushForTesting();base::ThreadPoolInstance::Get()->Shutdown();
 std::cout<<"persisted controller/encrypted URLLoader key binding, dispatch guards, shutdown lifetime and restart quota passed; synthetic profile only\n";
}

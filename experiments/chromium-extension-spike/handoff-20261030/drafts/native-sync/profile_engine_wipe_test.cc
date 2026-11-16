#include "profile_engine.h"
#include "base/at_exit.h"
#include "base/base64.h"
#include "base/check.h"
#include "base/command_line.h"
#include "base/files/file_util.h"
#include "base/functional/bind.h"
#include "base/run_loop.h"
#include "base/task/single_thread_task_executor.h"
#include "base/task/thread_pool/thread_pool_instance.h"
#include "mojo/core/embedder/embedder.h"
#include "net/base/net_errors.h"
#include "net/http/http_status_code.h"
#include "services/network/public/cpp/resource_request.h"
#include "services/network/public/cpp/url_loader_completion_status.h"
#include "services/network/public/cpp/weak_wrapper_shared_url_loader_factory.h"
#include "services/network/test/test_url_loader_factory.h"
#include "services/network/test/test_utils.h"
#include <iostream>
using namespace blanc::sync;
class NoKeyLookup:public os_crypt_async::OSCryptAsync{public:NoKeyLookup():OSCryptAsync({}){}void GetInstance(InitCallback)override{CHECK(false);}};
int main(int argc,char**argv){
 base::AtExitManager at_exit;base::CommandLine::Init(argc,argv);CHECK_EQ(argc,2);base::SingleThreadTaskExecutor executor(base::MessagePumpType::IO);base::ThreadPoolInstance::CreateAndStartWithDefaultParams("ProfileWipeCheck");mojo::core::Init();
 const auto root=base::FilePath::FromUTF8Unsafe(argv[1]);CHECK(root.IsAbsolute());CHECK(!base::PathExists(root));CHECK(base::CreateDirectory(root));const std::string profile(64,'a'),account(64,'b');
 for(int mode=0;mode<8;++mode){
  const auto profile_root=root.AppendASCII(std::to_string(mode));CHECK(base::CreateDirectory(profile_root));
  auto store=std::make_shared<ProfileStateStore>(profile_root,profile,true,false);CHECK(store->Bootstrap(ProfileStateStore::BootstrapMode::kKnownFirstNativeSetup)==RequestLedger::Status::kLoaded);
  const auto protected_key=base::Base64Encode("v10SYNTHETIC-CANNOT-DECRYPT");CHECK(store->Adopt(store->Read().state->identity_revision,"Synthetic",account,protected_key,false)==RequestLedger::Status::kLoaded);const auto before=*store->Read().state;
  NoKeyLookup crypto;network::TestURLLoaderFactory factory;int requests=0;
  const auto url="https://blanc-sync.bnfy-441.workers.dev/v1/blob/"+account;
  factory.SetInterceptor(base::BindRepeating([](int* count,const network::ResourceRequest&r){++*count;CHECK_EQ(r.method,"DELETE");CHECK(r.url.path().ends_with(std::string(64,'b')));CHECK(!r.request_body);},base::Unretained(&requests)));
  if(mode<5)factory.AddResponse(url,mode==2?"{\"error\":\"quota erasure pending\"}":"failed",mode==0?net::HTTP_NOT_FOUND:mode==1?net::HTTP_TOO_MANY_REQUESTS:mode==2||mode==3?net::HTTP_SERVICE_UNAVAILABLE:net::HTTP_NO_CONTENT);
  if(mode==5)factory.AddResponse(GURL(url),network::CreateURLResponseHead(net::HTTP_OK),"",network::URLLoaderCompletionStatus(net::ERR_CONNECTION_RESET));
  AccountController::Hooks hooks;hooks.gate=[]{return AccountController::Gate::kServiceUnavailable;}; // Publication denied; erasure remains available.
  auto clone=mode==7?std::unique_ptr<network::PendingSharedURLLoaderFactory>():factory.GetSafeWeakWrapper()->Clone();
  auto engine=std::make_unique<ProfileEngine>(store,VaultContext{profile,{},true,mode==6},std::make_shared<CredentialProviderHandle>(&crypto,base::SequencedTaskRunner::GetCurrentDefault()),std::move(clone),std::move(hooks));
  AccountController::Result result;{base::RunLoop loop;engine->account().Disable(engine->account().Status().revision,true,[&](auto r){result=r;loop.Quit();});loop.Run();}
  const auto after=*store->Read().state;
  if(mode==4){CHECK(result.ok);CHECK(!after.enabled);CHECK(after.account_id.empty());CHECK(after.protected_key.empty());CHECK_EQ(requests,1);}
  else{CHECK(!result.ok);CHECK(after.enabled);CHECK_EQ(after.account_id,before.account_id);CHECK_EQ(after.protected_key,before.protected_key);CHECK_EQ(after.device_id,before.device_id);CHECK_EQ(requests,mode>=6?0:1);}
  if(mode==0)CHECK_EQ(result.error,"wipe-failed:404");
  if(mode==1)CHECK_EQ(result.error,"rate-limited");
  if(mode==2){CHECK_EQ(result.error,"erasure-pending");CHECK(after.erasure_pending);}
  if(mode==3)CHECK_EQ(result.error,"wipe-failed:503");
  if(mode==5)CHECK_EQ(result.error,"wipe-offline");
  CHECK(after.quota.log.empty());
  {base::RunLoop loop;engine->Shutdown([&](auto r){CHECK(r.ok);loop.Quit();});loop.Run();}engine.reset();
 }
 base::RunLoop().RunUntilIdle();base::ThreadPoolInstance::Get()->FlushForTesting();base::ThreadPoolInstance::Get()->Shutdown();std::cout<<"actual URLLoader account erase outcomes, no-key operation, private/missing transport and credential retention passed; fake server only\n";
}

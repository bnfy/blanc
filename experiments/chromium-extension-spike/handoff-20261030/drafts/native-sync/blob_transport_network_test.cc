#include "blob_transport.h"
#include "base/at_exit.h"
#include "base/check.h"
#include "base/command_line.h"
#include "base/functional/bind.h"
#include "base/run_loop.h"
#include "base/task/single_thread_task_executor.h"
#include "base/task/thread_pool/thread_pool_instance.h"
#include "mojo/core/embedder/embedder.h"
#include "net/base/load_flags.h"
#include "net/base/net_errors.h"
#include "net/http/http_response_headers.h"
#include "net/http/http_status_code.h"
#include "services/network/public/cpp/resource_request.h"
#include "services/network/public/cpp/weak_wrapper_shared_url_loader_factory.h"
#include "services/network/public/cpp/url_loader_completion_status.h"
#include "services/network/public/mojom/url_response_head.mojom.h"
#include "services/network/test/test_url_loader_factory.h"
#include "services/network/test/test_utils.h"
#include <iostream>
using T = blanc::sync::BlobTransport;
T::Completed Reply(T::Response* result, base::RunLoop* loop) {
 return base::BindOnce([](T::Response* result, base::RunLoop* loop,T::Response v) {
   *result=std::move(v); loop->Quit();
 },base::Unretained(result),base::Unretained(loop));
}
T::Response Read(T& transport,T::Request request) {
 T::Response result; base::RunLoop loop;
 transport.Start(std::move(request),Reply(&result,&loop));loop.Run();return result;
}
int main(int argc,char** argv) {
 base::AtExitManager at_exit; base::CommandLine::Init(argc,argv);
 base::SingleThreadTaskExecutor executor(base::MessagePumpType::IO);
 base::ThreadPoolInstance::CreateAndStartWithDefaultParams("BlobTransportCheck");
 mojo::core::Init();
 {
  network::TestURLLoaderFactory factory;
  T transport(factory.GetSafeWeakWrapper());
  int seen=0;
  factory.SetInterceptor(base::BindRepeating([](int* seen,const network::ResourceRequest& r){
   ++*seen; CHECK(r.url.SchemeIs("https"));
   CHECK_EQ(r.url.host(),"blanc-sync.bnfy-441.workers.dev");
   CHECK(r.credentials_mode==network::mojom::CredentialsMode::kOmit);
   CHECK(r.redirect_mode==network::mojom::RedirectMode::kError);
   CHECK(r.load_flags & net::LOAD_DISABLE_CACHE);
  },base::Unretained(&seen)));
  const std::string account(64,'a'), other(64,'b'), space="space-"+std::string(32,'c');
  const auto url="https://blanc-sync.bnfy-441.workers.dev/v1/blob/"+account+"/session";
  for(int status:{200,409,429,503}) {
   factory.AddResponse(url,"response",static_cast<net::HttpStatusCode>(status));
   auto r=Read(transport,{T::Method::kGet,account,"session",{}});
   CHECK_EQ(r.status,status);CHECK_EQ(r.net_error,net::OK);CHECK_EQ(r.body,"response");
  }
  CHECK_EQ(seen,4); // No hidden retries, including409/429.
  auto blocked=Read(transport,{T::Method::kDeleteSpace,account,space,{}});
  CHECK_EQ(blocked.error,"space-delete-unsupported");CHECK_EQ(seen,4);
  auto head=network::mojom::URLResponseHead::New();
  constexpr char headers[]="HTTP/1.1 200 OK\0X-Blanc-Space-Delete: 1\0\0";
  head->headers=base::MakeRefCounted<net::HttpResponseHeaders>(std::string_view(headers,sizeof(headers)-1));
  factory.AddResponse(GURL(url),std::move(head),"{}",network::URLLoaderCompletionStatus(net::OK));
  CHECK(Read(transport,{T::Method::kGet,account,"session",{}}).space_delete_supported);
  const auto space_url="https://blanc-sync.bnfy-441.workers.dev/v1/blob/"+account+"/"+space;
  factory.AddResponse(space_url,"",net::HTTP_OK);
  CHECK_EQ(Read(transport,{T::Method::kDeleteSpace,account,space,{}}).status,200);
  transport.Cancel();
  CHECK_EQ(Read(transport,{T::Method::kDeleteSpace,account,space,{}}).error,"space-delete-unsupported");
  const auto other_url="https://blanc-sync.bnfy-441.workers.dev/v1/blob/"+other+"/session";
  factory.AddResponse(other_url,"other",net::HTTP_OK);
  CHECK_EQ(Read(transport,{T::Method::kGet,other,"session",{}}).body,"other");
  CHECK_EQ(Read(transport,{T::Method::kDeleteSpace,account,space,{}}).error,"space-delete-unsupported");
  // Exercise the real SimpleURLLoader body bound through a Mojo data pipe.
  factory.AddResponse(url,std::string(1024*1024+1,'x'),net::HTTP_OK);
  const auto oversized=Read(transport,{T::Method::kGet,account,"session",{}});
  CHECK_EQ(oversized.error,"network-or-body-limit");CHECK(oversized.body.empty());
  factory.AddResponse(GURL(url),network::CreateURLResponseHead(net::HTTP_OK),"",
      network::URLLoaderCompletionStatus(net::ERR_CONNECTION_RESET));
  const auto offline=Read(transport,{T::Method::kGet,account,"session",{}});
  CHECK_EQ(offline.net_error,net::ERR_CONNECTION_RESET);CHECK(offline.body.empty());
  net::RedirectInfo redirect;redirect.status_code=302;
  redirect.new_url=GURL("https://example.invalid/collect");redirect.new_method="GET";
  network::TestURLLoaderFactory::Redirects redirects;
  redirects.emplace_back(redirect,network::CreateURLResponseHead(net::HTTP_FOUND));
  factory.AddResponse(GURL(url),network::CreateURLResponseHead(net::HTTP_OK),"",
      network::URLLoaderCompletionStatus(net::OK),std::move(redirects),
      network::TestURLLoaderFactory::kResponseOnlyRedirectsNoDestination);
  const auto redirected=Read(transport,{T::Method::kGet,account,"session",{}});
  CHECK_EQ(redirected.error,"redirect-refused");CHECK_EQ(redirected.net_error,net::ERR_UNSAFE_REDIRECT);
  factory.ClearResponses();
  T::Response cancelled; base::RunLoop loop;
  transport.Start({T::Method::kGet,account,"session",{}},Reply(&cancelled,&loop));
  const auto requests_before_busy=factory.total_requests();
  CHECK_EQ(Read(transport,{T::Method::kGet,account,"session",{}}).error,"busy");
  CHECK_EQ(factory.total_requests(),requests_before_busy);
  transport.Cancel();loop.Run();CHECK_EQ(cancelled.error,"cancelled");CHECK_EQ(cancelled.net_error,net::ERR_ABORTED);
 }
 base::RunLoop().RunUntilIdle();
 base::ThreadPoolInstance::Get()->FlushForTesting();
 base::ThreadPoolInstance::Get()->Shutdown();
 std::cout<<"fake URLLoader HTTP/no-retry/privacy/body-bound/offline/redirect/busy/cancel/Space capability checks passed; no live network\n";
}

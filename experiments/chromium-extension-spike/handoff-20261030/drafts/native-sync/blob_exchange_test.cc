#include "blob_exchange.h"
#include "base/at_exit.h"
#include "base/check.h"
#include "base/command_line.h"
#include "base/functional/bind.h"
#include "base/json/json_reader.h"
#include "base/json/json_writer.h"
#include "base/location.h"
#include "base/run_loop.h"
#include "base/task/single_thread_task_executor.h"
#include "base/task/thread_pool/thread_pool_instance.h"
#include "base/time/time.h"
#include "base/values.h"
#include "mojo/core/embedder/embedder.h"
#include "net/http/http_status_code.h"
#include "services/network/public/cpp/resource_request.h"
#include "services/network/public/cpp/weak_wrapper_shared_url_loader_factory.h"
#include "services/network/test/test_url_loader_factory.h"
#include "services/network/test/test_utils.h"
#include <cstdlib>
#include <iostream>
using namespace blanc::sync;
using Queue=RequestWorker::Queue;
struct Scenario {
 network::TestURLLoaderFactory factory;
 std::shared_ptr<const ProtocolKey> key;
 std::shared_ptr<BlobTransport> transport;
 int mode,gets=0,puts=0,plans=0,stored=0,persists=0,prior=0;
 bool cancelled=false;
 SchedulerState saved;
 explicit Scenario(std::shared_ptr<const ProtocolKey> key,int mode):key(std::move(key)),mode(mode) {
  transport=std::make_shared<BlobTransport>(factory.GetSafeWeakWrapper());
  factory.SetInterceptor(base::BindRepeating([](Scenario* self,const network::ResourceRequest& request){self->Request(request);},base::Unretained(this)));
 }
 void Request(const network::ResourceRequest& request) {
  if(request.method=="GET") {
   ++gets;CHECK_EQ(saved.log.size(),static_cast<size_t>(prior+gets));CHECK_GT(persists,0);
   if(mode==12)return;  // Hold the actual loader open until its deadline.
   if(mode==6){factory.AddResponse(request.url.spec(),"{\"error\":\"quota erasure pending\"}",net::HTTP_SERVICE_UNAVAILABLE);return;}
   if(mode==1){factory.AddResponse(request.url.spec(),"limited",net::HTTP_TOO_MANY_REQUESTS);return;}
   if(mode==4 || mode==9){factory.AddResponse(request.url.spec(),"unknown store",net::HTTP_NOT_FOUND);return;}
   auto encrypted=Encrypt(*key,"{\"server\":true}");CHECK(encrypted);
   base::DictValue blob;blob.Set("v",encrypted->version);blob.Set("iv",encrypted->iv);blob.Set("ct",encrypted->ct);blob.Set("tag",mode==2?"bad":encrypted->tag);
   base::DictValue body;body.Set("version","version-"+std::to_string(gets));body.Set("blob",std::move(blob));
   factory.AddResponse(request.url.spec(),*base::WriteJson(body),net::HTTP_OK);
  }else{
   CHECK_EQ(request.method,"PUT");++puts;
   const auto wire=network::GetUploadData(request);CHECK(wire.find("canary")==std::string::npos);
   const auto body=base::JSONReader::ReadDict(wire,base::JSON_PARSE_RFC);CHECK(body);
   CHECK_EQ(*body->FindString("ifVersion"),"version-"+std::to_string(gets));
   const auto* b=body->FindDict("blob");CHECK(b);
   auto clear=Decrypt(*key,Envelope{*b->FindInt("v"),*b->FindString("iv"),*b->FindString("ct"),*b->FindString("tag")});
   CHECK(clear && *clear=="{\"local\":\"canary\"}");
   if(mode==13){factory.ClearResponses();return;}  // Hold the upload until its deadline.
   factory.AddResponse(request.url.spec(),"{}",mode==7?net::HTTP_INSUFFICIENT_STORAGE:(mode==5||mode==8||mode==10||puts==1)?net::HTTP_CONFLICT:net::HTTP_OK);
  }
 }
 void Run() {
  double now=1000;
  SchedulerState initial;
  prior=mode==10?9:mode==11?10:0;
  initial.log.assign(prior,now);
  auto scheduler=std::make_shared<RequestScheduler>([&]{return now;},[&]{return now;},10,60000,initial);
  const auto runner=base::SequencedTaskRunner::GetCurrentDefault();
  auto post=[runner](Queue::Task task){CHECK(runner->PostTask(FROM_HERE,base::BindOnce([](Queue::Task task){task();},std::move(task))));};
  auto queue=Queue::Create(scheduler,[&](const SchedulerState& state)->std::optional<std::string>{saved=state;++persists;return {};},post,
    [](double,Queue::Task){CHECK(false);},[]{},[&]{return now;});CHECK(queue);
  BlobModelHooks hooks;
  hooks.cancelled=[&]{return cancelled?"generation":std::string();};
  hooks.plan=[&](const std::optional<std::string>& remote){++plans;CHECK(remote && *remote=="{\"server\":true}");if(mode==3)cancelled=true;return BlobPlan{"{\"local\":\"canary\"}",{}};};
  hooks.stored=[&]{++stored;};
  auto request=MakeBlobExchange(transport,key,std::string(64,'a'),"session","native-generation",RequestClass::kFixed,true,std::move(hooks),
      mode>=8?BlobExchangeMode::kDeparture:BlobExchangeMode::kNormal);
  CHECK_EQ(request.immediate_only,mode>=8);
  Queue::Result result;base::RunLoop loop;const auto started=base::TimeTicks::Now();
  queue->Enqueue(std::move(request),[&](const Queue::Result& r){result=r;loop.Quit();});loop.Run();
  if(mode==0){CHECK(result.error.empty());CHECK(result.outcome=="stored");CHECK_EQ(gets,2);CHECK_EQ(puts,2);CHECK_EQ(plans,2);CHECK_EQ(stored,1);CHECK_EQ(saved.log.size(),2u);}
  if(mode==1){CHECK_EQ(result.error,"rate-limited");CHECK_EQ(puts,0);CHECK_EQ(plans,0);CHECK(saved.backoff_until);}
  if(mode==2){CHECK_EQ(result.error,"bad-passphrase");CHECK_EQ(puts,0);CHECK_EQ(plans,0);}
  if(mode==3){CHECK(result.error.starts_with("cancelled:"));CHECK_EQ(puts,0);CHECK_EQ(stored,0);}
  if(mode==4){CHECK(result.error.empty());CHECK(result.outcome=="unavailable");CHECK_EQ(plans,0);CHECK_EQ(puts,0);}
  if(mode==5){CHECK_EQ(result.error,"conflict");CHECK_EQ(gets,4);CHECK_EQ(puts,4);CHECK_EQ(stored,0);CHECK_EQ(saved.log.size(),4u);}
  if(mode==6){CHECK_EQ(result.error,"erasure-pending");CHECK_EQ(puts,0);CHECK_EQ(plans,0);}
  if(mode==7){CHECK_EQ(result.error,"account-quota");CHECK_EQ(puts,1);CHECK_EQ(stored,0);}
  if(mode==8){CHECK_EQ(result.error,"conflict");CHECK_EQ(gets,2);CHECK_EQ(puts,2);CHECK_EQ(stored,0);CHECK_EQ(saved.log.size(),2u);}
  if(mode==9){CHECK(result.error.empty());CHECK(result.outcome=="unchanged");CHECK_EQ(gets,1);CHECK_EQ(plans,0);CHECK_EQ(puts,0);}
  if(mode==10){CHECK_EQ(result.error,"request-budget-unavailable");CHECK_EQ(gets,1);CHECK_EQ(puts,1);CHECK_EQ(saved.log.size(),10u);}
  if(mode==11){CHECK_EQ(result.error,"request-budget-unavailable");CHECK_EQ(gets,0);CHECK_EQ(puts,0);CHECK_EQ(persists,0);}
  if(mode==12){CHECK_EQ(result.error,"offline");CHECK_EQ(gets,1);CHECK_EQ(puts,0);CHECK_GE((base::TimeTicks::Now()-started).InMilliseconds(),4500);CHECK_LT((base::TimeTicks::Now()-started).InSeconds(),15);}
  if(mode==13){CHECK_EQ(result.error,"offline");CHECK_EQ(gets,1);CHECK_EQ(puts,1);CHECK_GE((base::TimeTicks::Now()-started).InMilliseconds(),4500);CHECK_LT((base::TimeTicks::Now()-started).InSeconds(),15);}
  transport->Cancel();queue.reset();
 }
};
int main(int argc,char** argv){
 base::AtExitManager at_exit;base::CommandLine::Init(argc,argv);
 base::SingleThreadTaskExecutor executor(base::MessagePumpType::IO);
 base::ThreadPoolInstance::CreateAndStartWithDefaultParams("BlobExchangeCheck");mojo::core::Init();
 std::array<uint8_t,32> bytes{};bytes.fill(42);auto imported=ProtocolKey::Import(bytes);CHECK(imported);
 auto key=std::make_shared<ProtocolKey>(std::move(*imported));
 const int first=argc>1?std::atoi(argv[1]):8;
 const int end=argc>2?std::atoi(argv[2]):14;
 for(int mode=first;mode<end;++mode){Scenario scenario(key,mode);scenario.Run();}
 base::RunLoop().RunUntilIdle();base::ThreadPoolInstance::Get()->FlushForTesting();base::ThreadPoolInstance::Get()->Shutdown();
 std::cout<<"selected encrypted exchange scenarios passed; no live network\n";
}

#include "departure_adapter.h"
#include "base/at_exit.h"
#include "base/check.h"
#include "base/check_op.h"
#include "base/command_line.h"
#include "base/feature_list.h"
#include "base/files/file.h"
#include "base/files/memory_mapped_file.h"
#include "base/functional/bind.h"
#include "base/i18n/icu_util.h"
#include "base/json/json_reader.h"
#include "base/json/json_writer.h"
#include "base/location.h"
#include "base/run_loop.h"
#include "base/synchronization/waitable_event.h"
#include "base/task/single_thread_task_executor.h"
#include "base/task/thread_pool.h"
#include "base/task/thread_pool/thread_pool_instance.h"
#include "base/threading/thread_restrictions.h"
#include "base/values.h"
#include "gin/array_buffer.h"
#include "gin/public/isolate_holder.h"
#include "gin/v8_initializer.h"
#include "mojo/core/embedder/embedder.h"
#include "net/http/http_status_code.h"
#include "services/network/public/cpp/resource_request.h"
#include "services/network/public/cpp/weak_wrapper_shared_url_loader_factory.h"
#include "services/network/test/test_url_loader_factory.h"
#include "services/network/test/test_utils.h"
#include "v8/include/v8.h"
#include <iostream>
using namespace blanc::sync;using M=blanc::sync::draft::ModelRunner;using Q=RequestWorker::Queue;
auto Task(std::function<void()> fn){return base::BindOnce([](std::function<void()> fn){fn();},std::move(fn));}
int main(int argc,char**argv){
 base::AtExitManager at_exit;base::CommandLine::Init(argc,argv);CHECK_EQ(argc,2);base::FeatureList::InitInstance("","");base::SingleThreadTaskExecutor executor(base::MessagePumpType::IO);base::ThreadPoolInstance::CreateAndStartWithDefaultParams("AsyncExchangeCheck");mojo::core::Init();
 const auto build=base::FilePath::FromUTF8Unsafe(argv[1]);base::File icu(build.AppendASCII("icudtl.dat"),base::File::FLAG_OPEN|base::File::FLAG_READ);CHECK(icu.IsValid());CHECK(base::i18n::InitializeICUWithFileDescriptor(icu.TakePlatformFile(),base::MemoryMappedFile::Region::kWholeFile));auto region=base::MemoryMappedFile::Region::kWholeFile;gin::V8Initializer::LoadV8SnapshotFromFile(base::File(build.AppendASCII("snapshot_blob.bin"),base::File::FLAG_OPEN|base::File::FLAG_READ),&region,gin::V8SnapshotFileType::kDefault);v8::V8::SetFlagsFromString("--jitless --optimize-for-size");gin::IsolateHolder::Initialize(gin::IsolateHolder::kNonStrictMode,gin::ArrayBufferAllocator::SharedInstance());
 auto model_thread=base::ThreadPool::CreateSingleThreadTaskRunner({base::MayBlock(),base::TaskPriority::USER_VISIBLE,base::TaskShutdownBehavior::BLOCK_SHUTDOWN});auto model=std::make_shared<M>(model_thread);
 {base::RunLoop loop;model->Run(M::Method::kJsonRoundTrip,"{}",base::BindOnce([](base::RunLoop* loop,M::Result r){CHECK(r.error.empty());loop->Quit();},base::Unretained(&loop)));loop.Run();}
 std::array<uint8_t,32> bytes{};bytes.fill(17);auto imported=ProtocolKey::Import(bytes);CHECK(imported);auto key=std::make_shared<ProtocolKey>(std::move(*imported));
 const std::string account(64,'a'),own="550e8400-e29b-41d4-a716-446655440000";
 const std::string remote="{\"devices\":{\""+own+"\":{\"tabs\":[\"old-secret\"]},\"peer\":{\"future\":\"\\ud800\",\"counter\":1e400}}}";
 const std::string expected="{\"devices\":{\""+own+"\":{\"retracted\":true,\"updatedAt\":2000},\"peer\":{\"future\":\"\\ud800\",\"counter\":null}}}";
 for(int mode=0;mode<10;++mode){
  network::TestURLLoaderFactory factory;auto transport=std::make_shared<BlobTransport>(factory.GetSafeWeakWrapper());int gets=0,puts=0,stored=0,guarded_effects=0;bool cancelled=false,dispatch_cancelled=false;double now=1000;SchedulerState saved;
  const auto payload=mode==1?"{broken":mode==2?"{\"devices\":{}}":mode==4?"null,\"ownId\":\"attacker\"":remote;
  auto encrypted=Encrypt(*key,payload);CHECK(encrypted);base::DictValue blob;blob.Set("v",encrypted->version);blob.Set("iv",encrypted->iv);blob.Set("ct",encrypted->ct);blob.Set("tag",encrypted->tag);base::DictValue body;body.Set("version","version-1");body.Set("blob",std::move(blob));const auto response=*base::WriteJson(body);
  const auto url="https://blanc-sync.bnfy-441.workers.dev/v1/blob/"+account+"/session";
  std::function<void(const network::ResourceRequest&)> intercept=[&](const auto&r){CHECK_EQ(r.url.spec(),url);if(r.method=="GET"){++gets;CHECK_EQ(saved.log.size(),1u);factory.AddResponse(url,response,net::HTTP_OK);}else{++puts;CHECK(mode==0||mode==5||mode==6);CHECK_EQ(r.method,"PUT");auto upload=base::JSONReader::ReadDict(network::GetUploadData(r),base::JSON_PARSE_RFC);CHECK(upload);CHECK_EQ(*upload->FindString("ifVersion"),"version-1");const auto*b=upload->FindDict("blob");CHECK(b);auto clear=Decrypt(*key,Envelope{*b->FindInt("v"),*b->FindString("iv"),*b->FindString("ct"),*b->FindString("tag")});CHECK(clear);CHECK_EQ(*clear,expected);CHECK(clear->find("old-secret")==std::string::npos);CHECK(clear->find("\xef\xbf\xbd")==std::string::npos);factory.AddResponse(url,"{}",net::HTTP_OK);}};
  factory.SetInterceptor(base::BindRepeating([](std::function<void(const network::ResourceRequest&)> fn,const network::ResourceRequest&r){fn(r);},intercept));
  const auto owner=base::SequencedTaskRunner::GetCurrentDefault();auto scheduler=std::make_shared<RequestScheduler>([&]{return now;},[&]{return now;});
  auto q=Q::Create(scheduler,[&](const SchedulerState&s)->std::optional<std::string>{saved=s;return {};},[owner](Q::Task t){CHECK(owner->PostTask(FROM_HERE,Task(std::move(t))));},[](double,Q::Task){CHECK(false);},[]{},[&]{return now;});CHECK(q);
  auto hooks=blanc::sync::draft::DepartureModel(model,own,[]{return 2000.;});hooks.cancelled=[&]{return cancelled?"generation":std::string();};hooks.stored=[&]{CHECK(owner->RunsTasksInCurrentSequence());++stored;};
  if(mode>=6){auto planner=std::move(hooks.plan_async);hooks.plan_guarded_async=[&,planner](std::optional<std::string> raw,BlobModelHooks::Guard guard,BlobModelHooks::Planned done){CHECK(guard);CHECK(guard().empty());planner(std::move(raw),base::BindOnce([](BlobModelHooks::Guard guard,int* effects,BlobModelHooks::Planned done,BlobPlan plan){if(guard().empty())++*effects;std::move(done).Run(std::move(plan));},std::move(guard),&guarded_effects,std::move(done)));};if(mode==8)hooks.cancelled={};if(mode==9)hooks.plan=[](const auto&){return BlobPlan{};};}
  if(mode==5){
   auto planner=std::move(hooks.plan_async);
   hooks.plan_async=[planner,model_thread](std::optional<std::string> raw,BlobModelHooks::Planned done){
    planner(std::move(raw),base::BindOnce([](scoped_refptr<base::SingleThreadTaskRunner> target,BlobModelHooks::Planned done,BlobPlan plan){
     CHECK(target->PostTask(FROM_HERE,base::BindOnce([](BlobModelHooks::Planned done,BlobPlan plan){std::move(done).Run(std::move(plan));},std::move(done),std::move(plan))));
    },model_thread,std::move(done)));
   };
  }
  base::WaitableEvent blocked,release;base::RunLoop planning,finished;bool planned=false;
  if(mode==3||mode==7){CHECK(model_thread->PostTask(FROM_HERE,Task([&]{base::ScopedAllowBaseSyncPrimitivesForTesting allow;blocked.Signal();release.Wait();})));blocked.Wait();if(mode==3){auto async=std::move(hooks.plan_async);hooks.plan_async=[&,async](std::optional<std::string> raw,BlobModelHooks::Planned done){async(std::move(raw),std::move(done));planned=true;planning.Quit();};}else{auto async=std::move(hooks.plan_guarded_async);hooks.plan_guarded_async=[&,async](std::optional<std::string> raw,BlobModelHooks::Guard guard,BlobModelHooks::Planned done){async(std::move(raw),std::move(guard),std::move(done));planned=true;planning.Quit();};}}
  Q::Result result;auto request=MakeBlobExchange(transport,key,account,"session",account,RequestClass::kFixed,false,std::move(hooks));if(mode==6||mode==7){auto original=request.cancelled;request.cancelled=[&,original]{return dispatch_cancelled?std::string("dispatch-generation"):original();};}q->Enqueue(std::move(request),[&](const auto&r){result=r;finished.Quit();});
  if(mode==3||mode==7){planning.Run();CHECK(planned);if(mode==3)cancelled=true;else dispatch_cancelled=true;release.Signal();}
  finished.Run();CHECK_EQ(gets,mode>=8?0:1);CHECK_EQ(saved.log.size(),1u);
  if(mode==0||mode==5||mode==6){CHECK(result.error.empty());CHECK(result.outcome=="stored");CHECK_EQ(puts,1);CHECK_EQ(stored,1);if(mode==6)CHECK_EQ(guarded_effects,1);}
  if(mode==1||mode==4){CHECK_EQ(result.error,"bad-passphrase");CHECK_EQ(puts,0);CHECK_EQ(stored,0);}
  if(mode==2){CHECK(result.error.empty());CHECK(result.outcome=="unchanged");CHECK_EQ(puts,0);}
  if(mode==3){CHECK(result.error.starts_with("cancelled:"));CHECK_EQ(puts,0);CHECK_EQ(stored,0);}
  if(mode==7){CHECK_EQ(result.error,"cancelled:dispatch-generation");CHECK_EQ(puts,0);CHECK_EQ(stored,0);CHECK_EQ(guarded_effects,0);}
  if(mode>=8){CHECK_EQ(result.error,"service-unavailable");CHECK_EQ(puts,0);CHECK_EQ(stored,0);CHECK_EQ(guarded_effects,0);}
  transport->Cancel();q.reset();
 }
 {base::RunLoop loop;model->Shutdown(loop.QuitClosure());loop.Run();}model.reset();base::ThreadPoolInstance::Get()->FlushForTesting();base::ThreadPoolInstance::Get()->Shutdown();
 std::cout<<"encrypted async V8 exchange and final dispatch guard: ten fake-server scenarios passed\n";
}

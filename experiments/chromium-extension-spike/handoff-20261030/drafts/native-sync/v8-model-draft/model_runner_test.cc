#include "model_runner.h"
#include "base/at_exit.h"
#include "base/check.h"
#include "base/check_op.h"
#include "base/command_line.h"
#include "base/feature_list.h"
#include "base/files/file.h"
#include "base/files/memory_mapped_file.h"
#include "base/functional/bind.h"
#include "base/json/json_writer.h"
#include "base/i18n/icu_util.h"
#include "base/location.h"
#include "base/run_loop.h"
#include "base/synchronization/waitable_event.h"
#include "base/task/single_thread_task_executor.h"
#include "base/task/thread_pool.h"
#include "base/threading/thread_restrictions.h"
#include "base/task/thread_pool/thread_pool_instance.h"
#include "base/values.h"
#include "gin/array_buffer.h"
#include "gin/public/isolate_holder.h"
#include "gin/v8_initializer.h"
#include "v8/include/v8.h"
#include <iostream>
using R=blanc::sync::draft::ModelRunner;
auto Callback(std::function<void(R::Result)> fn){return base::BindOnce([](std::function<void(R::Result)> fn,R::Result r){fn(std::move(r));},std::move(fn));}
auto Closure(std::function<void()> fn){return base::BindOnce([](std::function<void()> fn){fn();},std::move(fn));}
int main(int argc,char**argv){
 base::AtExitManager at_exit;base::CommandLine::Init(argc,argv);CHECK_EQ(argc,2);base::FeatureList::InitInstance("","");base::SingleThreadTaskExecutor executor(base::MessagePumpType::IO);base::ThreadPoolInstance::CreateAndStartWithDefaultParams("ModelRunnerCheck");
 auto model_sequence=base::ThreadPool::CreateSingleThreadTaskRunner({base::MayBlock(),base::TaskPriority::USER_VISIBLE,base::TaskShutdownBehavior::BLOCK_SHUTDOWN});const auto owner=base::SequencedTaskRunner::GetCurrentDefault();
 auto runner=std::make_unique<R>(model_sequence);
 auto run=[&](R::Method method,std::string input){R::Result result;base::RunLoop loop;runner->Run(method,std::move(input),Callback([&](auto r){CHECK(owner->RunsTasksInCurrentSequence());result=std::move(r);loop.Quit();}));loop.Run();return result;};
 CHECK_EQ(run(R::Method::kJsonRoundTrip,"{}").error,"runtime-unavailable");CHECK(!gin::IsolateHolder::Initialized());
 {base::RunLoop loop;runner->Shutdown(loop.QuitClosure());loop.Run();}runner.reset();
 const auto out=base::FilePath::FromUTF8Unsafe(argv[1]);base::File icu(out.AppendASCII("icudtl.dat"),base::File::FLAG_OPEN|base::File::FLAG_READ);CHECK(icu.IsValid());CHECK(base::i18n::InitializeICUWithFileDescriptor(icu.TakePlatformFile(),base::MemoryMappedFile::Region::kWholeFile));auto region=base::MemoryMappedFile::Region::kWholeFile;gin::V8Initializer::LoadV8SnapshotFromFile(base::File(out.AppendASCII("snapshot_blob.bin"),base::File::FLAG_OPEN|base::File::FLAG_READ),&region,gin::V8SnapshotFileType::kDefault);
 // Only the diagnostic process startup chooses flags; ModelRunner never does.
 v8::V8::SetFlagsFromString("--jitless --optimize-for-size");gin::IsolateHolder::Initialize(gin::IsolateHolder::kNonStrictMode,gin::ArrayBufferAllocator::SharedInstance());
 runner=std::make_unique<R>(model_sequence);
 for(const std::string input:{"\"\\ud800\"","\"\\udfff\"","{\"\\ud800\":1,\"\\ud801\":2}","\"globalThis.injected=true\""}){const auto r=run(R::Method::kJsonRoundTrip,input);CHECK(r.error.empty());CHECK_EQ(r.json,input);}
 CHECK_EQ(run(R::Method::kJsonRoundTrip,"1e400").json,"null");CHECK_EQ(run(R::Method::kJsonRoundTrip,"-0").json,"0");
 CHECK_EQ(run(R::Method::kJsonRoundTrip,"[1e20,1e21,9007199254740993]").json,"[100000000000000000000,1e+21,9007199254740992]");
 CHECK_EQ(run(R::Method::kJsonRoundTrip,"{broken").error,"invalid-json");CHECK_EQ(run(R::Method::kJsonRoundTrip,"/*comment*/{}").error,"invalid-json");CHECK_EQ(run(R::Method::kJsonRoundTrip,std::string(1024*1024+1,'x')).error,"input-too-large");CHECK_EQ(run(static_cast<R::Method>(99),"{}").error,"invalid-method");
 const auto sanitized=run(R::Method::kSanitizeEntry,"{\"updatedAt\":1,\"name\":\"\\ud800\",\"tabs\":[],\"groups\":[]}");CHECK(sanitized.error.empty());CHECK(sanitized.json.find("\\ud800")!=std::string::npos);
 const std::string own="550e8400-e29b-41d4-a716-446655440000";
 auto merge=[&](std::string local,std::string remote,double now){base::DictValue args;args.Set("ownId",own);args.Set("now",now);args.Set("localJson",std::move(local));args.Set("remoteJson",std::move(remote));auto json=base::WriteJson(args);CHECK(json);return run(R::Method::kMergeDevices,*json);};
 const auto merged=merge(R"JSON({"550e8400-e29b-41d4-a716-446655440000":{"updatedAt":3000000000,"name":"own","tabs":[{"url":"https://a.test","title":"one"}]},"peer":{"updatedAt":3000000000,"name":"peer","tabs":[{"url":"https://peer.test"}]},"old":{"updatedAt":1,"name":"stale"}})JSON",R"JSON({"550e8400-e29b-41d4-a716-446655440000":{"updatedAt":3000000000,"retracted":true},"peer":{"updatedAt":3000000000,"retracted":true},"new":{"updatedAt":3000000000,"name":"\ud800","tabs":[{"url":"file:///x"},{"url":"https://b.test","title":"ok"}]}})JSON",3000000000);
 CHECK(merged.error.empty());CHECK_EQ(merged.json,R"JSON({"550e8400-e29b-41d4-a716-446655440000":{"name":"own","platform":"","updatedAt":3000000000,"tabs":[{"url":"https://a.test","title":"one","groupId":null,"pinned":false}],"groups":[]},"peer":{"retracted":true,"updatedAt":3000000000},"new":{"name":"\ud800","platform":"","updatedAt":3000000000,"tabs":[{"url":"https://b.test","title":"ok","groupId":null,"pinned":false}],"groups":[]}})JSON");
 CHECK_EQ(merge(R"JSON({"peer":{"updatedAt":20,"name":"z"}})JSON",R"JSON({"peer":{"updatedAt":20,"name":"a"}})JSON",20).json,R"JSON({"peer":{"name":"a","platform":"","updatedAt":20,"tabs":[],"groups":[]}})JSON");
 CHECK_EQ(merge("null","null",20).json,"{}");CHECK_EQ(merge("{}","{broken",20).error,"model-error");CHECK_EQ(merge("{}",R"JSON({"peer":{}} , "now":1)JSON",20).error,"model-error");CHECK_EQ(merge("[]","{}",20).error,"model-error");CHECK_EQ(run(R::Method::kMergeDevices,R"JSON({"ownId":"not-a-uuid","now":1,"localJson":"{}","remoteJson":"{}"})JSON").error,"model-error");
 const std::string account(64,'a'),other(64,'b');
 auto bound_merge=[&](std::string cache,std::string remote,std::string account_id){base::DictValue args;args.Set("accountId",account_id);args.Set("ownId",own);args.Set("now",20);args.Set("cacheJson",std::move(cache));args.Set("remoteJson",std::move(remote));auto json=base::WriteJson(args);CHECK(json);return run(R::Method::kMergeBoundDevices,*json);};
 const std::string cache="{\"accountId\":\""+account+"\",\"devices\":{\"peer\":{\"updatedAt\":20,\"name\":\"cached\"}},\"sharedMembership\":{\"member\":true}}";
 const auto same=bound_merge(cache,"{}",account);CHECK(same.error.empty());CHECK_EQ(same.json,"{\"accountId\":\""+account+"\",\"devices\":{\"peer\":{\"name\":\"cached\",\"platform\":\"\",\"updatedAt\":20,\"tabs\":[],\"groups\":[]}},\"sharedMembership\":{\"member\":true}}");
 const auto changed=bound_merge(cache,R"JSON({"fresh":{"updatedAt":20,"name":"new"}})JSON",other);CHECK(changed.error.empty());CHECK_EQ(changed.json,"{\"accountId\":\""+other+"\",\"devices\":{\"fresh\":{\"name\":\"new\",\"platform\":\"\",\"updatedAt\":20,\"tabs\":[],\"groups\":[]}}}");
 CHECK_EQ(bound_merge(cache,"{}","bad-account").error,"model-error");CHECK_EQ(bound_merge(cache,"{bad",account).error,"model-error");CHECK_EQ(bound_merge("{bad","{}",account).error,"model-error");CHECK_EQ(bound_merge("{\"accountId\":\""+account+"\",\"devices\":[]}","{}",account).error,"model-error");
 const auto absent=bound_merge("{}","null",account);CHECK(absent.error.empty());CHECK_EQ(absent.json,"{\"accountId\":\""+account+"\",\"devices\":{}}");
 const std::string request="{\"ownId\":\""+own+"\",\"now\":2000,\"remote\":{\"ignored\":true,\"devices\":{\""+own+"\":{\"tabs\":[\"owner-secret\"]},\"peer\":{\"future\":\"\\ud800\"}}}}";
 const auto departure=run(R::Method::kDeparture,request);CHECK(departure.error.empty());CHECK(departure.json.find("owner-secret")==std::string::npos);CHECK(departure.json.find("ignored")==std::string::npos);CHECK(departure.json.find("\\ud800")!=std::string::npos);CHECK(departure.json.find("\"retracted\":true,\"updatedAt\":2000")!=std::string::npos);
 CHECK_EQ(run(R::Method::kDeparture,"{\"ownId\":\""+own+"\",\"now\":2000,\"remote\":{\"devices\":{}}}").json,"null");
 // Wait until a result is posted but not delivered, then retire its owner.
 bool redacted=false;base::WaitableEvent executed;
 runner->Run(R::Method::kJsonRoundTrip,"{\"oldAccount\":true}",Callback([&](auto r){CHECK_EQ(r.error,"shutdown");CHECK(r.json.empty());redacted=true;}));CHECK(model_sequence->PostTask(FROM_HERE,Closure([&]{executed.Signal();})));executed.Wait();
 {base::RunLoop loop;runner->Shutdown(Closure([&]{CHECK(redacted);loop.Quit();}));loop.Run();}runner.reset();
 // Requests accepted before shutdown but still queued must not execute. Both
 // first and repeated shutdown completions wait behind isolate disposal.
 runner=std::make_unique<R>(model_sequence);CHECK(run(R::Method::kJsonRoundTrip,"{}").error.empty());base::WaitableEvent blocked,release;
 CHECK(model_sequence->PostTask(FROM_HERE,Closure([&]{base::ScopedAllowBaseSyncPrimitivesForTesting allow;blocked.Signal();release.Wait();})));blocked.Wait();bool cancelled=false;int shutdowns=0;
 runner->Run(R::Method::kJsonRoundTrip,"{\"privateData\":true}",Callback([&](auto r){CHECK_EQ(r.error,"shutdown");CHECK(r.json.empty());cancelled=true;}));
 {base::RunLoop loop;auto done=[&]{CHECK(cancelled);if(++shutdowns==2)loop.Quit();};runner->Shutdown(Closure(done));runner->Shutdown(Closure(done));release.Signal();loop.Run();}runner.reset();
 base::ThreadPoolInstance::Get()->FlushForTesting();base::ThreadPoolInstance::Get()->Shutdown();std::cout<<"owned V8 runner JSON/Unicode/numbers/released sanitizer/departure/thread/shutdown checks passed; no app integration\n";
}

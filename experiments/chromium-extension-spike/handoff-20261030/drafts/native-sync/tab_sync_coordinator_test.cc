#include "tab_sync_coordinator.h"
#include "base/at_exit.h"
#include "base/base64.h"
#include "base/check.h"
#include "base/command_line.h"
#include "base/feature_list.h"
#include "base/files/file.h"
#include "base/files/file_util.h"
#include "base/files/memory_mapped_file.h"
#include "base/functional/bind.h"
#include "base/i18n/icu_util.h"
#include "base/location.h"
#include "base/run_loop.h"
#include "base/synchronization/waitable_event.h"
#include "base/task/single_thread_task_executor.h"
#include "base/task/thread_pool.h"
#include "base/task/thread_pool/thread_pool_instance.h"
#include "base/threading/thread_restrictions.h"
#include "gin/array_buffer.h"
#include "gin/public/isolate_holder.h"
#include "gin/v8_initializer.h"
#include "v8/include/v8.h"
#include <iostream>
using namespace blanc::sync;
using Result=TabSyncCoordinator::Result;
auto Callback(std::function<void(Result)> fn){return base::BindOnce([](std::function<void(Result)> fn,Result r){fn(r);},std::move(fn));}
auto Closure(std::function<void()> fn){return base::BindOnce([](std::function<void()> fn){fn();},std::move(fn));}
int main(int argc,char** argv){
 base::AtExitManager at_exit;base::CommandLine::Init(argc,argv);CHECK_EQ(argc,3);base::FeatureList::InitInstance("","");base::SingleThreadTaskExecutor executor(base::MessagePumpType::IO);base::ThreadPoolInstance::CreateAndStartWithDefaultParams("TabCoordinatorCheck");
 const auto out=base::FilePath::FromUTF8Unsafe(argv[1]);base::File icu(out.AppendASCII("icudtl.dat"),base::File::FLAG_OPEN|base::File::FLAG_READ);CHECK(icu.IsValid());CHECK(base::i18n::InitializeICUWithFileDescriptor(icu.TakePlatformFile(),base::MemoryMappedFile::Region::kWholeFile));auto region=base::MemoryMappedFile::Region::kWholeFile;gin::V8Initializer::LoadV8SnapshotFromFile(base::File(out.AppendASCII("snapshot_blob.bin"),base::File::FLAG_OPEN|base::File::FLAG_READ),&region,gin::V8SnapshotFileType::kDefault);
 v8::V8::SetFlagsFromString("--jitless --optimize-for-size");gin::IsolateHolder::Initialize(gin::IsolateHolder::kNonStrictMode,gin::ArrayBufferAllocator::SharedInstance());
 const auto root=base::FilePath::FromUTF8Unsafe(argv[2]);CHECK(!base::PathExists(root));CHECK(base::CreateDirectory(root));const std::string profile(64,'a'),a(64,'b'),b(64,'c');
 auto state=std::make_shared<ProfileStateStore>(root,profile,true,false);CHECK(state->Bootstrap(ProfileStateStore::BootstrapMode::kKnownFirstNativeSetup)==RequestLedger::Status::kLoaded);const auto blob=base::Base64Encode("v10SYNTHETIC-TEST");CHECK(state->Adopt(0,"Account A",a,blob,false)==RequestLedger::Status::kLoaded);int rev=state->Read().state->identity_revision;
 auto sequence=base::ThreadPool::CreateSingleThreadTaskRunner({base::MayBlock(),base::TaskPriority::USER_VISIBLE,base::TaskShutdownBehavior::BLOCK_SHUTDOWN});auto model=std::make_shared<draft::ModelRunner>(sequence);auto coordinator=std::make_unique<TabSyncCoordinator>(state,model);TabCacheStore cache(state);
 const auto allowed=[] {return std::string();};
 const std::string remote=R"JSON({"peer":{"updatedAt":20,"name":"peer","tabs":[{"url":"https://example.test"}]}})JSON";
 {base::RunLoop loop;coordinator->Merge(rev,a,remote,20,allowed,Callback([&](auto r){CHECK(r==Result::kSaved);loop.Quit();}));loop.Run();}
 const auto first=cache.Read(rev,a);CHECK(first.raw_json);CHECK(first.raw_json->find("example.test")!=std::string::npos);const auto path=root.AppendASCII("Blanc Sync/tabs-cache.json");std::string before;CHECK(base::ReadFileToString(path,&before));
 base::WaitableEvent blocked,release;CHECK(sequence->PostTask(FROM_HERE,Closure([&]{base::ScopedAllowBaseSyncPrimitivesForTesting allow;blocked.Signal();release.Wait();})));blocked.Wait();bool busy=false,stale=false;
 {base::RunLoop loop;coordinator->Merge(rev,a,remote,20,allowed,Callback([&](auto r){CHECK(r==Result::kStale);stale=true;loop.Quit();}));coordinator->Merge(rev,a,remote,20,allowed,Callback([&](auto r){CHECK(r==Result::kBusy);busy=true;}));CHECK(busy);CHECK(state->Adopt(rev,"Account B",b,blob,false)==RequestLedger::Status::kLoaded);release.Signal();loop.Run();}
 CHECK(stale);std::string after;CHECK(base::ReadFileToString(path,&after));CHECK_EQ(before,after);rev=state->Read().state->identity_revision;CHECK(cache.Read(rev,b).status==RequestLedger::Status::kMissing);
 {base::RunLoop loop;coordinator->Merge(rev,b,R"JSON({"fresh":{"updatedAt":20,"name":"new"}})JSON",20,allowed,Callback([&](auto r){CHECK(r==Result::kSaved);loop.Quit();}));loop.Run();}
 const auto second=cache.Read(rev,b);CHECK(second.raw_json);CHECK(second.raw_json->find("fresh")!=std::string::npos);CHECK(second.raw_json->find("example.test")==std::string::npos);
 CHECK(base::ReadFileToString(path,&before));base::WaitableEvent blocked_erasure,release_erasure;CHECK(sequence->PostTask(FROM_HERE,Closure([&]{base::ScopedAllowBaseSyncPrimitivesForTesting allow;blocked_erasure.Signal();release_erasure.Wait();})));blocked_erasure.Wait();
 {base::RunLoop loop;coordinator->Merge(rev,b,remote,20,allowed,Callback([&](auto r){CHECK(r==Result::kStale);loop.Quit();}));CHECK(state->SetErasurePending(rev,true)==RequestLedger::Status::kLoaded);release_erasure.Signal();loop.Run();}CHECK(base::ReadFileToString(path,&after));CHECK_EQ(before,after);CHECK(state->SetErasurePending(rev,false)==RequestLedger::Status::kLoaded);
 CHECK(base::ReadFileToString(path,&before));base::WaitableEvent blocked_cancel,release_cancel;CHECK(sequence->PostTask(FROM_HERE,Closure([&]{base::ScopedAllowBaseSyncPrimitivesForTesting allow;blocked_cancel.Signal();release_cancel.Wait();})));blocked_cancel.Wait();bool current=true;
 {base::RunLoop loop;coordinator->Merge(rev,b,remote,20,[&]{return current?std::string():std::string("generation");},Callback([&](auto r){CHECK(r==Result::kCancelled);loop.Quit();}));current=false;release_cancel.Signal();loop.Run();}CHECK(base::ReadFileToString(path,&after));CHECK_EQ(before,after);
 bool refused=false;coordinator->Merge(rev,b,remote,20,{},Callback([&](auto r){CHECK(r==Result::kCancelled);refused=true;}));CHECK(refused);
 base::WaitableEvent blocked2,release2;CHECK(sequence->PostTask(FROM_HERE,Closure([&]{base::ScopedAllowBaseSyncPrimitivesForTesting allow;blocked2.Signal();release2.Wait();})));blocked2.Wait();int cancelled=0;coordinator->Merge(rev,b,remote,20,allowed,Callback([&](auto r){CHECK(r==Result::kShutdown);++cancelled;}));coordinator->Shutdown();CHECK_EQ(cancelled,1);release2.Signal();{base::RunLoop loop;model->Shutdown(loop.QuitClosure());loop.Run();}CHECK_EQ(cancelled,1);coordinator.reset();model.reset();base::ThreadPoolInstance::Get()->FlushForTesting();base::ThreadPoolInstance::Get()->Shutdown();std::cout<<"real V8 bound merge and cache, account-switch stale result, busy and shutdown passed\n";
}

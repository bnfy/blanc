#include "personal_identity_loader.h"
#include "base/at_exit.h"
#include "base/check.h"
#include "base/command_line.h"
#include "base/files/file_util.h"
#include "base/functional/bind.h"
#include "base/location.h"
#include "base/run_loop.h"
#include "base/synchronization/waitable_event.h"
#include "base/task/single_thread_task_executor.h"
#include "base/threading/thread.h"
#include "base/threading/thread_restrictions.h"
#include <iostream>
using namespace blanc::sync;using L=PersonalIdentityLoader;using S=PersonalIdentityStore;
namespace blanc::sync {class PersonalIdentityStoreTestAccess{public:static auto Initialize(S& s,const base::FilePath& p){return s.InitializeNew(p);}};}
namespace blanc::sync {class PersonalIdentityLoaderTestAccess{public:static void Deliver(L& l,S::Result r){l.Loaded(std::move(r));}};}
int main(int argc,char**argv){
 base::AtExitManager at_exit;base::CommandLine::Init(argc,argv);CHECK_EQ(argc,2);base::SingleThreadTaskExecutor executor;const auto owner=base::SequencedTaskRunner::GetCurrentDefault();const auto root=base::FilePath::FromUTF8Unsafe(argv[1]);CHECK(!base::PathExists(root));CHECK(base::CreateDirectory(root));
 base::Thread worker("PersonalIdentityWorker");CHECK(worker.Start());
 {L missing(root.AppendASCII("missing"),worker.task_runner());base::RunLoop loop;missing.Load(base::BindOnce([](base::RunLoop* l,L::Result r){CHECK(r.state==L::State::kUnavailable);CHECK(r.store_status==S::Status::kMissing);l->Quit();},base::Unretained(&loop)));loop.Run();CHECK(!missing.path());CHECK(!base::PathExists(root.AppendASCII("missing")));}
 const auto personal=root.AppendASCII("Default");CHECK(base::CreateDirectory(personal));S store(root);CHECK(PersonalIdentityStoreTestAccess::Initialize(store,personal)==S::Status::kLoaded);
 auto loader=std::make_unique<L>(root,worker.task_runner());auto resolver=loader->Resolver();CHECK(!resolver.Run());
 {base::RunLoop loop;loader->Load(base::BindOnce([](scoped_refptr<base::SequencedTaskRunner> owner,base::RunLoop* l,L::Result r){CHECK(owner->RunsTasksInCurrentSequence());CHECK(r.state==L::State::kReady);l->Quit();},owner,base::Unretained(&loop)));loop.Run();CHECK(resolver.Run()==personal);}
 loader->Invalidate();CHECK(!resolver.Run());CHECK(!loader->path());
 base::WaitableEvent blocked,release,drained;CHECK(worker.task_runner()->PostTask(FROM_HERE,base::BindOnce([](auto* blocked,auto* release){blocked->Signal();base::ScopedAllowBaseSyncPrimitivesForTesting allow;release->Wait();},base::Unretained(&blocked),base::Unretained(&release))));{base::ScopedAllowBaseSyncPrimitivesForTesting allow;blocked.Wait();}
 int callbacks=0;base::RunLoop cancelled;
 loader->Load(base::BindOnce([](int* count,base::RunLoop* loop,L::Result r){CHECK(r.state==L::State::kCancelled);if(++*count==2)loop->Quit();},base::Unretained(&callbacks),base::Unretained(&cancelled)));
 loader->Load(base::BindOnce([](int* count,base::RunLoop* loop,L::Result r){CHECK(r.state==L::State::kBusy);if(++*count==2)loop->Quit();},base::Unretained(&callbacks),base::Unretained(&cancelled)));loader->Invalidate();cancelled.Run();CHECK_EQ(callbacks,2);release.Signal();CHECK(worker.task_runner()->PostTask(FROM_HERE,base::BindOnce([](auto* done){done->Signal();},base::Unretained(&drained))));{base::ScopedAllowBaseSyncPrimitivesForTesting allow;drained.Wait();}base::RunLoop().RunUntilIdle();CHECK_EQ(callbacks,2);CHECK(!loader->path());
 {base::RunLoop loop;loader->Load(base::BindOnce([](base::RunLoop* l,L::Result r){CHECK(r.state==L::State::kReady);l->Quit();},base::Unretained(&loop)));loop.Run();CHECK(loader->path()==personal);}
 base::WaitableEvent blocked3,release3,drained3;CHECK(worker.task_runner()->PostTask(FROM_HERE,base::BindOnce([](auto* blocked,auto* release){blocked->Signal();base::ScopedAllowBaseSyncPrimitivesForTesting allow;release->Wait();},base::Unretained(&blocked3),base::Unretained(&release3))));{base::ScopedAllowBaseSyncPrimitivesForTesting allow;blocked3.Wait();}
 int queued_count=0;base::RunLoop queued;loader->Load(base::BindOnce([](int* count,base::RunLoop* l,L::Result r){CHECK(r.state==L::State::kCancelled);++*count;l->Quit();},base::Unretained(&queued_count),base::Unretained(&queued)));PersonalIdentityLoaderTestAccess::Deliver(*loader,store.Read());CHECK(loader->path()==personal);loader->Invalidate();queued.Run();CHECK_EQ(queued_count,1);release3.Signal();CHECK(worker.task_runner()->PostTask(FROM_HERE,base::BindOnce([](auto* done){done->Signal();},base::Unretained(&drained3))));{base::ScopedAllowBaseSyncPrimitivesForTesting allow;drained3.Wait();}base::RunLoop().RunUntilIdle();CHECK_EQ(queued_count,1);CHECK(!loader->path());
 {base::RunLoop loop;loader->Load(base::BindOnce([](base::RunLoop* l,L::Result r){CHECK(r.state==L::State::kReady);l->Quit();},base::Unretained(&loop)));loop.Run();}
 auto current=loader->Resolver();const auto marker=personal.AppendASCII("Blanc Personal.owner"),saved=root.AppendASCII("saved-marker");CHECK(base::Move(marker,saved));
 {base::RunLoop loop;loader->Load(base::BindOnce([](base::RunLoop* l,L::Result r){CHECK(r.state==L::State::kUnavailable);CHECK(r.store_status==S::Status::kIncomplete);l->Quit();},base::Unretained(&loop)));CHECK(!current.Run());loop.Run();CHECK(!loader->path());}CHECK(base::Move(saved,marker));
 base::WaitableEvent blocked2,release2,drained2;CHECK(worker.task_runner()->PostTask(FROM_HERE,base::BindOnce([](auto* blocked,auto* release){blocked->Signal();base::ScopedAllowBaseSyncPrimitivesForTesting allow;release->Wait();},base::Unretained(&blocked2),base::Unretained(&release2))));{base::ScopedAllowBaseSyncPrimitivesForTesting allow;blocked2.Wait();}
 int shutdown_count=0;base::RunLoop shutdown;loader->Load(base::BindOnce([](int* count,base::RunLoop* l,L::Result r){CHECK(r.state==L::State::kShutdown);++*count;l->Quit();},base::Unretained(&shutdown_count),base::Unretained(&shutdown)));loader->Shutdown();loader.reset();shutdown.Run();CHECK_EQ(shutdown_count,1);CHECK(!current.Run());release2.Signal();CHECK(worker.task_runner()->PostTask(FROM_HERE,base::BindOnce([](auto* done){done->Signal();},base::Unretained(&drained2))));{base::ScopedAllowBaseSyncPrimitivesForTesting allow;drained2.Wait();}base::RunLoop().RunUntilIdle();CHECK_EQ(shutdown_count,1);worker.Stop();std::cout<<"asynchronous identity loader fail-closed and cancellation lifecycle passed\n";
}

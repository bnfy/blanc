#include "personal_deletion_guard.h"
#include "base/at_exit.h"
#include "base/check.h"
#include "base/command_line.h"
#include "base/files/file_util.h"
#include "base/synchronization/waitable_event.h"
#include "base/time/time.h"
#include "base/threading/thread_restrictions.h"
#include <thread>
#include <iostream>
using namespace blanc::sync;using S=PersonalIdentityStore;using G=PersonalDeletionGuard;
namespace blanc::sync {class PersonalIdentityStoreTestAccess{public:static auto Initialize(S& s,const base::FilePath& p){return s.InitializeNew(p);}};class PersonalDeletionGuardTestAccess{public:static bool Confirm(G& g,const S::Identity& i){return g.Confirm(i);}};}
int main(int argc,char**argv){
 base::AtExitManager at_exit;base::CommandLine::Init(argc,argv);CHECK_EQ(argc,2);const auto root=base::FilePath::FromUTF8Unsafe(argv[1]);CHECK(!base::PathExists(root));CHECK(base::CreateDirectory(root));const auto personal=root.AppendASCII("Default"),named=root.AppendASCII("Profile 1");CHECK(base::CreateDirectory(personal));CHECK(base::CreateDirectory(named));S store(root);CHECK(PersonalIdentityStoreTestAccess::Initialize(store,personal)==S::Status::kLoaded);const auto read=store.Read();CHECK(read.identity);
 G gate(root);int actions=0;auto action=[&]{++actions;return true;};CHECK(gate.RunIfAllowed(named,action)==G::Decision::kDeferred);CHECK(gate.RunIfAllowed(personal,action)==G::Decision::kDeferred);CHECK_EQ(actions,0);
 CHECK(gate.CheckBeforeScheduling(named)==G::Preflight::kDeferred);CHECK(gate.CheckBeforeScheduling(personal)==G::Preflight::kDeferred);
 CHECK(PersonalDeletionGuardTestAccess::Confirm(gate,*read.identity));CHECK(gate.RunIfAllowed(personal,action)==G::Decision::kProtected);CHECK(gate.RunIfAllowed(root.AppendASCII("../elsewhere"),action)==G::Decision::kInvalidPath);CHECK_EQ(actions,0);CHECK(gate.RunIfAllowed(named,action)==G::Decision::kDeleted);CHECK_EQ(actions,1);
 CHECK(gate.CheckBeforeScheduling(personal)==G::Preflight::kProtected);CHECK(gate.CheckBeforeScheduling(root.AppendASCII("../elsewhere"))==G::Preflight::kInvalidPath);CHECK(gate.CheckBeforeScheduling(named)==G::Preflight::kMaySchedule);
 gate.Invalidate();CHECK(gate.RunIfAllowed(named,action)==G::Decision::kDeferred);CHECK_EQ(actions,1);CHECK(PersonalDeletionGuardTestAccess::Confirm(gate,*read.identity));
 const auto alias=root.AppendASCII("alias");CHECK(base::CreateSymbolicLink(personal,alias));CHECK(gate.RunIfAllowed(alias,action)==G::Decision::kDeferred);CHECK(gate.RunIfAllowed(root.AppendASCII("missing"),action)==G::Decision::kDeferred);const auto ordinary_file=root.AppendASCII("ordinary-file");CHECK(base::WriteFile(ordinary_file,"x"));CHECK(gate.RunIfAllowed(ordinary_file,action)==G::Decision::kDeferred);const auto folded=root.AppendASCII("default");const auto folded_result=gate.RunIfAllowed(folded,action);CHECK(folded_result==G::Decision::kProtected||folded_result==G::Decision::kDeferred);CHECK_EQ(actions,1);
 CHECK(gate.CheckBeforeScheduling(alias)==G::Preflight::kDeferred);CHECK(gate.CheckBeforeScheduling(root.AppendASCII("missing"))==G::Preflight::kDeferred);const auto folded_preflight=gate.CheckBeforeScheduling(folded);CHECK(folded_preflight==G::Preflight::kProtected||folded_preflight==G::Preflight::kDeferred);
 const auto marker=named.AppendASCII("cleanup-marker");CHECK(base::WriteFile(marker,"pending"));CHECK(gate.RunIfAllowed(named,[]{return false;})==G::Decision::kActionFailed);CHECK(base::PathExists(marker));
 gate.Invalidate();CHECK(gate.RunIfAllowed(named,action)==G::Decision::kDeferred);auto wrong=*read.identity;wrong.profile_path=named;CHECK(!PersonalDeletionGuardTestAccess::Confirm(gate,wrong));CHECK(gate.RunIfAllowed(named,action)==G::Decision::kDeferred);wrong=*read.identity;wrong.id="550e8400-e29b-41d4-a716-446655440000";if(wrong.id==read.identity->id)wrong.id="550e8400-e29b-41d4-a716-446655440001";CHECK(!PersonalDeletionGuardTestAccess::Confirm(gate,wrong));CHECK(PersonalDeletionGuardTestAccess::Confirm(gate,*read.identity));
 base::WaitableEvent entered,release,attempted,revoked;G::Decision result=G::Decision::kDeferred;
 std::thread deleter([&]{result=gate.RunIfAllowed(named,[&]{entered.Signal();release.Wait();return true;});});entered.Wait();std::thread invalidator([&]{attempted.Signal();gate.Invalidate();revoked.Signal();});attempted.Wait();{base::ScopedAllowBaseSyncPrimitivesForTesting allow;CHECK(!revoked.TimedWait(base::Milliseconds(50)));}release.Signal();deleter.join();invalidator.join();CHECK(result==G::Decision::kDeleted);CHECK(gate.RunIfAllowed(named,action)==G::Decision::kDeferred);CHECK_EQ(actions,1);CHECK(base::PathExists(marker));
 std::cout<<"personal deletion fence, retained cleanup marker and serialized invalidation passed\n";
}

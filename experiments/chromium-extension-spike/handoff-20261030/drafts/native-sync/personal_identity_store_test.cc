#include "personal_identity_store.h"
#include "base/at_exit.h"
#include "base/check.h"
#include "base/command_line.h"
#include "base/files/file_util.h"
#include "base/json/json_reader.h"
#include "base/json/json_writer.h"
#include <iostream>
using namespace blanc::sync;
namespace blanc::sync {class PersonalIdentityStoreTestAccess {public:static auto Initialize(PersonalIdentityStore& store,const base::FilePath& path){return store.InitializeNew(path);}};}
using S=PersonalIdentityStore;using A=PersonalIdentityStoreTestAccess;
int main(int argc,char**argv){
 base::AtExitManager at_exit;base::CommandLine::Init(argc,argv);CHECK(argc==3||argc==4);const auto base=base::FilePath::FromUTF8Unsafe(argv[1]);const std::string mode=argv[2];const auto root=base.AppendASCII("owner");
 if(mode=="race") {CHECK_EQ(argc,4);S store(root);const auto result=A::Initialize(store,root.AppendASCII(argv[3]));std::cout<<(result==S::Status::kLoaded?"winner":"refused")<<"\n";return 0;}
 if(mode=="inspect") {S store(root);auto result=store.Read();CHECK(result.status==S::Status::kLoaded&&result.identity);const auto name=result.identity->profile_path.BaseName().AsUTF8Unsafe();CHECK(name=="Default"||name=="Profile 1");std::cout<<name<<"\n";return 0;}
 if(mode=="verify") {S store(root);auto r=store.Read();CHECK(r.status==S::Status::kLoaded);CHECK(r.identity&&r.identity->profile_path==root.AppendASCII("Default"));std::string expected;CHECK(base::ReadFileToString(base.AppendASCII("expected-id"),&expected));CHECK_EQ(r.identity->id,expected);std::cout<<"restart identity retained\n";return 0;}
 CHECK_EQ(mode,"create");CHECK(!base::PathExists(base));CHECK(base::CreateDirectory(root));const auto path=root.AppendASCII("Default");CHECK(base::CreateDirectory(path));CHECK(base::CreateDirectory(root.AppendASCII("Profile 1")));S store(root);CHECK(store.Read().status==S::Status::kMissing);CHECK(!base::PathExists(root.AppendASCII("Blanc Personal.identity")));
 CHECK(A::Initialize(store,base::FilePath::FromUTF8Unsafe("/elsewhere/Default"))==S::Status::kInvalidPath);CHECK(!base::PathExists(root.AppendASCII("Blanc Personal.identity")));
 CHECK(A::Initialize(store,path)==S::Status::kLoaded);auto first=store.Read();CHECK(first.status==S::Status::kLoaded&&first.identity);CHECK_EQ(first.identity->profile_path,path);CHECK(base::WriteFile(base.AppendASCII("expected-id"),first.identity->id));
 std::string bytes;const auto identity_file=root.AppendASCII("Blanc Personal.identity");CHECK(base::ReadFileToString(identity_file,&bytes));CHECK(A::Initialize(store,root.AppendASCII("Profile 1"))==S::Status::kAlreadyExists);std::string after;CHECK(base::ReadFileToString(identity_file,&after));CHECK_EQ(after,bytes);
 const auto saved_identity=base.AppendASCII("saved-identity");CHECK(base::Move(identity_file,saved_identity));CHECK(store.Read().status==S::Status::kIncomplete);CHECK(A::Initialize(store,root.AppendASCII("Profile 1"))==S::Status::kIncomplete);CHECK(!base::PathExists(root.AppendASCII("Profile 1").AppendASCII("Blanc Personal.owner")));CHECK(base::Move(saved_identity,identity_file));CHECK(store.Read().status==S::Status::kLoaded);
 const auto marker=path.AppendASCII("Blanc Personal.owner"),saved=base.AppendASCII("saved-owner");CHECK(base::Move(marker,saved));CHECK(store.Read().status==S::Status::kIncomplete);CHECK(A::Initialize(store,path)==S::Status::kIncomplete);CHECK(base::Move(saved,marker));CHECK(store.Read().status==S::Status::kLoaded);
 CHECK(base::WriteFile(marker,"{}"));CHECK(store.Read().status==S::Status::kCorrupt);CHECK(A::Initialize(store,path)==S::Status::kCorrupt);CHECK(base::WriteFile(marker,bytes));CHECK(store.Read().status==S::Status::kLoaded);
 CHECK(base::Move(marker,saved));CHECK(base::CreateSymbolicLink(identity_file,marker));CHECK(store.Read().status!=S::Status::kLoaded);CHECK(base::DeleteFile(marker));CHECK(base::Move(saved,marker));CHECK(store.Read().status==S::Status::kLoaded);
 const auto other=base.AppendASCII("other");CHECK(base::CreateDirectory(other));CHECK(base::CopyFile(identity_file,other.AppendASCII("Blanc Personal.identity")));CHECK(base::CopyFile(root.AppendASCII("Blanc Personal.claim"),other.AppendASCII("Blanc Personal.claim")));S moved(other);CHECK(moved.Read().status==S::Status::kWrongRoot);CHECK(A::Initialize(moved,other.AppendASCII("Default"))==S::Status::kWrongRoot);
 const auto partial=base.AppendASCII("partial");CHECK(base::CreateDirectory(partial));const auto partial_file=partial.AppendASCII("Blanc Personal.identity");CHECK(base::WriteFile(partial_file,"{\"version\":1"));S damaged(partial);CHECK(damaged.Read().status==S::Status::kIncomplete);CHECK(A::Initialize(damaged,partial.AppendASCII("Default"))==S::Status::kIncomplete);CHECK(base::WriteFile(partial.AppendASCII("Blanc Personal.claim"),"{\"version\":1"));CHECK(damaged.Read().status==S::Status::kCorrupt);CHECK(A::Initialize(damaged,partial.AppendASCII("Default"))==S::Status::kCorrupt);CHECK(base::ReadFileToString(partial_file,&after));CHECK_EQ(after,"{\"version\":1");
 const auto future=base.AppendASCII("future");CHECK(base::CreateDirectory(future));CHECK(base::WriteFile(future.AppendASCII("Blanc Personal.identity"),"{\"version\":2}"));CHECK(base::WriteFile(future.AppendASCII("Blanc Personal.claim"),"{\"version\":2}"));S newer(future);CHECK(newer.Read().status==S::Status::kUnsupportedVersion);CHECK(A::Initialize(newer,future.AppendASCII("Default"))==S::Status::kUnsupportedVersion);
 const auto symlink_root=base.AppendASCII("symlink");CHECK(base::CreateDirectory(symlink_root));CHECK(base::CreateSymbolicLink(identity_file,symlink_root.AppendASCII("Blanc Personal.identity")));S linked(symlink_root);CHECK(linked.Read().status!=S::Status::kLoaded);CHECK(A::Initialize(linked,symlink_root.AppendASCII("Default"))!=S::Status::kLoaded);CHECK(base::ReadFileToString(identity_file,&after));CHECK_EQ(after,bytes);
 const auto absent=base.AppendASCII("no-parent");S no_parent(absent);CHECK(A::Initialize(no_parent,absent.AppendASCII("Default"))==S::Status::kWriteError);CHECK(!base::PathExists(absent));
 std::cout<<"exclusive personal identity, corrupt/foreign/newer/symlink refusal passed\n";
}

#include "tab_cache_store.h"
#include "base/at_exit.h"
#include "base/base64.h"
#include "base/check.h"
#include "base/files/file_util.h"
#include <iostream>
using namespace blanc::sync;
using S=TabCacheStore::Status;
namespace blanc::sync { class TabCacheStoreTestAccess {
 public: static S Commit(TabCacheStore& cache,int revision,const std::string& account,const std::string& data) {
   return cache.Commit(revision,account,data);
 }
}; }
int main(int argc,char** argv) {
  base::AtExitManager at_exit; CHECK_EQ(argc,2);
  const auto root=base::FilePath::FromUTF8Unsafe(argv[1]); CHECK(root.IsAbsolute()); CHECK(!base::PathExists(root)); CHECK(base::CreateDirectory(root));
  const std::string profile(64,'a'),a(64,'b'),b(64,'c');
  auto state=std::make_shared<ProfileStateStore>(root,profile,true,false);
  TabCacheStore cache(state); CHECK(cache.Read(0,a).status==S::kMissing);
  CHECK(state->Bootstrap(ProfileStateStore::BootstrapMode::kKnownFirstNativeSetup)==S::kLoaded);
  const auto blob=base::Base64Encode("v10SYNTHETIC-TEST-ONLY");
  CHECK(state->Adopt(0,"Account A",a,blob,false)==S::kLoaded);
  int rev=state->Read().state->identity_revision; CHECK(cache.Read(rev,a).status==S::kMissing);
  const std::string a_data="{\"accountId\":\""+a+"\",\"devices\":{\"peer\":\"\\ud800\"}}";
  CHECK(TabCacheStoreTestAccess::Commit(cache,rev,a,a_data)==S::kLoaded);
  CHECK_EQ(*cache.Read(rev,a).raw_json,a_data);
  auto restarted=std::make_shared<ProfileStateStore>(root,profile,true,false); TabCacheStore restart_cache(restarted);
  CHECK_EQ(*restart_cache.Read(rev,a).raw_json,a_data);
  const auto path=root.AppendASCII("Blanc Sync/tabs-cache.json"); std::string before; CHECK(base::ReadFileToString(path,&before));
  const int old_rev=rev; CHECK(state->Adopt(rev,"Account B",b,blob,false)==S::kLoaded); rev=state->Read().state->identity_revision;
  CHECK(cache.Read(old_rev,a).status==S::kWrongAccount); CHECK(cache.Read(rev,b).status==S::kMissing);
  CHECK(TabCacheStoreTestAccess::Commit(cache,old_rev,a,a_data)==S::kWrongAccount);
  std::string after; CHECK(base::ReadFileToString(path,&after)); CHECK_EQ(before,after);
  const std::string b_data="{\"accountId\":\""+b+"\",\"devices\":{}}";
  CHECK(TabCacheStoreTestAccess::Commit(cache,rev,b,b_data)==S::kLoaded); CHECK_EQ(*cache.Read(rev,b).raw_json,b_data);
  CHECK(state->SetErasurePending(rev,true)==S::kLoaded); CHECK(cache.Read(rev,b).status==S::kWrongAccount); CHECK(TabCacheStoreTestAccess::Commit(cache,rev,b,b_data)==S::kWrongAccount);
  CHECK(state->SetErasurePending(rev,false)==S::kLoaded); CHECK_EQ(*cache.Read(rev,b).raw_json,b_data);
  CHECK(base::WriteFile(path,"{corrupt")); CHECK(cache.Read(rev,b).status==S::kCorrupt); CHECK(TabCacheStoreTestAccess::Commit(cache,rev,b,b_data)==S::kCorrupt); CHECK(base::ReadFileToString(path,&after)); CHECK_EQ(after,"{corrupt");
  CHECK(base::DeleteFile(path)); const auto outside=root.AppendASCII("outside"); CHECK(base::WriteFile(outside,"untouched")); CHECK(base::CreateSymbolicLink(outside,path)); CHECK(cache.Read(rev,b).status!=S::kLoaded); CHECK(TabCacheStoreTestAccess::Commit(cache,rev,b,b_data)!=S::kLoaded); CHECK(base::ReadFileToString(outside,&after)); CHECK_EQ(after,"untouched");
  auto private_state=std::make_shared<ProfileStateStore>(root,profile,true,true); TabCacheStore private_cache(private_state); CHECK(private_cache.Read(rev,b).status==S::kNotAllowed);
  std::cout<<"account-bound cache, stale revision, erasure, restart, corrupt and symlink checks passed\n";
}

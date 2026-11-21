#include "legacy_snapshot.h"
#include "base/at_exit.h"
#include "base/check.h"
#include "base/files/file_util.h"
#include <iostream>
#include <sys/stat.h>
using namespace blanc::sync;
int main(int argc,char** argv) {
 base::AtExitManager at_exit; CHECK_EQ(argc,2);
 const auto root=base::FilePath::FromUTF8Unsafe(argv[1]); CHECK(!base::PathExists(root)); CHECK(base::CreateDirectory(root));
 CHECK(ReadLegacySnapshot(root).status==LegacySnapshotStatus::kMissing);
 const auto sync=root.AppendASCII("sync.json"), shared=root.AppendASCII("shared-spaces.json");
 CHECK(base::WriteFile(sync,"{\"enabled\":false}"));
 CHECK(ReadLegacySnapshot(root).status==LegacySnapshotStatus::kMissing);
 CHECK(base::WriteFile(shared,"{\"requestLog\":[]}"));
 const auto before_sync=base::GetFileSize(sync), before_shared=base::GetFileSize(shared);
 auto read=ReadLegacySnapshot(root);CHECK(read.status==LegacySnapshotStatus::kRead && read.snapshot);
 CHECK_EQ(read.snapshot->sync_json,"{\"enabled\":false}"); CHECK_EQ(read.snapshot->shared_json,"{\"requestLog\":[]}");
 CHECK_EQ(read.snapshot->sync_sha256.size(),64u); CHECK_EQ(read.snapshot->shared_sha256.size(),64u);
 CHECK(base::GetFileSize(sync)==before_sync);CHECK(base::GetFileSize(shared)==before_shared);
 CHECK(base::DeleteFile(sync)); CHECK(base::CreateSymbolicLink(shared,sync));
 CHECK(ReadLegacySnapshot(root).status==LegacySnapshotStatus::kNotRegular);
 CHECK(base::DeleteFile(sync)); CHECK(base::CreateDirectory(sync));
 CHECK(ReadLegacySnapshot(root).status==LegacySnapshotStatus::kNotRegular);
 CHECK(base::DeletePathRecursively(sync)); CHECK_EQ(mkfifo(sync.value().c_str(),0600),0);
 CHECK(ReadLegacySnapshot(root).status==LegacySnapshotStatus::kNotRegular);
 CHECK(base::DeleteFile(sync)); CHECK(base::WriteFile(sync,std::string(65537,' ')));
 CHECK(ReadLegacySnapshot(root).status==LegacySnapshotStatus::kTooLarge);
 CHECK(ReadLegacySnapshot(base::FilePath("relative")).status==LegacySnapshotStatus::kInvalidRoot);
 CHECK(ReadLegacySnapshot(root.AppendASCII(".." )).status==LegacySnapshotStatus::kInvalidRoot);
 const auto alias=root.AddExtensionASCII("alias"); CHECK(base::CreateSymbolicLink(root,alias));
 CHECK(ReadLegacySnapshot(alias).status==LegacySnapshotStatus::kInvalidRoot);
 CHECK(base::DeleteFile(alias));
 std::cout<<"bounded exact-root legacy snapshot, missing/symlink/directory/oversize refusal and no source writes passed\n";
}

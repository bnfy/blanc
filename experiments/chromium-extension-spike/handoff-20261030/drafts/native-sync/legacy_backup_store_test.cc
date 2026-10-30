#include "legacy_backup_store.h"
#include "base/files/file_util.h"
#include "base/uuid.h"
#include <sys/file.h>
#include <fcntl.h>
#include <unistd.h>
#include "key_vault.h"
#include "base/at_exit.h"
#include "base/base64.h"
#include "base/check.h"
#include "base/memory/scoped_refptr.h"
#include "components/os_crypt/async/common/algorithm.mojom.h"
#include "crypto/aes_cbc.h"
#include "crypto/secure_util.h"
#include <iostream>
using namespace blanc::sync;
using Encryptor = os_crypt_async::Encryptor;
using Algorithm = os_crypt_async::mojom::Algorithm;
using Status = KeyVault::Status;
class FixtureEncryptor : public Encryptor {
 public:
  FixtureEncryptor(KeyRing keys, const std::string& provider)
      : Encryptor(std::move(keys), provider) {}
};
Encryptor::KeyRing Ring(std::string tag, Algorithm algorithm, uint8_t byte = 0) {
  Encryptor::KeyRing ring;
  const std::vector<uint8_t> key(algorithm == Algorithm::kAES128CBC ? 16 : 32, byte);
  ring.emplace(tag, Encryptor::Key(key, algorithm)); return ring;
}
scoped_refptr<Encryptor> Make(Encryptor::KeyRing keys, const std::string& provider) {
  return base::MakeRefCounted<FixtureEncryptor>(std::move(keys), provider);
}
int main(int argc,char** argv) {
 base::AtExitManager at_exit;CHECK_EQ(argc,2);
 const auto root=base::FilePath::FromUTF8Unsafe(argv[1]);CHECK(!base::PathExists(root));CHECK(base::CreateDirectory(root));
 CHECK(base::SetPosixFilePermissions(root,0700));
 const std::string source(64,'d');const VaultContext context{std::string(64,'a'),source,true,false};
 auto provider=Make(Ring("v10",Algorithm::kAES256GCM,7),"v10");KeyVault vault(provider,context);
 LegacySnapshot snapshot;snapshot.sync_json="synthetic-source-canary";snapshot.shared_json="{\"requestLog\":[]}";
 auto first=WriteLegacyBackup(root,snapshot,vault,source);CHECK(first.status==LegacyBackupWriteStatus::kVerified);
 int permissions=0;CHECK(base::GetPosixFilePermissions(first.artifact,&permissions));CHECK_EQ(permissions,0600);
 std::string bytes;CHECK(base::ReadFileToString(first.artifact,&bytes));CHECK(bytes.find(snapshot.sync_json)==std::string::npos);
 auto read=ReadLegacyBackup(first.artifact,vault,source);CHECK(read && read->sync_json==snapshot.sync_json && read->shared_json==snapshot.shared_json);
 auto second=WriteLegacyBackup(root,snapshot,vault,source);CHECK(second.status==LegacyBackupWriteStatus::kVerified);CHECK(first.artifact!=second.artifact);
 std::string preserved;CHECK(base::ReadFileToString(first.artifact,&preserved));CHECK_EQ(bytes,preserved);
 CHECK(!ReadLegacyBackup(first.artifact,vault,std::string(64,'e')));
 // Simulate interruption after publishing the final hardlink but before
 // removing the pending name. Recovery must authenticate before unlinking.
 const auto first_pending=first.artifact.RemoveExtension().AddExtensionASCII("pending");
 CHECK_EQ(link(first.artifact.value().c_str(),first_pending.value().c_str()),0);
 CHECK(!ReadLegacyBackup(first.artifact,vault,source));
 CHECK(RecoverLegacyBackup(first.artifact,vault,source).status==LegacyBackupWriteStatus::kVerified);
 CHECK(!base::PathExists(first_pending));CHECK(ReadLegacyBackup(first.artifact,vault,source));
 CHECK(RecoverLegacyBackup(first.artifact,vault,source).status==LegacyBackupWriteStatus::kVerified);
 const auto second_pending=second.artifact.RemoveExtension().AddExtensionASCII("pending");
 CHECK(base::Move(second.artifact,second_pending));
 CHECK(RecoverLegacyBackup(second_pending,vault,source).status==LegacyBackupWriteStatus::kVerified);
 CHECK(!base::PathExists(second_pending));CHECK(ReadLegacyBackup(second.artifact,vault,source));
 // A same-name pending file with different identity must remain untouched.
 CHECK(base::WriteFile(first_pending,bytes));CHECK(base::SetPosixFilePermissions(first_pending,0600));
 CHECK(RecoverLegacyBackup(first.artifact,vault,source).status==LegacyBackupWriteStatus::kReadbackFailed);
 CHECK(base::PathExists(first_pending));CHECK(base::DeleteFile(first_pending));
 const auto extra=root.AppendASCII("foreign.backup");
 CHECK_EQ(link(first.artifact.value().c_str(),extra.value().c_str()),0);
 CHECK(RecoverLegacyBackup(first.artifact,vault,source).status==LegacyBackupWriteStatus::kReadbackFailed);
 CHECK(base::PathExists(extra));CHECK(base::DeleteFile(extra));
 const int held=open(first.artifact.value().c_str(),O_RDWR);CHECK_GE(held,0);CHECK_EQ(flock(held,LOCK_EX|LOCK_NB),0);
 CHECK(RecoverLegacyBackup(first.artifact,vault,source).status==LegacyBackupWriteStatus::kReadbackFailed);
 CHECK_EQ(flock(held,LOCK_UN),0);CHECK_EQ(close(held),0);
 const auto bad_pending=root.AppendASCII(base::Uuid::GenerateRandomV4().AsLowercaseString()+".pending");
 CHECK(base::WriteFile(bad_pending,"corrupt"));CHECK(base::SetPosixFilePermissions(bad_pending,0600));
 CHECK(RecoverLegacyBackup(bad_pending,vault,source).status==LegacyBackupWriteStatus::kReadbackFailed);
 CHECK(base::PathExists(bad_pending));CHECK(!base::PathExists(bad_pending.RemoveExtension().AddExtensionASCII("backup")));
 const auto link=root.AppendASCII("alias.backup");CHECK(base::CreateSymbolicLink(first.artifact,link));CHECK(!ReadLegacyBackup(link,vault,source));
 const auto pending=root.AppendASCII("unverified.pending");CHECK(base::WriteFile(pending,"partial"));CHECK(!ReadLegacyBackup(pending,vault,source));
 const auto root_alias=root.AddExtensionASCII("alias");CHECK(base::CreateSymbolicLink(root,root_alias));
 CHECK(WriteLegacyBackup(root_alias,snapshot,vault,source).status==LegacyBackupWriteStatus::kInvalidDirectory);CHECK(base::DeleteFile(root_alias));
 CHECK(base::SetPosixFilePermissions(root,0755));
 CHECK(WriteLegacyBackup(root,snapshot,vault,source).status==LegacyBackupWriteStatus::kInvalidDirectory);
 CHECK(!ReadLegacyBackup(first.artifact,vault,source));CHECK(base::SetPosixFilePermissions(root,0700));
 CHECK(base::SetPosixFilePermissions(first.artifact,0644));CHECK(!ReadLegacyBackup(first.artifact,vault,source));CHECK(base::SetPosixFilePermissions(first.artifact,0600));
 auto corrupt=bytes;corrupt[0]='!';CHECK(base::WriteFile(first.artifact,corrupt));CHECK(!ReadLegacyBackup(first.artifact,vault,source));
 std::cout<<"exclusive backup/readback, interrupted publication recovery, live-writer/unrelated-link refusal and old-file preservation passed\n";
}

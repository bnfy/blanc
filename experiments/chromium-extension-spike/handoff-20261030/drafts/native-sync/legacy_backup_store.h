#ifndef BLANC_SYNC_LEGACY_BACKUP_STORE_H_
#define BLANC_SYNC_LEGACY_BACKUP_STORE_H_
#include "legacy_backup.h"
namespace blanc::sync {
enum class LegacyBackupWriteStatus { kVerified, kInvalidDirectory, kEncryptionFailed,
                                     kCreateFailed, kWriteFailed, kReadbackFailed, kInvalidArtifact, kUnsupported };
struct LegacyBackupWrite { LegacyBackupWriteStatus status; base::FilePath artifact; };
// Native POSIX adapter. Destination must already be an owned0700 directory;
// no source profile access/closure/consent/import authority is implied.
// Incomplete .pending artifacts are retained. Existing files are never replaced.
LegacyBackupWrite WriteLegacyBackup(const base::FilePath& directory,
    const LegacySnapshot& snapshot, KeyVault& vault, const std::string& source_binding);
// Explicit recovery for this adapter's known UUID artifact after its writer
// stopped. Authenticates before publishing/removing the matching pending link.
LegacyBackupWrite RecoverLegacyBackup(const base::FilePath& artifact,
    KeyVault& vault, const std::string& source_binding);
std::optional<LegacySnapshot> ReadLegacyBackup(const base::FilePath& file,
    KeyVault& vault, const std::string& source_binding);
}
#endif

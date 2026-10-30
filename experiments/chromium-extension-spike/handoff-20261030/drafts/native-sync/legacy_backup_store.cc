#include "legacy_backup_store.h"
#include "base/files/file.h"
#include "base/files/file_util.h"
#include "base/uuid.h"
#include "build/build_config.h"
#if BUILDFLAG(IS_POSIX)
#include <fcntl.h>
#include <sys/stat.h>
#include <sys/file.h>
#include <unistd.h>
#include "base/files/scoped_file.h"
#include "base/posix/eintr_wrapper.h"
#endif
namespace blanc::sync {
namespace {
#if BUILDFLAG(IS_POSIX)
constexpr int64_t kMaxBackup = 17 * 1024 * 1024;
base::ScopedFD Directory(const base::FilePath& root) {
  if (!root.IsAbsolute() || root.ReferencesParent() ||
      base::MakeAbsoluteFilePath(root) != root.StripTrailingSeparators()) return {};
  base::ScopedFD fd(HANDLE_EINTR(open(root.value().c_str(), O_RDONLY | O_DIRECTORY | O_CLOEXEC | O_NOFOLLOW)));
  struct stat st;
  if (!fd.is_valid() || fstat(fd.get(), &st) != 0 || !S_ISDIR(st.st_mode) ||
      st.st_uid != getuid() || (st.st_mode & 077) != 0) return {};
  return fd;
}
std::optional<std::string> ReadCipher(base::File& file, nlink_t links = 1) {
  struct stat st;
  if (fstat(file.GetPlatformFile(), &st) != 0 || !S_ISREG(st.st_mode) ||
      st.st_uid != getuid() || (st.st_mode & 077) != 0 || st.st_nlink != links ||
      st.st_size <= 0 || st.st_size > kMaxBackup) return {};
  if (file.Seek(base::File::FROM_BEGIN, 0) != 0) return {};
  std::string bytes(static_cast<size_t>(st.st_size), '\0');
  if (!file.ReadAtCurrentPosAndCheck(base::as_writable_byte_span(bytes))) return {};
  struct stat after;
  if (fstat(file.GetPlatformFile(), &after) != 0 || after.st_size != st.st_size) return {};
  return bytes;
}
#endif
}
LegacyBackupWrite WriteLegacyBackup(const base::FilePath& root,
    const LegacySnapshot& snapshot, KeyVault& vault, const std::string& source) {
#if BUILDFLAG(IS_POSIX)
  using S = LegacyBackupWriteStatus;
  auto directory = Directory(root); if (!directory.is_valid()) return {S::kInvalidDirectory, {}};
  auto encrypted = SealLegacyBackup(snapshot, vault, source);
  if (!encrypted) return {S::kEncryptionFailed, {}};
  const auto id = base::Uuid::GenerateRandomV4().AsLowercaseString();
  const auto pending = id + ".pending", final = id + ".backup";
  const auto pending_path = root.AppendASCII(pending), final_path = root.AppendASCII(final);
  const int fd = HANDLE_EINTR(openat(directory.get(), pending.c_str(),
      O_RDWR | O_CREAT | O_EXCL | O_NOFOLLOW | O_CLOEXEC, 0600));
  if (fd < 0) return {S::kCreateFailed, {}};
  base::File file(fd);
  if (flock(fd, LOCK_EX | LOCK_NB) != 0) return {S::kWriteFailed, pending_path};
  if (!file.WriteAtCurrentPosAndCheck(base::as_byte_span(*encrypted)) || !file.Flush())
    return {S::kWriteFailed, pending_path};
  auto readback = ReadCipher(file);
  if (!readback || *readback != *encrypted) return {S::kReadbackFailed, pending_path};
  auto restored = OpenLegacyBackup(*readback, vault, source);
  if (!restored || restored->sync_json != snapshot.sync_json || restored->shared_json != snapshot.shared_json)
    return {S::kReadbackFailed, pending_path};
  // linkat is atomic and refuses an existing final name (unlike rename).
  if (linkat(directory.get(), pending.c_str(), directory.get(), final.c_str(), 0) != 0)
    return {S::kWriteFailed, pending_path};
  if (unlinkat(directory.get(), pending.c_str(), 0) != 0 || fsync(directory.get()) != 0)
    return {S::kWriteFailed, final_path};
  return {S::kVerified, final_path};
#else
  return {LegacyBackupWriteStatus::kUnsupported, {}};
#endif
}
LegacyBackupWrite RecoverLegacyBackup(const base::FilePath& artifact,
    KeyVault& vault, const std::string& source) {
#if BUILDFLAG(IS_POSIX)
  using S = LegacyBackupWriteStatus;
  if (artifact.Extension() != ".backup" && artifact.Extension() != ".pending")
    return {S::kInvalidArtifact, artifact};
  const auto stem = artifact.BaseName().RemoveExtension().value();
  if (!base::Uuid::ParseLowercase(stem).is_valid()) return {S::kInvalidArtifact, artifact};
  auto directory = Directory(artifact.DirName());
  if (!directory.is_valid()) return {S::kInvalidDirectory, artifact};
  const auto pending = stem + ".pending", final = stem + ".backup";
  const auto final_path = artifact.DirName().AppendASCII(final);
  int fd = HANDLE_EINTR(openat(directory.get(), final.c_str(), O_RDWR | O_NOFOLLOW | O_NONBLOCK | O_CLOEXEC));
  const bool has_final = fd >= 0;
  if (!has_final) {
    if (errno != ENOENT) return {S::kReadbackFailed, artifact};
    fd = HANDLE_EINTR(openat(directory.get(), pending.c_str(), O_RDWR | O_NOFOLLOW | O_NONBLOCK | O_CLOEXEC));
  }
  if (fd < 0) return {S::kReadbackFailed, artifact};
  base::File file(fd);
  // Cooperates with WriteLegacyBackup's lock; never finalize a live writer.
  if (flock(fd, LOCK_EX | LOCK_NB) != 0) return {S::kReadbackFailed, artifact};
  struct stat st, pending_stat;
  if (fstat(fd, &st) != 0) return {S::kReadbackFailed, artifact};
  base::ScopedFD pending_fd(HANDLE_EINTR(openat(directory.get(), pending.c_str(),
      O_RDONLY | O_NOFOLLOW | O_NONBLOCK | O_CLOEXEC)));
  bool paired = false;
  if (has_final && pending_fd.is_valid()) {
    if (fstat(pending_fd.get(), &pending_stat) != 0 || pending_stat.st_dev != st.st_dev ||
        pending_stat.st_ino != st.st_ino || st.st_nlink != 2)
      return {S::kReadbackFailed, artifact};
    paired = true;
  } else if (has_final && errno != ENOENT) {
    return {S::kReadbackFailed, artifact};
  }
  auto bytes = ReadCipher(file, paired ? 2 : 1);
  if (!bytes || !OpenLegacyBackup(*bytes, vault, source) || !file.Flush())
    return {S::kReadbackFailed, artifact};
  if (!has_final && linkat(directory.get(), pending.c_str(), directory.get(), final.c_str(), 0) != 0)
    return {S::kWriteFailed, artifact};
  if ((!has_final || paired) && unlinkat(directory.get(), pending.c_str(), 0) != 0)
    return {S::kWriteFailed, final_path};
  if (fsync(directory.get()) != 0 || !ReadCipher(file)) return {S::kWriteFailed, final_path};
  return {S::kVerified, final_path};
#else
  return {LegacyBackupWriteStatus::kUnsupported, artifact};
#endif
}
std::optional<LegacySnapshot> ReadLegacyBackup(const base::FilePath& path,
    KeyVault& vault, const std::string& source) {
#if BUILDFLAG(IS_POSIX)
  if (path.Extension() != ".backup") return {};
  auto directory = Directory(path.DirName()); if (!directory.is_valid()) return {};
  const int fd = HANDLE_EINTR(openat(directory.get(), path.BaseName().value().c_str(),
      O_RDONLY | O_NOFOLLOW | O_NONBLOCK | O_CLOEXEC));
  if (fd < 0) return {};
  base::File file(fd); auto bytes = ReadCipher(file);
  return bytes ? OpenLegacyBackup(*bytes, vault, source) : std::nullopt;
#else
  return {};
#endif
}
}

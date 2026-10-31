#include "legacy_snapshot.h"
#include "base/files/file.h"
#include "base/files/file_util.h"
#include "base/strings/string_number_conversions.h"
#include "crypto/secure_util.h"
#include "crypto/sha2.h"
#include "build/build_config.h"
#if BUILDFLAG(IS_POSIX)
#include <cerrno>
#include <fcntl.h>
#include <sys/stat.h>
#include "base/posix/eintr_wrapper.h"
#endif
namespace blanc::sync {
namespace {
using S = LegacySnapshotStatus;
void Clear(std::string& bytes) { crypto::SecureZeroBuffer(base::as_writable_byte_span(bytes)); }
S Read(const base::FilePath& path, int64_t limit, std::string& bytes) {
  if (base::IsLink(path)) return S::kNotRegular;
#if BUILDFLAG(IS_POSIX)
  // Nonblocking open prevents a replaced FIFO from hanging before fstat. Check
  // the opened handle, not only a racy pathname stat; refuse devices as well.
  const int fd = HANDLE_EINTR(open(path.value().c_str(), O_RDONLY | O_CLOEXEC | O_NOFOLLOW | O_NONBLOCK));
  if (fd < 0) return errno == ENOENT ? S::kMissing : errno == ELOOP ? S::kNotRegular : S::kReadError;
  base::File file(fd);
  struct stat st;
  if (fstat(fd, &st) != 0) return S::kReadError;
  if (!S_ISREG(st.st_mode)) return S::kNotRegular;
#else
  base::File file(path, base::File::FLAG_OPEN | base::File::FLAG_READ | base::File::FLAG_NO_FOLLOW);
  if (!file.IsValid()) return file.error_details() == base::File::FILE_ERROR_NOT_FOUND ? S::kMissing : S::kReadError;
#endif
  base::File::Info info;
  if (!file.GetInfo(&info)) return S::kReadError;
  if (info.is_directory || info.is_symbolic_link) return S::kNotRegular;
  const auto length = file.GetLength();
  if (length < 0) return S::kReadError;
  if (length > limit) return S::kTooLarge;
  bytes.resize(static_cast<size_t>(length));
  if (length && !file.ReadAtCurrentPosAndCheck(base::as_writable_byte_span(bytes))) return S::kReadError;
  base::File::Info after;
  if (!file.GetInfo(&after)) return S::kReadError;
  if (after.size != info.size || after.last_modified != info.last_modified) return S::kChanged;
  return S::kRead;
}
std::string Hash(const std::string& bytes) { return base::HexEncodeLower(crypto::SHA256HashString(bytes)); }
}
LegacySnapshot::~LegacySnapshot() { Clear(sync_json); Clear(shared_json); }
LegacySnapshotRead ReadLegacySnapshot(const base::FilePath& root) {
  // A symlinked/relative/parent-traversing root is not silently rebound to a
  // different profile. This is not protection against a hostile ancestor race.
  if (!root.IsAbsolute() || root.ReferencesParent() ||
      base::MakeAbsoluteFilePath(root) != root.StripTrailingSeparators())
    return {S::kInvalidRoot, {}};
  LegacySnapshot first, second;
  const auto pass = [&](LegacySnapshot& result) {
    auto status = Read(root.AppendASCII("sync.json"), 65536, result.sync_json);
    if (status != S::kRead) return status;
    return Read(root.AppendASCII("shared-spaces.json"), 8 * 1024 * 1024, result.shared_json);
  };
  auto status = pass(first); if (status != S::kRead) return {status, {}};
  status = pass(second); if (status != S::kRead) return {status, {}};
  if (first.sync_json != second.sync_json || first.shared_json != second.shared_json)
    return {S::kChanged, {}};
  first.sync_sha256 = Hash(first.sync_json); first.shared_sha256 = Hash(first.shared_json);
  return {S::kRead, std::move(first)};
}
}

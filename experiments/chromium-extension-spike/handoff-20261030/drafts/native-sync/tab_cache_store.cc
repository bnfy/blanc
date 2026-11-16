#include "tab_cache_store.h"
#include "base/files/file.h"
#include "base/files/important_file_writer.h"
#include "base/json/json_reader.h"
#include "base/json/json_writer.h"
#include "base/strings/string_util.h"
#include "build/build_config.h"
#include <algorithm>

namespace blanc::sync {
namespace {
constexpr size_t kMaxPayload = 1024 * 1024;
constexpr int64_t kMaxEnvelope = 6 * kMaxPayload + 1024;
bool ValidAccount(const std::string& value) {
  return value.size() == 64 && std::all_of(value.begin(), value.end(), [](char c) {
    return (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f');
  });
}
}
TabCacheStore::TabCacheStore(std::shared_ptr<ProfileStateStore> profile)
    : profile_(std::move(profile)) {}
TabCacheStore::Status TabCacheStore::CheckIdentity(int revision, const std::string& account) {
  if (!profile_ || revision < 0 || !ValidAccount(account)) return Status::kNotAllowed;
  auto status = profile_->ReadyMarker();
  if (status != Status::kLoaded) return status;
  auto state = profile_->Read();
  if (!state.state) return state.status;
  if (!state.state->enabled || state.state->erasure_pending ||
      state.state->identity_revision != revision || state.state->account_id != account)
    return Status::kWrongAccount;
  return Status::kLoaded;
}
TabCacheStore::Loaded TabCacheStore::Read(int revision, const std::string& account) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  const auto allowed = CheckIdentity(revision, account);
  if (allowed != Status::kLoaded) return {allowed, {}};
#if BUILDFLAG(IS_POSIX)
  base::File file(profile_->folder_.AppendASCII("tabs-cache.json"),
                  base::File::FLAG_OPEN | base::File::FLAG_READ | base::File::FLAG_NO_FOLLOW);
  if (!file.IsValid()) return {file.error_details() == base::File::FILE_ERROR_NOT_FOUND
      ? Status::kMissing : Status::kReadError, {}};
  const auto length = file.GetLength();
  if (length <= 0 || length > kMaxEnvelope) return {Status::kCorrupt, {}};
  std::string bytes(static_cast<size_t>(length), '\0');
  if (!file.ReadAtCurrentPosAndCheck(base::as_writable_byte_span(bytes))) return {Status::kReadError, {}};
  const auto envelope = base::JSONReader::ReadDict(bytes, base::JSON_PARSE_RFC, 4);
  if (!envelope || envelope->size() != 4 || envelope->FindInt("version") != 1)
    return {Status::kCorrupt, {}};
  const auto* profile = envelope->FindString("profile");
  const auto* stored_account = envelope->FindString("account");
  const auto* payload = envelope->FindString("payload");
  if (!profile || !stored_account || !ValidAccount(*stored_account) || !payload ||
      payload->empty() || payload->size() > kMaxPayload)
    return {Status::kCorrupt, {}};
  if (*profile != profile_->binding_) return {Status::kWrongProfile, {}};
  // Never return a previous account's cached bytes to a new account.
  if (*stored_account != account) return {Status::kMissing, {}};
  return {Status::kLoaded, *payload};
#else
  // Handle/reparse-point checks are not yet qualified on Windows.
  return {Status::kNotAllowed, {}};
#endif
}
TabCacheStore::Status TabCacheStore::Commit(int revision, const std::string& account,
                                           const std::string& payload) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  auto current = Read(revision, account);
  if (current.status != Status::kLoaded && current.status != Status::kMissing)
    return current.status;
  if (payload.empty() || payload.size() > kMaxPayload ||
      !base::IsStringUTF8AllowingNoncharacters(payload)) return Status::kCorrupt;
  // State mutations and this commit must all be serialized on the same worker.
  // Recheck after model execution and again immediately before the write.
  const auto allowed = CheckIdentity(revision, account);
  if (allowed != Status::kLoaded) return allowed;
  base::DictValue envelope; envelope.Set("version", 1); envelope.Set("profile", profile_->binding_);
  envelope.Set("account", account); envelope.Set("payload", payload);
  const auto bytes = base::WriteJson(envelope);
  if (!bytes || bytes->size() > static_cast<size_t>(kMaxEnvelope)) return Status::kCorrupt;
  return base::ImportantFileWriter::WriteFileAtomically(
      profile_->folder_.AppendASCII("tabs-cache.json"), *bytes, "BlancTabCache")
      ? Status::kLoaded : Status::kWriteError;
}
}  // namespace blanc::sync

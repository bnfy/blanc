#include "profile_state_store.h"
#include "base/base64.h"
#include "base/auto_reset.h"
#include "base/check.h"
#include "base/files/file.h"
#include "base/files/file_util.h"
#include "base/files/important_file_writer.h"
#include "base/json/json_reader.h"
#include "base/json/json_writer.h"
#include "base/strings/string_util.h"
#include "base/strings/utf_string_conversions.h"
#include "base/uuid.h"
#include <limits>

namespace blanc::sync {
namespace {
constexpr int64_t kMaxBytes = 16384;
bool Binding(const std::string& value) {
  return value.size() == 64 && std::all_of(value.begin(), value.end(), [](char c) {
    return (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f');
  });
}
bool Blob(const std::string& value) {
  if (value.empty() || value.size() > 5500) return false;
  const auto bytes = base::Base64Decode(value);
  return bytes && bytes->size() >= 3 && bytes->size() <= 4096 &&
      base::Base64Encode(*bytes) == value;
}
bool ErrorCode(const std::string& value) {
  static const std::vector<std::string> codes = {"", "offline", "rate-limited",
      "conflict", "server", "server-error", "erasure-pending", "account-quota",
      "bad-passphrase", "service-unavailable"};
  return std::find(codes.begin(), codes.end(), value) != codes.end() ||
      (value.size() == 12 && value.starts_with("rejected:4") &&
       value[10] >= '0' && value[10] <= '9' && value[11] >= '0' && value[11] <= '9');
}
bool Valid(const ProfileSyncState& state) {
  const auto id = base::Uuid::ParseLowercase(state.device_id);
  if (!id.is_valid() || state.device_id[14] != '4' ||
      !std::string_view("89ab").contains(state.device_id[19]) ||
      state.identity_revision < 0 || !std::isfinite(state.last_synced_at) ||
      state.last_synced_at < 0 || !ErrorCode(state.last_error) ||
      (state.origin != "" && state.origin != "generated") ||
      !base::IsStringUTF8AllowingNoncharacters(state.handle) ||
      !EncodeRequestState(state.quota)) return false;
  if (state.enabled) {
    if (!Binding(state.account_id) || !Blob(state.protected_key) ||
        base::UTF8ToUTF16(state.handle).size() < 2) return false;
  } else if (!state.account_id.empty() || !state.protected_key.empty() ||
             !state.handle.empty() || state.sync_spaces || state.erasure_pending) return false;
  return true;
}
bool Advance(ProfileSyncState& state) {
  if (state.identity_revision == std::numeric_limits<int>::max()) return false;
  ++state.identity_revision; return true;
}
struct Marker {
  RequestLedger::Status status;
  std::string phase;
};
Marker ReadMarker(const base::FilePath& path, const std::string& binding) {
  using Status = RequestLedger::Status;
  base::File file(path, base::File::FLAG_OPEN | base::File::FLAG_READ);
  if (!file.IsValid()) return {file.error_details() == base::File::FILE_ERROR_NOT_FOUND
      ? Status::kMissing : Status::kReadError, {}};
  const auto length = file.GetLength();
  if (length < 0) return {Status::kReadError, {}};
  if (!length || length > 512) return {Status::kCorrupt, {}};
  std::string bytes(static_cast<size_t>(length), '\0');
  if (!file.ReadAtCurrentPosAndCheck(base::as_writable_byte_span(bytes)))
    return {Status::kReadError, {}};
  const auto json = base::JSONReader::ReadDict(bytes, base::JSON_PARSE_RFC, 3);
  if (!json || json->size() != 3 || json->FindInt("version") != 1)
    return {Status::kCorrupt, {}};
  const auto* profile = json->FindString("profile");
  const auto* phase = json->FindString("phase");
  if (!profile || !Binding(*profile) || !phase || (*phase != "preparing" && *phase != "ready"))
    return {Status::kCorrupt, {}};
  if (*profile != binding) return {Status::kWrongProfile, {}};
  return {Status::kLoaded, *phase};
}
bool WriteMarker(const base::FilePath& path, const std::string& binding, const char* phase) {
  base::DictValue json; json.Set("version", 1); json.Set("profile", binding);
  json.Set("phase", phase);
  const auto bytes = base::WriteJson(json);
  return bytes && base::ImportantFileWriter::WriteFileAtomically(path, *bytes, "BlancSyncBootstrap");
}
}  // namespace
ProfileStateStore::ProfileStateStore(base::FilePath root, std::string binding,
                                     bool personal, bool off_the_record)
    : folder_(root.AppendASCII("Blanc Sync")), path_(folder_.AppendASCII("state.json")),
      marker_(root.AppendASCII("Blanc Sync.bootstrap")),
      binding_(std::move(binding)), personal_(personal), private_(off_the_record) {}
bool ProfileStateStore::Allowed() const {
  return personal_ && !private_ && folder_.IsAbsolute() && Binding(binding_);
}
ProfileStateStore::Status ProfileStateStore::ReadyMarker() {
  if (!Allowed()) return Status::kNotAllowed;
  const auto marker = ReadMarker(marker_, binding_);
  return marker.status != Status::kLoaded ? marker.status
      : marker.phase == "ready" ? Status::kLoaded : Status::kNotAllowed;
}
ProfileStateStore::Status ProfileStateStore::Bootstrap(BootstrapMode mode) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  if (!Allowed()) return Status::kNotAllowed;
  auto marker = ReadMarker(marker_, binding_);
  if (marker.status == Status::kMissing) {
    const auto existing = Read();
    if (existing.status != Status::kMissing) return existing.status == Status::kLoaded
        ? Status::kCorrupt : existing.status;
    if (mode != BootstrapMode::kKnownFirstNativeSetup) return Status::kMissing;
    if (!WriteMarker(marker_, binding_, "preparing")) return Status::kWriteError;
    marker = {Status::kLoaded, "preparing"};
  }
  if (marker.status != Status::kLoaded) return marker.status;
  if (marker.phase == "ready") return Read().status;
  auto current = Read();
  if (current.status == Status::kMissing) {
    base::AutoReset<bool> bootstrap(&bootstrapping_, true);
    const auto status = InitializeProfile();
    if (status != Status::kLoaded) return status;
    current = Read();
  }
  if (!current.state) return current.status;
  const auto& state = *current.state;
  // A preparing marker never authorizes live activity. Only an untouched fresh
  // bundle can complete that interrupted initialization; preserve anything else.
  if (state.enabled || state.identity_revision || state.sync_tabs || state.sync_spaces ||
      !state.quota.log.empty() || state.quota.window_limit != 10 ||
      state.quota.backoff_until || !state.quota.cursors.empty()) return Status::kCorrupt;
  return WriteMarker(marker_, binding_, "ready") ? Status::kLoaded : Status::kWriteError;
}
ProfileStateStore::Loaded ProfileStateStore::Read() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  if (!Allowed()) return {Status::kNotAllowed, {}};
  base::File file(path_, base::File::FLAG_OPEN | base::File::FLAG_READ);
  if (!file.IsValid()) return {file.error_details() == base::File::FILE_ERROR_NOT_FOUND
      ? Status::kMissing : Status::kReadError, {}};
  observed_existing_ = true;
  const auto length = file.GetLength();
  if (length < 0) return {Status::kReadError, {}};
  if (!length || length > kMaxBytes) return {Status::kCorrupt, {}};
  std::string bytes(static_cast<size_t>(length), '\0');
  if (!file.ReadAtCurrentPosAndCheck(base::as_writable_byte_span(bytes)))
    return {Status::kReadError, {}};
  auto root = base::JSONReader::ReadDict(bytes, base::JSON_PARSE_RFC, 8);
  if (!root || root->size() != 16 || root->FindInt("version") != 1)
    return {Status::kCorrupt, {}};
  const auto* profile = root->FindString("profile");
  if (!profile || !Binding(*profile)) return {Status::kCorrupt, {}};
  if (*profile != binding_) return {Status::kWrongProfile, {}};
  ProfileSyncState state;
  const auto string = [&](const char* key, std::string& value) {
    const auto* found = root->FindString(key); if (!found) return false;
    value = *found; return true;
  };
  const auto boolean = [&](const char* key, bool& value) {
    const auto found = root->FindBool(key); if (!found) return false;
    value = *found; return true;
  };
  const auto revision = root->FindInt("revision");
  const auto last_sync = root->FindDouble("lastSyncedAt");
  const auto* quota = root->FindDict("quota");
  if (!revision || !last_sync || !quota || quota->size() != 5 ||
      !string("deviceId", state.device_id) || !string("handle", state.handle) ||
      !string("account", state.account_id) || !string("protectedKey", state.protected_key) ||
      !string("origin", state.origin) || !string("lastError", state.last_error) ||
      !boolean("enabled", state.enabled) || !boolean("syncTabs", state.sync_tabs) ||
      !boolean("syncSpaces", state.sync_spaces) || !boolean("erasurePending", state.erasure_pending) ||
      !boolean("recoveryPromptDismissed", state.recovery_prompt_dismissed))
    return {Status::kCorrupt, {}};
  auto decoded = DecodeRequestState(*quota); if (!decoded) return {Status::kCorrupt, {}};
  state.quota = std::move(*decoded); state.identity_revision = *revision;
  state.last_synced_at = *last_sync;
  if (!Valid(state)) return {Status::kCorrupt, {}};
  return {Status::kLoaded, std::move(state)};
}
ProfileStateStore::Status ProfileStateStore::InitializeProfile() {
  const auto loaded = Read();
  if (loaded.status != Status::kMissing) return loaded.status == Status::kLoaded
      ? Status::kAlreadyExists : loaded.status;
  if (observed_existing_) return Status::kMissing;
  if (!base::CreateDirectory(folder_)) return Status::kWriteError;
  ProfileSyncState state; state.device_id = base::Uuid::GenerateRandomV4().AsLowercaseString();
  return Save(state);
}
ProfileStateStore::Status ProfileStateStore::Save(const ProfileSyncState& state) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  if (!Allowed()) return Status::kNotAllowed;
  if (!bootstrapping_) {
    const auto ready = ReadyMarker(); if (ready != Status::kLoaded) return ready;
  }
  if (!Valid(state)) return Status::kCorrupt;
  base::DictValue root;
  root.Set("version", 1); root.Set("profile", binding_);
  root.Set("deviceId", state.device_id); root.Set("revision", state.identity_revision);
  root.Set("handle", state.handle); root.Set("account", state.account_id);
  root.Set("protectedKey", state.protected_key); root.Set("origin", state.origin);
  root.Set("lastError", state.last_error); root.Set("enabled", state.enabled);
  root.Set("syncTabs", state.sync_tabs); root.Set("syncSpaces", state.sync_spaces);
  root.Set("erasurePending", state.erasure_pending);
  root.Set("recoveryPromptDismissed", state.recovery_prompt_dismissed);
  root.Set("lastSyncedAt", state.last_synced_at);
  auto quota = EncodeRequestState(state.quota); root.Set("quota", std::move(*quota));
  const auto bytes = base::WriteJson(root);
  if (!bytes || bytes->size() > static_cast<size_t>(kMaxBytes)) return Status::kCorrupt;
  // Chromium atomic replacement/flush; no system-crash integrity guarantee.
  if (!base::ImportantFileWriter::WriteFileAtomically(path_, *bytes, "BlancSyncProfile"))
    return Status::kWriteError;
  observed_existing_ = true;
  return Status::kLoaded;
}
ProfileStateStore::Status ProfileStateStore::Adopt(int expected_revision, std::string handle, std::string account,
                                                 std::string protected_key, bool generated) {
  auto loaded = Read(); if (!loaded.state) return loaded.status;
  if (loaded.state->identity_revision != expected_revision) return Status::kWrongAccount;
  auto state = std::move(*loaded.state);
  if (!Advance(state)) return Status::kCorrupt;
  if (state.account_id != account) {
    state.sync_spaces = false; state.last_synced_at = 0;
    state.origin = generated ? "generated" : "";
    if (generated) state.recovery_prompt_dismissed = false;
    state.quota.next = RequestClass::kIndex; state.quota.cursors.clear();
  }
  state.enabled = true; state.handle = std::move(handle); state.account_id = std::move(account);
  state.protected_key = std::move(protected_key); state.erasure_pending = false; state.last_error.clear();
  return Save(state);
}
ProfileStateStore::Status ProfileStateStore::SetConsents(int expected_revision, bool tabs, bool spaces) {
  auto loaded = Read(); if (!loaded.state) return loaded.status;
  if (loaded.state->identity_revision != expected_revision) return Status::kWrongAccount;
  auto& state = *loaded.state;
  if (state.sync_tabs == tabs && state.sync_spaces == spaces) return Status::kLoaded;
  if (!Advance(state)) return Status::kCorrupt;
  state.sync_tabs = tabs; state.sync_spaces = spaces; return Save(state);
}
ProfileStateStore::Status ProfileStateStore::SetErasurePending(int expected_revision, bool pending) {
  auto loaded = Read(); if (!loaded.state) return loaded.status;
  if (loaded.state->identity_revision != expected_revision) return Status::kWrongAccount;
  loaded.state->erasure_pending = pending;
  loaded.state->last_error = pending ? "erasure-pending" : "";
  return Save(*loaded.state);
}
ProfileStateStore::Status ProfileStateStore::RecordResult(int expected_revision, double success_time,
                                                         const std::string& error_code) {
  auto loaded = Read(); if (!loaded.state) return loaded.status;
  if (loaded.state->identity_revision != expected_revision) return Status::kWrongAccount;
  if (!loaded.state->enabled || !ErrorCode(error_code) ||
      !std::isfinite(success_time) || success_time < 0) return Status::kCorrupt;
  if (error_code.empty()) loaded.state->last_synced_at = success_time;
  loaded.state->last_error = error_code;
  return Save(*loaded.state);
}
ProfileStateStore::Status ProfileStateStore::DismissRecoveryPrompt(int expected_revision) {
  auto loaded = Read(); if (!loaded.state) return loaded.status;
  if (loaded.state->identity_revision != expected_revision) return Status::kWrongAccount;
  if (loaded.state->recovery_prompt_dismissed) return Status::kLoaded;
  loaded.state->recovery_prompt_dismissed = true; return Save(*loaded.state);
}
ProfileStateStore::Status ProfileStateStore::RewrapProtectedKey(int revision,
                                                              std::string protected_key) {
  auto loaded = Read(); if (!loaded.state) return loaded.status;
  if (loaded.state->identity_revision != revision || !loaded.state->enabled)
    return Status::kWrongAccount;
  loaded.state->protected_key = std::move(protected_key); return Save(*loaded.state);
}
ProfileStateStore::Status ProfileStateStore::ClearCredentials(int expected_revision) {
  auto loaded = Read(); if (!loaded.state) return loaded.status;
  if (loaded.state->identity_revision != expected_revision) return Status::kWrongAccount;
  auto& state = *loaded.state;
  if (!Advance(state)) return Status::kCorrupt;
  state.enabled = false; state.handle.clear(); state.account_id.clear(); state.protected_key.clear();
  state.sync_spaces = false; state.erasure_pending = false; state.last_error.clear();
  return Save(state);
}
ProfileStateStore::Status ProfileStateStore::CommitQuota(int revision, const SchedulerState& quota) {
  auto loaded = Read(); if (!loaded.state) return loaded.status;
  if (loaded.state->identity_revision != revision) return Status::kWrongAccount;
  loaded.state->quota = quota; return Save(*loaded.state);
}
class ProfileRequestLedger : public RequestLedger {
 public:
  ProfileRequestLedger(std::shared_ptr<ProfileStateStore> store, int revision)
      : store_(std::move(store)), revision_(revision) {}
  Loaded Load() override {
    const auto ready = store_->ReadyMarker(); if (ready != Status::kLoaded) return {ready, {}};
    auto loaded = store_->Read();
    if (!loaded.state) return {loaded.status, {}};
    if (loaded.state->identity_revision != revision_) return {Status::kWrongAccount, {}};
    return {Status::kLoaded, std::move(loaded.state->quota)};
  }
  Status InitializeNew() override { return Status::kNotAllowed; }
  Status Commit(const SchedulerState& quota) override { return store_->CommitQuota(revision_, quota); }
 private:
  std::shared_ptr<ProfileStateStore> store_;
  int revision_;
};
std::unique_ptr<RequestLedger> ProfileStateStore::MakeLedger() {
  if (ReadyMarker() != Status::kLoaded) return nullptr;
  auto loaded = Read(); auto self = weak_from_this().lock();
  if (!loaded.state || !self) return nullptr;
  return std::make_unique<ProfileRequestLedger>(std::move(self), loaded.state->identity_revision);
}
}  // namespace blanc::sync

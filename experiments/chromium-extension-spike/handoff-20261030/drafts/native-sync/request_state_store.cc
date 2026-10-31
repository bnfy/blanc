#include "request_state_store.h"
#include "base/check.h"
#include "base/containers/span.h"
#include "base/files/file.h"
#include "base/files/file_util.h"
#include "base/files/important_file_writer.h"
#include "base/json/json_reader.h"
#include "base/json/json_writer.h"
#include "base/values.h"

namespace blanc::sync {
namespace {
constexpr size_t kMaxBytes = 16384;
bool BindingValid(const std::string& value) {
  return value.size() == 64 && std::all_of(value.begin(), value.end(),
      [](char c) { return (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f'); });
}
std::optional<std::string> ClassName(RequestClass kind) {
  switch (kind) {
    case RequestClass::kIndex: return "I";
    case RequestClass::kSpace: return "S";
    case RequestClass::kFixed: return "F";
    case RequestClass::kRemote: return "R";
  }
  return std::nullopt;
}
std::optional<RequestClass> ParseClass(const std::string& name) {
  for (auto kind : kClasses) if (ClassName(kind) == name) return kind;
  return std::nullopt;
}
bool CursorValid(const std::string& value) {
  return !value.empty() && value.size() <= 256 &&
      std::all_of(value.begin(), value.end(), [](unsigned char c) {
        return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') ||
               (c >= '0' && c <= '9') || c == '-' || c == '_';
      });
}
bool Valid(const SchedulerState& state) {
  if (!ClassName(state.next) || state.log.size() > 10 ||
      state.window_limit < 3 || state.window_limit > 10 ||
      (state.backoff_until && !std::isfinite(*state.backoff_until))) return false;
  for (auto timestamp : state.log)
    if (!std::isfinite(timestamp) || timestamp < 0) return false;
  for (const auto& [kind, cursor] : state.cursors)
    if (!ClassName(kind) || !CursorValid(cursor)) return false;
  return true;
}
}  // namespace

std::optional<SchedulerState> DecodeRequestState(const base::DictValue& value) {
  const auto* root = &value;
  const auto* log = root->FindList("log");
  const auto* cursors = root->FindDict("cursors");
  const auto* next = root->FindString("nextClass");
  const auto limit = root->FindInt("windowLimit");
  const auto* backoff = root->Find("backoffUntil");
  if (!log || !cursors || !next || !ParseClass(*next) || !limit || !backoff)
    return std::nullopt;
  SchedulerState state;
  state.next = *ParseClass(*next); state.window_limit = *limit;
  for (const auto& value : *log) {
    const auto number = value.GetIfDouble();
    if (!number) return std::nullopt;
    state.log.push_back(*number);
  }
  if (!backoff->is_none()) {
    state.backoff_until = backoff->GetIfDouble();
    if (!state.backoff_until) return std::nullopt;
  }
  for (const auto [name, value] : *cursors) {
    const auto kind = ParseClass(name);
    const auto* cursor = value.GetIfString();
    if (!kind || !cursor) return std::nullopt;
    state.cursors.emplace(*kind, *cursor);
  }
  if (!Valid(state)) return std::nullopt;
  return state;
}
std::optional<base::DictValue> EncodeRequestState(const SchedulerState& state) {
  if (!Valid(state)) return std::nullopt;
  base::DictValue root;
  root.Set("nextClass", *ClassName(state.next));
  root.Set("windowLimit", state.window_limit);
  base::ListValue log;
  for (double timestamp : state.log) log.Append(timestamp);
  root.Set("log", std::move(log));
  base::DictValue cursors;
  for (const auto& [kind, cursor] : state.cursors)
    cursors.Set(*ClassName(kind), cursor);
  root.Set("cursors", std::move(cursors));
  root.Set("backoffUntil", state.backoff_until
      ? base::Value(*state.backoff_until) : base::Value());
  return root;
}
RequestStateStore::RequestStateStore(base::FilePath path, std::string binding)
    : path_(std::move(path)), binding_(std::move(binding)) {}

RequestStateStore::Loaded RequestStateStore::Load() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  if (!BindingValid(binding_) || !path_.IsAbsolute())
    return {Status::kInvalidBinding, {}};
  base::File file(path_, base::File::FLAG_OPEN | base::File::FLAG_READ);
  if (!file.IsValid()) return {file.error_details() == base::File::FILE_ERROR_NOT_FOUND
      ? Status::kMissing : Status::kReadError, {}};
  const int64_t length = file.GetLength();
  if (length < 0) return {Status::kReadError, {}};
  if (length == 0 || length > static_cast<int64_t>(kMaxBytes))
    return {Status::kCorrupt, {}};
  std::string bytes(static_cast<size_t>(length), '\0');
  if (!file.ReadAtCurrentPosAndCheck(base::as_writable_byte_span(bytes)))
    return {Status::kReadError, {}};
  auto root = base::JSONReader::ReadDict(bytes, base::JSON_PARSE_RFC, 8);
  if (!root || root->FindInt("version") != 1) return {Status::kCorrupt, {}};
  const auto* binding = root->FindString("account");
  if (!binding || !BindingValid(*binding)) return {Status::kCorrupt, {}};
  if (*binding != binding_) return {Status::kWrongAccount, {}};
  auto state = DecodeRequestState(*root);
  if (!state) return {Status::kCorrupt, {}};
  return {Status::kLoaded, std::move(state)};
}
RequestStateStore::Status RequestStateStore::InitializeNew() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  const auto loaded = Load();
  if (loaded.status != Status::kMissing) return loaded.status == Status::kLoaded
      ? Status::kAlreadyExists : loaded.status;
  return Write(SchedulerState{});
}
RequestStateStore::Status RequestStateStore::Commit(const SchedulerState& state) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  const auto loaded = Load();
  if (loaded.status != Status::kLoaded) return loaded.status;
  return Write(state);
}
RequestStateStore::Status RequestStateStore::Write(const SchedulerState& state) {
  auto encoded = EncodeRequestState(state);
  if (!encoded) return Status::kCorrupt;
  auto root = std::move(*encoded);
  root.Set("version", 1); root.Set("account", binding_);
  const auto bytes = base::WriteJson(root);
  if (!bytes || bytes->size() > kMaxBytes) return Status::kCorrupt;
  // ImportantFileWriter provides Chromium's atomic replacement and file flush.
  // It explicitly does not guarantee integrity across a system crash. Missing
  // or corrupt state after recovery remains fail-closed, not a quota reset.
  return base::ImportantFileWriter::WriteFileAtomically(path_, *bytes, "BlancSync")
      ? Status::kLoaded : Status::kWriteError;
}
}  // namespace blanc::sync

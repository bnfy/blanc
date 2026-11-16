#include "legacy_request_state.h"
#include "base/json/json_reader.h"
namespace blanc::sync {
std::optional<SchedulerState> ParseLegacyRequestState(std::string_view bytes) {
  // Shared Spaces also contains user models; do not copy those into quota.
  if (bytes.size() > 8 * 1024 * 1024) return std::nullopt;
  auto source = base::JSONReader::ReadDict(bytes, base::JSON_PARSE_RFC, 32);
  if (!source) return std::nullopt;
  const auto* log = source->FindList("requestLog");
  if (!log) return std::nullopt;
  base::DictValue native;
  native.Set("log", log->Clone());
  const auto copy = [&](const char* name, base::Value fallback) {
    const auto* value = source->Find(name);
    native.Set(name, value ? value->Clone() : std::move(fallback));
  };
  copy("nextClass", base::Value("I"));
  copy("cursors", base::Value(base::DictValue()));
  copy("windowLimit", base::Value(10));
  copy("backoffUntil", base::Value());
  // Do not silently drop malformed entries, enlarge a reduced limit, remove
  // future wall timestamps or erase backoff. Existing native decoder validates
  // bounds; the scheduler restores the full monotonic charge window.
  return DecodeRequestState(native);
}
}

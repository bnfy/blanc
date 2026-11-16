#include "bang_mutation.h"
#include "bang_prefs.h"
#include "base/strings/utf_string_conversions.h"
namespace blanc::bangs::draft {
namespace {
std::vector<CustomBangInput> ToInputs(const std::vector<BangEntry>& entries) {
  std::vector<CustomBangInput> result; result.reserve(entries.size());
  for (const auto& entry : entries)
    result.push_back({base::UTF8ToUTF16(entry.code), entry.name, entry.template_url});
  return result;
}
}  // namespace
CustomMutation AddCustomBang(PrefService* prefs, const CustomBangInput& input) {
  auto state = ReadBangPrefs(prefs);
  if (!state) return CustomMutation::kUnavailable;
  auto normalized = NormalizeCustomBangs({input});
  if (normalized.size() != 1) return CustomMutation::kInvalid;
  for (const auto& item : state->custom)
    if (item.code == normalized[0].code) return CustomMutation::kDuplicate;
  if (state->custom.size() >= 100) return CustomMutation::kLimit;
  auto rows = ToInputs(state->custom);
  rows.push_back({base::UTF8ToUTF16(normalized[0].code), normalized[0].name, normalized[0].template_url});
  return SetBangCustom(prefs, rows) ? CustomMutation::kChanged : CustomMutation::kUnavailable;
}
CustomMutation RemoveCustomBang(PrefService* prefs, std::string_view code) {
  auto state = ReadBangPrefs(prefs);
  if (!state) return CustomMutation::kUnavailable;
  auto rows = ToInputs(state->custom);
  bool found = false;
  for (size_t i = 0; i < state->custom.size(); ++i) {
    if (state->custom[i].code == code) { rows.erase(rows.begin()+i); found = true; break; }
  }
  if (!found) return CustomMutation::kNotFound;
  return SetBangCustom(prefs, rows) ? CustomMutation::kChanged : CustomMutation::kUnavailable;
}
}  // namespace blanc::bangs::draft

// Copyright 2026 Bananify Creative. MIT; see LICENSE.
#ifndef BLANC_BROWSER_SYNC_DESKTOP_SYNC_SETTINGS_H_
#define BLANC_BROWSER_SYNC_DESKTOP_SYNC_SETTINGS_H_
#include <string_view>
#include "base/values.h"
class Profile;
namespace blanc {
// Omit unloaded, policy-controlled and unrepresentable native values.
base::DictValue ReadDesktopSyncSettings(Profile* profile);
bool SupportedDesktopSyncSetting(std::string_view key, const base::Value& value);
// Only the seven mapped keys are considered. Search engine/template apply as
// one pair. The caller reads back to detect policy refusals / normalization.
void ApplyDesktopSyncSettings(Profile* profile, const base::DictValue& patch);
}  // namespace blanc
#endif

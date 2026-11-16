// Copyright 2026 Bananify Creative. MIT; see LICENSE.
#ifndef BLANC_BROWSER_SYNC_SYNC_MERGE_H_
#define BLANC_BROWSER_SYNC_SYNC_MERGE_H_

#include <array>
#include <optional>
#include <string>
#include <string_view>

namespace blanc::sync_merge {
// URLs are canonicalized by the adapter. Empty folder means ungrouped.
struct Favorite {
  std::string title;
  std::string folder;
  bool operator==(const Favorite&) const = default;
};
enum class Direction { kNone, kApplyRemote, kPublishLocal, kAskFirstUpload };
// A publish is a proposal to bookmarks.mergeFromSync, NOT a forced overwrite.
// That shipping method arbitrates updatedAt/addedAt and tombstones. The host
// journals the proposal's original timestamp, then reads back the winner.
Direction FavoriteDirection(const std::optional<Favorite>& local,
                            const std::optional<Favorite>& remote,
                            const std::optional<Favorite>& seen,
                            bool local_only, bool upload_confirmed);

// An unfinished native write is an apply retry, never evidence of deletion.
// An observed subsequent user edit takes precedence over that recovery intent.
bool RecoverFavoriteWrite(const std::optional<Favorite>& local,
                          const std::optional<Favorite>& before,
                          const std::optional<Favorite>& after, bool edited);

// Mirror the shipping Favorites clock rule for tests and documentation.
// Equal item clocks keep the runner's item; equal tombstone clocks delete.
bool LocalItemWins(double local_at, double remote_at, double deleted_at);

enum class SettingKind { kTheme, kBoolean, kStrings, kEngine, kTemplate, kBangs };
struct SettingMapping {
  std::string_view key;
  // Empty means TemplateURLService. Theme names its observation pref, but
  // writes through ThemeService.
  std::string_view pref;
  SettingKind kind;
};
inline constexpr std::array<SettingMapping, 7> kSettings = {{
    {"theme", "browser.theme.color_scheme2", SettingKind::kTheme},
    {"adblockEnabled", "blanc.blocking.enabled", SettingKind::kBoolean},
    {"adblockExceptions", "blanc.blocking.exceptions", SettingKind::kStrings},
    {"searchEngine", "", SettingKind::kEngine},
    {"searchEngineTemplate", "", SettingKind::kTemplate},
    {"bangsEnabled", "blanc.bangs.enabled", SettingKind::kBoolean},
    {"customBangs", "blanc.bangs.custom", SettingKind::kBangs},
}};
// Values are canonical JSON. Unknown/unsupported values never get republished.
// As SyncedSettings does, a remote setting wins simultaneous edits; a purely
// local edit goes through settings.setSettings and shipping's Lamport clocks.
Direction SettingDirection(std::string_view local, std::string_view remote,
                           const std::optional<std::string>& seen,
                           bool supported);
}  // namespace blanc::sync_merge
#endif

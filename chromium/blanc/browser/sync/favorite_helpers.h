// Copyright 2026 Bananify Creative. MIT; see LICENSE.
#ifndef BLANC_BROWSER_SYNC_FAVORITE_HELPERS_H_
#define BLANC_BROWSER_SYNC_FAVORITE_HELPERS_H_

#include <cstddef>
#include <optional>
#include <string>
#include "base/strings/utf_string_conversions.h"
#include "chrome/browser/profiles/profile.h"
#include "components/bookmarks/browser/bookmark_client.h"
#include "components/bookmarks/browser/bookmark_model.h"
#include "components/bookmarks/browser/bookmark_node.h"
#include "components/bookmarks/common/bookmark_pref_names.h"
#include "components/prefs/pref_service.h"
#include "third_party/icu/source/common/unicode/ustring.h"

namespace blanc::favorites {
inline constexpr size_t kFolderMaxLength = 100;
inline bool IsJavaScriptTrimSpace(char16_t c) {
  return (c >= 0x0009 && c <= 0x000d) || c == 0x0020 || c == 0x00a0 ||
         c == 0x1680 || (c >= 0x2000 && c <= 0x200a) || c == 0x2028 ||
         c == 0x2029 || c == 0x202f || c == 0x205f || c == 0x3000 ||
         c == 0xfeff;
}
inline std::optional<std::u16string> ValidFolderName(const std::string& folder) {
  const std::u16string value = base::UTF8ToUTF16(folder);
  size_t begin = 0, end = value.size();
  while (begin < end && IsJavaScriptTrimSpace(value[begin])) ++begin;
  while (end > begin && IsJavaScriptTrimSpace(value[end - 1])) --end;
  const std::u16string trimmed = value.substr(begin, end - begin);
  if (trimmed.empty() || trimmed.size() > kFolderMaxLength) return std::nullopt;
  return trimmed;
}

// JavaScript's toLowerCase is locale-independent. The ICU root locale avoids
// moving an existing Favorite merely because the machine uses Turkish casing.
inline std::optional<std::u16string> FavoriteFolderKey(const std::u16string& value) {
  UErrorCode status = U_ZERO_ERROR;
  const auto* input = reinterpret_cast<const UChar*>(value.data());
  const auto length = static_cast<int32_t>(value.size());
  const int32_t needed = u_strToLower(nullptr, 0, input, length, "", &status);
  if (status != U_BUFFER_OVERFLOW_ERROR && U_FAILURE(status)) return std::nullopt;
  status = U_ZERO_ERROR;
  std::u16string output(needed + 1, u'\0');
  const int32_t written = u_strToLower(reinterpret_cast<UChar*>(output.data()),
                                       needed + 1, input, length, "", &status);
  if (U_FAILURE(status) || written < 0 || written > needed) return std::nullopt;
  output.resize(written);
  return output;
}

// `/save <folder>` and Sync match Other bookmarks like shipping: Work and
// work are one folder, appended only if an editable match does not exist.
inline const bookmarks::BookmarkNode* FindOrCreateFolder(bookmarks::BookmarkModel* model,
                                                  const std::u16string& name,
                                                  const bookmarks::BookmarkNode* parent) {
  if (!parent) return nullptr;
  const auto key = FavoriteFolderKey(name);
  if (!key) return nullptr;
  for (const auto& child : parent->children()) {
    if (child->is_folder() && !model->client()->IsNodeManaged(child.get())) {
      const auto title = ValidFolderName(base::UTF16ToUTF8(child->GetTitle()));
      const auto child_key = title ? FavoriteFolderKey(*title) : std::nullopt;
      if (title && !child_key) return nullptr;
      if (child_key && *child_key == *key) return child.get();
    }
  }
  return model->AddFolder(parent, parent->children().size(), name);
}

inline bool CanEditFavorites(Profile* profile) {
  if (!profile || profile->IsOffTheRecord()) return false;
  auto* prefs = profile->GetPrefs();
  return prefs && prefs->FindPreference(bookmarks::prefs::kEditBookmarksEnabled) &&
         prefs->GetBoolean(bookmarks::prefs::kEditBookmarksEnabled);
}

}  // namespace blanc::favorites
#endif

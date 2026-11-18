// Copyright 2026 Bananify Creative. MIT; see LICENSE.
#ifndef BLANC_BROWSER_SYNC_FAVORITE_HELPERS_H_
#define BLANC_BROWSER_SYNC_FAVORITE_HELPERS_H_

#include <cstddef>
#include <optional>
#include <string>
#include <vector>
#include "base/location.h"
#include "base/strings/utf_string_conversions.h"
#include "chrome/browser/profiles/profile.h"
#include "components/bookmarks/browser/bookmark_client.h"
#include "components/bookmarks/browser/bookmark_model.h"
#include "components/bookmarks/browser/bookmark_node.h"
#include "components/bookmarks/common/bookmark_metrics.h"
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

// Folder paths (F63, shipping's favorites-tree.js). A favorite's `folder` is
// a whole path, its folder names joined by kPathSeparator; here each name is
// a real folder inside the one before it, under the profile's storage root.
inline constexpr char16_t kPathSeparator[] = u" \u203a ";
using FolderPath = std::vector<std::u16string>;

inline std::u16string TrimJavaScriptSpace(const std::u16string& value) {
  size_t begin = 0, end = value.size();
  while (begin < end && IsJavaScriptTrimSpace(value[begin])) ++begin;
  while (end > begin && IsJavaScriptTrimSpace(value[end - 1])) --end;
  return value.substr(begin, end - begin);
}

// Shipping's cleanSegment(): one folder name as stored. The separator's
// character becomes '>', the name is trimmed, and it holds 1 to 100 units.
inline std::optional<std::u16string> CleanSegment(const std::u16string& name) {
  std::u16string value = name;
  for (auto& c : value) if (c == u'\u203a') c = u'>';
  value = TrimJavaScriptSpace(value);
  if (value.empty() || value.size() > kFolderMaxLength) return std::nullopt;
  return value;
}

// splitPath(): the names between separators, each trimmed.
inline FolderPath SplitPath(const std::u16string& path) {
  FolderPath segments;
  if (TrimJavaScriptSpace(path).empty()) return segments;
  const std::u16string separator(kPathSeparator);
  size_t start = 0;
  while (true) {
    const size_t at = path.find(separator, start);
    segments.push_back(TrimJavaScriptSpace(path.substr(start, at == std::u16string::npos ? std::u16string::npos : at - start)));
    if (at == std::u16string::npos) break;
    start = at + separator.size();
  }
  return segments;
}

inline std::u16string JoinPath(const FolderPath& segments) {
  std::u16string joined;
  for (size_t i = 0; i < segments.size(); ++i) {
    if (i) joined += kPathSeparator;
    joined += segments[i];
  }
  return joined;
}

// validPath(): a path a page or a person typed. Every name must be usable
// and the whole path at most 100 units; nullopt refuses it (never "the top").
inline std::optional<FolderPath> ValidFolderPath(const std::string& path) {
  FolderPath segments = SplitPath(base::UTF8ToUTF16(path));
  if (segments.empty()) return std::nullopt;
  for (auto& segment : segments) {
    auto cleaned = CleanSegment(segment);
    if (!cleaned) return std::nullopt;
    segment = *cleaned;
  }
  if (JoinPath(segments).size() > kFolderMaxLength) return std::nullopt;
  return segments;
}

// storedPath(): a `folder` string as Sync or an import hands it over. Names
// that can't be used are skipped, as shipping reads them; empty is the top
// level. Only a path longer than 100 units is refused.
inline std::optional<FolderPath> StoredFolderPath(const std::string& folder) {
  FolderPath segments;
  for (const auto& segment : SplitPath(base::UTF8ToUTF16(folder)))
    if (auto cleaned = CleanSegment(segment)) segments.push_back(*cleaned);
  if (JoinPath(segments).size() > kFolderMaxLength) return std::nullopt;
  return segments;
}

// A folder node's name as a path segment, or nullopt for an unusable title.
inline std::optional<std::u16string> FolderSegment(const bookmarks::BookmarkNode* node) {
  return CleanSegment(node->GetTitle());
}

// The folder (in `parent`) whose name matches `name` without regard to case.
inline const bookmarks::BookmarkNode* FindChildFolder(bookmarks::BookmarkModel* model,
                                                      const bookmarks::BookmarkNode* parent,
                                                      const std::u16string& name,
                                                      const bookmarks::BookmarkNode* except = nullptr) {
  if (!parent) return nullptr;
  const auto cleaned = CleanSegment(name);
  const auto key = cleaned ? FavoriteFolderKey(*cleaned) : std::nullopt;
  if (!key) return nullptr;
  for (const auto& child : parent->children()) {
    if (!child->is_folder() || child.get() == except || model->client()->IsNodeManaged(child.get())) continue;
    const auto segment = FolderSegment(child.get());
    const auto child_key = segment ? FavoriteFolderKey(*segment) : std::nullopt;
    if (child_key && *child_key == *key) return child.get();
  }
  return nullptr;
}

// `/save <folder>` and Sync match Other bookmarks like shipping: Work and
// work are one folder, appended only if an editable match does not exist.
inline const bookmarks::BookmarkNode* FindOrCreateFolder(bookmarks::BookmarkModel* model,
                                                  const std::u16string& name,
                                                  const bookmarks::BookmarkNode* parent) {
  if (!parent) return nullptr;
  const auto cleaned = CleanSegment(name);
  if (!cleaned || !FavoriteFolderKey(*cleaned)) return nullptr;
  if (const auto* found = FindChildFolder(model, parent, *cleaned)) return found;
  return model->AddFolder(parent, parent->children().size(), *cleaned);
}

// The folder at `segments` under `root`, or null. Empty is `root` itself.
inline const bookmarks::BookmarkNode* FindFolderPath(bookmarks::BookmarkModel* model,
                                                     const bookmarks::BookmarkNode* root,
                                                     const FolderPath& segments) {
  const auto* node = root;
  for (const auto& segment : segments) {
    node = FindChildFolder(model, node, segment);
    if (!node) return nullptr;
  }
  return node;
}

// The folder at `segments` under `root`, each missing name created at the
// end of its parent.
inline const bookmarks::BookmarkNode* FindOrCreateFolderPath(bookmarks::BookmarkModel* model,
                                                             const bookmarks::BookmarkNode* root,
                                                             const FolderPath& segments) {
  const auto* node = root;
  for (const auto& segment : segments) {
    node = FindOrCreateFolder(model, segment, node);
    if (!node) return nullptr;
  }
  return node;
}

// The path from `root` down to `folder` (empty when they are the same), or
// nullopt when `folder` isn't under `root` or a name on the way is unusable.
// A name still holding a separator (before NormalizeFavoriteFolders) reads
// as the path it stands for, so Sync sees the same path before and after.
inline std::optional<FolderPath> FolderPathOf(const bookmarks::BookmarkNode* folder,
                                              const bookmarks::BookmarkNode* root) {
  FolderPath path;
  const auto* node = folder;
  while (node && node != root) {
    if (node->is_permanent_node()) return std::nullopt;
    const auto parts = StoredFolderPath(base::UTF16ToUTF8(node->GetTitle()));
    if (!parts || parts->empty()) return std::nullopt;
    path.insert(path.begin(), parts->begin(), parts->end());
    node = node->parent();
  }
  if (node != root) return std::nullopt;
  return path;
}

// The permanent node a node lives under (itself, for a permanent node).
inline const bookmarks::BookmarkNode* PermanentRootOf(const bookmarks::BookmarkNode* node) {
  while (node && !node->is_permanent_node()) node = node->parent();
  return node;
}

// A favorite's `folder`: its path under its permanent root, "" at the top,
// nullopt when it can't be written as a path shipping accepts.
inline std::optional<std::string> FavoriteFolderPath(const bookmarks::BookmarkNode* node) {
  const auto* parent = node->parent();
  const auto path = parent ? FolderPathOf(parent, PermanentRootOf(parent)) : std::nullopt;
  if (!path) return std::nullopt;
  const auto joined = JoinPath(*path);
  if (joined.size() > kFolderMaxLength) return std::nullopt;
  return base::UTF16ToUTF8(joined);
}

// Moves every child of `from` to the end of `into`, then removes `from`.
inline void MergeFolderInto(bookmarks::BookmarkModel* model, const bookmarks::BookmarkNode* from,
                            const bookmarks::BookmarkNode* into) {
  while (!from->children().empty())
    model->Move(from->children().front().get(), into, into->children().size());
  model->Remove(from, bookmarks::metrics::BookmarkEditSource::kOther, FROM_HERE);
}

// One editable folder that breaks the path rules, or null: a name holding
// the separator's character (a path stored flat by Sync, an import or an
// earlier fork), or a name another folder before it in the same parent has.
inline const bookmarks::BookmarkNode* FolderToNormalize(bookmarks::BookmarkModel* model,
                                                        const bookmarks::BookmarkNode* parent) {
  for (const auto& child : parent->children()) {
    if (!child->is_folder() || model->client()->IsNodeManaged(child.get())) continue;
    if (child->GetTitle().find(u'\u203a') != std::u16string::npos) {
      const auto stored = StoredFolderPath(base::UTF16ToUTF8(child->GetTitle()));
      // A path too long to store stays as it is; Sync leaves its favorites.
      if (stored && !stored->empty()) return child.get();
    }
    // Only the later of two same-named folders moves.
    const auto segment = FolderSegment(child.get());
    const auto* first = segment ? FindChildFolder(model, parent, *segment) : nullptr;
    if (first && first != child.get()) return child.get();
    if (const auto* inner = FolderToNormalize(model, child.get())) return inner;
  }
  return nullptr;
}

// Brings existing folders to the path rules once, in place: `A › B` becomes
// B inside A, and two folders of one name in a parent become the first. The
// favorites and their order inside each folder are kept. Returns how many
// folders it changed. Never touches managed bookmarks.
inline int NormalizeFavoriteFolders(bookmarks::BookmarkModel* model) {
  if (!model || !model->loaded()) return 0;
  int changed = 0;
  // Each step removes or renames one folder, so this ends; the cap only
  // guards against a model that changes underneath.
  for (int step = 0; step < 10000; ++step) {
    const bookmarks::BookmarkNode* folder = nullptr;
    for (const auto& root : model->root_node()->children()) {
      folder = FolderToNormalize(model, root.get());
      if (folder) break;
    }
    if (!folder) break;
    const auto* parent = folder->parent();
    const std::u16string& title = folder->GetTitle();
    const auto stored = title.find(u'\u203a') != std::u16string::npos
        ? StoredFolderPath(base::UTF16ToUTF8(title)) : std::nullopt;
    if (stored && !stored->empty()) {
      const FolderPath& segments = *stored;
      // A path one name long is the same folder with the clean name, unless
      // another folder of that name is already there.
      const auto* same = segments.size() == 1 ? FindChildFolder(model, parent, segments[0], folder) : nullptr;
      if (segments.size() == 1 && !same) {
        model->SetTitle(folder, segments[0], bookmarks::metrics::BookmarkEditSource::kOther);
      } else {
        const auto* target = same ? same : FindOrCreateFolderPath(model, parent, segments);
        if (!target || target == folder) break;
        MergeFolderInto(model, folder, target);
      }
    } else {
      MergeFolderInto(model, folder, FindChildFolder(model, parent, *FolderSegment(folder)));
    }
    ++changed;
  }
  return changed;
}

inline bool CanEditFavorites(Profile* profile) {
  if (!profile || profile->IsOffTheRecord()) return false;
  auto* prefs = profile->GetPrefs();
  return prefs && prefs->FindPreference(bookmarks::prefs::kEditBookmarksEnabled) &&
         prefs->GetBoolean(bookmarks::prefs::kEditBookmarksEnabled);
}

}  // namespace blanc::favorites
#endif

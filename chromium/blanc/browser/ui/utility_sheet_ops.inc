// The utility sheet (S1.5, F9–F11, F16): shipping's Favorites, History and
// Downloads pages run in a frame of the Island host, and the host answers
// their window.bowserPages from Chromium's own models through these. Each
// mirrors the shipping main-process function named beside it.
namespace utility_sheet {

// Start Page pins as the Favorites page reads them: {max, pins}, without
// icons (the page uses only their addresses).
base::DictValue Pins(PrefService* prefs) {
  return base::DictValue().Set("max", static_cast<int>(kStartPageMaxPins))
      .Set("pins", SanitizeStartPins(prefs->GetList(kStartPagePinsPref)));
}

// The Favorite a row names by FavoriteRecord's id: one editable, unmanaged
// web bookmark, or null.
const bookmarks::BookmarkNode* EditableFavorite(bookmarks::BookmarkModel* model,
                                                const std::string& id) {
  int64_t value = 0;
  if (!base::StringToInt64(id, &value)) return nullptr;
  const auto* node = bookmarks::GetBookmarkNodeByID(model, value);
  if (!node || !node->is_url() || !IsFavoritable(node->url()) ||
      model->client()->IsNodeManaged(node) || !FavoriteStorageOtherRoot(model, node))
    return nullptr;
  return node;
}
}  // namespace utility_sheet

// ---- The Favorites manager (F63; shipping's pages:bookmarks:* calls in
// pages.js and bookmark-data.js). Favorites is a page in a tab of its own
// (owner, November 18, 2026); FavoritesHandler answers it from here.
//
// A folder path is the folder names from Other bookmarks down, joined by
// " › " (blanc::favorites). Nested folders are Chromium's own folders, and
// Chromium's order is the page's order. The bookmarks bar, mobile and account
// folders, when not empty, show as top-level folders named by Chromium that
// can't be renamed, moved or removed, as in Chromium's bookmark manager.
// Every call answers {ok: true} or {ok: false, error} with shipping's codes.
namespace favorites_page {
namespace fav = blanc::favorites;
constexpr size_t kIdsLimit = 5000;     // favorites-page-args.js MAX_IDS
constexpr size_t kKeysLimit = 20000;   // favorites-page-args.js MAX_KEYS
constexpr size_t kTitleMax = 500;     // bookmark-validate.js MAX_TITLE_LENGTH
constexpr size_t kAddressMax = 4096;  // bookmark-validate.js MAX_URL_LENGTH

base::DictValue Ok() { return base::DictValue().Set("ok", true); }
base::DictValue Refused(const char* error) {
  return base::DictValue().Set("ok", false).Set("error", error);
}

// A folder's name as a path segment, or for an unusable title the title as
// Chromium has it.
std::u16string SegmentName(const bookmarks::BookmarkNode* node) {
  if (auto segment = fav::CleanSegment(node->GetTitle())) return *segment;
  const auto title = fav::TrimJavaScriptSpace(node->GetTitle());
  return title.empty() ? u"\u2014" : title;
}
// The name the page shows a folder by: a permanent folder's distinct name
// (FixedRootNames), any other folder's segment.
std::u16string ShownName(bookmarks::BookmarkModel* model, const bookmarks::BookmarkNode* node) {
  if (node->is_permanent_node())
    for (const auto& [root, name] : fav::FixedRootNames(model)) if (root == node) return name;
  return SegmentName(node);
}

// Favicon data URLs by bookmark id while the page is open, so a refresh
// encodes only the icons that changed.
class FaviconCache {
 public:
  FaviconCache();
  ~FaviconCache();
  base::Value Get(bookmarks::BookmarkModel* model, const bookmarks::BookmarkNode* node);
  void Clear() { entries_.clear(); }

 private:
  std::map<int64_t, std::pair<uint32_t, std::string>> entries_;
};
FaviconCache::FaviconCache() = default;
FaviconCache::~FaviconCache() = default;
base::Value FaviconCache::Get(bookmarks::BookmarkModel* model, const bookmarks::BookmarkNode* node) {
  const gfx::Image& image = model->GetFavicon(node);
  const SkBitmap* bitmap = image.IsEmpty() ? nullptr : image.ToSkBitmap();
  // 0 is never a live bitmap's generation, so it stands for "no icon".
  const uint32_t generation = bitmap ? bitmap->getGenerationID() : 0;
  auto found = entries_.find(node->id());
  if (found == entries_.end() || found->second.first != generation)
    found = entries_.insert_or_assign(node->id(), std::make_pair(generation, FaviconDataUrl(image))).first;
  return NullableString(found->second.second);
}

// The page's folder argument: null is the top level (Other bookmarks); a
// string must be a valid path (shipping's pagePath and validPath). Anything
// else is refused rather than read as the top level.
bool ReadPath(const base::Value& value, fav::FolderPath* out) {
  out->clear();
  if (value.is_none()) return true;
  if (!value.is_string() || value.GetString().size() > 800) return false;
  auto path = fav::ValidFolderPath(value.GetString());
  if (!path) return false;
  *out = std::move(*path);
  return true;
}

// The folder a path names, or null.
const bookmarks::BookmarkNode* Resolve(bookmarks::BookmarkModel* model, const fav::FolderPath& path) {
  if (path.empty()) return model->other_node();
  const bookmarks::BookmarkNode* node = fav::FindChildFolder(model, model->other_node(), path[0]);
  if (!node) {
    // FixedRootNames never reuses a name Other bookmarks has.
    const auto key = fav::FavoriteFolderKey(path[0]);
    for (const auto& [root, shown] : fav::FixedRootNames(model)) {
      const auto name = fav::FavoriteFolderKey(shown);
      if (key && name && *key == *name) { node = root; break; }
    }
  }
  for (size_t i = 1; node && i < path.size(); ++i) node = fav::FindChildFolder(model, node, path[i]);
  return node;
}

// The path the page knows a folder by.
fav::FolderPath PathOf(bookmarks::BookmarkModel* model, const bookmarks::BookmarkNode* folder) {
  fav::FolderPath path;
  for (const auto* node = folder; node && node != model->other_node() && node != model->root_node();
       node = node->parent()) {
    path.insert(path.begin(), ShownName(model, node));
    if (node->is_permanent_node()) break;
  }
  return path;
}

std::string Joined(const fav::FolderPath& path) { return base::UTF16ToUTF8(fav::JoinPath(path)); }

std::string FolderKeyFor(const std::u16string& name) {
  const auto key = fav::FavoriteFolderKey(name);
  return "f:" + base::UTF16ToUTF8(key ? *key : name);
}
std::string FavoriteKeyFor(const bookmarks::BookmarkNode* node) {
  return "n:" + base::NumberToString(node->id());
}

// The longest " › a › b" a folder's sub-folders add to its own path.
size_t LongestBelow(const bookmarks::BookmarkNode* folder) {
  size_t longest = 0;
  for (const auto& child : folder->children()) {
    if (!child->is_folder()) continue;
    longest = std::max(longest, std::char_traits<char16_t>::length(fav::kPathSeparator) +
                                    SegmentName(child.get()).size() + LongestBelow(child.get()));
  }
  return longest;
}
// Whether `folder`, under a new path `to`, keeps every path within the limit.
bool Fits(const fav::FolderPath& to, const bookmarks::BookmarkNode* folder) {
  return fav::JoinPath(to).size() + LongestBelow(folder) <= fav::kFolderMaxLength;
}

bool IsWithin(const bookmarks::BookmarkNode* node, const bookmarks::BookmarkNode* ancestor) {
  for (; node; node = node->parent()) if (node == ancestor) return true;
  return false;
}

// A user folder the page may rename, move or remove.
bool EditableFolder(bookmarks::BookmarkModel* model, const bookmarks::BookmarkNode* node) {
  return node && node->is_folder() && !node->is_permanent_node() && !model->client()->IsNodeManaged(node);
}

// Where a new or moved folder goes: after the last folder in `parent`, so
// folders lead, as the page draws a folder's children.
size_t FolderInsertIndex(const bookmarks::BookmarkNode* parent) {
  size_t index = 0;
  for (size_t i = 0; i < parent->children().size(); ++i)
    if (parent->children()[i]->is_folder()) index = i + 1;
  return index;
}

base::DictValue FolderTree(bookmarks::BookmarkModel* model, const bookmarks::BookmarkNode* node,
                           const fav::FolderPath& path, FaviconCache& icons);

base::DictValue FolderEntry(bookmarks::BookmarkModel* model, const bookmarks::BookmarkNode* node,
                            const fav::FolderPath& parent_path, FaviconCache& icons) {
  const auto name = ShownName(model, node);
  fav::FolderPath path = parent_path;
  path.push_back(name);
  return base::DictValue().Set("kind", "folder").Set("key", FolderKeyFor(name))
      .Set("folder", FolderTree(model, node, path, icons));
}

// shipping's getTree(): {path, name, key, children} with each child
// {kind: 'folder', key, folder} or {kind: 'favorite', key, item}.
base::DictValue FolderTree(bookmarks::BookmarkModel* model, const bookmarks::BookmarkNode* node,
                           const fav::FolderPath& path, FaviconCache& icons) {
  base::ListValue children;
  for (const auto& child : node->children()) {
    if (child->is_folder()) {
      if (!model->client()->IsNodeManaged(child.get()))
        children.Append(FolderEntry(model, child.get(), path, icons));
    } else if (child->is_url() && IsFavoritable(child->url())) {
      auto item = FavoriteRecord(model, child.get(), /*include_favicons=*/false);
      item.Set("favicon", icons.Get(model, child.get()));
      const std::string key = FavoriteKeyFor(child.get());
      // The folder the page shows it in (as FavoriteRecord's, unless the
      // path is too long to store), so an edit never moves it.
      item.Set("folder", path.empty() ? base::Value() : base::Value(Joined(path)));
      item.Set("key", key);
      children.Append(base::DictValue().Set("kind", "favorite").Set("key", key).Set("item", std::move(item)));
    }
  }
  const auto joined = fav::JoinPath(path);
  const auto lower = fav::FavoriteFolderKey(joined);
  return base::DictValue()
      .Set("path", path.empty() ? base::Value() : base::Value(base::UTF16ToUTF8(joined)))
      .Set("name", path.empty() ? std::string() : base::UTF16ToUTF8(path.back()))
      .Set("key", base::UTF16ToUTF8(lower ? *lower : joined))
      .Set("children", std::move(children));
}

// Every favorite, with no cap: the page is the one place to manage them all.
base::DictValue Tree(bookmarks::BookmarkModel* model, FaviconCache& icons) {
  fav::NormalizeFavoriteFolders(model);
  auto tree = FolderTree(model, model->other_node(), {}, icons);
  auto* children = tree.FindList("children");
  for (const auto& [root, name] : fav::FixedRootNames(model)) children->Append(FolderEntry(model, root, {}, icons));
  return tree;
}

// createFolder(parentPath, name): an existing name answers with its path.
base::DictValue CreateFolder(bookmarks::BookmarkModel* model, const base::Value& parent_path,
                             const base::Value& name) {
  fav::FolderPath parent_segments;
  if (!ReadPath(parent_path, &parent_segments) || !name.is_string()) return Refused("invalid");
  const auto segment = fav::CleanSegment(base::UTF8ToUTF16(name.GetString().substr(0, 800)));
  const auto* parent = Resolve(model, parent_segments);
  if (!segment) return Refused("invalid");
  if (!parent) return Refused("missing");
  fav::FolderPath path = PathOf(model, parent);
  path.push_back(*segment);
  if (fav::JoinPath(path).size() > fav::kFolderMaxLength) return Refused("too-long");
  const auto* folder = fav::FindChildFolder(model, parent, *segment);
  if (!folder) folder = model->AddFolder(parent, FolderInsertIndex(parent), *segment);
  if (!folder) return Refused("invalid");
  return Ok().Set("path", Joined(PathOf(model, folder)));
}

// renameFolder(path, newName): a name a sibling has merges into the sibling.
base::DictValue RenameFolder(bookmarks::BookmarkModel* model, const base::Value& path_value,
                             const base::Value& name) {
  fav::FolderPath path;
  if (!ReadPath(path_value, &path) || path.empty() || !name.is_string()) return Refused("invalid");
  const auto segment = fav::CleanSegment(base::UTF8ToUTF16(name.GetString().substr(0, 800)));
  if (!segment) return Refused("invalid");
  const auto* folder = Resolve(model, path);
  if (!folder) return Refused("missing");
  if (!EditableFolder(model, folder)) return Refused("invalid");
  fav::FolderPath to = PathOf(model, folder->parent());
  to.push_back(*segment);
  if (!Fits(to, folder)) return Refused("too-long");
  if (const auto* sibling = fav::FindChildFolder(model, folder->parent(), *segment, folder)) {
    fav::MergeFolderInto(model, folder, sibling, bookmarks::metrics::BookmarkEditSource::kUser);
    fav::NormalizeFavoriteFolders(model);
    return Ok().Set("path", Joined(PathOf(model, sibling)));
  }
  if (folder->GetTitle() != *segment)
    model->SetTitle(folder, *segment, bookmarks::metrics::BookmarkEditSource::kUser);
  return Ok().Set("path", Joined(to));
}

// moveFolder(path, newParentPath): to the end of the new parent's folders;
// a folder of the same name there takes its contents.
base::DictValue MoveFolder(bookmarks::BookmarkModel* model, const base::Value& path_value,
                           const base::Value& parent_value) {
  fav::FolderPath path, parent_path;
  if (!ReadPath(path_value, &path) || path.empty() || !ReadPath(parent_value, &parent_path))
    return Refused("invalid");
  const auto* folder = Resolve(model, path);
  if (!folder) return Refused("missing");
  if (!EditableFolder(model, folder)) return Refused("invalid");
  const auto* parent = Resolve(model, parent_path);
  if (!parent) return Refused("missing");
  if (IsWithin(parent, folder)) return Refused("cycle");
  if (parent == folder->parent()) return Ok();
  // Account and local bookmarks are stored apart; a folder stays in its own.
  if (FavoriteStorageOtherRoot(model, parent) != FavoriteStorageOtherRoot(model, folder)) return Refused("invalid");
  fav::FolderPath to = PathOf(model, parent);
  to.push_back(SegmentName(folder));
  if (!Fits(to, folder)) return Refused("too-long");
  if (const auto* same = fav::FindChildFolder(model, parent, SegmentName(folder), folder)) {
    fav::MergeFolderInto(model, folder, same, bookmarks::metrics::BookmarkEditSource::kUser);
    fav::NormalizeFavoriteFolders(model);
    return Ok();
  }
  model->Move(folder, parent, FolderInsertIndex(parent));
  return Ok();
}

// removeFolder(path): its favorites and folders move up one level, into its
// place; a folder there of the same name as one of them takes it in.
base::DictValue RemoveFolder(bookmarks::BookmarkModel* model, const base::Value& path_value) {
  fav::FolderPath path;
  if (!ReadPath(path_value, &path) || path.empty()) return Refused("invalid");
  const auto* folder = Resolve(model, path);
  if (!folder) return Refused("missing");
  if (!EditableFolder(model, folder)) return Refused("invalid");
  const auto* parent = folder->parent();
  size_t index = *parent->GetIndexOf(folder);
  while (!folder->children().empty()) model->Move(folder->children().front().get(), parent, index++);
  model->Remove(folder, bookmarks::metrics::BookmarkEditSource::kUser, FROM_HERE);
  fav::NormalizeFavoriteFolders(model);
  return Ok();
}

std::vector<const bookmarks::BookmarkNode*> ReadFavorites(bookmarks::BookmarkModel* model,
                                                          const base::Value& ids) {
  std::vector<const bookmarks::BookmarkNode*> nodes;
  if (!ids.is_list()) return nodes;
  for (const auto& id : ids.GetList()) {
    if (nodes.size() >= kIdsLimit) break;
    if (!id.is_string() || id.GetString().size() > 200) continue;
    const auto* node = utility_sheet::EditableFavorite(model, id.GetString());
    if (node && std::find(nodes.begin(), nodes.end(), node) == nodes.end()) nodes.push_back(node);
  }
  return nodes;
}

// move(ids, path): each favorite to the end of the folder, in its own storage.
base::DictValue MoveFavorites(bookmarks::BookmarkModel* model, const base::Value& ids,
                              const base::Value& path_value) {
  fav::FolderPath path;
  if (!ReadPath(path_value, &path)) return Refused("invalid");
  const auto* target = Resolve(model, path);
  if (!target) return Refused("missing");
  // Account and local bookmarks are stored apart: a favorite never moves
  // between them, and the answer says when one stayed where it was.
  bool skipped = false;
  for (const auto* node : ReadFavorites(model, ids)) {
    if (FavoriteStorageOtherRoot(model, node) != FavoriteStorageOtherRoot(model, target)) { skipped = true; continue; }
    if (node->parent() != target) model->Move(node, target, target->children().size());
  }
  return skipped ? Refused("invalid") : Ok();
}

// reorder(path, keys): the listed children first, in that order.
base::DictValue Reorder(bookmarks::BookmarkModel* model, const base::Value& path_value,
                        const base::Value& keys) {
  fav::FolderPath path;
  if (!ReadPath(path_value, &path) || !keys.is_list()) return Refused("invalid");
  const auto* folder = Resolve(model, path);
  if (!folder) return Refused("missing");
  std::map<std::string, const bookmarks::BookmarkNode*> by_key;
  for (const auto& child : folder->children()) {
    if (model->client()->IsNodeManaged(child.get())) continue;
    const std::string key = child->is_folder() ? FolderKeyFor(SegmentName(child.get())) : FavoriteKeyFor(child.get());
    by_key.emplace(key, child.get());
  }
  std::vector<const bookmarks::BookmarkNode*> listed;
  for (const auto& key : keys.GetList()) {
    if (listed.size() >= kKeysLimit) break;
    if (!key.is_string()) continue;
    const auto found = by_key.find(key.GetString());
    if (found != by_key.end() && std::find(listed.begin(), listed.end(), found->second) == listed.end())
      listed.push_back(found->second);
  }
  for (size_t i = 0; i < listed.size(); ++i)
    if (*folder->GetIndexOf(listed[i]) != i) model->Move(listed[i], folder, i);
  return Ok();
}

// remove(id) and removeMany(ids).
base::DictValue RemoveFavorites(bookmarks::BookmarkModel* model, const base::Value& ids) {
  for (const auto* node : ReadFavorites(model, ids))
    model->Remove(node, bookmarks::metrics::BookmarkEditSource::kUser, FROM_HERE);
  return Ok();
}

// bookmark-validate.js editableAddress(): web pages only; a bare name such
// as example.com reads as https://; no name or password in the address.
std::optional<GURL> EditableAddress(const std::string& value) {
  const std::u16string typed = fav::TrimJavaScriptSpace(base::UTF8ToUTF16(value));
  if (typed.empty() || typed.size() > kAddressMax) return std::nullopt;
  for (const char16_t c : typed) if (fav::IsJavaScriptTrimSpace(c)) return std::nullopt;
  const std::string text = base::UTF16ToUTF8(typed);
  size_t scheme_end = text.find("://");
  bool has_scheme = scheme_end != std::string::npos && scheme_end > 0 && base::IsAsciiAlpha(text[0]);
  for (size_t i = 1; has_scheme && i < scheme_end; ++i) {
    const char c = text[i];
    if (!base::IsAsciiAlphaNumeric(c) && c != '+' && c != '.' && c != '-') has_scheme = false;
  }
  const GURL url(has_scheme ? text : "https://" + text);
  if (!url.is_valid() || !url.SchemeIsHTTPOrHTTPS() || url.host().empty() ||
      url.has_username() || url.has_password() || url.spec().size() > kAddressMax)
    return std::nullopt;
  return url;
}

// edit(id, {title, url}): a blank name becomes the address; a Start Page pin
// follows the favorite (start-page-pins.js replacePin).
base::DictValue EditFavorite(bookmarks::BookmarkModel* model, PrefService* prefs,
                             const base::Value& id, const base::Value& changes) {
  if (!id.is_string() || !changes.is_dict()) return Refused("missing");
  const auto* node = utility_sheet::EditableFavorite(model, id.GetString().substr(0, 200));
  if (!node) return Refused("missing");
  const GURL from_url = node->url();
  const std::u16string from_title = node->GetTitle();
  GURL url = from_url;
  if (const auto* typed = changes.GetDict().FindString("url");
      typed && fav::TrimJavaScriptSpace(base::UTF8ToUTF16(*typed)) != base::UTF8ToUTF16(from_url.spec())) {
    const auto address = EditableAddress(typed->substr(0, kAddressMax * 2));
    if (!address) return Refused("invalid-url");
    url = *address;
    if (url != from_url) {
      for (const auto& other : model->GetNodesByURL(url))
        if (other.get() != node) return Refused("exists");
    }
  }
  std::u16string title = from_title;
  if (const auto* typed = changes.GetDict().FindString("title")) {
    title = fav::TrimJavaScriptSpace(base::UTF8ToUTF16(typed->substr(0, kTitleMax * 4)));
    if (title.size() > kTitleMax) title = fav::TrimJavaScriptSpace(title.substr(0, kTitleMax));
    if (title.empty()) title = base::UTF8ToUTF16(url.spec());
  }
  const std::string key = FavoriteKeyFor(node);
  if (url == from_url && title == from_title) return Ok().Set("key", key);
  if (url != from_url) model->SetURL(node, url, bookmarks::metrics::BookmarkEditSource::kUser);
  if (title != from_title) model->SetTitle(node, title, bookmarks::metrics::BookmarkEditSource::kUser);
  if (prefs && prefs->FindPreference(kStartPagePinsPref)) ReplaceStartPin(prefs, from_url.spec(), url.spec(), base::UTF16ToUTF8(title));
  return Ok().Set("key", key);
}

// The flat page's setFolder(id, folder): a move, null or "" to the top.
base::DictValue SetFolder(bookmarks::BookmarkModel* model, const base::Value& id, const base::Value& folder) {
  base::ListValue ids;
  ids.Append(id.Clone());
  const bool top = folder.is_none() || (folder.is_string() && folder.GetString().empty());
  return MoveFavorites(model, base::Value(std::move(ids)), top ? base::Value() : folder.Clone());
}
}  // namespace favorites_page

namespace utility_sheet {
// Shipping keeps 5,000 visits (history.js) and 200 download records
// (downloads.js MAX_PERSISTED).
constexpr int kHistoryVisitsLimit = 5000;
constexpr size_t kDownloadsLimit = 200;

const char* DownloadState(const download::DownloadItem& item) {
  switch (item.GetState()) {
    case download::DownloadItem::IN_PROGRESS: return "progressing";
    case download::DownloadItem::COMPLETE: return "completed";
    case download::DownloadItem::CANCELLED: return "cancelled";
    default: return "interrupted";
  }
}

// The window profile and, when it exists, its private-tab profile: shipping
// lists a window's private downloads with its regular ones.
std::vector<content::DownloadManager*> DownloadManagers(Profile* profile) {
  std::vector<content::DownloadManager*> managers;
  if (auto* manager = profile->GetDownloadManager()) managers.push_back(manager);
  if (!profile->IsOffTheRecord() && profile->HasPrimaryOTRProfile()) {
    if (auto* manager = profile->GetPrimaryOTRProfile(/*create_if_needed=*/false)->GetDownloadManager())
      managers.push_back(manager);
  }
  return managers;
}

// A download the person made. Not a transient one, and not an extension
// being installed (the Web Store's own download of its package, made by
// Chromium's extension installer): neither the Downloads list nor the
// Island's Downloads shows those.
inline bool PersonsDownload(const download::DownloadItem* item) {
  return !item->IsTransient() &&
         item->GetDownloadSource() != download::DownloadSource::EXTENSION_INSTALLER;
}

// Memory-only per-profile activity. Existing downloads establish the initial
// baseline; later starts/completions are unacknowledged until the user opens
// Downloads. The host polls the native model with its normal snapshot.
class DownloadActivity final : public base::SupportsUserData::Data {
 public:
  DownloadActivity();
  ~DownloadActivity() override;
  static DownloadActivity* Get(Profile* profile) {
    static const int key = 0;
    auto* value = static_cast<DownloadActivity*>(profile->GetUserData(&key));
    if (!value) {
      auto owned = std::make_unique<DownloadActivity>(); value = owned.get();
      profile->SetUserData(&key, std::move(owned));
    }
    return value;
  }
  base::DictValue Read(Profile* profile) {
    int active = 0; double received = 0, total = 0;
    std::map<std::string, int> current;
    for (auto* manager : DownloadManagers(profile)) {
      download::SimpleDownloadManager::DownloadVector all; manager->GetAllDownloads(&all);
      for (download::DownloadItem* item : all) {
        if (!PersonsDownload(item)) continue;
        const auto& guid = item->GetGuid(); const int state = item->GetState();
        current.emplace(guid, state);
        const auto previous = seen.find(guid);
        if (initialized && previous == seen.end()) recent = true;
        if (initialized && state == download::DownloadItem::COMPLETE &&
            (previous == seen.end() || previous->second != state))
          completed = item->GetEndTime().is_null() ? base::Time::Now() : item->GetEndTime();
        if (!item->IsDone()) {
          ++active; received += std::max<int64_t>(0, item->GetReceivedBytes());
          total += std::max<int64_t>(0, item->GetTotalBytes());
        }
      }
    }
    initialized = true; seen = std::move(current);
    if (test_activity) return test_activity->Clone();
    return base::DictValue().Set("active", active).Set("hasRecent", recent)
        .Set("receivedBytes", received).Set("totalBytes", total)
        .Set("lastCompletedAt", completed.is_null() ? base::Value() : base::Value(completed.InMillisecondsFSinceUnixEpoch()));
  }
  void Acknowledge(Profile* profile) { Read(profile); recent = false; }
  // Set only through the opt-in native test channel (shipping's event seam).
  std::optional<base::DictValue> test_activity;
 private:
  bool initialized = false, recent = false;
  base::Time completed;
  std::map<std::string, int> seen;
};

DownloadActivity::DownloadActivity() = default;
DownloadActivity::~DownloadActivity() = default;

// Shipping's listDownloads(): downloads still in flight first, then finished
// ones, newest first in each, capped. No file path leaves the browser.
base::ListValue Downloads(Profile* profile) {
  std::vector<download::DownloadItem*> items;
  for (auto* manager : DownloadManagers(profile)) {
    download::SimpleDownloadManager::DownloadVector all;
    manager->GetAllDownloads(&all);
    for (download::DownloadItem* item : all) if (PersonsDownload(item)) items.push_back(item);
  }
  std::stable_sort(items.begin(), items.end(), [](auto* a, auto* b) {
    if (a->IsDone() != b->IsDone()) return !a->IsDone();
    return a->GetStartTime() > b->GetStartTime();
  });
  base::ListValue list;
  for (auto* item : items) {
    if (list.size() >= kDownloadsLimit) break;
    auto* context = content::DownloadItemUtils::GetBrowserContext(item);
    const bool interrupted = item->GetState() == download::DownloadItem::INTERRUPTED;
    list.Append(base::DictValue()
        .Set("id", item->GetGuid())
        .Set("url", item->GetURL().spec())
        .Set("filename", item->GetFileNameToReportUser().BaseName().AsUTF8Unsafe())
        .Set("state", DownloadState(*item))
        .Set("canResume", interrupted && item->CanResume())
        .Set("inFlight", !item->IsDone())
        .Set("receivedBytes", static_cast<double>(std::max<int64_t>(0, item->GetReceivedBytes())))
        .Set("totalBytes", static_cast<double>(std::max<int64_t>(0, item->GetTotalBytes())))
        .Set("startedAt", item->GetStartTime().InMillisecondsFSinceUnixEpoch())
        .Set("private", context && context->IsOffTheRecord()));
  }
  return list;
}

download::DownloadItem* FindDownload(Profile* profile, const std::string& guid) {
  for (auto* manager : DownloadManagers(profile))
    if (auto* item = manager->GetDownloadByGuid(guid)) return item;
  return nullptr;
}

// Shipping's cancel/resume/retry/open/show; each is a no-op where shipping's is.
void DownloadAction(Profile* profile, const std::string& guid, const std::string& action) {
  auto* item = FindDownload(profile, guid);
  if (!item) return;
  const bool interrupted = item->GetState() == download::DownloadItem::INTERRUPTED;
  if (action == "cancel") {
    if (!item->IsDone()) item->Cancel(/*user_cancel=*/true);
  } else if (action == "resume") {
    if (interrupted && item->CanResume()) item->Resume(/*user_resume=*/true);
  } else if (action == "retry") {
    // Start over from the source, replacing the row, as shipping's retry.
    const GURL url = item->GetURL();
    auto* manager = content::DownloadItemUtils::GetBrowserContext(item)
        ? content::DownloadItemUtils::GetBrowserContext(item)->GetDownloadManager() : nullptr;
    if (!interrupted || item->CanResume() || !url.SchemeIsHTTPOrHTTPS() || !manager) return;
    auto params = std::make_unique<download::DownloadUrlParameters>(url,
        net::DefineNetworkTrafficAnnotation("blanc_download_retry", R"(
          semantics { sender: "Blanc downloads" description: "Downloads a file again after it was interrupted."
            trigger: "User chooses Retry on an interrupted download." data: "The download's own address."
            destination: WEBSITE }
          policy { cookies_allowed: YES cookies_store: "user" setting: "Only on the user's request."
            policy_exception_justification: "User-initiated download." })"));
    params->set_download_source(download::DownloadSource::RETRY);
    item->Remove();
    manager->DownloadUrl(std::move(params));
  } else if (action == "open") {
    if (item->GetState() == download::DownloadItem::COMPLETE) item->OpenDownload();
  } else if (action == "show") {
    if (!item->GetTargetFilePath().empty()) platform_util::ShowItemInFolder(profile, item->GetTargetFilePath());
  }
}

// Shipping's clearFinishedDownloads(): the list forgets finished downloads;
// the files stay.
void ClearFinishedDownloads(Profile* profile) {
  for (auto* manager : DownloadManagers(profile)) {
    download::SimpleDownloadManager::DownloadVector all;
    manager->GetAllDownloads(&all);
    for (download::DownloadItem* item : all) if (item->IsDone() && !item->IsTransient()) item->Remove();
  }
}

}  // namespace utility_sheet

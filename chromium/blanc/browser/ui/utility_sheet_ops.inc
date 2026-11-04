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

// The Favorite a sheet row names by FavoriteRecord's id: one editable,
// unmanaged web bookmark, or null.
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

// Every user folder whose name matches |name| as shipping's folderKey() does.
std::vector<const bookmarks::BookmarkNode*> MatchingFolders(
    bookmarks::BookmarkModel* model, const std::u16string& name) {
  std::vector<const bookmarks::BookmarkNode*> folders;
  const auto key = FavoriteFolderKey(name);
  if (!key) return folders;
  ui::TreeNodeIterator<const bookmarks::BookmarkNode> nodes(model->root_node());
  while (nodes.has_next()) {
    const auto* node = nodes.Next();
    if (!node->is_folder() || node->is_permanent_node() || model->client()->IsNodeManaged(node)) continue;
    const auto title = ValidFolderName(base::UTF16ToUTF8(node->GetTitle()));
    const auto node_key = title ? FavoriteFolderKey(*title) : std::nullopt;
    if (node_key && *node_key == *key) folders.push_back(node);
  }
  return folders;
}

constexpr char kFolderNameError[] = "Folder names are 1 to 100 characters.";

// Shipping's removeBookmark(id).
std::optional<std::string> RemoveFavorite(bookmarks::BookmarkModel* model, const std::string& id) {
  const auto* node = EditableFavorite(model, id);
  if (!node) return "This Favorite can’t be removed here.";
  model->Remove(node, bookmarks::metrics::BookmarkEditSource::kUser, FROM_HERE);
  return std::nullopt;
}

// Shipping's setFolder(id, folder): a named folder in the Favorite's own
// storage (created at the end if absent), or none for an empty name.
std::optional<std::string> SetFolder(bookmarks::BookmarkModel* model, const std::string& id,
                                     const std::string& folder) {
  const auto* node = EditableFavorite(model, id);
  if (!node) return "This Favorite can’t be moved here.";
  const auto* root = FavoriteStorageOtherRoot(model, node);
  const bookmarks::BookmarkNode* target = root;
  if (!folder.empty()) {
    const auto name = ValidFolderName(folder);
    if (!name) return kFolderNameError;
    target = FindOrCreateFolder(model, *name, root);
    if (!target) return kFolderNameError;
  }
  if (node->parent() != target) model->Move(node, target, target->children().size());
  return std::nullopt;
}

// Shipping's renameFolder(old, new): every folder of that name takes the new one.
std::optional<std::string> RenameFolder(bookmarks::BookmarkModel* model, const std::string& old_name,
                                        const std::string& new_name) {
  const auto from = ValidFolderName(old_name);
  const auto to = ValidFolderName(new_name);
  if (!from || !to) return kFolderNameError;
  for (const auto* folder : MatchingFolders(model, *from)) model->SetTitle(folder, *to,
      bookmarks::metrics::BookmarkEditSource::kUser);
  return std::nullopt;
}

// Shipping's removeFolder(name): the folder goes, its Favorites stay, in its
// place in the parent folder.
std::optional<std::string> RemoveFolder(bookmarks::BookmarkModel* model, const std::string& name) {
  const auto folder_name = ValidFolderName(name);
  if (!folder_name) return kFolderNameError;
  for (const auto* folder : MatchingFolders(model, *folder_name)) {
    const auto* parent = folder->parent();
    size_t index = *parent->GetIndexOf(folder);
    while (!folder->children().empty()) model->Move(folder->children().front().get(), parent, index++);
    model->Remove(folder, bookmarks::metrics::BookmarkEditSource::kUser, FROM_HERE);
  }
  return std::nullopt;
}

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

// Shipping's listDownloads(): downloads still in flight first, then finished
// ones, newest first in each, capped. No file path leaves the browser.
base::ListValue Downloads(Profile* profile) {
  std::vector<download::DownloadItem*> items;
  for (auto* manager : DownloadManagers(profile)) {
    download::SimpleDownloadManager::DownloadVector all;
    manager->GetAllDownloads(&all);
    for (download::DownloadItem* item : all) if (!item->IsTransient()) items.push_back(item);
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

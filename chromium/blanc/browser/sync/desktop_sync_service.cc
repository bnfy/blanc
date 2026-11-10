// Copyright 2026 Bananify Creative. MIT; see LICENSE.
#include "blanc/browser/sync/desktop_sync_service.h"

#include <utility>
#include <cmath>
#include "base/auto_reset.h"
#include "base/files/file_util.h"
#include "base/files/important_file_writer.h"
#include "base/functional/bind.h"
#include "base/json/json_reader.h"
#include "base/json/json_writer.h"
#include "base/no_destructor.h"
#include "base/strings/utf_string_conversions.h"
#include "base/strings/string_util.h"
#include "base/task/single_thread_task_runner.h"
#include "base/task/thread_pool.h"
#include "base/time/time.h"
#include "base/uuid.h"
#include "blanc/browser/sync/desktop_sync_platform.h"
#include "blanc/browser/sync/desktop_sync_settings.h"
#include "blanc/browser/sync/favorite_helpers.h"
#include "blanc/browser/sync/sync_merge.h"
#include "chrome/browser/bookmarks/bookmark_model_factory.h"
#include "chrome/browser/browser_process.h"
#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/profiles/profile_manager.h"
#include "components/bookmarks/browser/bookmark_model.h"
#include "components/bookmarks/browser/bookmark_node.h"
#include "components/bookmarks/common/bookmark_metrics.h"
#include "components/os_crypt/async/browser/os_crypt_async.h"
#include "components/prefs/pref_service.h"
#include "components/sync_device_info/local_device_info_util.h"
#include "content/public/browser/browser_thread.h"
#include "url/gurl.h"

namespace blanc {
namespace {
constexpr size_t kMaxStateBytes = 32 * 1024 * 1024;
base::DictValue EmptyState() {
  return base::DictValue().Set("version", 1).Set("account", "")
      .Set("consent", "pending").Set("seen", base::DictValue())
      .Set("incoming", base::DictValue()).Set("excluded", base::DictValue())
      .Set("settingsSeen", base::DictValue()).Set("settingsIncoming", base::DictValue());
}
std::string Json(const base::Value& value) { return base::WriteJson(value).value_or("null"); }
std::string Json(const base::DictValue& value) { return base::WriteJson(value).value_or("{}"); }
std::string Args(base::Value value) { return base::WriteJson(base::ListValue().Append(std::move(value))).value_or("[]"); }
base::Value ValueAt(const base::DictValue& values, const std::string& key) {
  const auto* value = values.Find(key);
  return value ? value->Clone() : base::Value();
}
bool Equal(const base::Value* a, const base::Value* b) {
  return a && b ? *a == *b : (!a || a->is_none()) && (!b || b->is_none());
}
std::optional<sync_merge::Favorite> Favorite(const base::Value* value) {
  if (!value || !value->is_dict()) return std::nullopt;
  const auto* title = value->GetDict().FindString("title");
  const auto* folder = value->GetDict().FindString("folder");
  if (!title) return std::nullopt;
  std::string folder_key;
  if (folder && !folder->empty()) {
    const auto name = favorites::ValidFolderName(*folder);
    const auto key = name ? favorites::FavoriteFolderKey(*name) : std::nullopt;
    if (key) folder_key = base::UTF16ToUTF8(*key);
    else folder_key = *folder;
  }
  return sync_merge::Favorite{*title, folder_key};
}
base::DictValue Record(const std::string& title, const std::string& folder) {
  // Match Chromium's title normalization (whitespace is not a desktop edit).
  const auto tidy = base::CollapseWhitespace(base::UTF8ToUTF16(title), false);
  return base::DictValue().Set("title", base::UTF16ToUTF8(tidy))
      .Set("folder", folder.empty() ? base::Value() : base::Value(folder));
}
bool ValidStoredFavorite(const base::Value& value) {
  if (value.is_none()) return true;
  if (!value.is_dict() || !value.GetDict().FindString("title")) return false;
  const auto* folder = value.GetDict().Find("folder");
  return folder && (folder->is_none() || (folder->is_string() &&
      favorites::ValidFolderName(folder->GetString()).has_value()));
}
bool ValidStoredUrl(const std::string& url) {
  const GURL address(url);
  return address.is_valid() && address.SchemeIsHTTPOrHTTPS() && address.spec() == url;
}
bool ValidStateRecords(const base::DictValue& state) {
  for (auto [url, value] : *state.FindDict("seen"))
    if (!ValidStoredUrl(url) || value.is_none() || !ValidStoredFavorite(value)) return false;
  for (auto [url, value] : *state.FindDict("excluded"))
    if (!ValidStoredUrl(url) || !value.is_bool() || !value.GetBool()) return false;
  for (auto [url, value] : *state.FindDict("incoming")) {
    if (!ValidStoredUrl(url) || !value.is_dict()) return false;
    const auto* before = value.GetDict().Find("before");
    const auto* after = value.GetDict().Find("after");
    if (!before || !after || !ValidStoredFavorite(*before) || !ValidStoredFavorite(*after)) return false;
  }
  for (auto [key, value] : *state.FindDict("settingsSeen"))
    if (!SupportedDesktopSyncSetting(key, value)) return false;
  for (auto [key, value] : *state.FindDict("settingsIncoming")) {
    if (!value.is_dict()) return false;
    const auto* before = value.GetDict().Find("before");
    const auto* after = value.GetDict().Find("after");
    if (!before || !after || !SupportedDesktopSyncSetting(key, *before) ||
        !SupportedDesktopSyncSetting(key, *after)) return false;
  }
  const auto* pending = state.Find("outgoing");
  if (!pending) return true;
  if (!pending->is_dict()) return false;
  const auto& journal = pending->GetDict();
  const auto* url = journal.FindString("url");
  const auto* local = journal.Find("local");
  const auto* payload = journal.FindDict("payload");
  if (!url || !ValidStoredUrl(*url) || !local || !ValidStoredFavorite(*local) || !payload) return false;
  const auto* items = payload->FindList("items");
  const auto* tombstones = payload->FindList("tombstones");
  if (!items || !tombstones || items->size() != (local->is_none() ? 0u : 1u) ||
      tombstones->size() != (local->is_none() ? 1u : 0u)) return false;
  const auto& entry = local->is_none() ? (*tombstones)[0] : (*items)[0];
  if (!entry.is_dict()) return false;
  const auto* wire = entry.GetDict().FindString("url");
  const auto at = entry.GetDict().FindDouble(local->is_none() ? "deletedAt" : "updatedAt");
  return wire && GURL(*wire).spec() == *url && at && std::isfinite(*at) && *at > 0 &&
         (local->is_none() || Favorite(&entry) == Favorite(local));
}
std::optional<base::DictValue> ReadState(const base::FilePath& path) {
  if (!base::PathExists(path)) return EmptyState();
  std::string bytes;
  if (!base::ReadFileToStringWithMaxSize(path, &bytes, kMaxStateBytes)) return std::nullopt;
  auto state = base::JSONReader::ReadDict(bytes, base::JSON_PARSE_RFC);
  if (!state || state->FindInt("version") != 1 || !state->FindString("account") ||
      !state->FindString("consent")) return std::nullopt;
  for (const char* field : {"seen", "incoming", "excluded", "settingsSeen", "settingsIncoming"})
    if (!state->FindDict(field)) return std::nullopt;
  const auto& consent = *state->FindString("consent");
  if (consent != "pending" && consent != "accepted" && consent != "declined") return std::nullopt;
  if (!ValidStateRecords(*state)) return std::nullopt;
  return state;
}
bool WriteState(const base::FilePath& path, const std::string& bytes) {
  return bytes.size() <= kMaxStateBytes && base::CreateDirectory(path.DirName()) &&
         base::ImportantFileWriter::WriteFileAtomically(path, bytes);
}
// runner.flush flushes JS stores, but the existing host writer is asynchronous
// and only logs disk errors. Never call its response a durability receipt.
bool RunnerFileMatches(const base::FilePath& path, const base::DictValue& expected) {
  std::string bytes;
  if (!base::ReadFileToStringWithMaxSize(path, &bytes, kMaxStateBytes)) return false;
  auto actual = base::JSONReader::ReadDict(bytes, base::JSON_PARSE_RFC);
  if (!actual) return false;
  for (auto [key, value] : expected)
    if (!Equal(actual->Find(key), &value)) return false;
  return true;
}
void Collect(const bookmarks::BookmarkNode* parent, base::DictValue& rows) {
  for (const auto& child : parent->children()) {
    if (child->is_folder()) Collect(child.get(), rows);
    else if (child->url().SchemeIsHTTPOrHTTPS()) {
      const std::string folder = parent->is_permanent_node() ? "" : base::UTF16ToUTF8(parent->GetTitle());
      rows.Set(child->url().spec(), Record(base::UTF16ToUTF8(child->GetTitle()), folder));
    }
  }
}
}  // namespace

DesktopSyncService* DesktopSyncService::ForProfile(Profile* profile) {
  DCHECK_CURRENTLY_ON(content::BrowserThread::UI);
  if (!profile || profile->IsOffTheRecord() || !profile->IsRegularProfile() ||
      !g_browser_process || !g_browser_process->profile_manager() ||
      profile->GetPath() != g_browser_process->profile_manager()->user_data_dir().Append(ProfileManager::GetInitialProfileDir())) return nullptr;
  static base::NoDestructor<std::unique_ptr<DesktopSyncService>> service;
  if (!*service) service->reset(new DesktopSyncService(profile));
  // Reusing the singleton runner for a different/recreated profile requires a
  // process restart. Never silently bind its existing stores to another one.
  return (*service)->profile_ == profile ? service->get() : nullptr;
}
DesktopSyncService::DesktopSyncService(Profile* profile)
    : profile_(profile),
      state_path_(profile->GetPath().AppendASCII("BlancSyncDesktop").AppendASCII("state.json")),
      io_(base::ThreadPool::CreateSequencedTaskRunner({base::MayBlock(), base::TaskShutdownBehavior::BLOCK_SHUTDOWN})) {
  profile_observation_.Observe(profile);
  bookmarks_ = BookmarkModelFactory::GetForBrowserContext(profile);
  if (bookmarks_) {
    bookmark_observation_.Observe(bookmarks_);
    if (bookmarks_->loaded()) { std::set<std::string> blocked; last_local_ = LocalFavorites(&blocked); }
  }
  pref_changes_.Init(profile->GetPrefs());
  for (const auto& mapping : sync_merge::kSettings) {
    if (!mapping.pref.empty() && profile->GetPrefs()->FindPreference(mapping.pref))
      pref_changes_.Add(mapping.pref, base::BindRepeating(&DesktopSyncService::Reconcile, weak_factory_.GetWeakPtr()));
  }
  io_->PostTaskAndReplyWithResult(FROM_HERE, base::BindOnce(ReadState, state_path_),
      base::BindOnce(&DesktopSyncService::Loaded, weak_factory_.GetWeakPtr()));
}
DesktopSyncService::~DesktopSyncService() = default;
void DesktopSyncService::Loaded(std::optional<base::DictValue> state) {
  if (!state) { Fail("desktop-state-unreadable"); return; }
  state_ = std::move(*state);
  for (auto [url, value] : *state_.FindDict("incoming")) recovered_incoming_.insert(url);
  base::ThreadPool::PostTaskAndReplyWithResult(FROM_HERE, {base::MayBlock()},
      base::BindOnce(&syncer::GetPersonalizableDeviceNameBlocking),
      base::BindOnce([](base::WeakPtr<DesktopSyncService> self, std::string name) {
        if (!self) return;
        if (!g_browser_process->os_crypt_async()) { self->Fail("keychain-unavailable"); return; }
        g_browser_process->os_crypt_async()->GetInstance(base::BindOnce(
            &DesktopSyncService::InitializePlatform, self, std::move(name)));
      }, weak_factory_.GetWeakPtr()));
}
void DesktopSyncService::InitializePlatform(std::string name, scoped_refptr<os_crypt_async::Encryptor> encryptor) {
  if (!encryptor || !encryptor->IsEncryptionAvailable()) { Fail("keychain-unavailable"); return; }
  platform_ = std::make_unique<DesktopSyncPlatform>(profile_, std::move(name), std::move(encryptor),
      base::BindRepeating(&DesktopSyncService::OnEvent, weak_factory_.GetWeakPtr()));
  SetSyncPlatform(platform_.get());
  ready_ = true;
  Call("sync.setForeground", "[true]", base::BindOnce([](bool, const std::string&) {}));
}
// The frozen runner calls this phone.setTabs on every platform. The snapshot
// is browser-owned; renderer input must never reach this entry point.
void DesktopSyncService::SetTabs(base::ListValue tabs, base::ListValue groups) {
  if (!ready_ || !profile_ || failed_ || timed_out_ || tabs_pending_) return;
  auto args = base::WriteJson(base::ListValue().Append(std::move(tabs)).Append(std::move(groups))).value_or("[]");
  if (args == tabs_sent_ && base::TimeTicks::Now() - tabs_sent_at_ < base::Seconds(30)) return;
  tabs_pending_ = true;
  Call("phone.setTabs", args, base::BindOnce(
      [](base::WeakPtr<DesktopSyncService> self, std::string args, bool ok, const std::string&) {
        if (!self) return;
        self->tabs_pending_ = false;
        if (ok) { self->tabs_sent_ = std::move(args); self->tabs_sent_at_ = base::TimeTicks::Now(); }
      }, weak_factory_.GetWeakPtr(), args));
}
void DesktopSyncService::Call(std::string method, std::string args_json, SyncCallback callback) {
  DCHECK_CURRENTLY_ON(content::BrowserThread::UI);
  if (!profile_ || failed_ || timed_out_) { std::move(callback).Run(false, "desktop-sync-unavailable"); return; }
  requests_.push_back({std::move(method), std::move(args_json), std::move(callback)});
  Pump();
}
void DesktopSyncService::Pump() {
  if (!ready_ || running_ || failed_ || !profile_ || timed_out_) return;
  if (requests_.empty()) { Reconcile(); return; }
  running_ = true;
  auto request = std::move(requests_.front()); requests_.pop_front();
  Run(std::move(request.method), std::move(request.args), base::BindOnce(
      [](base::WeakPtr<DesktopSyncService> self, SyncCallback callback, bool ok, const std::string& value) {
        if (!self) { std::move(callback).Run(false, "profile-closed"); return; }
        std::move(callback).Run(ok, value);
        self->Finish(true);
      }, weak_factory_.GetWeakPtr(), std::move(request.callback)), false);
}
void DesktopSyncService::Run(std::string method, std::string args, SyncCallback callback, bool guard_account) {
  SetSyncPlatform(platform_.get());
  auto reply = std::make_shared<SyncCallback>(std::move(callback));
  active_reply_ = reply;
  const auto epoch = account_epoch_;
  SyncCall(std::move(method), std::move(args), base::BindOnce(
      [](base::WeakPtr<DesktopSyncService> self, uint64_t epoch, bool guard_account,
         std::shared_ptr<SyncCallback> reply, bool ok, const std::string& value) {
        if (!self) { if (*reply) std::move(*reply).Run(false, "profile-closed"); return; }
        if (!*reply) { self->timed_out_ = false; self->Reconcile(); return; }
        std::move(*reply).Run(ok && (!guard_account || epoch == self->account_epoch_), value);
      }, weak_factory_.GetWeakPtr(), epoch, guard_account, reply));
  base::SingleThreadTaskRunner::GetCurrentDefault()->PostDelayedTask(FROM_HERE, base::BindOnce(
      [](base::WeakPtr<DesktopSyncService> self, std::shared_ptr<SyncCallback> reply) {
        if (!self || !*reply) return;
        self->timed_out_ = true;
        self->Notify("desktop-error", "\"runner-timeout\"");
        std::move(*reply).Run(false, "runner-timeout");
        auto waiting = std::move(self->requests_);
        for (auto& request : waiting) std::move(request.callback).Run(false, "runner-timeout");
      }, weak_factory_.GetWeakPtr(), reply), base::Seconds(30));
}
void DesktopSyncService::AddObserver(Observer* observer) { observers_.AddObserver(observer); }
void DesktopSyncService::RemoveObserver(Observer* observer) { observers_.RemoveObserver(observer); }
size_t DesktopSyncService::PendingFirstUploadCount() const { return pending_uploads_.size(); }
void DesktopSyncService::ConfirmFirstUpload(bool accept) {
  if (!ready_ || pending_uploads_.empty() || *state_.FindString("consent") != "pending") return;
  confirmation_ = accept;
  confirmed_urls_ = pending_uploads_;
  Reconcile();
}
void DesktopSyncService::Reconcile() {
  DCHECK_CURRENTLY_ON(content::BrowserThread::UI);
  if (!profile_ || failed_ || timed_out_) return;
  if (!ready_ || running_) { again_ = true; return; }
  if (!requests_.empty()) { Pump(); return; }
  timer_.Stop();
  running_ = true;
  again_ = false;
  Run("sync.status", "[]", base::BindOnce(&DesktopSyncService::Status, weak_factory_.GetWeakPtr()));
}
void DesktopSyncService::Status(bool ok, const std::string& json) {
  auto status = ok ? base::JSONReader::ReadDict(json, base::JSON_PARSE_RFC) : std::nullopt;
  if (!status || !status->FindBool("enabled").has_value()) { Finish(); return; }
  if (*status->FindBool("enabled")) {
    auto* local = g_browser_process->local_state();
    auto progress = local->GetDict("blanc.checklist.progress").Clone();
    if (!progress.FindBool("sync").value_or(false)) {
      progress.Set("sync", true);
      local->SetDict("blanc.checklist.progress", std::move(progress));
    }
  }
  if (last_status_json_ != json) {
    const bool first_status = last_status_json_.empty();
    last_status_json_ = json; Notify("status", json);
    if (first_status && *status->FindBool("enabled")) NoteDevicesForChecklist();
  }
  if (!*status->FindBool("enabled")) {
    if (!pending_uploads_.empty()) Notify("first-upload", "{\"count\":0}");
    pending_uploads_.clear(); confirmation_.reset();
    if (state_ != EmptyState()) Commit(EmptyState(), base::BindOnce(&DesktopSyncService::Finish, weak_factory_.GetWeakPtr(), false));
    else Finish();
    return;
  }
  // A fresh join has to finish its initial account read before absence can
  // mean a remote deletion or form the first-upload consent inventory.
  if (status->FindDouble("lastSyncedAt").value_or(0) <= 0) { Finish(); return; }
  Run("sync.sharedContext", "[]", base::BindOnce([](base::WeakPtr<DesktopSyncService> self, bool ok, const std::string& json) {
    if (!self) return;
    auto context = ok ? base::JSONReader::ReadDict(json, base::JSON_PARSE_RFC) : std::nullopt;
    const auto* account = context ? context->FindString("accountId") : nullptr;
    if (!account || account->empty()) { self->Finish(); return; }
    if (*account != *self->state_.FindString("account")) {
      auto fresh = EmptyState(); fresh.Set("account", *account);
      self->pending_uploads_.clear(); self->confirmation_.reset(); self->recovered_incoming_.clear(); self->applied_settings_.clear();
      self->Commit(std::move(fresh), base::BindOnce(&DesktopSyncService::Favorites, self));
    } else self->Favorites();
  }, weak_factory_.GetWeakPtr()));
}

base::DictValue DesktopSyncService::LocalFavorites(std::set<std::string>* blocked) const {
  base::DictValue rows;
  if (!bookmarks_ || !bookmarks_->loaded()) return rows;
  Collect(bookmarks_->other_node(), rows);
  for (auto [url, value] : rows) {
    const auto nodes = bookmarks_->GetNodesByURL(GURL(url));
    const auto* folder = value.GetDict().FindString("folder");
    if (nodes.size() != 1 || bookmarks_->client()->IsNodeManaged(nodes.front().get()) ||
        (folder && !favorites::ValidFolderName(*folder))) blocked->insert(url);
  }
  return rows;
}
bool DesktopSyncService::ApplyFavorite(const std::string& url, const base::Value& desired) {
  if (!bookmarks_ || !bookmarks_->loaded() || !favorites::CanEditFavorites(profile_)) return false;
  const GURL address(url);
  if (!address.is_valid() || !address.SchemeIsHTTPOrHTTPS()) return false;
  const auto nodes = bookmarks_->GetNodesByURL(address);
  if (nodes.size() > 1) return false;
  const auto* node = nodes.empty() ? nullptr : nodes.front().get();
  if (node) {
    const auto* root = node;
    while (root->parent() && !root->is_permanent_node()) root = root->parent();
    if (root != bookmarks_->other_node() || bookmarks_->client()->IsNodeManaged(node)) return false;
  }
  base::AutoReset<bool> applying(&applying_, true);
  if (desired.is_none()) {
    if (node) bookmarks_->Remove(node, bookmarks::metrics::BookmarkEditSource::kOther, FROM_HERE);
    return true;
  }
  const auto entry = Favorite(&desired);
  if (!entry) return false;
  const bookmarks::BookmarkNode* parent = bookmarks_->other_node();
  const auto* folder = desired.GetDict().FindString("folder");
  if (folder && !folder->empty()) {
    const auto name = favorites::ValidFolderName(*folder);
    if (!name) return false;
    parent = favorites::FindOrCreateFolder(bookmarks_, *name, parent);
  }
  if (!parent) return false;
  const auto title = base::UTF8ToUTF16(entry->title);
  if (!node) return bookmarks_->AddNewURL(parent, parent->children().size(), title, address) != nullptr;
  bookmarks_->SetTitle(node, title, bookmarks::metrics::BookmarkEditSource::kOther);
  if (node->parent() != parent) bookmarks_->Move(node, parent, parent->children().size());
  return true;
}
void DesktopSyncService::Favorites() {
  if (state_.FindDict("outgoing")) { ReplayOutgoing(); return; }
  if (!bookmarks_ || !bookmarks_->loaded() || !favorites::CanEditFavorites(profile_)) { Settings(); return; }
  Run("bookmarks.exportForSync", "[]", base::BindOnce(&DesktopSyncService::PlanFavorites, weak_factory_.GetWeakPtr()));
}
void DesktopSyncService::PlanFavorites(bool ok, const std::string& json) {
  auto remote = ok ? base::JSONReader::ReadDict(json, base::JSON_PARSE_RFC) : std::nullopt;
  if (!remote || !remote->FindList("items") || !remote->FindList("tombstones")) { Finish(); return; }
  std::set<std::string> blocked;
  auto local = LocalFavorites(&blocked);
  base::DictValue theirs, raw;
  for (const auto& item : *remote->FindList("items")) {
    if (!item.is_dict()) { Finish(); return; }
    const auto* url = item.GetDict().FindString("url");
    if (!url) { Finish(); return; }
    GURL address(*url);
    if (!address.is_valid() || !address.SchemeIsHTTPOrHTTPS()) continue;
    const auto key = address.spec();
    if (theirs.contains(key)) blocked.insert(key);  // two runner URLs canonicalize alike
    const auto* title = item.GetDict().FindString("title");
    const auto* folder = item.GetDict().FindString("folder");
    if (folder && !folder->empty() && !favorites::ValidFolderName(*folder)) { blocked.insert(key); continue; }
    theirs.Set(key, Record(title && !title->empty() ? *title : key, folder ? *folder : ""));
    raw.Set(key, item.Clone());
    if (!local.contains(key) && !bookmarks_->GetNodesByURL(address).empty()) blocked.insert(key);
  }
  auto next = state_.Clone();
  auto* seen = next.FindDict("seen");
  auto* incoming = next.FindDict("incoming");
  auto* excluded = next.FindDict("excluded");
  std::set<std::string> urls;
  for (const auto* rows : {&local, &theirs, seen, incoming})
    for (auto [url, value] : *rows) urls.insert(url);

  std::set<std::string> pending;
  if (*state_.FindString("consent") == "pending") {
    for (auto [url, value] : local)
      if (!theirs.contains(url) && !seen->contains(url) && !excluded->contains(url) && !blocked.contains(url)) pending.insert(url);
  }
  if (pending != pending_uploads_) {
    pending_uploads_ = std::move(pending);
    Notify("first-upload", Json(base::DictValue().Set("count", static_cast<int>(pending_uploads_.size()))));
  }
  if (confirmation_ && confirmed_urls_ != pending_uploads_) {
    // Consent was for the displayed inventory, not a silently enlarged set.
    confirmation_.reset();
    Notify("first-upload", Json(base::DictValue().Set("count", static_cast<int>(pending_uploads_.size()))));
  }
  if (confirmation_) {
    next.Set("consent", *confirmation_ ? "accepted" : "declined");
    if (!*confirmation_)
      for (const auto& url : pending_uploads_) excluded->Set(url, true);
    confirmation_.reset(); pending_uploads_.clear();
    Commit(std::move(next), base::BindOnce([](base::WeakPtr<DesktopSyncService> self) {
      if (!self) return;
      self->Notify("first-upload", "{\"count\":0}");
      self->Favorites();
    }, weak_factory_.GetWeakPtr()));
    return;
  }
  // Empty local inventory needs no confirmation. Once inventory is nonempty,
  // an answer applies only to the URLs displayed; additions while waiting are
  // included in the refreshed count before an answer is consumed.
  if (*next.FindString("consent") == "pending" && pending_uploads_.empty()) next.Set("consent", "accepted");

  for (const auto& url : urls) {
    if (blocked.contains(url) || excluded->contains(url)) continue;
    auto mine = ValueAt(local, url), other = ValueAt(theirs, url);
    if (!local.contains(url) && !bookmarks_->GetNodesByURL(GURL(url)).empty()) continue;
    bool recover = false;
    if (const auto* journal = incoming->FindDict(url)) {
      const auto* before = journal->Find("before");
      const auto* after = journal->Find("after");
      recover = sync_merge::RecoverFavoriteWrite(Favorite(&mine), Favorite(before), Favorite(after), local_changes_.contains(url));
      if (recovered_incoming_.contains(url) && Favorite(&mine) == Favorite(after)) {
        incoming->Remove(url); recovered_incoming_.erase(url);
      } else if (!recover && Favorite(&mine) != Favorite(after)) {
        incoming->Remove(url);  // an intentional subsequent local edit
      }
    }
    auto direction = recover ? sync_merge::Direction::kApplyRemote : sync_merge::FavoriteDirection(
        Favorite(&mine), Favorite(&other), Favorite(seen->Find(url)), false,
        *next.FindString("consent") != "pending");
    if (direction == sync_merge::Direction::kAskFirstUpload) continue;
    if (direction == sync_merge::Direction::kPublishLocal) {
      const double now = local_changes_.contains(url) ? local_changes_.at(url) : base::Time::Now().InMillisecondsFSinceUnixEpoch();
      auto payload = base::DictValue().Set("items", base::ListValue()).Set("tombstones", base::ListValue());
      const auto* original = raw.FindDict(url);
      const auto* wire_url = original ? original->FindString("url") : nullptr;
      if (mine.is_none()) {
        payload.FindList("tombstones")->Append(base::DictValue().Set("url", wire_url ? *wire_url : url).Set("deletedAt", now));
      } else {
        auto item = original ? original->Clone() : base::DictValue()
            .Set("url", url).Set("id", base::Uuid::GenerateRandomV4().AsLowercaseString())
            .Set("addedAt", now).Set("favicon", base::Value());
        item.Set("title", mine.GetDict().Find("title")->Clone());
        item.Set("folder", mine.GetDict().Find("folder")->Clone());
        item.Set("updatedAt", now);
        payload.FindList("items")->Append(std::move(item));
      }
      next.Set("outgoing", base::DictValue().Set("url", url).Set("local", std::move(mine)).Set("payload", std::move(payload)));
      // Persist the original proposal and clock before calling the runner.
      Commit(std::move(next), base::BindOnce(&DesktopSyncService::ReplayOutgoing, weak_factory_.GetWeakPtr()));
      return;
    }
    if (direction == sync_merge::Direction::kApplyRemote) {
      incoming->Set(url, base::DictValue().Set("before", mine.Clone()).Set("after", other.Clone()));
      if (other.is_none()) seen->Remove(url); else seen->Set(url, other.Clone());
      // Verify the remote store on disk before installing a baseline that
      // could otherwise turn a failed runner save into a remote deletion.
      VerifyRunnerFile("bookmarks.json", remote->Clone(), base::BindOnce(
          [](base::WeakPtr<DesktopSyncService> self, base::DictValue next, std::string url,
             base::Value before, base::Value after) {
            if (!self) return;
            self->Commit(std::move(next), base::BindOnce(
                [](base::WeakPtr<DesktopSyncService> self, std::string url, base::Value before, base::Value after) {
                  if (!self) return;
                  std::set<std::string> blocked;
                  const auto now = self->LocalFavorites(&blocked);
                  if (blocked.contains(url) || Favorite(now.Find(url)) != Favorite(&before)) { self->Finish(true); return; }
                  self->local_changes_.erase(url);
                  if (!self->ApplyFavorite(url, after)) {
                    self->Notify("desktop-error", "\"favorite-write-refused\""); self->Finish(); return;
                  }
                  self->Finish(true);
                }, self, std::move(url), std::move(before), std::move(after)));
          }, weak_factory_.GetWeakPtr(), std::move(next), url, std::move(mine), std::move(other)));
      return;
    }
    if (mine.is_none() && other.is_none()) {
      seen->Remove(url);
    } else if (Favorite(&mine) == Favorite(&other) && !seen->contains(url)) {
      seen->Set(url, mine.Clone());
      // Even a locally-created Favorite can be waiting for Chromium's delayed
      // save. Keep the missing-node recovery guard until a later launch has
      // actually loaded it from Chromium's own store.
      incoming->Set(url, base::DictValue().Set("before", base::Value()).Set("after", mine.Clone()));
    }
  }
  if (next != state_ && *next.FindDict("seen") == *state_.FindDict("seen") &&
      *next.FindDict("incoming") == *state_.FindDict("incoming")) {
    Commit(std::move(next), base::BindOnce(&DesktopSyncService::Settings, weak_factory_.GetWeakPtr()));
  } else if (next != state_) {
    VerifyRunnerFile("bookmarks.json", remote->Clone(), base::BindOnce(
        [](base::WeakPtr<DesktopSyncService> self, base::DictValue next) {
          if (self) self->Commit(std::move(next), base::BindOnce(&DesktopSyncService::Settings, self));
        }, weak_factory_.GetWeakPtr(), std::move(next)));
  } else Settings();
}

void DesktopSyncService::ReplayOutgoing() {
  const auto* journal = state_.FindDict("outgoing");
  if (!journal || !journal->FindString("url") || !journal->FindDict("payload") || !journal->Find("local")) {
    Fail("invalid-favorite-journal"); return;
  }
  Run("bookmarks.mergeFromSync", Args(base::Value(journal->FindDict("payload")->Clone())), base::BindOnce(
      [](base::WeakPtr<DesktopSyncService> self, bool ok, const std::string&) {
        if (!self) return;
        if (!ok) { self->Finish(); return; }
        self->Run("runner.flush", "[]", base::BindOnce([](base::WeakPtr<DesktopSyncService> self, bool ok, const std::string&) {
          if (!self) return;
          if (!ok) { self->Finish(); return; }
          self->Run("bookmarks.exportForSync", "[]", base::BindOnce([](base::WeakPtr<DesktopSyncService> self, bool ok, const std::string& json) {
            if (!self) return;
            auto snapshot = ok ? base::JSONReader::ReadDict(json, base::JSON_PARSE_RFC) : std::nullopt;
            if (!snapshot || !snapshot->FindList("items") || !snapshot->FindList("tombstones")) { self->Finish(); return; }
            self->VerifyRunnerFile("bookmarks.json", std::move(*snapshot), base::BindOnce([](base::WeakPtr<DesktopSyncService> self) {
              if (!self) return;
              auto next = self->state_.Clone();
              const auto* journal = next.FindDict("outgoing");
              const std::string url = *journal->FindString("url");
              const auto& proposed = *journal->Find("local");
              if (proposed.is_none()) next.FindDict("seen")->Remove(url);
              else {
                next.FindDict("seen")->Set(url, proposed.Clone());
                next.FindDict("incoming")->Set(url, base::DictValue().Set("before", base::Value()).Set("after", proposed.Clone()));
              }
              next.Remove("outgoing");
              // Record the submitted local version, then re-read shipping's
              // winner. A future-clock remote edit can beat this proposal;
              // that result must be applied, never resubmitted at a new clock.
              self->Commit(std::move(next), base::BindOnce([](base::WeakPtr<DesktopSyncService> self) {
                if (!self) return;
                // mergeFromSync is a pull API and doesn't schedule a push.
                // Network backoff must not hold the local reconciliation lane.
                SyncCall("sync.syncNow", "[[\"bookmarks\"]]", base::BindOnce(
                    [](base::WeakPtr<DesktopSyncService> self, bool, const std::string&) {
                      if (self) self->Reconcile();
                    }, self));
                self->Finish(true);
              }, self));
            }, self));
          }, self));
        }, self));
      }, weak_factory_.GetWeakPtr()));
}

void DesktopSyncService::Settings() {
  Run("settings.exportForSync", "[]", base::BindOnce(&DesktopSyncService::PlanSettings, weak_factory_.GetWeakPtr()));
}
void DesktopSyncService::PlanSettings(bool ok, const std::string& json) {
  auto snapshot = ok ? base::JSONReader::ReadDict(json, base::JSON_PARSE_RFC) : std::nullopt;
  const auto* remote = snapshot ? snapshot->FindDict("values") : nullptr;
  if (!remote) { Finish(); return; }
  const auto local = ReadDesktopSyncSettings(profile_);
  auto next = state_.Clone();
  base::DictValue apply, publish, disk;
  auto* seen = next.FindDict("settingsSeen");
  auto* incoming = next.FindDict("settingsIncoming");
  for (const auto& mapping : sync_merge::kSettings) {
    const std::string key(mapping.key);
    const auto* mine = local.Find(key);
    const auto* theirs = remote->Find(key);
    if (!mine || !theirs || !SupportedDesktopSyncSetting(key, *theirs)) continue;
    auto direction = sync_merge::SettingDirection(Json(*mine), Json(*theirs),
        seen->Find(key) ? std::optional<std::string>(Json(*seen->Find(key))) : std::nullopt, true);
    if (const auto* journal = incoming->FindDict(key);
        journal && !applied_settings_.contains(key) && Equal(mine, journal->Find("before")) &&
        !Equal(mine, journal->Find("after"))) direction = sync_merge::Direction::kApplyRemote;
    if (direction == sync_merge::Direction::kApplyRemote) {
      apply.Set(key, theirs->Clone());
      disk.Set(key, theirs->Clone());
      incoming->Set(key, base::DictValue().Set("before", mine->Clone()).Set("after", theirs->Clone()));
      seen->Set(key, theirs->Clone());
    } else if (direction == sync_merge::Direction::kPublishLocal) {
      publish.Set(key, mine->Clone());
    } else if (*mine == *theirs) {
      seen->Set(key, mine->Clone());
      disk.Set(key, mine->Clone());
      // The initial profile prefs are already loaded when the service starts.
      if (!applied_settings_.contains(key)) incoming->Remove(key);
    }
  }
  // Search and its address are a pair; never apply a custom selection with
  // an address that this version cannot hold, or publish half an invalid pair.
  const auto* remote_engine = remote->FindString("searchEngine");
  const auto* remote_template = remote->Find("searchEngineTemplate");
  if (!remote_engine || !remote_template || !SupportedDesktopSyncSetting("searchEngine", base::Value(*remote_engine)) ||
      !SupportedDesktopSyncSetting("searchEngineTemplate", *remote_template) ||
      (*remote_engine == "custom" && remote_template->GetString().empty())) {
    for (const char* key : {"searchEngine", "searchEngineTemplate"}) {
      apply.Remove(key); publish.Remove(key); disk.Remove(key); incoming->Remove(key);
      if (const auto* old = state_.FindDict("settingsSeen")->Find(key)) seen->Set(key, old->Clone());
      else seen->Remove(key);
    }
  } else if (apply.contains("searchEngine") || apply.contains("searchEngineTemplate")) {
    // Remote changes in either half win the coupled setting, like shipping's
    // atomic custom-search validation. Do not mix local and remote halves.
    for (const char* key : {"searchEngine", "searchEngineTemplate"}) {
      if (!local.Find(key)) continue;
      const auto& value = *remote->Find(key);
      apply.Set(key, value.Clone()); disk.Set(key, value.Clone()); publish.Remove(key);
      incoming->Set(key, base::DictValue().Set("before", local.Find(key)->Clone()).Set("after", value.Clone()));
      seen->Set(key, value.Clone());
    }
  }
  if (!apply.empty()) {
    VerifyRunnerFile("settings.json", std::move(disk), base::BindOnce(
        [](base::WeakPtr<DesktopSyncService> self, base::DictValue next, base::DictValue before, base::DictValue patch) {
          if (!self) return;
          self->Commit(std::move(next), base::BindOnce(
              [](base::WeakPtr<DesktopSyncService> self, base::DictValue before, base::DictValue patch) {
                if (!self) return;
                const auto current = ReadDesktopSyncSettings(self->profile_);
                for (auto [key, value] : patch) {
                  if (!Equal(current.Find(key), before.Find(key))) { self->Finish(true); return; }
                }
                {
                  base::AutoReset<bool> applying(&self->applying_, true);
                  ApplyDesktopSyncSettings(self->profile_, patch);
                }
                const auto actual = ReadDesktopSyncSettings(self->profile_);
                bool applied = true;
                for (auto [key, value] : patch) {
                  if (Equal(actual.Find(key), &value)) self->applied_settings_.insert(key);
                  else applied = false;
                }
                if (!applied) self->Notify("desktop-error", "\"settings-write-refused\"");
                self->Finish(applied);
              }, self, std::move(before), std::move(patch)));
        }, weak_factory_.GetWeakPtr(), std::move(next), local.Clone(), std::move(apply)));
    return;
  }
  if (!publish.empty()) {
    Run("settings.setSettings", Args(base::Value(publish.Clone())), base::BindOnce(
        [](base::WeakPtr<DesktopSyncService> self, base::DictValue patch, bool ok, const std::string&) {
          if (!self) return;
          if (!ok) { self->Finish(); return; }
          self->Run("runner.flush", "[]", base::BindOnce(
              [](base::WeakPtr<DesktopSyncService> self, base::DictValue patch, bool ok, const std::string&) {
                if (!self) return;
                if (!ok) { self->Finish(); return; }
                self->VerifyRunnerFile("settings.json", patch.Clone(), base::BindOnce(
                    [](base::WeakPtr<DesktopSyncService> self, base::DictValue patch) {
                      if (!self) return;
                      auto next = self->state_.Clone();
                      for (auto [key, value] : patch) {
                        next.FindDict("settingsSeen")->Set(key, value.Clone());
                        next.FindDict("settingsIncoming")->Remove(key);
                      }
                      self->Commit(std::move(next), base::BindOnce(&DesktopSyncService::Finish, self, true));
                    }, self, std::move(patch)));
              }, self, std::move(patch)));
        }, weak_factory_.GetWeakPtr(), std::move(publish)));
    return;
  }
  if (next != state_) {
    // Unclocked runner defaults need not have a settings.json yet. Agreement
    // on these defaults is safe; no change was made to either native store.
    Commit(std::move(next), base::BindOnce(&DesktopSyncService::Finish, weak_factory_.GetWeakPtr(), false));
  } else Finish();
}

void DesktopSyncService::Commit(base::DictValue next, base::OnceClosure done) {
  const auto epoch = account_epoch_;
  auto bytes = base::WriteJson(next);
  if (!bytes) { Fail("desktop-state-encoding"); return; }
  io_->PostTaskAndReplyWithResult(FROM_HERE, base::BindOnce(WriteState, state_path_, std::move(*bytes)),
      base::BindOnce([](base::WeakPtr<DesktopSyncService> self, uint64_t epoch,
                       base::DictValue next, base::OnceClosure done, bool ok) {
        if (!self) return;
        if (!ok) { self->Notify("desktop-error", "\"desktop-state-write-failed\""); self->Finish(); return; }
        self->state_ = std::move(next);
        if (epoch != self->account_epoch_) { self->Finish(true); return; }
        std::move(done).Run();
      }, weak_factory_.GetWeakPtr(), epoch, std::move(next), std::move(done)));
}
void DesktopSyncService::VerifyRunnerFile(std::string name, base::DictValue expected, base::OnceClosure done) {
  const auto epoch = account_epoch_;
  io_->PostTaskAndReplyWithResult(FROM_HERE,
      base::BindOnce(RunnerFileMatches, platform_->StoreDir().AppendASCII(name), std::move(expected)),
      base::BindOnce([](base::WeakPtr<DesktopSyncService> self, uint64_t epoch, base::OnceClosure done, bool ok) {
        if (!self) return;
        if (epoch != self->account_epoch_) { self->Finish(true); return; }
        if (!ok) {
          self->Notify("desktop-error", "\"runner-store-not-durable\"");
          // May simply be the host writer lagging. Keep every journal and retry;
          // no missing file or refused write can install a deletion baseline.
          self->again_ = false; self->Finish(); return;
        }
        std::move(done).Run();
      }, weak_factory_.GetWeakPtr(), epoch, std::move(done)));
}
void DesktopSyncService::Finish(bool retry) {
  running_ = false;
  if (!profile_ || failed_) return;
  if (!requests_.empty() && !timed_out_) { Pump(); return; }
  const bool soon = retry || again_;
  again_ = false;
  timer_.Start(FROM_HERE, soon ? base::Milliseconds(100) : base::Seconds(30),
      base::BindOnce(&DesktopSyncService::Reconcile, weak_factory_.GetWeakPtr()));
}
void DesktopSyncService::Notify(const std::string& event, const std::string& json) {
  for (auto& observer : observers_) observer.OnSyncEvent(event, json);
}
void DesktopSyncService::NoteDevicesForChecklist() {
  if (!profile_ || g_browser_process->local_state()->GetDict("blanc.checklist.progress").FindBool("iphone").value_or(false)) return;
  Call("sync.listDevices", "[]", base::BindOnce([](base::WeakPtr<DesktopSyncService> self, bool ok, const std::string& json) {
    if (!self || !self->profile_ || !ok) return;
    auto value = base::JSONReader::ReadDict(json, base::JSON_PARSE_RFC);
    const auto* devices = value ? value->FindList("devices") : nullptr;
    if (!devices) return;
    for (const auto& device : *devices) {
      const auto* platform = device.is_dict() ? device.GetDict().FindString("platform") : nullptr;
      if (!platform || *platform != "ios") continue;
      auto* local = g_browser_process->local_state();
      auto progress = local->GetDict("blanc.checklist.progress").Clone();
      progress.Set("iphone", true);
      local->SetDict("blanc.checklist.progress", std::move(progress));
      break;
    }
  }, weak_factory_.GetWeakPtr()));
}
void DesktopSyncService::OnEvent(const std::string& event, const std::string& json) {
  if (event == "account") ++account_epoch_;
  if (event == "remote") NoteDevicesForChecklist();
  Notify(event, json);
  if (event == "favorites" || event == "settings" || event == "account") Reconcile();
}
void DesktopSyncService::Fail(const std::string& error) {
  failed_ = true; running_ = false; timer_.Stop();
  Notify("desktop-error", Json(base::Value(error)));
  auto requests = std::move(requests_);
  for (auto& request : requests) std::move(request.callback).Run(false, error);
}
void DesktopSyncService::BookmarkModelChanged() {
  if (!bookmarks_ || !bookmarks_->loaded()) return;
  std::set<std::string> blocked, urls;
  auto current = LocalFavorites(&blocked);
  for (const auto* rows : {&current, &last_local_})
    for (auto [url, value] : *rows) urls.insert(url);
  if (!applying_) {
    const double now = base::Time::Now().InMillisecondsFSinceUnixEpoch();
    for (const auto& url : urls)
      if (!blocked.contains(url) && Favorite(current.Find(url)) != Favorite(last_local_.Find(url))) local_changes_[url] = now;
  }
  last_local_ = std::move(current);
  if (!applying_) Reconcile();
}
void DesktopSyncService::BookmarkModelLoaded(bool) {
  std::set<std::string> blocked;
  last_local_ = LocalFavorites(&blocked);
  Reconcile();
}
void DesktopSyncService::BookmarkModelBeingDeleted() {
  bookmark_observation_.Reset(); bookmarks_ = nullptr;
}
void DesktopSyncService::OnProfileWillBeDestroyed(Profile*) {
  profile_observation_.Reset(); bookmark_observation_.Reset();
  pref_changes_.RemoveAll(); timer_.Stop();
  profile_ = nullptr; bookmarks_ = nullptr;
  weak_factory_.InvalidateWeakPtrs();
  if (active_reply_ && *active_reply_) std::move(*active_reply_).Run(false, "profile-closed");
  auto requests = std::move(requests_);
  for (auto& request : requests) std::move(request.callback).Run(false, "profile-closed");
}
}  // namespace blanc

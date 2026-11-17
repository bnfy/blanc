// Copyright 2026 Bananify Creative. MIT; see the Blanc repository LICENSE.
//
// The Electron profile importer (replacement spec section 7; plan
// docs/superpowers/plans/2026-11-16-electron-profile-importer.md). It reads
// an Electron Blanc data folder and never writes it. The stores' text goes to
// a sandboxed service running the pinned plan builder
// (services/sync_runner/shims/profile-import.js), which returns one plan; the
// browser then applies a profile's part only when all of it converted, and
// records what it imported in Local State so a second run adds nothing.
//
// Built so far (tasks 2 to 5): each profile's Favorites, history, site
// icons, Start Page pins, Tab Archive, Spaces and saved windows, a named
// profile becoming an ordinary Chromium profile; Personal's settings and the
// install id; site permissions; Sync's stores and key, staged for the next
// launch. The downloads list is left behind (owner).
//
// Included by blanc_prototype_ui.cc inside its unnamed namespace.

constexpr char kImportWallpaperKey[] = "wallpaper/current.jpg#base64";
constexpr size_t kImportMaxStoreBytes = 32 * 1024 * 1024;
constexpr size_t kImportMaxTotalBytes = 256 * 1024 * 1024;
constexpr size_t kImportMaxProfiles = 64;
constexpr const char* kImportProfileStores[] = {
    "bookmarks.json", "history.json", "downloads.json", "site-permissions.json", "start-page-pins.json",
    "archive.json", "workspaces.json", "shared-spaces.json", "synced-closed.json", "reader-appearance.json"};
constexpr const char* kImportDeviceStores[] = {
    "settings.json", "session.json", "profiles.json", "profile-deletions.json", "sync.json",
    "tab-sync.json", "tab-icons.json", "sends.json", "install.json", "wallpaper.json"};

// The stores' text, keyed by their path under the data folder. Read-only:
// regular files only, never through a link, each and all bounded. A file that
// cannot be passed on becomes text the plan builder rejects as damaged.
std::optional<base::DictValue> ReadImportSource(const base::FilePath& dir) {
  if (dir.empty() || !dir.IsAbsolute() || base::IsLink(dir) || !base::DirectoryExists(dir)) return std::nullopt;
  base::DictValue files;
  size_t total = 0;
  const auto take = [&](const base::FilePath& file, const std::string& name) {
    if (base::IsLink(file) || base::DirectoryExists(file) || !base::PathExists(file)) return;
    const auto size = base::GetFileSize(file);
    std::string text;
    if (!size || *size < 0 || static_cast<size_t>(*size) > kImportMaxStoreBytes ||
        total + static_cast<size_t>(*size) > kImportMaxTotalBytes ||
        !base::ReadFileToStringWithMaxSize(file, &text, kImportMaxStoreBytes) || !base::IsStringUTF8(text)) {
      files.Set(name, "!");
      return;
    }
    total += text.size();
    files.Set(name, std::move(text));
  };
  for (const char* name : kImportDeviceStores) take(dir.AppendASCII(name), name);
  // The Start Page's image: bytes, so it travels beside the stores and never
  // through the plan builder.
  const base::FilePath image_dir = dir.AppendASCII("wallpaper"), image = image_dir.AppendASCII("current.jpg");
  if (!base::IsLink(image_dir) && !base::IsLink(image) && base::PathExists(image) && !base::DirectoryExists(image)) {
    std::string bytes;
    if (base::ReadFileToStringWithMaxSize(image, &bytes, kImportMaxWallpaperBytes) && bytes.starts_with("\xFF\xD8\xFF")) {
      files.Set(kImportWallpaperKey, base::Base64Encode(bytes));
    }
  }
  for (const char* name : kImportProfileStores) take(dir.AppendASCII(name), name);
  const base::FilePath profiles = dir.AppendASCII("profiles");
  if (!base::IsLink(profiles) && base::DirectoryExists(profiles)) {
    base::FileEnumerator folders(profiles, false, base::FileEnumerator::DIRECTORIES);
    size_t count = 0;
    for (base::FilePath folder = folders.Next(); !folder.empty() && count < kImportMaxProfiles; folder = folders.Next()) {
      const std::string id = folder.BaseName().AsUTF8Unsafe();
      if (base::IsLink(folder) || id.empty() || id.size() > 64 ||
          !std::ranges::all_of(id, [](char c) { return base::IsAsciiAlphaNumeric(c) || c == '_' || c == '-'; })) continue;
      ++count;
      for (const char* name : kImportProfileStores) take(folder.AppendASCII(name), "profiles/" + id + "/" + name);
    }
  }
  return files;
}

// One short-lived sandboxed plan builder per import; its host refuses every call.
class ProfileImportRunner final : public blanc::mojom::SyncHost {
 public:
  using Reply = base::OnceCallback<void(bool, const std::string&)>;
  ProfileImportRunner();
  ~ProfileImportRunner() override;
  void Plan(std::string args, Reply reply);
  void Fetch(const std::string&, const std::string&, const std::string&,
             const std::optional<std::vector<uint8_t>>&, FetchCallback reply) override;
  void WriteStore(const std::string&, const std::vector<uint8_t>&) override;
  void PersistDesktopStore(const std::string&, const std::vector<uint8_t>&, PersistDesktopStoreCallback reply) override;
  void Protect(const std::vector<uint8_t>&, ProtectCallback reply) override;
  void Unprotect(const std::vector<uint8_t>&, UnprotectCallback reply) override;
  void Emit(const std::string&, const std::string&) override;

 private:
  void Fail(const char* why);
  mojo::Remote<blanc::mojom::SyncRunner> service_;
  mojo::Receiver<blanc::mojom::SyncHost> host_{this};
  Reply reply_;
  base::WeakPtrFactory<ProfileImportRunner> weak_{this};
};
ProfileImportRunner::ProfileImportRunner() = default;
ProfileImportRunner::~ProfileImportRunner() = default;
void ProfileImportRunner::Plan(std::string args, Reply reply) {
  reply_ = std::move(reply);
  auto resource = blanc::sync_resources::Find("profile-import-bundle.js");
  if (!resource) { Fail("import-bundle-missing"); return; }
  const std::string script(reinterpret_cast<const char*>(resource->data()), resource->size());
  if (base::ToLowerASCII(base::HexEncode(crypto::hash::Sha256(script))) != blanc::kBlancProfileImportBundleSha256) {
    Fail("import-bundle-invalid"); return;
  }
  base::SingleThreadTaskRunner::GetCurrentDefault()->PostDelayedTask(FROM_HERE,
      base::BindOnce(&ProfileImportRunner::Fail, weak_.GetWeakPtr(), "import-timeout"), base::Seconds(60));
  service_ = content::ServiceProcessHost::Launch<blanc::mojom::SyncRunner>(
      content::ServiceProcessHost::Options().WithDisplayName("Blanc Profile Import").Pass());
  service_.set_disconnect_handler(base::BindOnce(&ProfileImportRunner::Fail, weak_.GetWeakPtr(), "import-ended"));
  service_->Start(script, {}, blanc::RunnerConfigJson("profile-import"), host_.BindNewPipeAndPassRemote(),
      base::BindOnce([](base::WeakPtr<ProfileImportRunner> self, std::string args, bool ready) {
        if (!self) return;
        if (!ready) { self->Fail("import-start-failed"); return; }
        self->service_->Call("profile.plan", args, base::BindOnce([](base::WeakPtr<ProfileImportRunner> self, bool ok, const std::string& value) {
          auto* runner = self.get();
          if (!runner || !runner->reply_) return;
          auto reply = std::move(runner->reply_);
          const std::string plan = value;  // owned by the message being dropped below
          runner->weak_.InvalidateWeakPtrs(); runner->service_.reset(); runner->host_.reset();
          std::move(reply).Run(ok, plan);
        }, self));
      }, weak_.GetWeakPtr(), std::move(args)));
}
void ProfileImportRunner::Fail(const char* why) {
  weak_.InvalidateWeakPtrs(); service_.reset(); host_.reset();
  if (reply_) std::move(reply_).Run(false, why);
}
void ProfileImportRunner::Fetch(const std::string&, const std::string&, const std::string&,
    const std::optional<std::vector<uint8_t>>&, FetchCallback reply) { std::move(reply).Run("forbidden", 0, "{}", {}); }
void ProfileImportRunner::WriteStore(const std::string&, const std::vector<uint8_t>&) {}
void ProfileImportRunner::PersistDesktopStore(const std::string&, const std::vector<uint8_t>&, PersistDesktopStoreCallback reply) { std::move(reply).Run(false); }
void ProfileImportRunner::Protect(const std::vector<uint8_t>&, ProtectCallback reply) { std::move(reply).Run(std::nullopt); }
void ProfileImportRunner::Unprotect(const std::vector<uint8_t>&, UnprotectCallback reply) { std::move(reply).Run(std::nullopt); }
void ProfileImportRunner::Emit(const std::string&, const std::string&) {}

// A profile's part of the plan, converted and checked in full before any of
// it is written. `error` names the store that could not be converted.
struct PreparedImport {
  PreparedImport();
  PreparedImport(PreparedImport&&);
  PreparedImport& operator=(PreparedImport&&);
  ~PreparedImport();
  std::vector<browser_import::Entry> favorites;
  struct Visit { GURL url; std::u16string title; base::Time time; };
  std::vector<Visit> visits;
  struct Icon { std::string host; scoped_refptr<base::RefCountedBytes> png; gfx::Size size; };
  std::vector<Icon> icons;
  base::ListValue pins;
  base::ListValue archive;
  base::DictValue spaces;                // id -> record, for SpaceDisk importSpaces
  base::DictValue space_identity;        // id -> {color, symbol}
  struct Permission { GURL origin; ContentSettingsType type; ContentSetting setting; };
  std::vector<Permission> permissions;
  std::string error;
};

PreparedImport::PreparedImport() = default;
PreparedImport::PreparedImport(PreparedImport&&) = default;
PreparedImport& PreparedImport::operator=(PreparedImport&&) = default;
PreparedImport::~PreparedImport() = default;

int ImportGroupColor(const std::string* hex) {
  if (!hex) return 0;
  for (int id = 0; id <= 8; ++id) {
    if (*hex == GroupColor(static_cast<tab_groups::TabGroupColorId>(id))) return id;
  }
  return 0;
}

// Shipping's saved window columns (workspaces-model.js, session-workspace.js)
// as the fork's Space record. Tabs the fork cannot hold are left out, with
// groups and the current tab following; a window left with no tab is not
// imported. `source` maps each kept tab to its place in the columns, and
// `titles` holds each kept tab's title, for a window that is opened.
struct ImportedWindow {
  ImportedWindow();
  ImportedWindow(ImportedWindow&&);
  ImportedWindow& operator=(ImportedWindow&&);
  ~ImportedWindow();
  base::DictValue record;
  std::vector<size_t> source;
  std::vector<std::string> titles;
};
ImportedWindow::ImportedWindow() = default;
ImportedWindow::ImportedWindow(ImportedWindow&&) = default;
ImportedWindow& ImportedWindow::operator=(ImportedWindow&&) = default;
ImportedWindow::~ImportedWindow() = default;

std::optional<ImportedWindow> ConvertImportedWindow(const base::DictValue& columns, bool allow_empty = false) {
  const auto* urls = columns.FindList("urls");
  if (!urls || urls->size() > 500) return std::nullopt;
  const auto* group_ids = columns.FindList("groupIds");
  const auto* pinned = columns.FindList("pinned");
  const auto* meta = columns.FindList("meta");
  const auto* groups = columns.FindList("groups");
  std::map<std::string, int> group_index;
  base::ListValue out_groups, tabs;
  ImportedWindow out;
  int active = 0;
  const int wanted_active = columns.FindInt("activeIndex").value_or(0);
  for (size_t i = 0; i < urls->size(); ++i) {
    if (!(*urls)[i].is_string()) continue;
    GURL url((*urls)[i].GetString());
    if (url.SchemeIs("blanc") && url.host() == "newtab") url = GURL("chrome://newtab/");
    if (!url.is_valid() || url.has_username() || url.has_password() || url.spec().size() > 8192 ||
        (!url.SchemeIsHTTPOrHTTPS() && url != GURL("chrome://newtab/"))) continue;
    int group = -1;
    if (group_ids && i < group_ids->size() && (*group_ids)[i].is_string() && groups) {
      const std::string& id = (*group_ids)[i].GetString();
      if (auto found = group_index.find(id); found != group_index.end()) {
        group = found->second;
      } else {
        for (const auto& value : *groups) {
          const auto* dict = value.GetIfDict();
          const auto* group_id = dict ? dict->FindString("id") : nullptr;
          const auto* group_name = dict ? dict->FindString("name") : nullptr;
          if (!group_id || *group_id != id || !group_name || group_name->size() > 512) continue;
          group = static_cast<int>(out_groups.size());
          group_index[id] = group;
          out_groups.Append(base::DictValue().Set("name", *group_name)
              .Set("color", ImportGroupColor(dict->FindString("color")))
              .Set("collapsed", dict->FindBool("collapsed").value_or(false)));
          break;
        }
      }
    }
    if (static_cast<int>(i) == wanted_active) active = static_cast<int>(tabs.size());
    auto tab = base::DictValue().Set("url", url.spec())
        .Set("pinned", pinned && i < pinned->size() && (*pinned)[i].GetIfBool().value_or(false)).Set("group", group);
    std::string title;
    if (meta && i < meta->size() && (*meta)[i].is_dict()) {
      const auto& row = (*meta)[i].GetDict();
      const auto* home = row.FindString("pinnedHomeUrl");
      if (home && ValidPinnedHome(GURL(*home))) tab.Set("pinnedHomeUrl", *home);
      if (const auto* text = row.FindString("title")) title = text->substr(0, 4096);
    }
    tabs.Append(std::move(tab));
    out.source.push_back(i);
    out.titles.push_back(std::move(title));
  }
  if (tabs.empty()) {
    // An empty Space, or one whose tabs the fork cannot hold, keeps its name
    // with one new tab (the fork has no Space without a tab); an empty saved
    // window is nothing to open.
    if (!allow_empty) return std::nullopt;
    tabs.Append(base::DictValue().Set("url", "chrome://newtab/").Set("pinned", false).Set("group", -1));
    out.source.push_back(0);
    out.titles.emplace_back();
    out_groups.clear();
    active = 0;
  }
  out.record = base::DictValue().Set("tabs", std::move(tabs)).Set("groups", std::move(out_groups)).Set("active", active);
  if (!ValidSpace(out.record)) return std::nullopt;
  return out;
}

std::optional<base::DictValue> ImportSpaceRecord(const base::DictValue& space, int sequence) {
  const auto* name = space.FindString("name");
  if (!name || name->empty() || name->size() > 512) return std::nullopt;
  auto window = ConvertImportedWindow(space, /*allow_empty=*/true);
  if (!window) return std::nullopt;
  window->record.Set("importName", *name);
  window->record.Set("importSequence", sequence);
  return std::move(window->record);
}

// A saved window (task 4) opened as a window of its own: every tab restored
// unloaded with its title, then pins, groups and splits, and only the saved
// current tab loaded. Returns how many tabs opened, or 0.
int OpenImportedWindow(Profile* profile, const base::DictValue& columns) {
  auto window = ConvertImportedWindow(columns);
  if (!window || GetBrowserWindowCreationStatusForProfile(*profile) != BrowserWindowInterface::CreationStatus::kOk) return 0;
  BrowserWindowCreateParams params(profile, true);
  params.should_trigger_session_restore = false;
  BrowserWindowInterface* browser = CreateBrowserWindow(std::move(params));
  auto* context = browser ? BrowserLiveTabContext::From(browser) : nullptr;
  if (!context) return 0;
  // Shown before its tabs are added: tabs restored into a window that is not
  // showing yet were all loaded when it appeared.
  browser->GetWindow()->Show();
  auto* model = browser->GetTabStripModel();
  auto* placeholder = model->GetActiveWebContents();
  const auto& tabs = *window->record.FindList("tabs");
  // The first tab added to a window is shown, and so loaded, whichever tab it
  // is (as in Chromium's own session restore, patch 0051). The saved current
  // tab therefore goes in first and the others take their places around it.
  std::vector<content::WebContents*> created(tabs.size(), nullptr);
  const size_t current = static_cast<size_t>(*window->record.FindInt("active"));
  const int base_index = model->count();
  std::vector<size_t> order = {current};
  for (size_t i = 0; i < tabs.size(); ++i) if (i != current) order.push_back(i);
  bool complete = true;
  for (size_t i : order) {
    const auto& spec = tabs[i].GetDict();
    sessions::tab_restore::Tab saved;
    sessions::SerializedNavigationEntry nav;
    nav.set_index(0);
    nav.set_virtual_url(GURL(*spec.FindString("url")));
    nav.set_title(base::UTF8ToUTF16(window->titles[i]));
    saved.navigations.push_back(std::move(nav));
    saved.current_navigation_index = 0;
    if (*spec.FindBool("pinned")) {
      saved.extra_data[kGroupPinKey] = "1";
      const auto* home = spec.FindString("pinnedHomeUrl");
      saved.extra_data[kPinnedHomeKey] = home ? *home : *spec.FindString("url");
    }
    // Before the current tab: at its own place. After it: at the end so far.
    const int at = i < current ? base_index + static_cast<int>(i) : model->count();
    auto* live = context->AddRestoredTab(saved, at, false, false, sessions::tab_restore::TAB);
    auto* tab = live ? model->GetWebContentsAt(at) : nullptr;
    if (!tab || sessions::SessionTabHelper::IdForTab(tab) != live->GetSessionID()) { complete = false; break; }
    created[i] = tab;
  }
  if (!complete) {
    browser->GetWindow()->Close();
    return 0;
  }
  const auto& groups = *window->record.FindList("groups");
  for (size_t g = 0; g < groups.size(); ++g) {
    std::vector<int> indices;
    for (size_t i = 0; i < tabs.size(); ++i) {
      if (tabs[i].GetDict().FindInt("group") == static_cast<int>(g)) indices.push_back(model->GetIndexOfWebContents(created[i]));
    }
    if (indices.empty()) continue;
    const auto& group = groups[g].GetDict();
    const auto id = NewPinnedGroup(model, indices);
    model->ChangeTabGroupVisuals(id, tab_groups::TabGroupVisualData(GroupName(*group.FindString("name")),
        static_cast<tab_groups::TabGroupColorId>(*group.FindInt("color")), *group.FindBool("collapsed")));
  }
  auto* front = created[*window->record.FindInt("active")];
  model->ActivateTabAt(model->GetIndexOfWebContents(front));
  // Splits: two kept neighbors that shared a split in the saved columns.
  const auto* splits = columns.FindList("splits");
  const auto* split_ids = columns.FindList("splitIds");
  if (splits && split_ids) {
    for (const auto& value : *splits) {
      const auto* split = value.GetIfDict();
      const auto* id = split ? split->FindString("id") : nullptr;
      const auto* layout = split ? split->FindDict("layout") : nullptr;
      const auto* widths = layout ? layout->FindList("widths") : nullptr;
      if (!id || !widths || widths->size() != 2 || !(*widths)[0].GetIfDouble()) continue;
      const double ratio = *(*widths)[0].GetIfDouble();
      if (!std::isfinite(ratio) || ratio < .2 || ratio > .8) continue;
      base::ListValue members;
      for (size_t i = 0; i < created.size(); ++i) {
        const size_t at = window->source[i];
        if (at < split_ids->size() && (*split_ids)[at].is_string() && (*split_ids)[at].GetString() == *id) {
          members.Append(base::DictValue().Set("id", sessions::SessionTabHelper::IdForTab(created[i]).id()));
        }
      }
      if (members.size() != 2) continue;
      RestoreBatchSplit(browser, base::DictValue().Set("ratio", ratio).Set("members", std::move(members))
          .Set("focused", std::clamp(split->FindInt("focusedIndex").value_or(0), 0, 1)));
    }
  }
  front->GetController().LoadIfNecessary();
  if (placeholder && model->GetIndexOfWebContents(placeholder) >= 0) {
    model->CloseWebContentsAt(model->GetIndexOfWebContents(placeholder), TabCloseTypes::CLOSE_NONE);
  }
  return static_cast<int>(created.size());
}

// The saved session: each window the profile with Electron id |id| owned, at
// most ten. A window with no owner recorded is Personal's.
base::DictValue OpenImportedSession(Profile* profile, const base::DictValue& session, const std::string& id) {
  int windows = 0, tabs = 0;
  if (const auto* saved = session.FindList("windows")) {
    for (const auto& value : *saved) {
      const auto* columns = value.GetIfDict();
      if (!columns || windows >= 10) continue;
      const auto* owner = columns->FindString("profileId");
      if ((owner ? *owner : std::string("default")) != id) continue;
      if (const int opened = OpenImportedWindow(profile, *columns)) { ++windows; tabs += opened; }
    }
  }
  return base::DictValue().Set("windows", windows).Set("tabs", tabs);
}

PreparedImport PrepareImport(const base::DictValue& stores) {
  PreparedImport out;
  const auto fail = [&](const char* store) { out.error = store; return std::move(out); };
  if (const auto* store = stores.FindDict("bookmarks.json")) {
    const auto* items = store->FindList("items");
    if (!items) return fail("bookmarks.json");
    for (const auto& value : *items) {
      const auto* item = value.GetIfDict();
      const auto* url = item ? item->FindString("url") : nullptr;
      if (!url || url->size() > 8192) continue;
      browser_import::Entry entry;
      entry.url = *url;
      if (const auto* title = item->FindString("title")) entry.title = title->substr(0, 4096);
      entry.added_at = item->FindDouble("addedAt").value_or(0);
      if (const auto* folder = item->FindString("folder"); folder && !folder->empty()) entry.folder = *folder;
      out.favorites.push_back(std::move(entry));
    }
  }
  if (const auto* store = stores.FindDict("history.json")) {
    const auto* entries = store->FindList("entries");
    // Site icons are absent from a history file written before Blanc kept them.
    const auto* icons = store->FindList("siteIcons");
    if (!entries || (store->contains("siteIcons") && !icons) || entries->size() > 5000) return fail("history.json");
    for (const auto& value : *entries) {
      const auto* item = value.GetIfDict();
      const auto* url = item ? item->FindString("url") : nullptr;
      const auto when = item ? item->FindDouble("visitedAt") : std::nullopt;
      if (!url || url->size() > 8192 || !when || !std::isfinite(*when) || *when <= 0) continue;
      const GURL parsed(*url);
      if (!parsed.is_valid() || !parsed.SchemeIsHTTPOrHTTPS()) continue;
      const auto* title = item->FindString("title");
      out.visits.push_back({parsed, base::UTF8ToUTF16(title ? title->substr(0, 4096) : std::string()),
                            base::Time::FromMillisecondsSinceUnixEpoch(*when)});
    }
    const base::ListValue no_icons;
    for (const auto& value : icons ? *icons : no_icons) {
      const auto* item = value.GetIfDict();
      const auto* host = item ? item->FindString("key") : nullptr;
      const auto* data = item ? item->FindString("favicon") : nullptr;
      if (!host || host->empty() || host->size() > 253 || !data || data->size() > 512 * 1024) continue;
      std::string mime, charset, bytes;
      if (!net::DataURL::Parse(GURL(*data), &mime, &charset, &bytes) || mime != "image/png") continue;
      const SkBitmap bitmap = gfx::PNGCodec::Decode(base::as_byte_span(bytes));
      if (bitmap.drawsNothing() || bitmap.width() > 256 || bitmap.height() > 256) continue;
      out.icons.push_back({*host, base::MakeRefCounted<base::RefCountedBytes>(base::as_byte_span(bytes)),
                           gfx::Size(bitmap.width(), bitmap.height())});
    }
  }
  if (const auto* store = stores.FindDict("start-page-pins.json")) {
    const auto* pins = store->FindList("pins");
    if (!pins) return fail("start-page-pins.json");
    for (const auto& value : *pins) {
      if (auto pin = SanitizeStartPin(value); pin && out.pins.size() < kStartPageMaxPins) out.pins.Append(std::move(*pin));
    }
  }
  if (const auto* store = stores.FindDict("archive.json")) {
    const auto* entries = store->FindList("entries");
    if (!entries) return fail("archive.json");
    for (const auto& value : *entries) {
      const auto* item = value.GetIfDict();
      const auto* id = item ? item->FindString("id") : nullptr;
      const auto* url = item ? item->FindString("url") : nullptr;
      const auto when = item ? item->FindDouble("archivedAt") : std::nullopt;
      if (!id || id->empty() || id->size() > 128 || !url || url->size() > 65536 ||
          !GURL(*url).SchemeIsHTTPOrHTTPS() || !when || !std::isfinite(*when)) continue;
      auto row = base::DictValue().Set("id", *id).Set("url", *url).Set("archivedAt", *when);
      for (const char* key : {"title", "customTitle", "spaceName"}) {
        if (const auto* text = item->FindString(key)) row.Set(key, *text);
      }
      if (const auto viewed = item->FindDouble("lastViewedAt")) row.Set("lastViewedAt", *viewed);
      out.archive.Append(std::move(row));
    }
  }
  // Site permissions (task 6): shipping's keys are origin|kind, or
  // origin|media|audio and origin|media|video. An old origin|media answer
  // covered both devices: a deny holds for both, an allow is asked again
  // (shipping's permission-decisions.js storedDecision).
  if (const auto* store = stores.FindDict("site-permissions.json")) {
    const auto* decisions = store->FindDict("decisions");
    if (!decisions) return fail("site-permissions.json");
    for (auto [key, value] : *decisions) {
      const auto* decision = value.GetIfString();
      const auto parts = base::SplitString(key, "|", base::KEEP_WHITESPACE, base::SPLIT_WANT_ALL);
      if (!decision || (*decision != "allow" && *decision != "deny") || parts.size() < 2 || parts.size() > 3) continue;
      const GURL site(parts[0]);
      if (!site.is_valid() || !site.SchemeIsHTTPOrHTTPS() || site.has_username() || site.has_password()) continue;
      const GURL origin = site.DeprecatedGetOriginAsURL();
      const ContentSetting setting = *decision == "allow" ? CONTENT_SETTING_ALLOW : CONTENT_SETTING_BLOCK;
      if (parts[1] == "geolocation" && parts.size() == 2) {
        out.permissions.push_back({origin, ContentSettingsType::GEOLOCATION, setting});
      } else if (parts[1] == "notifications" && parts.size() == 2) {
        out.permissions.push_back({origin, ContentSettingsType::NOTIFICATIONS, setting});
      } else if (parts[1] == "media" && parts.size() == 3 && parts[2] == "audio") {
        out.permissions.push_back({origin, ContentSettingsType::MEDIASTREAM_MIC, setting});
      } else if (parts[1] == "media" && parts.size() == 3 && parts[2] == "video") {
        out.permissions.push_back({origin, ContentSettingsType::MEDIASTREAM_CAMERA, setting});
      } else if (parts[1] == "media" && parts.size() == 2 && setting == CONTENT_SETTING_BLOCK) {
        out.permissions.push_back({origin, ContentSettingsType::MEDIASTREAM_MIC, setting});
        out.permissions.push_back({origin, ContentSettingsType::MEDIASTREAM_CAMERA, setting});
      }
    }
    if (out.permissions.size() > 5000) return fail("site-permissions.json");
  }
  if (const auto* store = stores.FindDict("workspaces.json")) {
    const auto* spaces = store->FindList("workspaces");
    if (!spaces) return fail("workspaces.json");
    int sequence = 0;
    for (const auto& value : *spaces) {
      const auto* space = value.GetIfDict();
      auto record = space ? ImportSpaceRecord(*space, sequence) : std::nullopt;
      if (!record) continue;
      ++sequence;
      const std::string id = base::Uuid::GenerateRandomV4().AsLowercaseString();
      base::DictValue identity;
      for (const char* key : {"color", "symbol"}) {
        if (const auto* text = space->FindString(key); text && text->size() <= 120) identity.Set(key, *text);
      }
      out.space_identity.Set(id, std::move(identity));
      out.spaces.Set(id, std::move(*record));
    }
  }
  return out;
}

// Writes a prepared profile. Spaces go first: their file is the one write
// that can refuse (no room, a switch in progress), and nothing else has been
// written yet when it does.
void ApplyImport(Profile* profile, PreparedImport prepared, base::OnceCallback<void(base::Value)> done, int attempt) {
  // A profile created a moment ago is still loading its Favorites.
  if (auto* loading = BookmarkModelFactory::GetForBrowserContext(profile); loading && !loading->loaded() && attempt < 100) {
    base::SingleThreadTaskRunner::GetCurrentDefault()->PostDelayedTask(FROM_HERE,
        base::BindOnce([](base::WeakPtr<Profile> profile, PreparedImport prepared, base::OnceCallback<void(base::Value)> done, int attempt) {
          if (!profile) { std::move(done).Run(base::Value("profile-closed")); return; }
          ApplyImport(profile.get(), std::move(prepared), std::move(done), attempt + 1);
        }, profile->GetWeakPtr(), std::move(prepared), std::move(done), attempt), base::Milliseconds(100));
    return;
  }
  auto spaces = prepared.spaces.Clone();
  base::ThreadPool::PostTaskAndReplyWithResult(FROM_HERE, {base::MayBlock()},
      base::BindOnce(&SpaceDisk, profile->GetPath().AppendASCII("BlancPrototypeSpaces.json"), "importSpaces",
                     std::string(), std::move(spaces)),
      base::BindOnce([](base::WeakPtr<Profile> profile, PreparedImport prepared,
                        base::OnceCallback<void(base::Value)> done, base::DictValue written) {
        if (!profile) { std::move(done).Run(base::Value("profile-closed")); return; }
        if (const auto* error = written.FindString("error")) { std::move(done).Run(base::Value("spaces:" + *error)); return; }
        auto* model = LoadedBookmarkModel(profile.get());
        auto* history = HistoryServiceFactory::GetForProfile(profile.get(), ServiceAccessType::EXPLICIT_ACCESS);
        auto* favicons = FaviconServiceFactory::GetForProfile(profile.get(), ServiceAccessType::EXPLICIT_ACCESS);
        if (!model || !history || !favicons) { std::move(done).Run(base::Value("profile-not-ready")); return; }
        auto* prefs = profile->GetPrefs();
        // Spaces: their names, order, color and symbol.
        RecoverImportedSpaceNames(profile.get(), prepared.spaces);
        if (!prepared.space_identity.empty()) {
          auto meta = prefs->GetDict(kSpacesMetaPref).Clone();
          if (auto* items = meta.FindDict("items")) {
            for (auto [id, identity] : prepared.space_identity) {
              if (auto* item = items->FindDict(id)) item->Merge(identity.GetDict().Clone());
            }
          }
          prefs->SetDict(kSpacesMetaPref, std::move(meta));
        }
        const auto favorites = browser_import::Import(model, prepared.favorites);
        std::set<GURL> seen;
        for (const auto& visit : prepared.visits) {
          history->AddPage(visit.url, visit.time, history::SOURCE_BROWSED);
          if (seen.insert(visit.url).second && !visit.title.empty()) history->SetPageTitle(visit.url, visit.title);
        }
        for (const auto& icon : prepared.icons) {
          const GURL icon_url("https://" + icon.host + "/favicon.ico");
          size_t pages = 0;
          for (const auto& url : seen) {
            if (pages >= 500) break;
            const auto host = url.host();
            if (host != icon.host && host != "www." + icon.host) continue;
            favicons->MergeFavicon(url, icon_url, favicon_base::IconType::kFavicon, icon.png, icon.size);
            ++pages;
          }
        }
        if (!prepared.pins.empty()) {
          auto pins = prefs->GetList(kStartPagePinsPref).Clone();
          std::set<std::string> urls;
          for (const auto& pin : pins) if (const auto* url = pin.GetDict().FindString("url")) urls.insert(*url);
          for (auto& pin : prepared.pins) {
            if (pins.size() >= kStartPageMaxPins) break;
            if (urls.insert(*pin.GetDict().FindString("url")).second) pins.Append(std::move(pin));
          }
          prefs->SetList(kStartPagePinsPref, std::move(pins));
        }
        if (!prepared.archive.empty()) {
          auto archive = prefs->GetList(kArchiveEntriesPref).Clone();
          std::set<std::string> ids;
          for (const auto& row : archive) if (const auto* id = row.GetDict().FindString("id")) ids.insert(*id);
          for (auto& row : prepared.archive) {
            if (archive.size() >= 500) break;
            if (ids.insert(*row.GetDict().FindString("id")).second) archive.Append(std::move(row));
          }
          prefs->SetList(kArchiveEntriesPref, std::move(archive));
        }
        if (auto* settings = HostContentSettingsMapFactory::GetForProfile(profile.get())) {
          for (const auto& permission : prepared.permissions) {
            settings->SetContentSettingDefaultScope(permission.origin, permission.origin, permission.type, permission.setting);
          }
        }
        prefs->CommitPendingWrite();
        std::move(done).Run(base::Value(base::DictValue()
            .Set("favorites", favorites.FindInt("added").value_or(0))
            .Set("history", static_cast<int>(prepared.visits.size()))
            .Set("siteIcons", static_cast<int>(prepared.icons.size()))
            .Set("pins", static_cast<int>(prepared.pins.size()))
            .Set("archive", static_cast<int>(prepared.archive.size()))
            .Set("spaces", static_cast<int>(prepared.spaces.size()))
            .Set("permissions", static_cast<int>(prepared.permissions.size()))));
      }, profile->GetWeakPtr(), std::move(prepared), std::move(done)));
}

// Settings (task 3). The seven keys Sync carries go through Sync's own
// converter; the rest arrive from the plan builder as preference names and
// values it already checked against the settings table. Here a value is
// written only into a Blanc preference (or the one Chromium preference the
// table names) that is registered with the same type, in the profile's
// store or, failing that, Local State.
base::DictValue ApplyImportedSettings(Profile* profile, const base::DictValue* synced, const base::DictValue* prefs) {
  int converted = 0, copied = 0;
  base::ListValue refused;
  if (synced) {
    base::DictValue patch;
    for (auto [key, value] : *synced) {
      if (blanc::SupportedDesktopSyncSetting(key, value)) { patch.Set(key, value.Clone()); ++converted; }
    }
    if (!patch.empty()) blanc::ApplyDesktopSyncSettings(profile, patch);
  }
  if (prefs) {
    for (auto [name, value] : *prefs) {
      if (!name.starts_with("blanc.") && name != "search.suggest_enabled") { refused.Append(name); continue; }
      PrefService* store = profile->GetPrefs()->FindPreference(name) ? profile->GetPrefs() : g_browser_process->local_state();
      const auto* pref = store->FindPreference(name);
      if (!pref || !pref->IsUserModifiable()) { refused.Append(name); continue; }
      if (pref->GetType() == base::Value::Type::DOUBLE && value.is_int()) {
        store->SetDouble(name, value.GetInt());
      } else if (pref->GetType() == value.type() &&
                 (value.is_bool() || value.is_int() || value.is_double() || value.is_string())) {
        store->Set(name, value.Clone());
      } else {
        refused.Append(name);
        continue;
      }
      ++copied;
    }
  }
  profile->GetPrefs()->CommitPendingWrite();
  g_browser_process->local_state()->CommitPendingWrite();
  return base::DictValue().Set("synced", converted).Set("prefs", copied).Set("refused", std::move(refused));
}

// The Start Page's settings. The layout and the clock are preferences; the
// wallpaper choices and image wait for the Start Page (start_page_import.inc).
// The fork's one layout is Billboard with widgets, taken once from the old
// layout: widgets nobody has changed are taken again from the imported one.
base::DictValue ApplyImportedStartPage(Profile* profile, const base::DictValue& start, std::optional<std::string> image) {
  auto* prefs = profile->GetPrefs();
  auto* local = g_browser_process->local_state();
  auto summary = base::DictValue().Set("layout", false).Set("clock", 0).Set("wallpaper", false).Set("image", false);
  const auto* layout = start.FindString("layout");
  if (layout && (*layout == "billboard" || *layout == "ledger" || *layout == "shelf" || *layout == "tally") &&
      prefs->FindPreference("blanc.prototype.start_layout")) {
    prefs->SetString("blanc.prototype.start_layout", *layout);
    summary.Set("layout", true);
    constexpr char kWidgets[] = "blanc.start.widgets";
    if (local->FindPreference(kWidgets)) {
      const auto& widgets = local->GetDict(kWidgets);
      const auto* from = widgets.FindString("from");
      const auto initial = [](const std::string& name) {
        return base::DictValue().Set("v", 1)
            .Set("favorites", name == "ledger" || name == "tally" || name == "shelf")
            .Set("devices", name == "ledger").Set("shortcuts", name == "shelf").Set("from", name);
      };
      if (from && *from != *layout && widgets == initial(*from)) local->ClearPref(kWidgets);
    }
  }
  if (const auto* clock = start.FindDict("clock"); clock && prefs->FindPreference(kBillboardClockPref)) {
    auto update = SanitizeClockUpdate(*clock);
    if (!update.empty()) {
      summary.Set("clock", static_cast<int>(update.size()));
      auto next = prefs->GetDict(kBillboardClockPref).Clone();
      for (auto [key, value] : update) next.Set(key, value.Clone());
      prefs->SetDict(kBillboardClockPref, std::move(next));
    }
  }
  prefs->CommitPendingWrite();
  base::DictValue wallpaper;
  if (const auto* wanted = start.FindDict("wallpaper")) {
    for (const char* key : {"dynamic", "color", "custom"}) {
      if (const auto value = wanted->FindBool(key)) wallpaper.Set(key, *value);
    }
    for (const char* key : {"preset", "fill", "style"}) {
      const auto* text = wanted->FindString(key);
      if (text && !text->empty() && text->size() <= 32 && std::ranges::all_of(*text, base::IsAsciiLower<char>)) wallpaper.Set(key, *text);
    }
    if (const auto wash = wanted->FindInt("wash"); wash && *wash >= 0 && *wash <= 100) wallpaper.Set("wash", *wash);
  }
  if (wallpaper.empty()) return summary;
  const bool with_image = wallpaper.FindBool("custom").value_or(false) && image && !image->empty();
  summary.Set("wallpaper", true);
  summary.Set("image", with_image);
  auto pending = base::DictValue().Set("directory", profile->GetPath().BaseName().AsUTF8Unsafe())
      .Set("wallpaper", std::move(wallpaper)).Set("image", with_image);
  // The image is staged first, so a Start Page never reads a pending import
  // whose image is not there yet.
  base::ThreadPool::PostTaskAndReplyWithResult(FROM_HERE, {base::MayBlock()},
      base::BindOnce([](base::FilePath folder, std::string bytes) {
        base::DeletePathRecursively(folder);
        if (bytes.empty()) return true;
        return base::CreateDirectory(folder) && base::SetPosixFilePermissions(folder, 0700) &&
               base::WriteFile(folder.AppendASCII(kStartPageImportImage), bytes);
      }, profile->GetPath().AppendASCII(kStartPageImportFolder), with_image ? std::move(*image) : std::string()),
      base::BindOnce([](base::DictValue pending, bool staged) {
        if (!staged) pending.Set("image", false);
        auto marker = g_browser_process->local_state()->GetDict(kProfileImportPref).Clone();
        marker.Set("startPage", std::move(pending));
        g_browser_process->local_state()->SetDict(kProfileImportPref, std::move(marker));
        g_browser_process->local_state()->CommitPendingWrite();
      }, std::move(pending)));
  return summary;
}

// The install id travels with the person (spec section 7), so a count of
// installs does not see a new one.
bool ApplyImportedInstall(const base::DictValue* install) {
  const auto* id = install ? install->FindString("id") : nullptr;
  if (!id || !base::Uuid::ParseCaseInsensitive(*id).is_valid()) return false;
  // An install older than shipping's first-day signals has the word "legacy"
  // for its date (telemetry.js installMeta; found on a real profile,
  // 2026-11-16). It is kept as 0, a date no first-day window contains.
  double created = 0;
  if (const auto number = install->FindDouble("createdAt")) {
    if (!std::isfinite(*number) || *number <= 0) return false;
    created = *number;
  } else {
    const auto* word = install->FindString("createdAt");
    if (!word || *word != "legacy") return false;
  }
  g_browser_process->local_state()->SetDict("blanc.telemetry.install", base::DictValue()
      .Set("id", base::ToLowerASCII(*id)).Set("createdAt", created)
      .Set("day1Default", install->FindBool("day1Default").value_or(false))
      .Set("day1Browsed", install->FindBool("day1Browsed").value_or(false)));
  g_browser_process->local_state()->CommitPendingWrite();
  return true;
}

// Sync (task 7). Its stores are shipping's own files, which the fork's Sync
// reads once when it starts, so the importer stages them beside the profile
// (BlancSyncImport) and the next launch takes them up before Sync starts
// (desktop_sync_service.cc AdoptImportedSyncStores). The key is ciphertext
// only Electron's Keychain item opens: it is opened with that item's
// password and protected again with the fork's own, so Sync stays on as the
// same device (owner, 2026-11-16). Where the key cannot be opened, the
// stores are staged with Sync off and the person signs in again.
constexpr char kImportSyncStaging[] = "BlancSyncImport";
constexpr const char* kImportSyncDeviceStores[] = {"sync.json", "tab-sync.json", "tab-icons.json", "sends.json"};
constexpr const char* kImportSyncProfileStores[] = {"shared-spaces.json", "synced-closed.json"};

// A test launch never reads the real Keychain item: its password is a
// stand-in, and with none set the read counts as refused.
std::optional<std::string>& TestSafeStoragePassword() {
  static base::NoDestructor<std::optional<std::string>> password;
  return *password;
}
std::optional<std::string> ElectronSafeStoragePassword() {
  if (blanc::BlancTestLaunch()) return TestSafeStoragePassword();
#if BUILDFLAG(IS_MAC)
  return blanc::ReadElectronSafeStoragePassword();
#else
  return std::nullopt;
#endif
}

// Electron's safeStorage on macOS is Chromium's OSCrypt "v10": AES-128-CBC,
// sixteen spaces as the IV, under PBKDF2-HMAC-SHA1(password, "saltysalt",
// 1003 rounds). Shipping stores base64(encrypt(base64(key))); the result here
// is that inner base64 text, checked to be a 32-byte key.
std::optional<std::string> UnwrapElectronSyncKey(const std::string& protected_key, const std::string& password) {
  const auto blob = base::Base64Decode(protected_key);
  if (!blob || blob->size() < 3 + 16 || (*blob)[0] != 'v' || (*blob)[1] != '1' || (*blob)[2] != '0') return std::nullopt;
  std::array<uint8_t, 16> derived;
  static constexpr char kSalt[] = "saltysalt";
  if (!PKCS5_PBKDF2_HMAC_SHA1(password.data(), password.size(), reinterpret_cast<const uint8_t*>(kSalt), 9, 1003,
                              derived.size(), derived.data())) return std::nullopt;
  std::array<uint8_t, 16> iv;
  iv.fill(' ');
  const auto plain = crypto::aes_cbc::Decrypt(derived, iv, base::span(*blob).subspan(3u));
  if (!plain) return std::nullopt;
  std::string text(plain->begin(), plain->end());
  const auto key = base::Base64Decode(text);
  if (!key || key->size() != 32) return std::nullopt;
  return text;
}
std::optional<std::string> OpenElectronSyncKey(std::string protected_key) {
  const auto password = ElectronSafeStoragePassword();
  return password ? UnwrapElectronSyncKey(protected_key, *password) : std::nullopt;
}

// Writes the staging folder afresh: the stores, then `ready` last, so a
// folder without it is never taken up.
// A test launch can make the staging write fail (setImportSyncStagingFails).
std::atomic<bool>& ImportSyncStagingFailsForTest() {
  static std::atomic<bool> fails{false};
  return fails;
}
bool WriteImportSyncStaging(base::FilePath dir, base::DictValue stores) {
  if (!base::DeletePathRecursively(dir) || !base::CreateDirectory(dir)) return false;
  if (blanc::BlancTestLaunch() && ImportSyncStagingFailsForTest()) return false;
  for (auto [name, value] : stores) {
    const auto json = base::WriteJson(value);
    if (!json || !base::ImportantFileWriter::WriteFileAtomically(dir.AppendASCII(name), *json)) return false;
  }
  return base::WriteFile(dir.AppendASCII("ready"), "1");
}

// Stages Sync for the first profile. `key_state` in the reply is kept (the
// key re-protected), unavailable (it could not be opened) or none (the
// Electron app was not syncing, or kept no protected key).
void StageImportedSync(Profile* profile, base::DictValue stores, std::optional<std::string> protected_key,
                       base::OnceCallback<void(base::DictValue)> done) {
  auto* sync = stores.FindDict("sync.json");
  // state: staged, failed (the write did not finish; Sync is retried by the
  // next import) or none (nothing of Sync's to stage).
  if (!sync) { std::move(done).Run(base::DictValue().Set("staged", false).Set("state", "none").Set("key", "none")); return; }
  const base::FilePath dir = profile->GetPath().AppendASCII(kImportSyncStaging);
  auto write = base::BindOnce([](base::FilePath dir, base::OnceCallback<void(base::DictValue)> done,
                                 base::DictValue stores, std::string key_state) {
    base::ThreadPool::PostTaskAndReplyWithResult(FROM_HERE, {base::MayBlock()},
        base::BindOnce(&WriteImportSyncStaging, dir, std::move(stores)),
        base::BindOnce([](base::OnceCallback<void(base::DictValue)> done, std::string key_state, bool written) {
          std::move(done).Run(base::DictValue().Set("staged", written).Set("state", written ? "staged" : "failed").Set("key", key_state));
        }, std::move(done), std::move(key_state)));
  }, dir, std::move(done));
  if (!sync->FindBool("enabled").value_or(false) || !protected_key) {
    sync->Set("enabled", false);
    std::move(write).Run(std::move(stores), "none");
    return;
  }
  base::ThreadPool::PostTaskAndReplyWithResult(FROM_HERE, {base::MayBlock()},
      base::BindOnce(&OpenElectronSyncKey, *protected_key),
      base::BindOnce([](base::DictValue stores, base::OnceCallback<void(base::DictValue, std::string)> write,
                        std::optional<std::string> key) {
        if (!key || !g_browser_process->os_crypt_async()) {
          stores.FindDict("sync.json")->Set("enabled", false);
          std::move(write).Run(std::move(stores), "unavailable");
          return;
        }
        g_browser_process->os_crypt_async()->GetInstance(base::BindOnce(
            [](base::DictValue stores, base::OnceCallback<void(base::DictValue, std::string)> write, std::string key,
               scoped_refptr<os_crypt_async::Encryptor> encryptor) {
              const auto sealed = encryptor && encryptor->IsEncryptionAvailable() ? encryptor->EncryptString(key) : std::nullopt;
              auto* sync = stores.FindDict("sync.json");
              if (sealed) sync->Set("protectedKey", base::Base64Encode(*sealed));
              else sync->Set("enabled", false);
              std::move(write).Run(std::move(stores), sealed ? "kept" : "unavailable");
            }, std::move(stores), std::move(write), std::move(*key)));
      }, std::move(stores), std::move(write)));
}

// Where the import reads from, and whether it may start (task 8). The folder
// is the released Electron app's own data folder: nothing a page says picks
// it. The import waits while that app is running, so it never reads stores
// in the middle of being written. A test launch reads neither the real
// folder nor the real app's state: both come from its hooks, and with none
// set there is no source.
std::optional<base::FilePath>& TestImportSource() {
  static base::NoDestructor<std::optional<base::FilePath>> source;
  return *source;
}
std::optional<bool>& TestImportElectronRunning() {
  static std::optional<bool> running;
  return running;
}
struct ImportSourceState {
  base::FilePath path;
  bool running = false;
};
ImportSourceState FindImportSource() {
  ImportSourceState state;
  if (blanc::BlancTestLaunch()) {
    if (TestImportSource()) state.path = *TestImportSource();
    state.running = TestImportElectronRunning().value_or(false);
    return state;
  }
#if BUILDFLAG(IS_MAC)
  base::FilePath support;
  if (base::PathService::Get(base::DIR_APP_DATA, &support)) state.path = support.AppendASCII("Blanc");
  state.running = blanc::ElectronBlancRunning();
#endif
  return state;
}

// What Settings shows of a finished import: counts and codes, no content.
base::DictValue ImportSummary(const base::Value& result) {
  const auto* dict = result.GetIfDict();
  if (!dict || !dict->FindBool("ok").value_or(false)) {
    const auto* error = dict ? dict->FindString("error") : nullptr;
    return base::DictValue().Set("ok", false).Set("error", error ? *error : std::string("failed"));
  }
  const auto* profiles = dict->FindDict("profiles");
  const auto* errors = dict->FindList("errors");
  const auto* already = dict->FindList("alreadyImported");
  const auto* sync = dict->FindDict("sync");
  const auto* key = sync ? sync->FindString("key") : nullptr;
  const auto* sync_state = sync ? sync->FindString("state") : nullptr;
  const bool sync_failed = sync_state && *sync_state == "failed";
  // The list a person reads: each profile by its own name with its counts,
  // and each one that could not be read. Names go to the Settings page only.
  const auto* names = dict->FindDict("names");
  const auto name_of = [&](const std::string& profile) {
    const auto* name = names ? names->FindString(profile) : nullptr;
    return name ? *name : std::string();
  };
  base::ListValue details;
  if (profiles) {
    for (auto [profile, counts] : *profiles) {
      if (!counts.is_dict()) continue;
      details.Append(base::DictValue().Set("personal", profile == "personal").Set("name", name_of(profile))
          .Set("failed", false).Set("counts", counts.Clone()));
    }
  }
  std::set<std::string> failed;
  if (errors) {
    for (const auto& value : *errors) {
      const auto* profile = value.is_dict() ? value.GetDict().FindString("profile") : nullptr;
      if (!profile || (profiles && profiles->contains(*profile)) || !failed.insert(*profile).second) continue;
      if (*profile != "personal" && name_of(*profile).empty()) continue;
      details.Append(base::DictValue().Set("personal", *profile == "personal").Set("name", name_of(*profile)).Set("failed", true));
    }
  }
  return base::DictValue().Set("ok", true).Set("details", std::move(details))
      .Set("imported", static_cast<int>(profiles ? profiles->size() : 0))
      .Set("failed", static_cast<int>(errors ? errors->size() : 0))
      .Set("already", static_cast<int>(already ? already->size() : 0))
      .Set("sync", sync_failed ? std::string("failed") : key ? *key : std::string("none"))
      .Set("syncRetried", dict->FindBool("syncRetried").value_or(false));
}

// One import at a time. Each profile in the plan is a job: Personal into the
// first profile, and each named profile into an ordinary Chromium profile
// created for it (owner, 2026-11-16: Chromium's own profiles, nothing
// custom). A job's data is converted in full before its profile is created
// or written. The result names what came across, what failed and what was
// imported before.
class ProfileImport final {
 public:
  using Done = base::OnceCallback<void(base::Value)>;
  static ProfileImport* Get();
  ProfileImport();
  ~ProfileImport();
  void Start(base::FilePath source, Profile* personal, Done done);

 private:
  struct Job {
    Job();
    Job(Job&&);
    Job& operator=(Job&&);
    ~Job();
    std::string key, id, name;
    base::DictValue stores;
  };
  void SourceRead(std::optional<base::DictValue> files);
  void Planned(bool ok, const std::string& value);
  void NextProfile();
  void ProfileReady(std::string key, std::string id, PreparedImport prepared, Profile* profile);
  void Applied(std::string key, std::string id, base::WeakPtr<Profile> profile, base::Value applied);
  void Fail(const std::string& key, const std::string& store, const std::string& reason);
  void SyncStaged(base::DictValue staged);
  void Finish(base::Value result);
  std::unique_ptr<ProfileImportRunner> runner_;
  base::WeakPtr<Profile> personal_;
  std::vector<Job> jobs_;
  std::string version_;
  int windows_ = 0, tabs_ = 0;
  bool created_profile_ = false;
  bool retry_sync_ = false;
  base::DictValue settings_synced_, settings_prefs_, install_, session_, sync_stores_, start_page_;
  std::optional<std::string> wallpaper_;
  std::optional<std::string> sync_key_;
  base::ListValue settings_skipped_;
  base::DictValue result_;
  Done done_;
  base::WeakPtrFactory<ProfileImport> weak_{this};
};
ProfileImport::Job::Job() = default;
ProfileImport::Job::Job(Job&&) = default;
ProfileImport::Job& ProfileImport::Job::operator=(Job&&) = default;
ProfileImport::Job::~Job() = default;
ProfileImport::ProfileImport() = default;
ProfileImport::~ProfileImport() = default;
ProfileImport* ProfileImport::Get() {
  static base::NoDestructor<ProfileImport> instance;
  return instance.get();
}
void ProfileImport::Start(base::FilePath source, Profile* personal, Done done) {
  if (done_) { std::move(done).Run(base::Value(base::DictValue().Set("ok", false).Set("error", "import-busy"))); return; }
  done_ = std::move(done);
  personal_ = personal->GetWeakPtr();
  base::ThreadPool::PostTaskAndReplyWithResult(FROM_HERE, {base::MayBlock()},
      base::BindOnce(&ReadImportSource, std::move(source)),
      base::BindOnce(&ProfileImport::SourceRead, weak_.GetWeakPtr()));
}
void ProfileImport::SourceRead(std::optional<base::DictValue> files) {
  if (!files) { Finish(base::Value(base::DictValue().Set("ok", false).Set("error", "no-source"))); return; }
  if (auto image = files->Extract(kImportWallpaperKey); image && image->is_string()) {
    if (const auto bytes = base::Base64Decode(image->GetString())) wallpaper_ = std::string(bytes->begin(), bytes->end());
  }
  auto args = base::WriteJson(base::ListValue().Append(std::move(*files)));
  if (!args) { Finish(base::Value(base::DictValue().Set("ok", false).Set("error", "no-source"))); return; }
  runner_ = std::make_unique<ProfileImportRunner>();
  runner_->Plan(std::move(*args), base::BindOnce(&ProfileImport::Planned, weak_.GetWeakPtr()));
}
void ProfileImport::Planned(bool ok, const std::string& value) {
  runner_.reset();
  auto parsed = ok ? base::JSONReader::ReadDict(value, base::JSON_PARSE_RFC) : std::nullopt;
  if (!parsed) { Finish(base::Value(base::DictValue().Set("ok", false).Set("error", ok ? "invalid-plan" : value))); return; }
  if (!parsed->FindBool("ok").value_or(false)) { Finish(base::Value(std::move(*parsed))); return; }
  const auto* version = parsed->FindString("sourceVersion");
  const auto* profiles = parsed->FindDict("profiles");
  if (!version || !profiles || !personal_) { Finish(base::Value(base::DictValue().Set("ok", false).Set("error", "invalid-plan"))); return; }
  version_ = *version;
  result_ = base::DictValue().Set("ok", true).Set("sourceVersion", *version).Set("profiles", base::DictValue())
      .Set("errors", parsed->FindList("errors") ? parsed->FindList("errors")->Clone() : base::ListValue())
      .Set("notImported", parsed->FindList("notImported") ? parsed->FindList("notImported")->Clone() : base::ListValue())
      .Set("alreadyImported", base::ListValue()).Set("names", base::DictValue());
  // A profile the plan builder refused is named for the result list; the
  // error rows themselves stay profile, store and reason.
  for (auto& row : *result_.FindList("errors")) {
    auto* error = row.GetIfDict();
    const auto* profile = error ? error->FindString("profile") : nullptr;
    const auto* name = error ? error->FindString("name") : nullptr;
    if (profile && name) result_.FindDict("names")->Set(*profile, name->substr(0, 64));
    if (error) error->Remove("name");
  }
  if (const auto* rules = parsed->FindDict("settingsPrefs")) {
    if (const auto* prefs = rules->FindDict("prefs")) settings_prefs_ = prefs->Clone();
    if (const auto* skipped = rules->FindList("skipped")) settings_skipped_ = skipped->Clone();
  }
  if (const auto* device = parsed->FindDict("device")) {
    if (const auto* install = device->FindDict("install.json")) install_ = install->Clone();
    if (const auto* session = device->FindDict("session.json")) session_ = session->Clone();
    for (const char* name : kImportSyncDeviceStores) {
      if (const auto* store = device->FindDict(name)) sync_stores_.Set(name, store->Clone());
    }
  }
  if (const auto* sealed = parsed->FindString("syncProtectedKey")) sync_key_ = *sealed;
  if (const auto* start = parsed->FindDict("startPage")) start_page_ = start->Clone();
  // Personal first, then the named profiles in the plan's order; one
  // imported before is only named.
  const auto* done = g_browser_process->local_state()->GetDict(kProfileImportPref).FindDict("profiles");
  std::vector<Job> named;
  for (auto [key, planned] : *profiles) {
    const auto* entry = planned.GetIfDict();
    const auto* stores = entry ? entry->FindDict("stores") : nullptr;
    const auto* id = entry ? entry->FindString("id") : nullptr;
    if (!stores || !id) continue;
    // Personal's Sync stores travel with the device's.
    if (key == "personal") {
      for (const char* name : kImportSyncProfileStores) {
        if (const auto* store = stores->FindDict(name)) sync_stores_.Set(name, store->Clone());
      }
    }
    if (done && done->contains(key)) {
      result_.FindList("alreadyImported")->Append(key);
      // Sync is tracked apart from the profile's data: a Personal imported
      // before whose Sync staging failed gets Sync staged again, and nothing
      // else of it is imported twice.
      const auto* entry_done = done->FindDict(key);
      const auto* sync_state = entry_done ? entry_done->FindString("sync") : nullptr;
      if (key == "personal" && sync_state && *sync_state == "failed") retry_sync_ = true;
      continue;
    }
    Job job;
    job.key = key;
    job.id = *id;
    if (const auto* name = entry->FindString("name")) job.name = *name;
    result_.FindDict("names")->Set(key, job.name.substr(0, 64));
    job.stores = stores->Clone();
    if (key == "personal") {
      if (const auto* synced = stores->FindDict("settings.json")) settings_synced_ = synced->Clone();
    }
    if (key == "personal") jobs_.insert(jobs_.begin(), std::move(job)); else named.push_back(std::move(job));
  }
  // Processed from the back, so Personal, at the front, goes last in the
  // vector and first in time.
  std::ranges::reverse(named);
  if (!jobs_.empty()) { named.push_back(std::move(jobs_.front())); jobs_.clear(); }
  jobs_ = std::move(named);
  NextProfile();
}
void ProfileImport::NextProfile() {
  if (jobs_.empty() && retry_sync_) {
    retry_sync_ = false;
    if (personal_) {
      result_.Set("syncRetried", true);
      StageImportedSync(personal_.get(), std::move(sync_stores_), std::move(sync_key_),
          base::BindOnce(&ProfileImport::SyncStaged, weak_.GetWeakPtr()));
      sync_stores_ = base::DictValue();
      sync_key_.reset();
      return;
    }
  }
  if (jobs_.empty()) {
    // With more than one profile Chromium opens its profile picker at each
    // launch. Its own setting for that is switched off (owner, 2026-11-16),
    // so Blanc reopens its windows as the Electron app did; the picker's
    // checkbox switches it back on.
    if (created_profile_) {
      g_browser_process->local_state()->SetBoolean(prefs::kBrowserShowProfilePickerOnStartup, false);
      g_browser_process->local_state()->CommitPendingWrite();
    }
    result_.Set("session", base::DictValue().Set("windows", windows_).Set("tabs", tabs_));
    Finish(base::Value(std::move(result_)));
    return;
  }
  Job job = std::move(jobs_.back());
  jobs_.pop_back();
  auto prepared = PrepareImport(job.stores);
  if (!prepared.error.empty()) { Fail(job.key, prepared.error, "invalid-shape"); return; }
  if (job.key == "personal") {
    ProfileReady(job.key, job.id, std::move(prepared), personal_.get());
    return;
  }
  // An ordinary Chromium profile, created the standard way with the Blanc
  // profile's name and Chromium's default avatar.
  std::u16string name;
  base::TrimWhitespace(base::UTF8ToUTF16(job.name), base::TRIM_ALL, &name);
  if (name.empty()) name = u"Profile";
  ProfileManager::CreateMultiProfileAsync(name.substr(0, 64), profiles::GetPlaceholderAvatarIndex(), /*is_hidden=*/false,
      base::BindOnce(&ProfileImport::ProfileReady, weak_.GetWeakPtr(), job.key, job.id, std::move(prepared)));
}
void ProfileImport::ProfileReady(std::string key, std::string id, PreparedImport prepared, Profile* profile) {
  if (!profile) { Fail(key, "profile", "profile-not-created"); return; }
  ApplyImport(profile, std::move(prepared),
      base::BindOnce(&ProfileImport::Applied, weak_.GetWeakPtr(), key, id, profile->GetWeakPtr()), 0);
}
void ProfileImport::Fail(const std::string& key, const std::string& store, const std::string& reason) {
  result_.FindList("errors")->Append(base::DictValue().Set("profile", key).Set("store", store).Set("reason", reason));
  NextProfile();
}
void ProfileImport::Applied(std::string key, std::string id, base::WeakPtr<Profile> profile, base::Value applied) {
  if (applied.is_string() || !profile) { Fail(key, "apply", applied.is_string() ? applied.GetString() : "profile-closed"); return; }
  // Settings and the install id travel with Personal (owner, 2026-11-16);
  // a named profile keeps Chromium's per-profile defaults.
  if (key == "personal") {
    auto settings = ApplyImportedSettings(profile.get(), &settings_synced_, &settings_prefs_);
    settings.Set("skipped", std::move(settings_skipped_));
    result_.Set("settings", std::move(settings));
    result_.Set("install", ApplyImportedInstall(&install_));
    result_.Set("startPage", ApplyImportedStartPage(profile.get(), start_page_, std::move(wallpaper_)));
  }
  // The marker: the source's version, when each profile came across, and
  // which Chromium profile it became.
  auto marker = g_browser_process->local_state()->GetDict(kProfileImportPref).Clone();
  marker.Set("sourceVersion", version_);
  marker.EnsureDict("profiles")->Set(key, base::DictValue()
      .Set("importedAt", base::Time::Now().InMillisecondsFSinceUnixEpoch())
      .Set("directory", profile->GetPath().BaseName().AsUTF8Unsafe()));
  g_browser_process->local_state()->SetDict(kProfileImportPref, std::move(marker));
  g_browser_process->local_state()->CommitPendingWrite();
  result_.FindDict("profiles")->Set(key, std::move(applied));
  if (key != "personal") created_profile_ = true;
  // The profile's saved windows.
  const auto opened = OpenImportedSession(profile.get(), session_, id);
  windows_ += opened.FindInt("windows").value_or(0);
  tabs_ += opened.FindInt("tabs").value_or(0);
  // Sync belongs to Personal: staged once its own data is in.
  if (key == "personal") {
    StageImportedSync(profile.get(), std::move(sync_stores_), std::move(sync_key_),
        base::BindOnce(&ProfileImport::SyncStaged, weak_.GetWeakPtr()));
    sync_stores_ = base::DictValue();
    sync_key_.reset();
    return;
  }
  NextProfile();
}
void ProfileImport::SyncStaged(base::DictValue staged) {
  // Personal's marker says whether Sync came across: staged, none, or failed
  // (the next import stages it again).
  const auto* state = staged.FindString("state");
  auto marker = g_browser_process->local_state()->GetDict(kProfileImportPref).Clone();
  if (auto* personal = marker.EnsureDict("profiles")->FindDict("personal"); personal && state) {
    personal->Set("sync", *state);
    g_browser_process->local_state()->SetDict(kProfileImportPref, std::move(marker));
    g_browser_process->local_state()->CommitPendingWrite();
  }
  result_.Set("sync", std::move(staged));
  NextProfile();
}
void ProfileImport::Finish(base::Value result) {
  runner_.reset();
  result_ = base::DictValue();
  jobs_.clear();
  version_.clear();
  windows_ = tabs_ = 0;
  created_profile_ = false;
  retry_sync_ = false;
  settings_synced_ = base::DictValue(); settings_prefs_ = base::DictValue(); install_ = base::DictValue();
  session_ = base::DictValue(); settings_skipped_ = base::ListValue();
  sync_stores_ = base::DictValue(); sync_key_.reset();
  personal_.reset();
  if (done_) std::move(done_).Run(std::move(result));
}

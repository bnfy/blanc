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
// Built so far (tasks 2 and 3): the Personal profile's Favorites, history,
// site icons, Start Page pins, Tab Archive and Spaces; settings and the
// install id. The session, named profiles, permissions, downloads and Sync
// follow in later tasks.
//
// Included by blanc_prototype_ui.cc inside its unnamed namespace.

constexpr char kProfileImportPref[] = "blanc.profile_import";
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
  service_->Start(script, {}, R"({"platform":"darwin","version":"profile-import","env":{}})", host_.BindNewPipeAndPassRemote(),
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

// Shipping's saved window columns (workspaces-model.js) as the fork's Space
// record. Tabs the fork cannot hold are left out, with groups and the active
// tab following; a Space left with no tab is not imported.
std::optional<base::DictValue> ImportSpaceRecord(const base::DictValue& space, int sequence) {
  const auto* name = space.FindString("name");
  const auto* urls = space.FindList("urls");
  if (!name || name->empty() || name->size() > 512 || !urls || urls->size() > 500) return std::nullopt;
  const auto* group_ids = space.FindList("groupIds");
  const auto* pinned = space.FindList("pinned");
  const auto* meta = space.FindList("meta");
  const auto* groups = space.FindList("groups");
  std::map<std::string, int> group_index;
  base::ListValue out_groups, tabs;
  int active = 0;
  const int wanted_active = space.FindInt("activeIndex").value_or(0);
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
    if (meta && i < meta->size() && (*meta)[i].is_dict()) {
      const auto* home = (*meta)[i].GetDict().FindString("pinnedHomeUrl");
      if (home && ValidPinnedHome(GURL(*home))) tab.Set("pinnedHomeUrl", *home);
    }
    tabs.Append(std::move(tab));
  }
  if (tabs.empty()) return std::nullopt;
  auto record = base::DictValue().Set("tabs", std::move(tabs)).Set("groups", std::move(out_groups))
      .Set("active", active).Set("importName", *name).Set("importSequence", sequence);
  if (!ValidSpace(record)) return std::nullopt;
  return record;
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
    const auto* icons = store->FindList("siteIcons");
    if (!entries || !icons || entries->size() > 5000) return fail("history.json");
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
    for (const auto& value : *icons) {
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
void ApplyImport(Profile* profile, PreparedImport prepared, base::OnceCallback<void(base::Value)> done) {
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
        prefs->CommitPendingWrite();
        std::move(done).Run(base::Value(base::DictValue()
            .Set("favorites", favorites.FindInt("added").value_or(0))
            .Set("history", static_cast<int>(prepared.visits.size()))
            .Set("siteIcons", static_cast<int>(prepared.icons.size()))
            .Set("pins", static_cast<int>(prepared.pins.size()))
            .Set("archive", static_cast<int>(prepared.archive.size()))
            .Set("spaces", static_cast<int>(prepared.spaces.size()))));
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

// The install id travels with the person (spec section 7), so a count of
// installs does not see a new one.
bool ApplyImportedInstall(const base::DictValue* install) {
  const auto* id = install ? install->FindString("id") : nullptr;
  const auto created = install ? install->FindDouble("createdAt") : std::nullopt;
  if (!id || !base::Uuid::ParseCaseInsensitive(*id).is_valid() || !created || !std::isfinite(*created) || *created <= 0) return false;
  g_browser_process->local_state()->SetDict("blanc.telemetry.install", base::DictValue()
      .Set("id", base::ToLowerASCII(*id)).Set("createdAt", *created)
      .Set("day1Default", install->FindBool("day1Default").value_or(false))
      .Set("day1Browsed", install->FindBool("day1Browsed").value_or(false)));
  g_browser_process->local_state()->CommitPendingWrite();
  return true;
}

// One import at a time. The result names what came across, what failed and
// what was imported before.
class ProfileImport final {
 public:
  using Done = base::OnceCallback<void(base::Value)>;
  static ProfileImport* Get();
  ProfileImport();
  ~ProfileImport();
  void Start(base::FilePath source, Profile* personal, Done done);

 private:
  void SourceRead(std::optional<base::DictValue> files);
  void Planned(bool ok, const std::string& value);
  void Applied(std::string version, base::Value applied);
  void Finish(base::Value result);
  std::unique_ptr<ProfileImportRunner> runner_;
  base::WeakPtr<Profile> personal_;
  base::DictValue settings_synced_, settings_prefs_, install_;
  base::ListValue settings_skipped_;
  base::DictValue result_;
  Done done_;
  base::WeakPtrFactory<ProfileImport> weak_{this};
};
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
  result_ = base::DictValue().Set("ok", true).Set("sourceVersion", *version).Set("profiles", base::DictValue())
      .Set("errors", parsed->FindList("errors") ? parsed->FindList("errors")->Clone() : base::ListValue())
      .Set("notImported", parsed->FindList("notImported") ? parsed->FindList("notImported")->Clone() : base::ListValue())
      .Set("alreadyImported", base::ListValue());
  const auto* done = g_browser_process->local_state()->GetDict(kProfileImportPref).FindDict("profiles");
  const auto* personal = profiles->FindDict("personal");
  const auto* stores = personal ? personal->FindDict("stores") : nullptr;
  if (done && done->contains("personal")) {
    result_.FindList("alreadyImported")->Append("personal");
    Finish(base::Value(std::move(result_)));
    return;
  }
  if (!stores) { Finish(base::Value(std::move(result_))); return; }
  // Kept for after the profile's own data lands (Applied).
  if (const auto* synced = stores->FindDict("settings.json")) settings_synced_ = synced->Clone();
  if (const auto* rules = parsed->FindDict("settingsPrefs")) {
    if (const auto* prefs = rules->FindDict("prefs")) settings_prefs_ = prefs->Clone();
    if (const auto* skipped = rules->FindList("skipped")) settings_skipped_ = skipped->Clone();
  }
  if (const auto* device = parsed->FindDict("device")) {
    if (const auto* install = device->FindDict("install.json")) install_ = install->Clone();
  }
  auto prepared = PrepareImport(*stores);
  if (!prepared.error.empty()) {
    result_.FindList("errors")->Append(base::DictValue().Set("profile", "personal").Set("store", prepared.error).Set("reason", "invalid-shape"));
    Finish(base::Value(std::move(result_)));
    return;
  }
  ApplyImport(personal_.get(), std::move(prepared), base::BindOnce(&ProfileImport::Applied, weak_.GetWeakPtr(), *version));
}
void ProfileImport::Applied(std::string version, base::Value applied) {
  if (applied.is_string()) {
    result_.FindList("errors")->Append(base::DictValue().Set("profile", "personal").Set("store", "apply").Set("reason", applied.GetString()));
    Finish(base::Value(std::move(result_)));
    return;
  }
  if (personal_) {
    auto settings = ApplyImportedSettings(personal_.get(), &settings_synced_, &settings_prefs_);
    settings.Set("skipped", std::move(settings_skipped_));
    result_.Set("settings", std::move(settings));
  }
  result_.Set("install", ApplyImportedInstall(&install_));
  // The marker: the source's version and when each profile came across.
  auto marker = g_browser_process->local_state()->GetDict(kProfileImportPref).Clone();
  marker.Set("sourceVersion", version);
  marker.EnsureDict("profiles")->Set("personal",
      base::DictValue().Set("importedAt", base::Time::Now().InMillisecondsFSinceUnixEpoch()));
  g_browser_process->local_state()->SetDict(kProfileImportPref, std::move(marker));
  g_browser_process->local_state()->CommitPendingWrite();
  result_.FindDict("profiles")->Set("personal", std::move(applied));
  Finish(base::Value(std::move(result_)));
}
void ProfileImport::Finish(base::Value result) {
  runner_.reset();
  result_ = base::DictValue();
  settings_synced_ = base::DictValue(); settings_prefs_ = base::DictValue(); install_ = base::DictValue();
  settings_skipped_ = base::ListValue();
  personal_.reset();
  if (done_) std::move(done_).Run(std::move(result));
}

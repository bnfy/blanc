// First run (F36) and Favorites import from other browsers (F30). Included
// inside blanc_prototype_ui.cc's anonymous namespace, before the Start Page
// handler. The walkthrough itself is shipping's onboarding.js; this is what its
// main process does: settings.js's first-run state, pages.js's narrow
// onboarding setters and browser-data-import.js's profile reader.

// Device-wide, as shipping's are: a new Chromium profile is not asked again.
constexpr char kFirstRunCompletedPref[] = "blanc.first_run.completed_at";
constexpr char kUsagePingPref[] = "blanc.telemetry.usage_ping";
// Saved only while first run is pending (F52 spec D5); F52 reads it in S3.
constexpr char kTabArchivePref[] = "blanc.tabs.archive";

// Shipping's acceptance profile completes first run at launch and a test
// asks for the walkthrough; the fork's test profiles do the same, unless a
// test asks for the real saved state (--blanc-test-first-run).
bool g_first_run_pending_for_test = false;
bool FirstRunPending() {
  const auto* command_line = base::CommandLine::ForCurrentProcess();
  if (command_line->HasSwitch("blanc-test") && !command_line->HasSwitch("blanc-test-first-run"))
    return g_first_run_pending_for_test;
  return g_browser_process->local_state()->GetDouble(kFirstRunCompletedPref) <= 0;
}

// What the walkthrough shows: real saved values, never invented defaults.
base::DictValue FirstRunPrivacy(Profile* profile) {
  return base::DictValue()
      .Set("required", FirstRunPending())
      .Set("searchSuggestions",
           profile->GetOriginalProfile()->GetPrefs()->GetBoolean(prefs::kSearchSuggestEnabled))
      .Set("usagePing", g_browser_process->local_state()->GetBoolean(kUsagePingPref));
}
base::DictValue OnboardingState(Profile* profile) {
  const auto scheme = ThemeServiceFactory::GetForProfile(profile)->GetBrowserColorScheme();
  return base::DictValue()
      .Set("adblockEnabled", blanc::BlockingEnabled(profile))
      .Set("theme", scheme == ThemeService::BrowserColorScheme::kLight ? "light"
                    : scheme == ThemeService::BrowserColorScheme::kDark ? "dark" : "system");
}
// pages.js's pages:start:onboarding-set: exactly these settings, no others.
void ApplyOnboardingSet(Profile* profile, const base::DictValue& partial) {
  if (const auto enabled = partial.FindBool("adblockEnabled"))
    blanc::SetBlockingEnabled(profile, *enabled);
  if (const auto* theme = partial.FindString("theme")) {
    if (*theme == "light" || *theme == "dark" || *theme == "system") {
      ThemeServiceFactory::GetForProfile(profile)->SetBrowserColorScheme(
          *theme == "light" ? ThemeService::BrowserColorScheme::kLight
          : *theme == "dark" ? ThemeService::BrowserColorScheme::kDark
                             : ThemeService::BrowserColorScheme::kSystem);
    }
  }
  if (const auto* archive = partial.FindString("tabArchive")) {
    if ((*archive == "7d" || *archive == "off") && FirstRunPending())
      profile->GetOriginalProfile()->GetPrefs()->SetString(kTabArchivePref, *archive);
  }
}
// settings.js's completeFirstRunPrivacyChoices: both choices or nothing, and
// the walkthrough closes only once they are saved.
bool CompleteFirstRunPrivacy(Profile* profile, const base::DictValue& choices) {
  const auto suggestions = choices.FindBool("searchSuggestions");
  const auto ping = choices.FindBool("usagePing");
  if (!suggestions || !ping) return false;
  profile->GetOriginalProfile()->GetPrefs()->SetBoolean(prefs::kSearchSuggestEnabled, *suggestions);
  PrefService* local = g_browser_process->local_state();
  local->SetBoolean(kUsagePingPref, *ping);
  if (local->GetDouble(kFirstRunCompletedPref) <= 0)
    local->SetDouble(kFirstRunCompletedPref, base::Time::Now().InMillisecondsFSinceUnixEpoch());
  local->CommitPendingWrite();
  g_first_run_pending_for_test = false;
  return true;
}

// Shipping's default-browser status for the walkthrough's first step (V20:
// Chromium's own check and registration).
base::Value DefaultBrowserStatus(shell_integration::DefaultWebClientState state) {
  return base::Value(base::DictValue()
      .Set("isDefault", state == shell_integration::IS_DEFAULT)
      .Set("canSet", shell_integration::CanSetAsDefaultBrowser()));
}

// Shipping's durable moving-in checklist; only the default regular profile.
constexpr char kChecklistDismissedPref[] = "blanc.checklist.dismissed";
constexpr char kChecklistDefaultPref[] = "blanc.checklist.default_done";
constexpr char kChecklistProgressPref[] = "blanc.checklist.progress";
void NoteChecklistTask(Profile* profile, std::string_view task) {
  if (!profile || profile->IsOffTheRecord() ||
      profile->GetPath() != g_browser_process->profile_manager()->user_data_dir().Append(ProfileManager::GetInitialProfileDir())) return;
  auto* local = g_browser_process->local_state();
  auto progress = local->GetDict(kChecklistProgressPref).Clone();
  if (progress.FindBool(task).value_or(false)) return;
  progress.Set(task, true);
  local->SetDict(kChecklistProgressPref, std::move(progress));
}
base::Value MigrationChecklist(Profile* profile) {
  if (profile->IsOffTheRecord() || profile->GetBaseName().value() != FILE_PATH_LITERAL("Default"))
    return base::Value();
  PrefService* local = g_browser_process->local_state();
  // Like shipping's unpackaged development build, preview doesn't offer
  // changing the system default from this checklist.
#if defined(OFFICIAL_BUILD)
  const bool default_shown = shell_integration::CanSetAsDefaultBrowser();
#else
  const bool default_shown = false;
#endif
  const bool default_done = default_shown && local->GetBoolean(kChecklistDefaultPref);
  const auto& progress = local->GetDict(kChecklistProgressPref);
  const bool sync = progress.FindBool("sync").value_or(false);
  const bool tabs = progress.FindBool("tabs").value_or(false);
  const bool space = progress.FindBool("space").value_or(false);
  const bool iphone = progress.FindBool("iphone").value_or(false);
  const int tasks = 4 + int(default_shown);
  const int completed = int(default_done) + int(sync) + int(tabs) + int(space) + int(iphone);
  return base::Value(base::DictValue()
      .Set("visible", !FirstRunPending() && !local->GetBoolean(kChecklistDismissedPref) && completed < tasks)
      .Set("dismissed", local->GetBoolean(kChecklistDismissedPref))
      .Set("completedCount", completed).Set("taskCount", tasks)
      .Set("defaultAvailable", default_shown).Set("defaultComplete", default_done)
      .Set("syncAvailable", true).Set("syncComplete", sync)
      .Set("tabsAvailable", true).Set("tabsComplete", tabs)
      .Set("spaceAvailable", true).Set("spaceComplete", space)
      .Set("iphoneAvailable", true).Set("iphoneComplete", iphone));
}
// Noted whenever the OS is asked, as shipping notes it on launch and focus.
void NoteDefaultBrowser(shell_integration::DefaultWebClientState state) {
  if (state == shell_integration::IS_DEFAULT)
    g_browser_process->local_state()->SetBoolean(kChecklistDefaultPref, true);
}

// What's New (F51). The rules are shipping's whats-new.js, run by the host and
// the Start Page; this holds their state and the one request they make. They
// key off the Blanc release version, and the preview has none and no updates,
// so nothing runs until a release channel supplies one here.
constexpr char kWhatsNewPref[] = "blanc.whats_new";
std::string BlancReleaseVersion() {
  const auto* command_line = base::CommandLine::ForCurrentProcess();
  if (command_line->HasSwitch("blanc-test")) return command_line->GetSwitchValueASCII("blanc-test-version");
  return std::string();
}
base::Value WhatsNewState() {
  const std::string version = BlancReleaseVersion();
  if (version.empty()) return base::Value();
  return base::Value(base::DictValue().Set("version", version)
      .Set("state", g_browser_process->local_state()->GetDict(kWhatsNewPref).Clone()));
}
// Shipping's five settings and no others.
void SaveWhatsNew(const base::DictValue& patch) {
  PrefService* local = g_browser_process->local_state();
  base::DictValue state = local->GetDict(kWhatsNewPref).Clone();
  for (const char* key : {"lastRunVersion", "whatsNewVersion", "whatsNewPageVersion", "whatsNewTabRelease"}) {
    if (const auto* value = patch.FindString(key)) state.Set(key, *value);
  }
  if (const auto since = patch.FindDouble("whatsNewSince")) state.Set("whatsNewSince", *since);
  local->SetDict(kWhatsNewPref, std::move(state));
}
// whats-new-check.js may ask only about a feature release's page.
bool IsWhatsNewPage(const GURL& url) {
  const std::string path(url.path());
  return url.is_valid() && url.SchemeIs("https") && url.host() == "blanc.day" && !url.has_port() &&
      !url.has_query() && !url.has_ref() && !url.has_username() && !url.has_password() &&
      base::StartsWith(path, "/whats-new/") &&
      path.find_first_not_of("0123456789.", std::string_view("/whats-new/").size()) == std::string::npos;
}

namespace browser_import {

constexpr int64_t kMaxBookmarkBytes = 20 * 1024 * 1024;
constexpr int64_t kMaxLocalStateBytes = 2 * 1024 * 1024;
constexpr int kMaxNodes = 100000;
constexpr int kMaxDepth = 64;
constexpr int64_t kChromiumEpochOffsetMs = 11644473600000;

struct BrowserInfo {
  const char* id;
  const char* name;
  const char* root;  // Under the platform's application data folder.
};
#if BUILDFLAG(IS_MAC)
constexpr BrowserInfo kBrowsers[] = {
    {"chrome", "Google Chrome", "Library/Application Support/Google/Chrome"},
    {"edge", "Microsoft Edge", "Library/Application Support/Microsoft Edge"},
    {"brave", "Brave", "Library/Application Support/BraveSoftware/Brave-Browser"},
    {"chromium", "Chromium", "Library/Application Support/Chromium"},
    {"vivaldi", "Vivaldi", "Library/Application Support/Vivaldi"},
};
#elif BUILDFLAG(IS_WIN)
constexpr BrowserInfo kBrowsers[] = {
    {"chrome", "Google Chrome", "Google/Chrome/User Data"},
    {"edge", "Microsoft Edge", "Microsoft/Edge/User Data"},
    {"brave", "Brave", "BraveSoftware/Brave-Browser/User Data"},
    {"chromium", "Chromium", "Chromium/User Data"},
    {"vivaldi", "Vivaldi", "Vivaldi/User Data"},
};
#else
constexpr BrowserInfo kBrowsers[] = {
    {"chrome", "Google Chrome", ".config/google-chrome"},
    {"edge", "Microsoft Edge", ".config/microsoft-edge"},
    {"brave", "Brave", ".config/BraveSoftware/Brave-Browser"},
    {"chromium", "Chromium", ".config/chromium"},
    {"vivaldi", "Vivaldi", ".config/vivaldi"},
};
#endif

base::FilePath DataHome() {
  const auto* command_line = base::CommandLine::ForCurrentProcess();
  if (command_line->HasSwitch("blanc-test") && command_line->HasSwitch("blanc-test-browser-home"))
    return command_line->GetSwitchValuePath("blanc-test-browser-home");
#if BUILDFLAG(IS_WIN)
  base::FilePath local;
  base::PathService::Get(base::DIR_LOCAL_APP_DATA, &local);
  return local;
#else
  return base::GetHomeDir();
#endif
}

struct Source {
  std::string id, browser, profile;
  base::FilePath bookmarks, account;
};
struct Discovery {
  std::vector<Source> sources;
  std::vector<std::string> blocked;  // Browser names Blanc may not read.
};
struct Entry {
  std::string url, title;
  double added_at = 0;
  std::optional<std::string> folder;
};
// Imported root folders that have no name of their own, in the interface
// language; and the permission advice for a blocked browser.
struct Strings {
  std::string bar, other, mobile, guidance;
};
struct Read {
  std::string error;  // Empty on success.
  std::vector<Entry> entries;
  std::string label;
};

std::string SourceId(const std::string& browser, const std::string& directory) {
  const auto digest = crypto::hash::Sha256(browser + std::string(1, '\0') + directory);
  std::string encoded;
  base::Base64UrlEncode(digest, base::Base64UrlEncodePolicy::OMIT_PADDING, &encoded);
  return encoded.substr(0, 24);
}
std::string Label(const Source& source) {
  return source.profile == "Default" ? source.browser : source.browser + " — " + source.profile;
}

enum class FileState { kFile, kBlocked, kAbsent };
FileState Check(const base::FilePath& path) {
  base::File file(path, base::File::FLAG_OPEN | base::File::FLAG_READ);
  if (!file.IsValid())
    return file.error_details() == base::File::FILE_ERROR_ACCESS_DENIED ? FileState::kBlocked
                                                                        : FileState::kAbsent;
  base::File::Info info;
  return file.GetInfo(&info) && !info.is_directory ? FileState::kFile : FileState::kAbsent;
}

// One opened descriptor for the size check and the read, so a file replaced
// in between can't get past the limit.
std::optional<std::string> ReadSmall(const base::FilePath& path, int64_t limit, bool* too_large) {
  base::File file(path, base::File::FLAG_OPEN | base::File::FLAG_READ);
  base::File::Info info;
  if (!file.IsValid() || !file.GetInfo(&info) || info.is_directory) return std::nullopt;
  if (info.size > limit) {
    if (too_large) *too_large = true;
    return std::nullopt;
  }
  std::string data(static_cast<size_t>(info.size), '\0');
  const auto read = file.ReadAndCheck(0, base::as_writable_byte_span(data));
  return read ? std::optional<std::string>(std::move(data)) : std::nullopt;
}

std::string ProfileName(const std::optional<base::Value>& local_state, const std::string& directory) {
  const base::DictValue* cache = nullptr;
  if (local_state && local_state->is_dict()) {
    if (const auto* profile = local_state->GetDict().FindDict("profile"))
      cache = profile->FindDict("info_cache");
  }
  if (cache) {
    if (const auto* entry = cache->FindDict(directory)) {
      if (const auto* name = entry->FindString("name")) {
        const std::string trimmed(base::TrimWhitespaceASCII(*name, base::TRIM_ALL));
        if (!trimmed.empty()) return trimmed.substr(0, 120);
      }
    }
  }
  return directory.substr(0, 120);
}

Discovery Discover() {
  Discovery result;
  const base::FilePath home = DataHome();
  for (const auto& browser : kBrowsers) {
    const base::FilePath root = home.AppendASCII(browser.root);
    if (!base::DirectoryExists(root)) continue;
    bool blocked = false;
    const auto local_text = ReadSmall(root.AppendASCII("Local State"), kMaxLocalStateBytes, nullptr);
    const auto local_state = local_text ? base::JSONReader::Read(*local_text, base::JSON_PARSE_RFC)
                                        : std::nullopt;
    base::FileEnumerator directories(root, false, base::FileEnumerator::DIRECTORIES);
    for (auto path = directories.Next(); !path.empty(); path = directories.Next()) {
      const std::string name = path.BaseName().AsUTF8Unsafe();
      if (name != "Default" && !base::StartsWith(name, "Profile ")) continue;
      const base::FilePath local_path = path.AppendASCII("Bookmarks");
      const base::FilePath account_path = path.AppendASCII("AccountBookmarks");
      const FileState local = Check(local_path);
      const FileState account = Check(account_path);
      // A blocked account file matters only when it would be the profile's
      // sole bookmarks; beside a local file it is left out.
      if (local == FileState::kBlocked ||
          (local == FileState::kAbsent && account == FileState::kBlocked)) {
        blocked = true;
        continue;
      }
      if (local != FileState::kFile && account != FileState::kFile) continue;
      result.sources.push_back({SourceId(browser.id, name), browser.name,
                                ProfileName(local_state, name),
                                local == FileState::kFile ? local_path : base::FilePath(),
                                account == FileState::kFile ? account_path : base::FilePath()});
    }
    if (directories.GetError() == base::File::FILE_ERROR_ACCESS_DENIED) blocked = true;
    if (blocked) result.blocked.push_back(browser.name);
  }
  std::sort(result.sources.begin(), result.sources.end(), [](const Source& a, const Source& b) {
    return std::tie(a.browser, a.profile) < std::tie(b.browser, b.profile);
  });
  return result;
}

double ChromiumTimeMs(const std::string* value, double now) {
  int64_t micros = 0;
  if (!value || !base::StringToInt64(*value, &micros) || micros <= 0) return now;
  const double ms = static_cast<double>(micros / 1000 - kChromiumEpochOffsetMs);
  return ms > 0 && ms <= now ? ms : now;
}

// parseChromiumBookmarks: a Favorite keeps the nearest named folder above it.
bool Visit(const base::DictValue& node, const std::optional<std::string>& folder, int depth,
           double now, int& visited, std::vector<Entry>& out) {
  if (++visited > kMaxNodes || depth > kMaxDepth) return false;
  const auto* type = node.FindString("type");
  if (type && *type == "url") {
    const auto* url = node.FindString("url");
    if (!url) return true;
    const GURL parsed(*url);
    if (!parsed.is_valid() || !parsed.SchemeIsHTTPOrHTTPS()) return true;
    const auto* name = node.FindString("name");
    const std::string title(name ? base::TrimWhitespaceASCII(*name, base::TRIM_ALL) : std::string_view());
    out.push_back({*url, title.empty() ? *url : title, ChromiumTimeMs(node.FindString("date_added"), now),
                   folder});
    return true;
  }
  const auto* children = node.FindList("children");
  if (!children) return true;
  std::optional<std::string> child_folder = folder;
  if (const auto* name = node.FindString("name")) {
    if (ValidFolderName(*name)) child_folder = *name;
  }
  for (const auto& child : *children) {
    if (child.is_dict() && !Visit(child.GetDict(), child_folder, depth + 1, now, visited, out))
      return false;
  }
  return true;
}

// Empty on success.
std::string ReadFile(const base::FilePath& path, const Strings& strings, std::vector<Entry>& out) {
  bool too_large = false;
  const auto text = ReadSmall(path, kMaxBookmarkBytes, &too_large);
  if (too_large) return "too-large";
  if (!text) return "unreadable";
  const auto data = base::JSONReader::Read(*text, base::JSON_PARSE_RFC);
  const base::DictValue* roots = data && data->is_dict() ? data->GetDict().FindDict("roots") : nullptr;
  if (!roots) return "unreadable";
  const double now = base::Time::Now().InMillisecondsFSinceUnixEpoch();
  int visited = 0;
  const std::pair<const char*, const std::string*> keys[] = {
      {"bookmark_bar", &strings.bar}, {"other", &strings.other}, {"synced", &strings.mobile}};
  for (const auto& [key, fallback] : keys) {
    const auto* root = roots->FindDict(key);
    const auto* children = root ? root->FindList("children") : nullptr;
    if (!children) continue;
    const auto* name = root->FindString("name");
    const std::string root_name = name && ValidFolderName(*name) ? *name : *fallback;
    for (const auto& child : *children) {
      if (child.is_dict() && !Visit(child.GetDict(), root_name, 1, now, visited, out))
        return "unreadable";
    }
  }
  return std::string();
}

// The local file reads as it always has and its failures are the profile's;
// the account file joins it only when it reads cleanly, without repeating a
// URL the local file already has.
Read ReadSource(const std::string& id, const Strings& strings) {
  Read result;
  const auto discovery = Discover();
  const auto source = std::ranges::find(discovery.sources, id, &Source::id);
  if (source == discovery.sources.end()) {
    result.error = "source-unavailable";
    return result;
  }
  result.label = Label(*source);
  std::vector<Entry> local, account;
  std::string local_error, account_error;
  if (!source->bookmarks.empty()) local_error = ReadFile(source->bookmarks, strings, local);
  if (!local_error.empty()) {
    result.error = local_error;
    return result;
  }
  if (!source->account.empty()) account_error = ReadFile(source->account, strings, account);
  if (source->bookmarks.empty() && !account_error.empty()) {
    result.error = account_error;
    return result;
  }
  result.entries = std::move(local);
  if (account_error.empty()) {
    std::set<std::string> urls;
    for (const auto& entry : result.entries) urls.insert(entry.url);
    for (auto& entry : account)
      if (!urls.contains(entry.url)) result.entries.push_back(std::move(entry));
  }
  if (result.entries.empty()) result.error = "empty";
  return result;
}

// bookmark-data.js's addImported: a URL already saved is skipped, and a
// folder keeps the spelling it already has.
base::DictValue Import(bookmarks::BookmarkModel* model, const std::vector<Entry>& entries) {
  int added = 0, skipped = 0;
  std::set<GURL> seen;
  const auto* root = FavoriteStorageOtherRoot(model, nullptr);
  for (const auto& entry : entries) {
    const GURL url(entry.url);
    if (!root || !IsFavoritable(url) || model->IsBookmarked(url) || !seen.insert(url).second) {
      ++skipped;
      continue;
    }
    const bookmarks::BookmarkNode* parent = root;
    if (entry.folder) {
      if (const auto name = ValidFolderName(*entry.folder)) {
        if (const auto* folder = FindOrCreateFolder(model, *name, root)) parent = folder;
      }
    }
    model->AddURL(parent, parent->children().size(), base::UTF8ToUTF16(entry.title), url, nullptr,
                  base::Time::FromMillisecondsSinceUnixEpoch(entry.added_at));
    ++added;
  }
  return base::DictValue().Set("added", added).Set("skipped", skipped);
}

Strings CurrentStrings() {
  Strings strings;
  for (const auto& string : blanc::settings::ForLocale(g_browser_process->GetApplicationLocale())) {
    if (string.name == "blancImportBar") strings.bar = base::UTF16ToUTF8(string.value);
    if (string.name == "blancImportOther") strings.other = base::UTF16ToUTF8(string.value);
    if (string.name == "blancImportMobile") strings.mobile = base::UTF16ToUTF8(string.value);
    if (string.name == "blancImportPermission") strings.guidance = base::UTF16ToUTF8(string.value);
  }
  return strings;
}

// The page's list: labels only, never a path.
void ListSources(base::OnceCallback<void(base::Value)> reply) {
  base::ThreadPool::PostTaskAndReplyWithResult(
      FROM_HERE, {base::MayBlock(), base::TaskPriority::USER_VISIBLE}, base::BindOnce(&Discover),
      base::BindOnce([](base::OnceCallback<void(base::Value)> reply, Discovery discovery) {
        const Strings strings = CurrentStrings();
        base::ListValue sources, unavailable;
        for (const auto& source : discovery.sources) {
          sources.Append(base::DictValue().Set("id", source.id).Set("browser", source.browser)
              .Set("profile", source.profile).Set("label", Label(source)));
        }
        for (const auto& browser : discovery.blocked) {
          unavailable.Append(base::DictValue().Set("browser", browser).Set("label", browser)
              .Set("reason", "permission").Set("guidance", strings.guidance));
        }
        std::move(reply).Run(base::Value(base::DictValue().Set("sources", std::move(sources))
            .Set("unavailable", std::move(unavailable))));
      }, std::move(reply)));
}

// pages:bookmarks:import-browser. The reply carries the source's label only.
void ImportSource(base::WeakPtr<Profile> profile, const std::string& id,
                  base::OnceCallback<void(base::Value)> reply) {
  base::ThreadPool::PostTaskAndReplyWithResult(
      FROM_HERE, {base::MayBlock(), base::TaskPriority::USER_VISIBLE},
      base::BindOnce(&ReadSource, id, CurrentStrings()),
      base::BindOnce([](base::WeakPtr<Profile> profile, base::OnceCallback<void(base::Value)> reply,
                        Read read) {
        if (!read.error.empty()) {
          std::move(reply).Run(base::Value(base::DictValue().Set("error", read.error)));
          return;
        }
        auto* model = profile ? LoadedBookmarkModel(profile.get()) : nullptr;
        if (!model) {
          std::move(reply).Run(base::Value(base::DictValue().Set("error", "source-unavailable")));
          return;
        }
        base::DictValue result = Import(model, read.entries);
        result.Set("source", base::DictValue().Set("label", read.label));
        std::move(reply).Run(base::Value(std::move(result)));
      }, profile, std::move(reply)));
}

// Entries the page parsed from a bookmarks file the person chose.
base::Value ImportParsed(Profile* profile, const base::ListValue& list) {
  auto* model = LoadedBookmarkModel(profile);
  if (!model) return base::Value(base::DictValue().Set("error", "unreadable"));
  std::vector<Entry> entries;
  const double now = base::Time::Now().InMillisecondsFSinceUnixEpoch();
  for (const auto& value : list) {
    if (!value.is_dict() || entries.size() >= static_cast<size_t>(kMaxNodes)) continue;
    const auto& dict = value.GetDict();
    const auto* url = dict.FindString("url");
    if (!url) continue;
    const auto* title = dict.FindString("title");
    const auto* folder = dict.FindString("folder");
    const double added = dict.FindDouble("addedAt").value_or(now);
    entries.push_back({*url, title && !title->empty() ? *title : *url, added > 0 && added <= now ? added : now,
                       folder ? std::optional<std::string>(*folder) : std::nullopt});
  }
  return base::Value(Import(model, entries));
}

}  // namespace browser_import

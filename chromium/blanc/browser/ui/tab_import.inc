// Bring Your Tabs: file I/O stays native and on a worker. Discovery only reads
// browser labels; session and Arc content are opened after explicit selection.
namespace tab_import {
constexpr int64_t kSessionLimit = 64 * 1024 * 1024;
constexpr int64_t kArcLimit = 32 * 1024 * 1024;
struct Source {
  std::string id, browser_id, browser, profile;
  base::FilePath path;
};
std::vector<Source> Discover() {
  std::vector<Source> result;
  const auto home = browser_import::DataHome();
  for (const auto& browser : browser_import::kBrowsers) {
    const auto root = home.AppendASCII(browser.root);
    if (!base::DirectoryExists(root)) continue;
    const auto text = browser_import::ReadSmall(root.AppendASCII("Local State"), browser_import::kMaxLocalStateBytes, nullptr);
    const auto state = text ? base::JSONReader::Read(*text, base::JSON_PARSE_RFC) : std::nullopt;
    base::FileEnumerator dirs(root, false, base::FileEnumerator::DIRECTORIES);
    for (auto path = dirs.Next(); !path.empty() && result.size() < 100; path = dirs.Next()) {
      const auto directory = path.BaseName().AsUTF8Unsafe();
      if (directory != "Default" && !base::StartsWith(directory, "Profile ")) continue;
      if (!base::DirectoryExists(path.AppendASCII("Sessions"))) continue;
      result.push_back({base::Uuid::GenerateRandomV4().AsLowercaseString(), browser.id, browser.name,
          browser_import::ProfileName(state, directory), path});
    }
  }
  return result;
}
base::FilePath ArcPath() {
#if BUILDFLAG(IS_MAC)
  return browser_import::DataHome().AppendASCII("Library/Application Support/Arc/StorableSidebar.json");
#elif BUILDFLAG(IS_WIN)
  return browser_import::DataHome().AppendASCII("Packages/TheBrowserCompany.Arc_ttt1ap7aakyb4/LocalCache/Local/Arc/StorableSidebar.json");
#else
  return {};
#endif
}
std::vector<base::FilePath> SessionFiles(const base::FilePath& profile) {
  std::vector<base::FilePath> result;
  base::FileEnumerator files(profile.AppendASCII("Sessions"), false, base::FileEnumerator::FILES, FILE_PATH_LITERAL("Session_*"));
  for (auto path = files.Next(); !path.empty(); path = files.Next()) {
    if (result.size() >= 1000) return {};
    const std::string name = path.BaseName().AsUTF8Unsafe().substr(8);
    uint64_t timestamp;
    if (!name.empty() && std::ranges::all_of(name, [](char c) { return base::IsAsciiDigit(c); }) &&
        base::StringToUint64(name, &timestamp)) result.push_back(path);
  }
  std::ranges::sort(result, [](const auto& a, const auto& b) {
    uint64_t av = 0, bv = 0;
    base::StringToUint64(a.BaseName().AsUTF8Unsafe().substr(8), &av);
    base::StringToUint64(b.BaseName().AsUTF8Unsafe().substr(8), &bv);
    return av > bv;
  });
  return result;
}
struct ReadResult { std::string bytes, error; };
ReadResult ReadStable(const base::FilePath& path, int64_t limit) {
  base::File file(path, base::File::FLAG_OPEN | base::File::FLAG_READ);
  base::File::Info before, after, current;
  if (!file.IsValid()) return {{}, file.error_details() == base::File::FILE_ERROR_ACCESS_DENIED ? "permission" : "unreadable"};
  if (!file.GetInfo(&before) || before.is_directory || before.size < 0) return {{}, "unreadable"};
  if (before.size > limit) return {{}, "too-large"};
  std::string bytes(static_cast<size_t>(before.size), '\0'), verified(bytes.size(), '\0');
  if (!file.ReadAndCheck(0, base::as_writable_byte_span(bytes)) ||
      !file.ReadAndCheck(0, base::as_writable_byte_span(verified)) || bytes != verified ||
      !file.GetInfo(&after) || !base::GetFileInfo(path, &current) ||
      before.size != after.size || before.last_modified != after.last_modified ||
      before.size != current.size || before.last_modified != current.last_modified ||
      before.creation_time != current.creation_time) return {{}, "source-saving"};
  return {std::move(bytes), {}};
}
struct SourceRead {
  ReadResult newest, older;
  base::FilePath exact;
  bool running = false;
};
SourceRead ReadSource(const base::FilePath& profile, bool after_quit) {
  SourceRead result;
  const auto files = SessionFiles(profile);
  if (files.empty()) { result.newest.error = "empty"; return result; }
  // Select the current newest file, including a new checkpoint produced by
  // normal quit, and bind this entire read to it. Never fall back after quit.
  result.exact = files.front();
  result.newest = ReadStable(result.exact, kSessionLimit);
  const auto lock = profile.DirName().AppendASCII("SingletonLock");
  result.running = base::PathExists(lock) || base::IsLink(lock);
  if (!after_quit && result.running && files.size() > 1) result.older = ReadStable(files[1], kSessionLimit);
  const auto after = SessionFiles(profile);
  if (after.empty() || after.front() != result.exact) {result.newest.bytes.clear(); result.newest.error = "source-saving";}
  if (result.newest.error == "too-large") result.newest.error = "session-too-large";
  return result;
}
}  // namespace tab_import

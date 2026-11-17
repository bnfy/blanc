// The Start Page's half of the Electron profile importer (plan
// docs/superpowers/plans/2026-11-16-electron-profile-importer.md, task 8).
// The Start Page keeps its wallpaper choices and image in its own storage,
// which the browser cannot write. So the importer leaves them here, pending,
// and the profile's next Start Page takes them through its bridge
// (importRead), stores them itself and says so (importDone).
//
// Included by blanc_prototype_ui.cc inside its unnamed namespace, before the
// Start Page handler and profile_import.inc.

constexpr char kProfileImportPref[] = "blanc.profile_import";
constexpr char kStartPageImportFolder[] = "BlancStartPageImport";
constexpr char kStartPageImportImage[] = "wallpaper.jpg";
constexpr size_t kImportMaxWallpaperBytes = 12 * 1024 * 1024;

// The wallpaper choices waiting for |profile|'s Start Page, if any.
std::optional<base::DictValue> PendingStartPageImport(Profile* profile) {
  const auto* pending = g_browser_process->local_state()->GetDict(kProfileImportPref).FindDict("startPage");
  const auto* directory = pending ? pending->FindString("directory") : nullptr;
  if (!directory || *directory != profile->GetPath().BaseName().AsUTF8Unsafe()) return std::nullopt;
  return pending->Clone();
}

// The staged image as base64, or empty. Blocking.
std::string ReadStartPageImportImage(const base::FilePath& profile_dir) {
  if (profile_dir.empty()) return std::string();
  const base::FilePath file = profile_dir.AppendASCII(kStartPageImportFolder).AppendASCII(kStartPageImportImage);
  std::string bytes;
  if (base::IsLink(file) || !base::ReadFileToStringWithMaxSize(file, &bytes, kImportMaxWallpaperBytes) ||
      !bytes.starts_with("\xFF\xD8\xFF")) return std::string();
  return base::Base64Encode(bytes);
}

// The Start Page has stored what was pending: forget it and the staged image.
void ClearStartPageImport(Profile* profile) {
  if (!PendingStartPageImport(profile)) return;
  auto marker = g_browser_process->local_state()->GetDict(kProfileImportPref).Clone();
  marker.Remove("startPage");
  g_browser_process->local_state()->SetDict(kProfileImportPref, std::move(marker));
  g_browser_process->local_state()->CommitPendingWrite();
  base::ThreadPool::PostTask(FROM_HERE, {base::MayBlock(), base::TaskPriority::BEST_EFFORT},
      base::GetDeletePathRecursivelyCallback(profile->GetPath().AppendASCII(kStartPageImportFolder)));
}

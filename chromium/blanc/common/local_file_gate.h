// Copyright 2026 Bananify Creative. MIT; see the Blanc repository LICENSE.
#ifndef BLANC_COMMON_LOCAL_FILE_GATE_H_
#define BLANC_COMMON_LOCAL_FILE_GATE_H_

#include <map>
#include <memory>
#include <string>

#include "base/files/file_path.h"
#include "base/files/file_util.h"
#include "base/functional/callback.h"
#include "base/no_destructor.h"
#include "base/strings/string_util.h"
#include "base/supports_user_data.h"
#include "base/time/time.h"
#include "content/public/browser/web_contents.h"
#include "net/base/filename_util.h"
#include "url/gurl.h"

// Local HTML files (N15), as shipping's official builds treat them
// (src/main/local-html-files.js, top-level-url-policy.js): `file:` is refused
// at the top level, except in a tab that was granted one local HTML document
// by the operating system's open-file path or by its own saved session. The
// grant names one canonical file; every load of it is checked again on disk.
// Header-only so the navigation layer and the browser UI share one rule.
namespace blanc {

inline constexpr char kLocalFileGrantKey[] = "blanc.tab.local-file.v1";

struct LocalFileGrantData : base::SupportsUserData::Data {
  explicit LocalFileGrantData(std::string value) : url(std::move(value)) {}
  std::string url;
};

// One of shipping's local HTML document types, by address alone (no disk).
inline bool SupportedLocalHtmlUrl(const GURL& url) {
  base::FilePath path;
  if (!url.is_valid() || !url.SchemeIsFile() || !url.host().empty() || url.has_query() ||
      url.spec().size() > 8192 || !net::FileURLToFilePath(url, &path) || !path.IsAbsolute()) return false;
  const std::string extension = base::ToLowerASCII(path.Extension());
  return extension == ".htm" || extension == ".html" || extension == ".xht" ||
      extension == ".xhtm" || extension == ".xhtml";
}

inline GURL LocalFileWithoutRef(const GURL& url) {
  GURL::Replacements no_ref;
  no_ref.ClearRef();
  return url.ReplaceComponents(no_ref);
}

// Blocking. The canonical address of an existing regular local HTML file, or
// an empty GURL: a symlink resolves to the one stable address its tab keeps.
inline GURL CanonicalLocalHtmlUrl(const GURL& url) {
  base::FilePath path;
  if (!SupportedLocalHtmlUrl(url) || !net::FileURLToFilePath(url, &path)) return GURL();
  const base::FilePath real = base::MakeAbsoluteFilePath(path);
  if (real.empty() || base::DirectoryExists(real) || !base::PathExists(real)) return GURL();
  const GURL canonical = net::FilePathToFileURL(real);
  return SupportedLocalHtmlUrl(canonical) ? canonical : GURL();
}

// Blocking. A granted address is usable only while it is still that same
// canonical, existing file.
inline bool LocalHtmlFileStillValid(const GURL& url) {
  base::FilePath path;
  if (!SupportedLocalHtmlUrl(url) || !net::FileURLToFilePath(url, &path)) return false;
  const base::FilePath real = base::MakeAbsoluteFilePath(path);
  return !real.empty() && real == path && !base::DirectoryExists(real) && base::PathExists(real);
}

inline std::string LocalFileGrantOf(content::WebContents* tab) {
  auto* grant = tab ? static_cast<LocalFileGrantData*>(tab->GetUserData(kLocalFileGrantKey)) : nullptr;
  return grant ? grant->url : std::string();
}

// The browser UI records a new grant with the tab's saved session.
inline base::RepeatingCallback<void(content::WebContents*)>& LocalFileGrantSaver() {
  static base::NoDestructor<base::RepeatingCallback<void(content::WebContents*)>> saver;
  return *saver;
}

inline void SetLocalFileGrant(content::WebContents* tab, const GURL& url, bool save) {
  if (!tab || !SupportedLocalHtmlUrl(url)) return;
  tab->SetUserData(kLocalFileGrantKey, std::make_unique<LocalFileGrantData>(LocalFileWithoutRef(url).spec()));
  if (save && LocalFileGrantSaver()) LocalFileGrantSaver().Run(tab);
}

// Addresses the operating system asked Blanc to open, each good for the one
// navigation that follows and only for a short while.
inline std::map<std::string, base::TimeTicks>& PendingLocalFileGrants() {
  static base::NoDestructor<std::map<std::string, base::TimeTicks>> pending;
  return *pending;
}
inline void AddPendingLocalFileGrant(const GURL& url) {
  auto& pending = PendingLocalFileGrants();
  const auto now = base::TimeTicks::Now();
  std::erase_if(pending, [&](const auto& item) { return item.second < now; });
  if (pending.size() < 64) pending[LocalFileWithoutRef(url).spec()] = now + base::Seconds(30);
}
inline bool TakePendingLocalFileGrant(const GURL& url) {
  auto& pending = PendingLocalFileGrants();
  const auto found = pending.find(url.spec());
  if (found == pending.end()) return false;
  const bool live = found->second >= base::TimeTicks::Now();
  pending.erase(found);
  return live;
}

}  // namespace blanc

#endif  // BLANC_COMMON_LOCAL_FILE_GATE_H_

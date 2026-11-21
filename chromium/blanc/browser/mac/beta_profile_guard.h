// Copyright 2026 Bananify Creative. MIT; see LICENSE.
#ifndef BLANC_BROWSER_MAC_BETA_PROFILE_GUARD_H_
#define BLANC_BROWSER_MAC_BETA_PROFILE_GUARD_H_
#include <sys/stat.h>
#include <cerrno>
#include <cstdlib>
#include <string>
#include <vector>

namespace blanc::beta {
// Resolve existing ancestors before appending absent leaves. Never create or
// open a profile. Refuse relative/traversal paths and inaccessible ancestors.
inline std::string ResolveDirectory(std::string path) {
  if (path.empty() || path.front() != '/' || path.find('\0') != std::string::npos)
    return {};
  for (size_t start = 1; start <= path.size();) {
    size_t end = path.find('/', start);
    if (end == std::string::npos) end = path.size();
    const auto part = path.substr(start, end - start);
    if (part == "." || part == "..") return {};
    start = end + 1;
  }
  std::vector<std::string> missing;
  while (true) {
    while (path.size() > 1 && path.back() == '/') path.pop_back();
    char* resolved = realpath(path.c_str(), nullptr);
    if (resolved) {
      struct stat existing;
      if (stat(resolved, &existing) != 0 || !S_ISDIR(existing.st_mode)) {
        free(resolved); return {};
      }
      std::string result(resolved);
      free(resolved);
      for (auto it = missing.rbegin(); it != missing.rend(); ++it)
        result += (result == "/" ? "" : "/") + *it;
      return result;
    }
    // A dangling symlink, permission error or non-directory ancestor must
    // not be interpreted as an ordinary not-yet-created directory.
    if (errno != ENOENT) return {};
    struct stat info;
    if (lstat(path.c_str(), &info) == 0) return {};
    const size_t slash = path.find_last_of('/');
    if (slash == std::string::npos || path == "/") return {};
    missing.push_back(path.substr(slash + 1));
    path = slash == 0 ? "/" : path.substr(0, slash);
  }
}
inline bool Within(const std::string& path, const std::string& root) {
  return path == root || (path.size() > root.size() &&
      path.compare(0, root.size(), root) == 0 && path[root.size()] == '/');
}
inline bool SafeDirectory(const std::string& path, const std::string& home) {
  const std::string resolved = ResolveDirectory(path);
  const std::string resolved_home = ResolveDirectory(home);
  if (resolved.empty() || resolved_home.empty()) return false;
  // Electron (including its old name) and the two preserved fork identities.
  for (const char* parent : {"/Library/Application Support/", "/Library/Caches/"}) {
    for (const char* name : {"Blanc", "Bowser", "me.bnfy.bowser",
                             "Blanc Browser", "Blanc Chromium Preview"}) {
      const std::string reserved = resolved_home + parent + name;
      const std::string physical = ResolveDirectory(reserved);
      if (Within(resolved, reserved) || (!physical.empty() && Within(resolved, physical)))
        return false;
    }
  }
  return true;
}
}  // namespace blanc::beta
#endif

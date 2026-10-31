#include "context_link_policy.h"

#include <array>
#include <string>
#include <string_view>

#include "base/strings/string_util.h"
#include "url/gurl.h"

namespace blanc::glance::draft {
namespace {
template <size_t N>
bool Contains(const std::array<std::string_view, N>& values,
              std::string_view item) {
  for (auto value : values) if (value == item) return true;
  return false;
}
constexpr auto kBlocked = std::to_array<std::string_view>({
    "chrome", "chrome-extension", "devtools", "blanc-chrome", "blanc-import",
    "file", "view-source", "afp", "applescript", "disk", "disks", "hcp",
    "ie.http", "mk", "ms-help", "nntp", "res", "shell", "vnd.ms.radio",
    "cmd", "powershell", "terminal", "osascript", "ms-msdt",
    "ms-appinstaller", "ms-settings", "search-ms", "search", "smb", "ssh",
    "x-apple.systempreferences", "data", "javascript", "vbscript"});
constexpr auto kBrowser = std::to_array<std::string_view>({
    "http", "https", "about", "blob", "filesystem", "blanc"});
}  // namespace

ContextLinkPolicy ClassifyContextLink(std::string_view raw_url) {
  if (raw_url.empty()) return ContextLinkPolicy::kInvalid;
  for (unsigned char c : raw_url) {
    if (c <= 0x20 || c == 0x7f || c == '\\' || c == '"' || c == '`')
      return ContextLinkPolicy::kInvalid;
  }
  const GURL url(raw_url);
  if (!url.is_valid() || !url.has_scheme() || url.scheme().size() <= 1)
    return ContextLinkPolicy::kInvalid;
  const std::string scheme = base::ToLowerASCII(url.scheme());
  if (Contains(kBlocked, scheme)) return ContextLinkPolicy::kDenied;
  if (Contains(kBrowser, scheme)) return ContextLinkPolicy::kBrowser;
  return ContextLinkPolicy::kExternalConsent;
}
}  // namespace blanc::glance::draft

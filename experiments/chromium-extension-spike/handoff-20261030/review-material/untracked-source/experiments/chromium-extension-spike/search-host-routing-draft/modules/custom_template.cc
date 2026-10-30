#include "custom_template.h"

#include <algorithm>
#include <string_view>

#include "base/strings/string_util.h"
#include "base/strings/utf_string_conversions.h"
#include "net/base/ip_address.h"
#include "url/gurl.h"

namespace blanc::custom_search {
namespace {
bool JsSpace(char16_t c) {
  return (c >= 0x0009 && c <= 0x000d) || c == 0x20 || c == 0xa0 ||
         c == 0x1680 || (c >= 0x2000 && c <= 0x200a) || c == 0x2028 ||
         c == 0x2029 || c == 0x202f || c == 0x205f || c == 0x3000 || c == 0xfeff;
}
std::optional<std::string> Trim(const std::string& value) {
  std::u16string text;
  if (!base::UTF8ToUTF16(value.data(), value.size(), &text)) return std::nullopt;
  const auto first = std::find_if_not(text.begin(), text.end(), JsSpace);
  const auto last = std::find_if_not(text.rbegin(), text.rend(), JsSpace).base();
  if (first >= last) return std::string();
  std::string result;
  if (!base::UTF16ToUTF8(&*first, last - first, &result)) return std::nullopt;
  return result;
}
bool LocalHost(const GURL& url) {
  const std::string host = url.HostNoBrackets();
  if (host.empty()) return false;
  net::IPAddress ip;
  if (ip.AssignFromIPLiteral(host)) {
    if (ip.IsLoopback()) return true;
    const auto& b = ip.bytes();
    if (ip.IsIPv4()) return b[0] == 10 || (b[0] == 172 && b[1] >= 16 && b[1] <= 31) ||
        (b[0] == 192 && b[1] == 168) || (b[0] == 169 && b[1] == 254) ||
        (b[0] == 100 && b[1] >= 64 && b[1] <= 127);
    return ip.IsIPv6() && ((b[0] & 0xfe) == 0xfc || (b[0] == 0xfe && (b[1] & 0xc0) == 0x80));
  }
  if (host == "localhost" || host.ends_with(".localhost")) return true;
  if (host.find_first_not_of("0123456789.") == std::string::npos) return false;
  return host.find('.') == std::string::npos || host.ends_with(".local") ||
         host.ends_with(".lan") || host.ends_with(".internal") || host.ends_with(".home.arpa");
}
std::string Encode(std::string_view input) {
  constexpr char hex[] = "0123456789ABCDEF";
  std::string out;
  for (unsigned char c : input) {
    if ((c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') ||
        c == '-' || c == '_' || c == '.' || c == '!' || c == '~' || c == '*' ||
        c == '\'' || c == '(' || c == ')') out.push_back(static_cast<char>(c));
    else { out.push_back('%'); out.push_back(hex[c >> 4]); out.push_back(hex[c & 15]); }
  }
  return out;
}
bool ValidEngine(const std::string& name) {
  return name == "duckduckgo" || name == "google" || name == "bing" ||
         name == "brave" || name == "kagi" || name == "custom";
}
}  // namespace

std::optional<Template> Validate(const std::string& candidate) {
  // Keep malformed renderer or Sync input from causing unbounded allocations;
  // the released trimmed template itself is limited to 2048 UTF-16 units.
  if (candidate.size() > 65536) return std::nullopt;
  auto trimmed = Trim(candidate);
  if (!trimmed || trimmed->empty()) return std::nullopt;
  std::u16string text;
  if (!base::UTF8ToUTF16(trimmed->data(), trimmed->size(), &text) || text.size() > 2048)
    return std::nullopt;
  std::string literal = std::move(*trimmed);
  const auto at = literal.find("%s");
  if (at == std::string::npos || literal.find("%s", at + 2) != std::string::npos) return std::nullopt;
  std::string probe = literal;
  probe.replace(at, 2, "blancsearchprobe");
  const GURL url(probe);
  if (!url.is_valid() || !url.has_host() || url.has_username() || url.has_password() ||
      url.host().find("blancsearchprobe") != std::string::npos ||
      !(url.SchemeIs("https") || (url.SchemeIs("http") && LocalHost(url)))) return std::nullopt;
  std::string label(url.host());
  if (label.starts_with("www.")) label.erase(0, 4);
  if (url.has_port()) { label.push_back(':'); label.append(url.port()); }
  return Template{std::move(literal), std::move(label)};
}

std::optional<std::string> Resolve(const Template& supplied, const std::string& query) {
  auto checked = Validate(supplied.literal);
  // Bound allocations at this untrusted-input boundary. Empty queries are
  // accepted by the shipping pure resolver; callers may separately reject.
  if (!checked || query.size() > 16384 || !base::IsStringUTF8(query)) return std::nullopt;
  std::string result = checked->literal;
  result.replace(result.find("%s"), 2, Encode(query));
  // Do not return a malformed navigable URL even if a future URL parser or
  // encoding rule changes; never reinterpret a caller-supplied host.
  const GURL url(result);
  if (!url.is_valid()) return std::nullopt;
  return result;
}

std::optional<Settings> Apply(const Settings& previous, const Patch& patch) {
  if (patch.engine && !ValidEngine(*patch.engine)) return std::nullopt;
  Settings result = previous;
  if (patch.custom_template) {
    if (patch.custom_template->size() > 65536) return std::nullopt;
    auto trimmed = Trim(*patch.custom_template);
    if (!trimmed) return std::nullopt;
    if (trimmed->empty()) result.custom_template.clear();
    else {
      auto checked = Validate(*trimmed);
      if (!checked) return std::nullopt;
      result.custom_template = std::move(checked->literal);
    }
  }
  if (patch.engine) result.engine = *patch.engine;
  if (!ValidEngine(result.engine) ||
      (result.engine == "custom" && !Validate(result.custom_template))) return std::nullopt;
  return result;
}
}  // namespace blanc::custom_search

// Copyright 2026 Bananify Creative. MIT; see the Blanc repository LICENSE.
// Standard library only: tools/external-handoff.test.mjs compiles this file.
#include "blanc/browser/ui/browser_api/external_handoff.h"

#include <algorithm>
#include <array>
#include <cctype>
#include <string>

namespace blanc::browser_api {
namespace {

// These familiar links retain the explicit typed-address shortcut.
constexpr std::array<std::string_view, 4> kDirect = {"mailto:", "tel:", "facetime:", "sms:"};
constexpr std::array<std::string_view, 9> kBrowser = {
    "http:", "https:", "about:", "blob:", "filesystem:", "blanc:", "data:", "javascript:", "vbscript:"};
constexpr std::array<std::string_view, 31> kBlockedOs = {
    "chrome:", "chrome-extension:", "devtools:", "blanc-chrome:", "blanc-import:", "file:",
    "view-source:", "afp:", "applescript:", "disk:", "disks:", "hcp:", "ie.http:", "mk:",
    "ms-help:", "nntp:", "res:", "shell:", "vnd.ms.radio:", "cmd:", "powershell:", "terminal:",
    "osascript:", "ms-msdt:", "ms-appinstaller:", "ms-settings:", "search-ms:", "search:",
    "smb:", "ssh:", "x-apple.systempreferences:"};

template <size_t N>
bool Contains(const std::array<std::string_view, N>& set, std::string_view value) {
  return std::find(set.begin(), set.end(), value) != set.end();
}
bool SchemeStart(char c) { return std::isalpha(static_cast<unsigned char>(c)); }
bool SchemeChar(char c) {
  return std::isalnum(static_cast<unsigned char>(c)) || c == '+' || c == '.' || c == '-';
}

}  // namespace

Handoff ClassifyExternalNavigation(std::string_view url, bool trusted) {
  // /^[a-z][a-z0-9+.-]*:/i, and none of U+0000–U+0020, U+007F, \ " `.
  size_t colon = 0;
  if (url.empty() || !SchemeStart(url[0])) return Handoff::kNone;
  while (colon < url.size() && SchemeChar(url[colon])) ++colon;
  if (colon >= url.size() || url[colon] != ':') return Handoff::kNone;
  for (unsigned char c : url) {
    if (c <= 0x20 || c == 0x7f || c == '\\' || c == '"' || c == '`') return Handoff::kNone;
  }
  std::string protocol(url.substr(0, colon + 1));
  std::transform(protocol.begin(), protocol.end(), protocol.begin(),
                 [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
  // A one-letter scheme is a drive letter, not a protocol.
  if (protocol.size() == 2) return Handoff::kNone;
  // Shipping parses with the WHATWG URL parser, which fails on an invalid
  // authority: special schemes (ftp:, ws:, wss:; http(s): and file: never
  // reach a hand-off) need a host, and any port must be a number up to 65535.
  const bool special = protocol == "ftp:" || protocol == "ws:" || protocol == "wss:";
  std::string_view rest = url.substr(colon + 1);
  if (special || rest.starts_with("//")) {
    if (special) rest.remove_prefix(std::min(rest.find_first_not_of('/'), rest.size()));
    else rest.remove_prefix(2);
    std::string_view authority = rest.substr(0, rest.find_first_of("/?#"));
    const size_t at = authority.rfind('@');
    if (at != std::string_view::npos) authority.remove_prefix(at + 1);
    const size_t port_at = authority.find(':');
    const std::string_view host = authority.substr(0, port_at);
    // A host is required for special schemes, and whenever credentials or a
    // port are given.
    if (host.empty() && (special || at != std::string_view::npos || port_at != std::string_view::npos)) return Handoff::kNone;
    if (host.find_first_of("<>[]^|") != std::string_view::npos) return Handoff::kNone;
    if (port_at != std::string_view::npos) {
      std::string_view port = authority.substr(port_at + 1);
      if (!std::all_of(port.begin(), port.end(), [](unsigned char c) { return std::isdigit(c); })) return Handoff::kNone;
      port.remove_prefix(std::min(port.find_first_not_of('0'), port.size()));
      if (port.size() > 5 || (!port.empty() && std::stoul(std::string(port)) > 65535)) return Handoff::kNone;
    }
  }
  if (Contains(kBlockedOs, protocol)) return Handoff::kDeny;
  if (Contains(kBrowser, protocol)) return Handoff::kNone;
  // A typed custom app URL needs a slash; page-initiated links need not.
  const bool direct = Contains(kDirect, protocol);
  if (trusted && !direct && (url.size() <= colon + 1 || url[colon + 1] != '/')) return Handoff::kNone;
  return trusted && direct ? Handoff::kOpen : Handoff::kConfirm;
}

}  // namespace blanc::browser_api

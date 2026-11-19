// Copyright 2026 Bananify Creative. MIT; see the Blanc repository LICENSE.
#ifndef BLANC_BROWSER_UI_SPACES_ACROSS_PROFILES_H_
#define BLANC_BROWSER_UI_SPACES_ACROSS_PROFILES_H_

#include <algorithm>
#include <cstddef>
#include <map>
#include <set>
#include <string>
#include <vector>

namespace blanc::spaces_across_profiles {

// The part of the Spaces payload that crosses into a window of ANOTHER
// profile (shipping's src/main/spaces-across-profiles.js, merged in #1642).
// Only a Space's id, name, color, symbol, tab count and whether a window shows
// it may cross; never URLs, titles, favicons or groups. Standard library only,
// so tools/spaces-across-profiles.test.mjs can compile it beside shipping's
// module.

inline constexpr size_t kMaxSpaces = 25;

struct Space {
  std::string id, name, color, symbol;
  int tab_count = 0;
};

struct Profile {
  std::string id, name;
  bool live = false;
};

struct Item : Space {
  bool open_elsewhere = false;
};

struct OtherProfile {
  std::string id, name, status = "saved";
  bool full = false;
  std::vector<Item> items;
};

namespace internal {

inline bool InClass(char c, bool upper, bool lower, bool digit, const char* extra) {
  return (upper && c >= 'A' && c <= 'Z') || (lower && c >= 'a' && c <= 'z') ||
         (digit && c >= '0' && c <= '9') || std::string(extra).find(c) != std::string::npos;
}

// ^[A-Za-z0-9_-]{1,120}$
inline bool ValidId(const std::string& s) {
  if (s.empty() || s.size() > 120) return false;
  return std::all_of(s.begin(), s.end(), [](char c) { return InClass(c, true, true, true, "_-"); });
}

// ^#[0-9a-fA-F]{6}$
inline bool ValidColor(const std::string& s) {
  if (s.size() != 7 || s[0] != '#') return false;
  return std::all_of(s.begin() + 1, s.end(), [](char c) {
    return (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F');
  });
}

// ^[a-z0-9-]{1,40}$
inline bool ValidSymbol(const std::string& s) {
  if (s.empty() || s.size() > 40) return false;
  return std::all_of(s.begin(), s.end(), [](char c) { return InClass(c, false, true, true, "-"); });
}

// UTF-8 code points: every byte that is not a 10xxxxxx continuation byte.
inline size_t CodePoints(const std::string& s) {
  size_t n = 0;
  for (unsigned char c : s) n += (c & 0xC0) != 0x80;
  return n;
}

inline std::string Quote(const std::string& s) {
  static const char* hex = "0123456789abcdef";
  std::string out = "\"";
  for (unsigned char c : s) {
    switch (c) {
      case '"': out += "\\\""; break;
      case '\\': out += "\\\\"; break;
      case '\n': out += "\\n"; break;
      case '\r': out += "\\r"; break;
      case '\t': out += "\\t"; break;
      case '\b': out += "\\b"; break;
      case '\f': out += "\\f"; break;
      default:
        if (c < 0x20) { out += "\\u00"; out += hex[c >> 4]; out += hex[c & 15]; }
        else out += static_cast<char>(c);
    }
  }
  return out + "\"";
}

}  // namespace internal

// The rows of one profile's mirrored Spaces: in `order`, skipping ids missing
// from `items`, deleted, repeated or `__scratch__`; at most kMaxSpaces.
inline std::vector<Space> MirrorRows(const std::vector<std::string>& order,
                                     const std::map<std::string, Space>& items,
                                     const std::set<std::string>& deleted) {
  std::vector<Space> rows;
  std::set<std::string> seen;
  for (const std::string& id : order) {
    if (rows.size() >= kMaxSpaces) break;
    if (id == "__scratch__" || deleted.count(id) || !seen.insert(id).second) continue;
    auto it = items.find(id);
    if (it == items.end()) continue;
    Space row = it->second;
    size_t points = internal::CodePoints(row.name);
    if (!internal::ValidId(id) || !internal::ValidId(row.id) || points == 0 || points > 60) continue;
    if (!internal::ValidColor(row.color)) row.color.clear();
    if (!internal::ValidSymbol(row.symbol)) row.symbol.clear();
    row.tab_count = std::clamp(row.tab_count, 0, 10000);
    rows.push_back(row);
  }
  return rows;
}

// Every live profile but `current_id`, in order, with its mirror rows; empty
// unless at least two profiles are live. Profiles with no Spaces are kept.
inline std::vector<OtherProfile> OtherProfileSpaces(
    const std::vector<Profile>& profiles, const std::string& current_id,
    const std::map<std::string, std::vector<Space>>& mirrors,
    const std::map<std::string, std::set<std::string>>& shown) {
  std::vector<OtherProfile> out;
  if (std::count_if(profiles.begin(), profiles.end(), [](const Profile& p) { return p.live; }) < 2)
    return out;
  for (const Profile& profile : profiles) {
    if (!profile.live || profile.id == current_id) continue;
    OtherProfile other;
    other.id = profile.id;
    other.name = profile.name;
    auto rows = mirrors.find(profile.id);
    auto open = shown.find(profile.id);
    if (rows != mirrors.end()) {
      for (const Space& row : rows->second) {
        Item item;
        static_cast<Space&>(item) = row;
        item.open_elsewhere = open != shown.end() && open->second.count(row.id) > 0;
        other.items.push_back(item);
      }
    }
    other.full = other.items.size() >= kMaxSpaces;
    out.push_back(std::move(other));
  }
  return out;
}

// For the test harness only; the browser builds base::Value directly.
inline std::string ToJson(const std::vector<OtherProfile>& profiles) {
  using internal::Quote;
  std::string out = "[";
  for (size_t i = 0; i < profiles.size(); ++i) {
    const OtherProfile& p = profiles[i];
    out += (i ? "," : "") + std::string("{\"id\":") + Quote(p.id) + ",\"name\":" + Quote(p.name) +
           ",\"status\":" + Quote(p.status) + ",\"full\":" + (p.full ? "true" : "false") + ",\"items\":[";
    for (size_t j = 0; j < p.items.size(); ++j) {
      const Item& it = p.items[j];
      out += (j ? "," : "") + std::string("{\"id\":") + Quote(it.id) + ",\"name\":" + Quote(it.name) +
             ",\"color\":" + Quote(it.color) + ",\"symbol\":" + Quote(it.symbol) +
             ",\"tabCount\":" + std::to_string(it.tab_count) +
             ",\"openElsewhere\":" + (it.open_elsewhere ? "true" : "false") + "}";
    }
    out += "]}";
  }
  return out + "]";
}

}  // namespace blanc::spaces_across_profiles

#endif  // BLANC_BROWSER_UI_SPACES_ACROSS_PROFILES_H_

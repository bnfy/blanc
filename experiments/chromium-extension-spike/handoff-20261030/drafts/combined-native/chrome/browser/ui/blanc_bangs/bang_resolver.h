#ifndef BLANC_BANGS_DRAFT_RESOLVER_H_
#define BLANC_BANGS_DRAFT_RESOLVER_H_
#include "bang_syntax.h"
#include <string>
#include <string_view>
#include <vector>
namespace blanc::bangs::draft {
// Inputs must come from the pinned release catalog or native-validated custom
// settings. In particular, custom home must be derived by native URL parsing.
struct BangEntry {
  std::string code;
  std::vector<std::string> aliases;
  std::u16string name;
  std::u16string template_url;
  std::u16string home;
  int encoding;
  std::u16string domain = {};
};
enum class ResolveStatus { kNotBang, kDisabled, kUnknown, kInvalidEncoding, kResolved };
struct BangResolution {
  ResolveStatus status;
  bool bang_shaped;
  std::string code;
  std::u16string name, query, url;
};
BangResolution ResolveBang(std::u16string_view input, bool enabled,
                           const std::vector<BangEntry>& custom,
                           const std::vector<BangEntry>& catalog);
}  // namespace blanc::bangs::draft
#endif

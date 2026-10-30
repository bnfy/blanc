#ifndef BLANC_BANGS_DRAFT_SYNTAX_H_
#define BLANC_BANGS_DRAFT_SYNTAX_H_
#include <cstdint>
#include <optional>
#include <string>
#include <string_view>
namespace blanc::bangs::draft {
struct ParsedBang {
  std::string code;
  std::u16string query;
  bool at_start;
};
// Follows the shipping ECMAScript token and UTF-16 whitespace semantics.
std::optional<ParsedBang> ParseBang(std::u16string_view text);
// Bits match shipping: 1=encodeURIComponent, 2=replace spaces with '+'.
// An unpaired surrogate fails only when URI encoding is requested.
std::optional<std::u16string> EncodeBangQuery(std::u16string_view query,
                                             int encoding_bits);
}  // namespace blanc::bangs::draft
#endif

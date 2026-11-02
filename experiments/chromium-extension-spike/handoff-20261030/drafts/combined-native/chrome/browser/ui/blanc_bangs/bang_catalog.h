#ifndef BLANC_BANGS_DRAFT_CATALOG_H_
#define BLANC_BANGS_DRAFT_CATALOG_H_
#include "bang_resolver.h"
#include <optional>
#include <string>
#include <string_view>
#include <vector>
namespace blanc::bangs::draft {
struct BangCatalog {
  std::vector<BangEntry> entries;
  std::vector<std::string> popular;
};
// Accepts only bytes of the reviewed release catalog. A native caller must
// apply a read cap before allocation and obtain bytes from a trusted asset.
std::optional<BangCatalog> ParsePinnedCatalog(std::string_view bytes);
}  // namespace blanc::bangs::draft
#endif

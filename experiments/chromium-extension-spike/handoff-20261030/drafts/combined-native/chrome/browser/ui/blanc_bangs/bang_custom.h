#ifndef BLANC_BANGS_DRAFT_CUSTOM_H_
#define BLANC_BANGS_DRAFT_CUSTOM_H_
#include "bang_resolver.h"
#include <string>
#include <vector>
namespace blanc::bangs::draft {
struct CustomBangInput { std::u16string code, name, template_url; };
// Mirrors released normalization for already typed strings. The native owner
// must validate IPC types and preserve UTF-16 without lossy JSON conversion.
std::vector<BangEntry> NormalizeCustomBangs(const std::vector<CustomBangInput>& input);
}  // namespace blanc::bangs::draft
#endif

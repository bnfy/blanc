#ifndef BLANC_BANGS_DRAFT_MUTATION_H_
#define BLANC_BANGS_DRAFT_MUTATION_H_
#include "bang_custom.h"
#include <string_view>
class PrefService;
namespace blanc::bangs::draft {
enum class CustomMutation { kChanged, kInvalid, kDuplicate, kLimit, kUnavailable, kNotFound };
// Re-reads current prefs synchronously for each operation. The trusted caller
// must authorize the settings document and supply the original profile prefs.
// A changed result means accepted in memory, not an acknowledged disk write.
CustomMutation AddCustomBang(PrefService* prefs, const CustomBangInput& input);
CustomMutation RemoveCustomBang(PrefService* prefs, std::string_view code);
}  // namespace blanc::bangs::draft
#endif

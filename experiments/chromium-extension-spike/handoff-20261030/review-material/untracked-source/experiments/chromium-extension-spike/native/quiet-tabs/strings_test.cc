#include <cassert>
#include "blanc_quiet_strings.h"
int main() {
  using blanc::quiet::GetSettingsStrings;
  assert(GetSettingsStrings("en-US").label == u"Quiet inactive tabs");
  assert(&GetSettingsStrings("de_AT") == &GetSettingsStrings("de"));
  assert(&GetSettingsStrings("pt-PT") == &GetSettingsStrings("pt-BR"));
  assert(&GetSettingsStrings("FR-ca") == &GetSettingsStrings("fr"));
  assert(&GetSettingsStrings("unsupported") == &GetSettingsStrings("en"));
  assert(GetSettingsStrings("de").label != GetSettingsStrings("en").label);
  assert(GetSettingsStrings("es").cancel != GetSettingsStrings("en").cancel);
  assert(GetSettingsStrings("it").after_1h != GetSettingsStrings("en").after_1h);
}

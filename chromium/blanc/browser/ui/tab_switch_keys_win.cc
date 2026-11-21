// Copyright 2026 Bananify Creative. MIT; see the Blanc repository LICENSE.
#include "blanc/browser/ui/tab_switch_keys_aura.h"

#include <windows.h>

namespace blanc {

TabSwitchKey CurrentTabSwitchKey() {
  InstallTabSwitchWatcher();
  const TabSwitchKey current = CurrentAuraTabSwitchKey();
  if (current != TabSwitchKey::kNone) return current;
  // Before the handler was installed (the first Ctrl+Tab of a run): the key
  // state of the message being handled.
  const bool control = ::GetKeyState(VK_CONTROL) & 0x8000;
  const bool tab = ::GetKeyState(VK_TAB) & 0x8000;
  const bool alt = ::GetKeyState(VK_MENU) & 0x8000;
  if (control && tab && !alt) return TabSwitchKey::kCtrlTab;
  return control || tab ? TabSwitchKey::kOther : TabSwitchKey::kNone;
}

}  // namespace blanc

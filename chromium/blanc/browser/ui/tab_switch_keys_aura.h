// Copyright 2026 Bananify Creative. MIT; see the Blanc repository LICENSE.
#ifndef BLANC_BROWSER_UI_TAB_SWITCH_KEYS_AURA_H_
#define BLANC_BROWSER_UI_TAB_SWITCH_KEYS_AURA_H_

#include "blanc/browser/ui/tab_switch_keys.h"
#include "build/build_config.h"

#if BUILDFLAG(IS_LINUX)
#include "base/time/time.h"

namespace ui { class Accelerator; }
namespace views { class View; }
#endif

namespace blanc {

// Install once per process. Linux calls this at Island creation, Windows on
// the first command (where GetKeyState covers the dispatch already underway).
void InstallTabSwitchWatcher();
TabSwitchKey CurrentAuraTabSwitchKey();

#if BUILDFLAG(IS_LINUX)
void RegisterTabSwitchAccelerators(views::View& island);
bool DispatchTabSwitchAccelerator(views::View& browser, const ui::Accelerator& accelerator);
base::TimeTicks TabSwitchPressTime();
bool PrepareTabSwitchStep();
#endif

}  // namespace blanc

#endif  // BLANC_BROWSER_UI_TAB_SWITCH_KEYS_AURA_H_

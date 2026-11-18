// Copyright 2026 Bananify Creative. MIT; see the Blanc repository LICENSE.
#ifndef BLANC_BROWSER_UI_TAB_SWITCH_KEYS_MAC_H_
#define BLANC_BROWSER_UI_TAB_SWITCH_KEYS_MAC_H_

#include <string>

#include "base/functional/callback.h"
#include "ui/gfx/native_ui_types.h"

// Ctrl+Tab by most recent use (F59), the keys' half. Shipping's main process
// sees every key; here the Tab presses arrive as Chromium's Select Next Tab
// command, and this watches the rest of the gesture.
namespace blanc {

enum class TabSwitchKey { kNone, kCtrlTab, kOther };

// What the event being handled is: Ctrl+Tab or Ctrl+Shift+Tab, another key
// (Ctrl+PageDown and the ⌘ shortcuts stay positional), or no key at all.
TabSwitchKey CurrentTabSwitchKey();

// From a Ctrl+Tab until Control comes up or Blanc stops being the active app,
// |send| gets "release" (Control up), "closePick" (Ctrl+W, swallowed),
// "cancel" (Esc, swallowed; any other key; another app in front) or
// "cancelSoon" (a click, which a card entry may still claim). Calling it
// again while watching only replaces |send|.
void WatchTabSwitchKeys(base::RepeatingCallback<void(const std::string&)> send);

// Posts one key of the gesture to this app's own event queue, addressed to
// |window|: "ctrlDown", "ctrlUp", "tab", "shiftTab", "w", "escape" or "a".
// Nothing leaves the process. False for an unknown key.
bool PostTabSwitchKeyForTesting(gfx::NativeWindow window, const std::string& key);

}  // namespace blanc

#endif  // BLANC_BROWSER_UI_TAB_SWITCH_KEYS_MAC_H_

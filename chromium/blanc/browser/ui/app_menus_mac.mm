// Copyright 2026 Bananify Creative. MIT; see the Blanc repository LICENSE.
#include "blanc/browser/ui/app_menus_mac.h"

#import <AppKit/AppKit.h>

#include "base/strings/sys_string_conversions.h"

namespace blanc {

namespace {
// The menu AppController builds each time the Dock asks for one.
NSMenuItem* DockMenuItem(int item_tag) {
  id<NSApplicationDelegate> delegate = NSApp.delegate;
  if (![delegate respondsToSelector:@selector(applicationDockMenu:)]) return nil;
  return [[delegate applicationDockMenu:NSApp] itemWithTag:item_tag];
}
}  // namespace

std::u16string MainMenuItemTitle(int menu_tag, int item_tag) {
  NSMenuItem* item = [[NSApp.mainMenu itemWithTag:menu_tag].submenu itemWithTag:item_tag];
  return item ? base::SysNSStringToUTF16(item.title) : std::u16string();
}

std::u16string DockMenuItemTitle(int item_tag) {
  NSMenuItem* item = DockMenuItem(item_tag);
  return item ? base::SysNSStringToUTF16(item.title) : std::u16string();
}

bool ClickDockMenuItem(int item_tag) {
  NSMenuItem* item = DockMenuItem(item_tag);
  if (!item.action || !item.target) return false;
  return [NSApp sendAction:item.action to:item.target from:item];
}

}  // namespace blanc

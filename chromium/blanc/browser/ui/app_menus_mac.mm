// Copyright 2026 Bananify Creative. MIT; see the Blanc repository LICENSE.
#include "blanc/browser/ui/app_menus_mac.h"

#import <AppKit/AppKit.h>

#include "base/strings/sys_string_conversions.h"
#include "blanc/browser/ui/blanc_prototype_ui.h"
#include "blanc/common/menu_strings.h"
#include "chrome/app/chrome_command_ids.h"
#include "chrome/browser/browser_process.h"

@interface BlancMiniWindowMenuTarget : NSObject
- (void)openMiniWindow:(id)sender;
@end
@implementation BlancMiniWindowMenuTarget
- (void)openMiniWindow:(id)sender {
  [NSApp activateIgnoringOtherApps:YES];
  blanc_prototype::OpenMiniWindow();
}
@end

namespace blanc {

void InstallMiniWindowMenu() {
  NSMenu* file = [NSApp.mainMenu itemWithTag:IDC_FILE_MENU].submenu;
  if (!file || [file itemWithTag:65040]) return;
  static BlancMiniWindowMenuTarget* target = [[BlancMiniWindowMenuTarget alloc] init];
  NSMenuItem* item = [[NSMenuItem alloc] initWithTitle:base::SysUTF16ToNSString(
      menu::ForLocale(g_browser_process->GetApplicationLocale()).new_mini_window)
      action:@selector(openMiniWindow:) keyEquivalent:@""];
  item.target = target; item.tag = 65040;
  const NSInteger at = [file indexOfItemWithTag:IDC_NEW_WINDOW];
  [file insertItem:item atIndex:at == -1 ? 0 : at + 1];
}


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

void SetDockIcon(base::span<const uint8_t> png) {
  NSImage* image = nil;
  if (!png.empty()) {
    image = [[NSImage alloc] initWithData:[NSData dataWithBytes:png.data() length:png.size()]];
    if (!image) return;
  }
  NSApp.applicationIconImage = image;
}

}  // namespace blanc

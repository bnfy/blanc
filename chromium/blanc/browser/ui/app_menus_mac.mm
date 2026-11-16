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
- (void)checkForUpdates:(id)sender;
- (void)focusActiveWindow:(id)sender;
@end
@implementation BlancMiniWindowMenuTarget
- (void)checkForUpdates:(id)sender {
  [NSApp activateIgnoringOtherApps:YES];
  blanc_prototype::CheckForUpdatesFromMenu();
}
- (void)focusActiveWindow:(id)sender {
  [NSApp activateIgnoringOtherApps:YES];
  blanc_prototype::FocusDockActiveWindow();
}
- (void)openMiniWindow:(id)sender {
  [NSApp activateIgnoringOtherApps:YES];
  blanc_prototype::OpenMiniWindow();
}
@end

namespace blanc {

namespace {
BlancMiniWindowMenuTarget* MenuTarget() {
  static BlancMiniWindowMenuTarget* target = [[BlancMiniWindowMenuTarget alloc] init];
  return target;
}

// Shipping's app menu: Check for Updates… directly under About.
void InstallCheckForUpdates() {
  NSMenu* app = [NSApp.mainMenu itemAtIndex:0].submenu;
  if (!app || [app itemWithTag:65042]) return;
  const NSInteger about = [app indexOfItemWithTag:IDC_ABOUT];
  if (about == -1) return;
  NSMenuItem* item = [[NSMenuItem alloc] initWithTitle:base::SysUTF16ToNSString(
      menu::ForLocale(g_browser_process->GetApplicationLocale()).check_for_updates)
      action:@selector(checkForUpdates:) keyEquivalent:@""];
  item.target = MenuTarget(); item.tag = 65042;
  [app insertItem:item atIndex:about + 1];
}
}  // namespace

void AddDockActiveTab(NSMenu* menu) {
  const auto tab = blanc_prototype::DockActiveTab();
  if (tab.label.empty()) return;
  NSMenuItem* item = [[NSMenuItem alloc] initWithTitle:base::SysUTF16ToNSString(tab.label)
      action:@selector(focusActiveWindow:) keyEquivalent:@""];
  item.target = MenuTarget(); item.tag = 65041;
  if (!tab.icon_png.empty()) {
    NSImage* icon = [[NSImage alloc] initWithData:[NSData dataWithBytes:tab.icon_png.data()
                                                                 length:tab.icon_png.size()]];
    if (icon) { icon.size = NSMakeSize(16, 16); item.image = icon; }
  }
  [menu addItem:item];
  [menu addItem:[NSMenuItem separatorItem]];
}

void InstallMiniWindowMenu() {
  InstallCheckForUpdates();
  NSMenu* file = [NSApp.mainMenu itemWithTag:IDC_FILE_MENU].submenu;
  if (!file || [file itemWithTag:65040]) return;
  BlancMiniWindowMenuTarget* target = MenuTarget();
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

std::vector<std::u16string> DockMenuItemTitles() {
  std::vector<std::u16string> titles;
  id<NSApplicationDelegate> delegate = NSApp.delegate;
  if (![delegate respondsToSelector:@selector(applicationDockMenu:)]) return titles;
  for (NSMenuItem* item in [delegate applicationDockMenu:NSApp].itemArray)
    titles.push_back(item.separatorItem ? u"-" : base::SysNSStringToUTF16(item.title));
  return titles;
}

bool DockMenuItemHasImage(int item_tag) {
  return DockMenuItem(item_tag).image != nil;
}

std::u16string DockBadge() {
  return base::SysNSStringToUTF16(NSApp.dockTile.badgeLabel ?: @"");
}

bool ClickAppMenuItem(int item_tag) {
  NSMenuItem* item = [[NSApp.mainMenu itemAtIndex:0].submenu itemWithTag:item_tag];
  if (!item.action || !item.target) return false;
  return [NSApp sendAction:item.action to:item.target from:item];
}

std::vector<std::u16string> AppMenuItemTitles() {
  std::vector<std::u16string> titles;
  for (NSMenuItem* item in [NSApp.mainMenu itemAtIndex:0].submenu.itemArray)
    if (!item.separatorItem) titles.push_back(base::SysNSStringToUTF16(item.title));
  return titles;
}

bool ClickAppMenuAbout() {
  NSMenuItem* item = [[NSApp.mainMenu itemAtIndex:0].submenu itemWithTag:IDC_ABOUT];
  if (!item.action) return false;
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

bool SetDockIconFromBundle(const std::string& name) {
  if (@available(macOS 26, *)) {
    // macOS 26's Icon & widget style, e.g. ClearLight or TintedDark.
    NSString* style = [NSUserDefaults.standardUserDefaults stringForKey:@"AppleIconAppearanceTheme"];
    if ([style hasPrefix:@"Clear"] || [style hasPrefix:@"Tinted"]) {
      NSApp.applicationIconImage = nil;
      return true;
    }
  }
  // Never a named Icon Composer stack: AppKit draws one handed to the Dock
  // once, in Light, and never again for Dark.
  NSString* path = [NSBundle.mainBundle pathForResource:base::SysUTF8ToNSString(name)
                                                 ofType:@"png"
                                            inDirectory:@"dock"];
  NSImage* image = path ? [[NSImage alloc] initWithContentsOfFile:path] : nil;
  if (!image) return false;
  NSApp.applicationIconImage = image;
  return true;
}

}  // namespace blanc

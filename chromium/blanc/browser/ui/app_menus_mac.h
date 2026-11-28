// Copyright 2026 Bananify Creative. MIT; see the Blanc repository LICENSE.
#ifndef BLANC_BROWSER_UI_APP_MENUS_MAC_H_
#define BLANC_BROWSER_UI_APP_MENUS_MAC_H_

#include <stdint.h>

#include <optional>
#include <string>
#include <utility>
#include <vector>

#include "base/containers/span.h"

class GURL;

#ifdef __OBJC__
@class NSMenu;

namespace blanc {
// The Dock menu's first row, as shipping's dock-menu.js: the front window's
// current tab (its icon and title; the private label for a private tab) and
// a separator, tagged 65041. Choosing it brings that window forward. Nothing
// is added while no window shows. AppController calls it on the menu it
// builds each time the Dock asks.
void AddDockActiveTab(NSMenu* menu);
}  // namespace blanc
#endif

namespace blanc {
// File → New Mini Window and, after About, Check for Updates… (tag 65042).
void InstallMiniWindowMenu();

// The app's menus as the test hooks read them (patch 0013 titles the
// private-browsing items): an item's title in a main-menu submenu or in the
// Dock menu, or "" when it isn't there, and clicking a Dock menu item.
std::u16string MainMenuItemTitle(int menu_tag, int item_tag);
// The Dock icon from PNG bytes; empty puts back the app's own icon.
void SetDockIcon(base::span<const uint8_t> png);
// The Dock icon from the bundle's dock/<name>.png (Blanc Beta's Icon
// Composer renders, one per appearance; the caller picks Light or Dark and
// asks again when the appearance changes, as shipping does). On macOS 26 and
// later, Clear and Tinted restyle only the app's own icon, so in those styles
// it puts that back instead. False when the image isn't in the bundle.
bool SetDockIconFromBundle(const std::string& name);
std::u16string DockMenuItemTitle(int item_tag);
bool ClickDockMenuItem(int item_tag);
// Test hooks: hands the app delegate a URL as the system does when another
// app opens a link (application:openURLs:); false without such a delegate.
bool OpenURLsAsTheSystem(const std::string& spec);
// The Dock menu top to bottom as the test hooks read it: each item's title,
// "-" for a separator; whether an item carries an image; the Dock tile's
// badge text ("" for none); and an application-menu item clicked by its tag.
std::vector<std::u16string> DockMenuItemTitles();
// The app bundle's CFBundleShortVersionString and CFBundleVersion.
std::pair<std::string, std::string> BundleVersion();
bool DockMenuItemHasImage(int item_tag);
std::u16string DockBadge();
bool ClickAppMenuItem(int item_tag);
// The Electron Blanc app (me.bnfy.bowser), for the protected-video notice's
// Open in Blanc: whether macOS knows it, and opening one web address in it.
bool ElectronBlancInstalled();
// Whether that app is running now; the profile importer waits until it is not.
bool ElectronBlancRunning();
// The password of the Electron app's safeStorage Keychain item ("Blanc Safe
// Storage"), for the profile importer to open that app's protected Sync key.
// Read-only: nothing is added or changed in the Keychain. macOS asks the
// person once, since the item belongs to another app; a refusal is nullopt.
// It blocks on that prompt, so it is never called on the UI thread.
std::optional<std::string> ReadElectronSafeStoragePassword();
void OpenInElectronBlanc(const GURL& url);
// The application menu's item titles in order (About, Hide, Quit… carry the
// app's name, patch 0075), and clicking its About item as a person would.
std::vector<std::u16string> AppMenuItemTitles();
bool ClickAppMenuAbout();

}  // namespace blanc

#endif  // BLANC_BROWSER_UI_APP_MENUS_MAC_H_

// Copyright 2026 Bananify Creative. MIT; see LICENSE.
#include "blanc/browser/mac/beta_updater.h"
#include "blanc/browser/mac/beta_update_policy.h"
#import <Sparkle/SPUStandardUpdaterController.h>
#import <Sparkle/SPUUpdater.h>
#import <Sparkle/SPUUpdaterDelegate.h>
#import <Sparkle/SUAppcastItem.h>
#include <unistd.h>
#include "base/check.h"

namespace {
NSString* Feed() {
#if defined(__arm64__)
  return @"https://blanc.day/updates/chromium-beta/arm64.xml";
#else
  return @"https://blanc.day/updates/chromium-beta/x64.xml";
#endif
}
NSString* Arch() {
#if defined(__arm64__)
  return @"arm64";
#else
  return @"x64";
#endif
}
std::string Text(NSString* text) {
  return [text isKindOfClass:NSString.class] ? (text.UTF8String ?: "") : "";
}
BOOL Refuse(NSError** error) {
  if (error) *error = [NSError errorWithDomain:@"me.bnfy.blanc.beta.updater" code:1
      userInfo:@{NSLocalizedDescriptionKey:@"This update does not match Blanc Beta's update policy."}];
  return NO;
}
}
@interface BlancBetaUpdater () <SPUUpdaterDelegate>
@property(nonatomic, strong) SPUStandardUpdaterController* controller;
@property(nonatomic, strong) NSMenuItem* menuItem;
@property(nonatomic) BOOL stopping;
@end
static __weak BlancBetaUpdater* g_beta_updater;

@implementation BlancBetaUpdater
@synthesize controller = _controller;
@synthesize menuItem = _menuItem;
@synthesize stopping = _stopping;
- (void)start {
  CHECK(NSThread.isMainThread);
  if (self.controller || self.stopping || geteuid() == 0 || getuid() == 0) return;
  NSBundle* app = NSBundle.mainBundle;
  NSString* key = [app objectForInfoDictionaryKey:@"SUPublicEDKey"];
  NSData* decoded = [key isKindOfClass:NSString.class]
      ? [[NSData alloc] initWithBase64EncodedString:key options:0] : nil;
  if (![app.bundleIdentifier isEqualToString:@"me.bnfy.blanc.beta"] ||
      ![[app objectForInfoDictionaryKey:@"CrProductDirName"] isEqualToString:@"Blanc Beta"] ||
      ![[app objectForInfoDictionaryKey:@"SUFeedURL"] isEqualToString:Feed()] ||
      ![[app objectForInfoDictionaryKey:@"SUVerifyUpdateBeforeExtraction"] boolValue] ||
      !blanc::beta::UpdateVersion(Text([app objectForInfoDictionaryKey:@"CFBundleShortVersionString"])) ||
      !blanc::beta::UpdateBuild(Text([app objectForInfoDictionaryKey:@"CFBundleVersion"])) || decoded.length != 32 ||
      ![[decoded base64EncodedStringWithOptions:0] isEqualToString:key] ||
      ![[[NSBundle bundleForClass:SPUUpdater.class] objectForInfoDictionaryKey:@"CFBundleShortVersionString"] isEqualToString:@"2.10.1"])
    return;
  self.controller = [[SPUStandardUpdaterController alloc] initWithStartingUpdater:NO
      updaterDelegate:self userDriverDelegate:nil];
  g_beta_updater = self;
  // The controller owns native menu validation and the standard update UI.
  NSMenu* menu = NSApp.mainMenu.numberOfItems ? [NSApp.mainMenu itemAtIndex:0].submenu : nil;
  self.menuItem = [[NSMenuItem alloc] initWithTitle:@"Check for Updates…"
      action:@selector(checkForUpdates:) keyEquivalent:@""];
  self.menuItem.target = self.controller;
  if (menu) [menu insertItem:self.menuItem atIndex:MIN(2, menu.numberOfItems)];
  [self.controller startUpdater];
}
- (NSString*)feedURLStringForUpdater:(SPUUpdater*)updater { return Feed(); }
- (BOOL)updater:(SPUUpdater*)updater mayPerformUpdateCheck:(SPUUpdateCheck)check
         error:(NSError* __autoreleasing*)error {
  return !self.stopping && geteuid() != 0 && getuid() != 0 ? YES : Refuse(error);
}
- (BOOL)updater:(SPUUpdater*)updater shouldProceedWithUpdate:(SUAppcastItem*)item
   updateCheck:(SPUUpdateCheck)check error:(NSError* __autoreleasing*)error {
  NSString* display = item.displayVersionString;
  NSString* current = [NSBundle.mainBundle objectForInfoDictionaryKey:@"CFBundleVersion"];
  return blanc::beta::AllowUpdate(Text(current), Text(item.versionString),
      Text(display), Text(item.fileURL.absoluteString), Text(Arch()),
      item.isDeltaUpdate || item.deltaUpdates.count != 0)
      ? YES : Refuse(error);
}
- (BOOL)updater:(SPUUpdater*)updater shouldDownloadReleaseNotesForUpdate:(SUAppcastItem*)item {
  return NO;
}
- (void)applicationWillTerminate {
  CHECK(NSThread.isMainThread);
  self.stopping = YES;
  self.menuItem.target = nil;
  self.menuItem.enabled = NO;
  // Keep the controller alive through the normal NSApplication termination
  // handshake. Chromium closes tabs/profiles and flushes its session/Sync in
  // that path. Never kill the browser or invoke an installer from a renderer.
  // ARC releases the controller with the owning AppController after shutdown.
}
@end
namespace blanc::beta {
UpdaterState GetUpdaterState() {
  CHECK(NSThread.isMainThread);
  BlancBetaUpdater* owner = g_beta_updater;
  UpdaterState state;
  if (!owner || owner.stopping || !owner.controller) return state;
  state.available = true;
  state.can_check = owner.controller.updater.canCheckForUpdates;
  state.in_progress = owner.controller.updater.sessionInProgress;
  NSString* version = [NSBundle.mainBundle objectForInfoDictionaryKey:@"CFBundleShortVersionString"];
  state.version = version.UTF8String ?: "";
  return state;
}
bool CheckForUpdates() {
  CHECK(NSThread.isMainThread);
  BlancBetaUpdater* owner = g_beta_updater;
  if (!GetUpdaterState().can_check) return false;
  [owner.controller checkForUpdates:nil];
  return true;
}
}

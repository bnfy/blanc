// Copyright 2026 Bananify Creative. MIT; see LICENSE.
#ifndef BLANC_BROWSER_MAC_BETA_UPDATER_H_
#define BLANC_BROWSER_MAC_BETA_UPDATER_H_
#include <string>
#ifdef __OBJC__
#import <Cocoa/Cocoa.h>
@interface BlancBetaUpdater : NSObject
- (void)start;
- (void)applicationWillTerminate;
@end
#endif
namespace blanc::beta {
struct UpdaterState {
  bool available = false;
  bool can_check = false;
  bool in_progress = false;
  std::string version;
};
UpdaterState GetUpdaterState();
bool CheckForUpdates();
}
#endif

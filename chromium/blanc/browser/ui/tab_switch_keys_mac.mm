// Copyright 2026 Bananify Creative. MIT; see the Blanc repository LICENSE.
#include "blanc/browser/ui/tab_switch_keys.h"

#import <AppKit/AppKit.h>

#include "base/no_destructor.h"

namespace blanc {
namespace {

// Virtual key codes (HIToolbox/Events.h), named here to avoid Carbon.
constexpr unsigned short kTab = 48, kEscape = 53, kW = 13, kA = 0, kControl = 59;

using Send = base::RepeatingCallback<void(const std::string&)>;
Send& Sender() {
  static base::NoDestructor<Send> send;
  return *send;
}
id g_monitor = nil;
id g_resigned = nil;

NSEventModifierFlags Flags(NSEvent* event) {
  return event.modifierFlags & NSEventModifierFlagDeviceIndependentFlagsMask;
}

void Stop() {
  if (g_monitor) [NSEvent removeMonitor:g_monitor];
  if (g_resigned) [NSNotificationCenter.defaultCenter removeObserver:g_resigned];
  g_monitor = nil;
  g_resigned = nil;
}

// |send| may replace or clear the sender; run a copy.
void Run(const std::string& action) {
  Send send = Sender();
  if (send) send.Run(action);
}

}  // namespace

TabSwitchKey CurrentTabSwitchKey() {
  NSEvent* event = NSApp.currentEvent;
  if (!event || event.type != NSEventTypeKeyDown) return TabSwitchKey::kNone;
  const NSEventModifierFlags flags = Flags(event);
  if (event.keyCode == kTab && (flags & NSEventModifierFlagControl) &&
      !(flags & (NSEventModifierFlagCommand | NSEventModifierFlagOption))) {
    return TabSwitchKey::kCtrlTab;
  }
  return TabSwitchKey::kOther;
}

void WatchTabSwitchKeys(Send send) {
  Sender() = std::move(send);
  if (g_monitor) return;
  const NSEventMask mask = NSEventMaskFlagsChanged | NSEventMaskKeyDown | NSEventMaskLeftMouseDown |
                           NSEventMaskRightMouseDown | NSEventMaskOtherMouseDown;
  g_monitor = [NSEvent addLocalMonitorForEventsMatchingMask:mask
                                                    handler:^NSEvent*(NSEvent* event) {
    const NSEventModifierFlags flags = Flags(event);
    switch (event.type) {
      case NSEventTypeFlagsChanged:
        if (!(flags & NSEventModifierFlagControl)) {
          Stop();
          Run("release");
        }
        return event;
      case NSEventTypeKeyDown:
        // Tab and Shift+Tab go on to Chromium's command, which steps.
        if (event.keyCode == kTab && (flags & NSEventModifierFlagControl)) return event;
        if (event.keyCode == kEscape) {
          Run("cancel");
          return nil;
        }
        if (event.keyCode == kW && (flags & NSEventModifierFlagControl) &&
            !(flags & (NSEventModifierFlagCommand | NSEventModifierFlagOption))) {
          Run("closePick");
          return nil;
        }
        Run("cancel");
        return event;
      default:
        Run("cancelSoon");
        return event;
    }
  }];
  g_resigned = [NSNotificationCenter.defaultCenter
      addObserverForName:NSApplicationDidResignActiveNotification
                  object:nil
                   queue:nil
              usingBlock:^(NSNotification*) {
                Stop();
                Run("cancel");
              }];
}

bool PostTabSwitchKeyForTesting(gfx::NativeWindow window, const std::string& key) {
  NSWindow* ns_window = window.GetNativeNSWindow();
  if (!ns_window) return false;
  NSEventType type = NSEventTypeKeyDown;
  NSEventModifierFlags flags = NSEventModifierFlagControl;
  unsigned short code = 0;
  NSString* characters = @"";
  if (key == "ctrlDown") { type = NSEventTypeFlagsChanged; code = kControl; }
  else if (key == "ctrlUp") { type = NSEventTypeFlagsChanged; code = kControl; flags = 0; }
  else if (key == "tab") { code = kTab; characters = @"\t"; }
  else if (key == "shiftTab") { code = kTab; characters = @"\x19"; flags |= NSEventModifierFlagShift; }
  else if (key == "w") { code = kW; characters = @"w"; }
  else if (key == "escape") { code = kEscape; characters = @"\x1b"; }
  else if (key == "a") { code = kA; characters = @"a"; }
  else return false;
  NSEvent* event = [NSEvent keyEventWithType:type
                                    location:NSZeroPoint
                               modifierFlags:flags
                                   timestamp:NSProcessInfo.processInfo.systemUptime
                                windowNumber:ns_window.windowNumber
                                     context:nil
                                  characters:characters
                 charactersIgnoringModifiers:characters
                                   isARepeat:NO
                                     keyCode:code];
  if (!event) return false;
  [NSApp postEvent:event atStart:NO];
  return true;
}

}  // namespace blanc

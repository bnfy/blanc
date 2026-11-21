// Copyright 2026 Bananify Creative. MIT; see the Blanc repository LICENSE.
#include "blanc/browser/ui/window_buttons_mac.h"

#import <AppKit/AppKit.h>

namespace blanc {

namespace {
constexpr NSWindowButton kButtons[] = {NSWindowCloseButton, NSWindowMiniaturizeButton,
                                       NSWindowZoomButton};
}  // namespace

void SetWindowButtonsVisible(gfx::NativeWindow window, bool visible) {
  NSWindow* ns_window = window.GetNativeNSWindow();
  for (NSWindowButton type : kButtons) [[ns_window standardWindowButton:type] setHidden:!visible];
}

void KeepWindowOutOfMenus(gfx::NativeWindow window) {
  window.GetNativeNSWindow().excludedFromWindowsMenu = YES;
}

bool WindowButtonsVisible(gfx::NativeWindow window) {
  NSButton* close = [window.GetNativeNSWindow() standardWindowButton:NSWindowCloseButton];
  return close && !close.hidden;
}

gfx::Point WindowButtonPosition(gfx::NativeWindow window) {
  NSWindow* ns_window = window.GetNativeNSWindow();
  NSButton* close = [ns_window standardWindowButton:NSWindowCloseButton];
  if (!close) return gfx::Point();
  const NSRect frame = [close convertRect:close.bounds toView:nil];
  return gfx::Point(static_cast<int>(NSMinX(frame)),
                    static_cast<int>(NSHeight(ns_window.frame) - NSMaxY(frame)));
}

}  // namespace blanc

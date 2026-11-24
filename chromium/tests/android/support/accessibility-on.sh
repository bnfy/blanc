#!/usr/bin/env bash
# Copyright 2026 Bananify Creative. MIT; see LICENSE.
# Turns on an accessibility service on the emulator ANDROID_SERIAL names (or the only one).
#
# Since Chromium 159 a Chrome tab builds its page's accessibility tree only while a real
# accessibility service is on: UI Automator alone doesn't count (WebContentsAccessibilityImpl,
# "auto-disable candidates"). The checks find a page's text through UI Automator, so they need
# one. Android's own Accessibility Menu service is used because it draws nothing until someone
# assigns its shortcut. Real users are unaffected: TalkBack and password managers still get the tree.
set -euo pipefail
ADB=adb
command -v adb >/dev/null || ADB="$HOME/chromium-android/src/third_party/android_sdk/public/platform-tools/adb"
SERVICE=com.android.systemui.accessibility.accessibilitymenu/com.android.systemui.accessibility.accessibilitymenu.AccessibilityMenuService
current=$("$ADB" shell settings get secure enabled_accessibility_services | tr -d '\r')
if [[ "$current" != *"$SERVICE"* ]]; then
  if [[ -z "$current" || "$current" == null ]]; then next=$SERVICE; else next="$current:$SERVICE"; fi
  "$ADB" shell settings put secure enabled_accessibility_services "$next"
fi
"$ADB" shell settings put secure accessibility_enabled 1

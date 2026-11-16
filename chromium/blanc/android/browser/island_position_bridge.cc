// Copyright 2026 Bananify Creative. MIT; see LICENSE.

// The Island's position for the Start Page: IslandPositionBridge.java reads the setting.

#include "blanc/android/browser/island_position.h"

#include "blanc/android/island_jni/IslandPositionBridge_jni.h"

namespace blanc {

bool IslandAtTop() {
  return Java_IslandPositionBridge_atTop(jni_zero::AttachCurrentThread());
}

}  // namespace blanc

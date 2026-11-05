// Copyright 2026 Bananify Creative. MIT; see LICENSE.

// The Island's way to the blocker: BlockerBridge.java.

#include <string>

#include "base/android/jni_string.h"
#include "blanc/android/blocking_jni/BlockerBridge_jni.h"
#include "blanc/services/blocker/blocker_proxy.h"
#include "content/public/browser/web_contents.h"

namespace blanc {
namespace {
using JavaRef = jni_zero::JavaRef<jobject>;
content::WebContents* Contents(const JavaRef& java) {
  return content::WebContents::FromJavaWebContents(java);
}
content::BrowserContext* Context(content::WebContents* contents) {
  return contents ? contents->GetBrowserContext() : nullptr;
}
GURL Page(content::WebContents* contents) {
  return contents ? contents->GetLastCommittedURL() : GURL();
}
}  // namespace

static jboolean JNI_BlockerBridge_Enabled(JNIEnv*, const JavaRef& java) {
  return BlockingEnabled(Context(Contents(java)));
}
static void JNI_BlockerBridge_SetEnabled(JNIEnv*, const JavaRef& java, jboolean on) {
  SetBlockingEnabled(Context(Contents(java)), on);
}
static jboolean JNI_BlockerBridge_Excepted(JNIEnv*, const JavaRef& java) {
  auto* contents = Contents(java);
  return BlockingSiteExcepted(Context(contents), Page(contents));
}
static void JNI_BlockerBridge_SetExcepted(JNIEnv*, const JavaRef& java, jboolean allow) {
  auto* contents = Contents(java);
  SetBlockingSiteException(Context(contents), Page(contents), allow);
}
static jint JNI_BlockerBridge_BlockedCount(JNIEnv*, const JavaRef& java) {
  auto* contents = Contents(java);
  return contents ? ShieldBlockedCount(contents) : 0;
}
static jni_zero::ScopedJavaLocalRef<jstring> JNI_BlockerBridge_Health(JNIEnv* env) {
  return base::android::ConvertUTF8ToJavaString(env, BlockerHealth());
}
static void JNI_BlockerBridge_Restart(JNIEnv*) {
  RestartBlocker();
}
}  // namespace blanc

DEFINE_JNI(BlockerBridge)

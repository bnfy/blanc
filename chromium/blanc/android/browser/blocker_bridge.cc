// Copyright 2026 Bananify Creative. MIT; see LICENSE.

// The Island's way to the blocker: BlockerBridge.java.

#include <string>
#include <vector>

#include "base/android/jni_array.h"
#include "base/android/jni_string.h"
#include "base/values.h"
#include "blanc/android/blocking_jni/BlockerBridge_jni.h"
#include "blanc/services/blocker/blocker_proxy.h"
#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/profiles/profile_manager.h"
#include "components/prefs/pref_service.h"
#include "content/public/browser/web_contents.h"
#include "url/gurl.h"

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
// Settings has no page, so it reaches the blocker's preferences through the last-used profile, as
// sync_bridge.cc does.
Profile* MainProfile() {
  Profile* profile = ProfileManager::GetLastUsedProfile();
  return profile ? profile->GetOriginalProfile() : nullptr;
}
}  // namespace

static jboolean JNI_BlockerBridge_ProfileEnabled(JNIEnv*) {
  return BlockingEnabled(MainProfile());
}
static void JNI_BlockerBridge_SetProfileEnabled(JNIEnv*, jboolean on) {
  SetBlockingEnabled(MainProfile(), on);
}
// The hosts in blanc.blocking.exceptions (blanc/services/blocker/blocking_policy.inc).
static jni_zero::ScopedJavaLocalRef<jobjectArray> JNI_BlockerBridge_AllowedSites(JNIEnv* env) {
  std::vector<std::string> hosts;
  if (Profile* profile = MainProfile()) {
    for (const auto& entry : profile->GetPrefs()->GetList("blanc.blocking.exceptions")) {
      if (entry.is_string()) hosts.push_back(entry.GetString());
    }
  }
  return base::android::ToJavaArrayOfStrings(env, hosts);
}
// `host` is already normalized by Java; the GURL form lets the blocker's own hostname rules apply.
static void JNI_BlockerBridge_AllowSite(JNIEnv* env, const jni_zero::JavaRef<jstring>& host, jboolean allow) {
  const std::string name = base::android::ConvertJavaStringToUTF8(env, host);
  SetBlockingSiteException(MainProfile(), GURL("https://" + name + "/"), allow);
}

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

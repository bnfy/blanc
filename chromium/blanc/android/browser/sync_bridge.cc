// Copyright 2026 Bananify Creative. MIT; see LICENSE.

// Android's half of the sync runner: keys, the store directory and the network.

#include <optional>
#include <string>
#include <vector>

#include "base/android/callback_android.h"
#include "base/android/jni_array.h"
#include "base/android/jni_string.h"
#include "base/base_paths_android.h"
#include "base/command_line.h"
#include "base/functional/bind.h"
#include "base/json/json_writer.h"
#include "base/no_destructor.h"
#include "base/path_service.h"
#include "base/values.h"
#include "blanc/android/sync_jni/SyncBridge_jni.h"
#include "blanc/services/sync_runner/sync_runner_proxy.h"
#include "chrome/browser/browser_process.h"
#include "chrome/browser/net/system_network_context_manager.h"
#include "components/version_info/version_info.h"
#include "services/network/public/cpp/shared_url_loader_factory.h"

namespace blanc {
namespace {
constexpr char kEndpoint[] = "https://blanc-sync.bnfy-441.workers.dev";

// Compiled out of release: only a test build can point sync elsewhere.
std::string TestEndpoint() {
#if defined(OFFICIAL_BUILD)
  return std::string();
#else
  return base::CommandLine::ForCurrentProcess()->GetSwitchValueASCII("blanc-sync-endpoint");
#endif
}

class AndroidSync : public SyncPlatform {
 public:
  base::FilePath StoreDir() override {
    base::FilePath dir;
    base::PathService::Get(base::DIR_ANDROID_APP_DATA, &dir);
    return dir.AppendASCII("blanc_sync");
  }
  std::string Endpoint() override {
    std::string test = TestEndpoint();
    return test.empty() ? kEndpoint : test;
  }
  std::string ConfigJson() override {
    base::DictValue config;
    config.Set("platform", "android");
    config.Set("version", std::string(version_info::GetVersionNumber()));
    config.Set("deviceName", base::android::ConvertJavaStringToUTF8(Java_SyncBridge_deviceName(jni_zero::AttachCurrentThread())));
    config.Set("keyStore", true);
    std::string test = TestEndpoint();
    if (!test.empty()) {
      config.Set("testEndpoint", test);
      config.Set("env", base::DictValue().Set("BLANC_TEST", "1").Set("BLANC_TEST_SYNC_ENDPOINT", test));
    }
    return base::WriteJson(config).value_or("{}");
  }
  scoped_refptr<network::SharedURLLoaderFactory> UrlLoaderFactory() override {
    return g_browser_process->system_network_context_manager()->GetSharedURLLoaderFactory();
  }
  std::optional<std::vector<uint8_t>> Protect(const std::vector<uint8_t>& data) override {
    return Wrap(data, true);
  }
  std::optional<std::vector<uint8_t>> Unprotect(const std::vector<uint8_t>& data) override {
    return Wrap(data, false);
  }
  void OnEvent(const std::string& event, const std::string& json) override {}

 private:
  std::optional<std::vector<uint8_t>> Wrap(const std::vector<uint8_t>& data, bool protect) {
    JNIEnv* env = jni_zero::AttachCurrentThread();
    auto input = base::android::ToJavaByteArray(env, data);
    auto output = protect ? Java_SyncBridge_protect(env, input) : Java_SyncBridge_unprotect(env, input);
    if (!output) return std::nullopt;
    std::vector<uint8_t> out;
    base::android::JavaByteArrayToByteVector(env, output, &out);
    return out;
  }
};
}  // namespace

static void JNI_SyncBridge_Call(JNIEnv* env, const jni_zero::JavaRef<jstring>& method,
                                const jni_zero::JavaRef<jstring>& args,
                                const jni_zero::JavaRef<JCallback<jstring>>& done) {
  static base::NoDestructor<AndroidSync> platform;
  SetSyncPlatform(platform.get());
  jni_zero::ScopedJavaGlobalRef<jobject> callback(env, done);
  SyncCall(base::android::ConvertJavaStringToUTF8(env, method),
           base::android::ConvertJavaStringToUTF8(env, args),
           base::BindOnce([](jni_zero::ScopedJavaGlobalRef<jobject> done, bool ok, const std::string& result) {
             base::android::RunStringCallbackAndroid(
                 done, ok ? "{\"ok\":true,\"value\":" + result + "}"
                          : "{\"ok\":false,\"error\":" + base::WriteJson(base::Value(result)).value_or("\"\"") + "}");
           }, std::move(callback)));
}
}  // namespace blanc

DEFINE_JNI(SyncBridge)

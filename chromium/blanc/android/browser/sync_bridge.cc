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
#include "base/functional/function_ref.h"
#include "base/json/json_reader.h"
#include "base/json/json_writer.h"
#include "base/no_destructor.h"
#include "base/path_service.h"
#include "base/scoped_observation.h"
#include "base/strings/utf_string_conversions.h"
#include "base/values.h"
#include "blanc/android/browser/sync_start_data.h"
#include "blanc/android/sync_jni/SyncBridge_jni.h"
#include "blanc/services/blocker/blocker_proxy.h"
#include "blanc/services/sync_runner/sync_runner_proxy.h"
#include "chrome/browser/bookmarks/bookmark_model_factory.h"
#include "chrome/browser/browser_process.h"
#include "chrome/browser/net/system_network_context_manager.h"
#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/profiles/profile_manager.h"
#include "components/bookmarks/browser/base_bookmark_model_observer.h"
#include "components/bookmarks/browser/bookmark_model.h"
#include "components/bookmarks/browser/bookmark_node.h"
#include "components/bookmarks/common/bookmark_metrics.h"
#include "components/version_info/version_info.h"
#include "services/network/public/cpp/shared_url_loader_factory.h"
#include "ui/base/models/tree_node_iterator.h"
#include "url/gurl.h"

namespace blanc {
namespace {
constexpr char kEndpoint[] = "https://blanc-sync.bnfy-441.workers.dev";

// Compiled out of release (blanc/config.gni): only a test build can point sync elsewhere.
std::string TestEndpoint() {
#if defined(BLANC_SYNC_TEST_HOOKS)
  return base::CommandLine::ForCurrentProcess()->GetSwitchValueASCII("blanc-sync-endpoint");
#else
  return std::string();
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
  void OnEvent(const std::string& event, const std::string& json) override {
    JNIEnv* env = jni_zero::AttachCurrentThread();
    Java_SyncBridge_onEvent(env, base::android::ConvertUTF8ToJavaString(env, event),
                            base::android::ConvertUTF8ToJavaString(env, json));
  }

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
struct Lists {
  base::ListValue devices, sent;
};
Lists& StartLists() {
  static base::NoDestructor<Lists> lists;
  return *lists;
}

Profile* MainProfile() {
  Profile* profile = ProfileManager::GetLastUsedProfile();
  return profile ? profile->GetOriginalProfile() : nullptr;
}

bookmarks::BookmarkModel* Bookmarks() {
  Profile* profile = MainProfile();
  return profile ? BookmarkModelFactory::GetForBrowserContext(profile) : nullptr;
}

// Any change to Chromium's Favorites, however it's made, reaches ProfileSync.
class FavoritesWatch : public bookmarks::BaseBookmarkModelObserver {
 public:
  void Watch(bookmarks::BookmarkModel* model) {
    if (model && !observation_.IsObserving()) observation_.Observe(model);
  }
  void BookmarkModelChanged() override { Java_SyncBridge_onFavoritesChanged(jni_zero::AttachCurrentThread()); }
  void BookmarkModelLoaded(bool) override { BookmarkModelChanged(); }

 private:
  base::ScopedObservation<bookmarks::BookmarkModel, bookmarks::BookmarkModelObserver> observation_{this};
};

const bookmarks::BookmarkNode* FolderNamed(bookmarks::BookmarkModel* model, const std::string& name) {
  const bookmarks::BookmarkNode* parent = model->mobile_node();
  if (name.empty()) return parent;
  const std::u16string title = base::UTF8ToUTF16(name);
  for (const auto& child : parent->children())
    if (child->is_folder() && child->GetTitle() == title) return child.get();
  return model->AddFolder(parent, parent->children().size(), title);
}

void ForEach(const base::DictValue& plan, const char* key, base::FunctionRef<void(const base::DictValue&)> run) {
  const base::ListValue* list = plan.FindList(key);
  if (!list) return;
  for (const base::Value& item : *list)
    if (item.is_dict()) run(item.GetDict());
}
}  // namespace

static jni_zero::ScopedJavaLocalRef<jstring> JNI_SyncBridge_FavoritesList(JNIEnv* env) {
  static base::NoDestructor<FavoritesWatch> watch;
  auto* model = Bookmarks();
  watch->Watch(model);
  if (!model || !model->loaded()) return nullptr;
  base::ListValue list;
  ui::TreeNodeIterator<const bookmarks::BookmarkNode> it(model->root_node());
  while (it.has_next()) {
    const bookmarks::BookmarkNode* node = it.Next();
    if (!node->is_url()) continue;
    const bookmarks::BookmarkNode* parent = node->parent();
    list.Append(base::DictValue()
                    .Set("url", node->url().spec())
                    .Set("title", base::UTF16ToUTF8(node->GetTitle()))
                    .Set("folder", parent && !parent->is_permanent_node()
                                       ? base::Value(base::UTF16ToUTF8(parent->GetTitle()))
                                       : base::Value()));
  }
  return base::android::ConvertUTF8ToJavaString(env, base::WriteJson(list).value_or("[]"));
}

static void JNI_SyncBridge_FavoritesApply(JNIEnv* env, const jni_zero::JavaRef<jstring>& plan_json) {
  auto* model = Bookmarks();
  auto plan = base::JSONReader::ReadDict(base::android::ConvertJavaStringToUTF8(env, plan_json), base::JSON_PARSE_RFC);
  if (!model || !model->loaded() || !plan) return;
  ForEach(*plan, "add", [&](const base::DictValue& item) {
    const std::string* url = item.FindString("url");
    const std::string* title = item.FindString("title");
    const std::string* folder = item.FindString("folder");
    GURL address(url ? *url : std::string());
    if (!address.is_valid()) return;
    const auto* parent = FolderNamed(model, folder ? *folder : std::string());
    model->AddURL(parent, parent->children().size(), base::UTF8ToUTF16(title ? *title : *url), address);
  });
  ForEach(*plan, "remove", [&](const base::DictValue& item) {
    const std::string* url = item.FindString("url");
    if (!url) return;
    for (const bookmarks::BookmarkNode* node : model->GetNodesByURL(GURL(*url)))
      model->Remove(node, bookmarks::metrics::BookmarkEditSource::kOther, FROM_HERE);
  });
  ForEach(*plan, "retitle", [&](const base::DictValue& item) {
    const std::string* url = item.FindString("url");
    const std::string* title = item.FindString("title");
    const std::string* folder = item.FindString("folder");
    if (!url || !title) return;
    const auto* parent = FolderNamed(model, folder ? *folder : std::string());
    for (const bookmarks::BookmarkNode* node : model->GetNodesByURL(GURL(*url))) {
      model->SetTitle(node, base::UTF8ToUTF16(*title), bookmarks::metrics::BookmarkEditSource::kOther);
      if (node->parent() != parent) model->Move(node, parent, parent->children().size());
    }
  });
}

static jni_zero::ScopedJavaLocalRef<jstring> JNI_SyncBridge_CanonicalUrls(JNIEnv* env, const jni_zero::JavaRef<jstring>& urls_json) {
  base::ListValue out;
  if (auto urls = base::JSONReader::Read(base::android::ConvertJavaStringToUTF8(env, urls_json), base::JSON_PARSE_RFC); urls && urls->is_list()) {
    for (const base::Value& url : urls->GetList()) {
      GURL address(url.is_string() ? url.GetString() : std::string());
      out.Append(address.is_valid() ? address.spec() : std::string());
    }
  }
  return base::android::ConvertUTF8ToJavaString(env, base::WriteJson(out).value_or("[]"));
}

static void JNI_SyncBridge_SetStartData(JNIEnv* env, const jni_zero::JavaRef<jstring>& devices,
                                        const jni_zero::JavaRef<jstring>& sent) {
  auto read = [&](const jni_zero::JavaRef<jstring>& json) {
    auto value = base::JSONReader::Read(base::android::ConvertJavaStringToUTF8(env, json), base::JSON_PARSE_RFC);
    return value && value->is_list() ? std::move(value->GetList()) : base::ListValue();
  };
  StartLists().devices = read(devices);
  StartLists().sent = read(sent);
}

base::ListValue SyncRemoteDevices() {
  return StartLists().devices.Clone();
}

base::ListValue SyncSentItems() {
  return StartLists().sent.Clone();
}

static jboolean JNI_SyncBridge_BlockingEnabled(JNIEnv*) {
  return BlockingEnabled(MainProfile());
}
static void JNI_SyncBridge_SetBlockingEnabled(JNIEnv*, jboolean on) {
  SetBlockingEnabled(MainProfile(), on);
}

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

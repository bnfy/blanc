// Copyright 2026 Bananify Creative. MIT; see LICENSE.

// The launch ping's one request (LaunchPingBridge.java, the desktop fork's TelemetryPost): a POST of
// the JSON Java built, through the system network context (as sync_bridge.cc's requests), so the NetLog sees it. No
// cookies, no redirects, a 10 s timeout, the answer ignored. Java decides whether to send; this
// refuses any address but the Worker's production endpoint and, where test hooks are built, a
// loopback collector at http://127.0.0.1:<port>/ping or http://[::1]:<port>/ping.

#include <memory>
#include <string>

#include "base/android/jni_string.h"
#include "base/functional/bind.h"
#include "base/time/time.h"
#include "blanc/android/first_run_jni/LaunchPingBridge_jni.h"
#include "blanc/buildflags.h"
#include "chrome/browser/browser_process.h"
#include "chrome/browser/net/system_network_context_manager.h"
#include "net/http/http_response_headers.h"
#include "net/traffic_annotation/network_traffic_annotation.h"
#include "services/network/public/cpp/resource_request.h"
#include "services/network/public/cpp/shared_url_loader_factory.h"
#include "services/network/public/cpp/simple_url_loader.h"
#include "services/network/public/mojom/fetch_api.mojom-shared.h"
#include "url/gurl.h"

namespace blanc {
namespace {

constexpr char kEndpoint[] = "https://blanc-ping.bnfy-441.workers.dev/ping";

bool Allowed(const GURL& url) {
  if (url == GURL(kEndpoint)) return true;
#if BUILDFLAG(ENABLE_BLANC_TEST_HOOKS)
  return url.is_valid() && url.SchemeIs("http") &&
         (url.host() == "127.0.0.1" || url.host() == "[::1]") && url.has_port() &&
         !url.has_username() && !url.has_password() && !url.has_query() && !url.has_ref() &&
         url.path() == "/ping";
#else
  return false;
#endif
}

}  // namespace

static void JNI_LaunchPingBridge_Post(JNIEnv* env, const jni_zero::JavaRef<jstring>& java_url,
                                     const jni_zero::JavaRef<jstring>& java_json) {
  const GURL target(base::android::ConvertJavaStringToUTF8(env, java_url));
  const std::string json = base::android::ConvertJavaStringToUTF8(env, java_json);
  if (!Allowed(target) || !g_browser_process || !g_browser_process->system_network_context_manager()) return;
  auto request = std::make_unique<network::ResourceRequest>();
  request->url = target;
  request->method = "POST";
  request->credentials_mode = network::mojom::CredentialsMode::kOmit;
  request->redirect_mode = network::mojom::RedirectMode::kError;
  auto loader = network::SimpleURLLoader::Create(std::move(request),
      net::DefineNetworkTrafficAnnotation("blanc_android_launch_ping", R"(
        semantics { sender: "Blanc usage measurement"
          description: "Counts an app launch for Blanc's active-user figures."
          trigger: "A launch the person opened, once per app session, after they chose Measure usage."
          data: "A random install id and session id, app version, platform, architecture, OS major and phone or tablet."
          destination: OTHER destination_other: "Bananify's blanc-ping collector." }
        policy { cookies_allowed: NO setting: "Settings > Privacy > Measure usage."
          policy_exception_justification: "Blanc's own measurement, sent only with the person's consent." })"));
  loader->AttachStringForUpload(json, "application/json");
  loader->SetTimeoutDuration(base::Seconds(10));
  auto* pending = loader.get();
  pending->DownloadHeadersOnly(
      g_browser_process->system_network_context_manager()->GetSharedURLLoaderFactory().get(),
      base::BindOnce([](std::unique_ptr<network::SimpleURLLoader>,
                        scoped_refptr<net::HttpResponseHeaders>) {}, std::move(loader)));
}

}  // namespace blanc

DEFINE_JNI(LaunchPingBridge)

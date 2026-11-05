// Copyright 2026 Bananify Creative. MIT; see LICENSE.

#include "blanc/services/sync_runner/sync_runner_proxy.h"

#include <list>
#include <map>
#include <memory>

#include "base/check.h"
#include "base/command_line.h"
#include "base/containers/flat_map.h"
#include "base/files/file.h"
#include "base/files/file_enumerator.h"
#include "base/files/file_util.h"
#include "base/files/important_file_writer.h"
#include "base/functional/bind.h"
#include "base/json/json_reader.h"
#include "base/json/json_writer.h"
#include "base/logging.h"
#include "base/no_destructor.h"
#include "base/strings/string_number_conversions.h"
#include "base/strings/string_util.h"
#include "base/task/sequenced_task_runner.h"
#include "base/task/thread_pool.h"
#include "base/time/time.h"
#include "base/values.h"
#include "blanc/services/sync_runner/bundle_hash.h"
#include "blanc/services/sync_runner/sync_runner.mojom.h"
#include "build/build_config.h"
#include "content/public/browser/service_process_host.h"
#include "crypto/hash.h"
#include "mojo/public/cpp/bindings/receiver.h"
#include "mojo/public/cpp/bindings/remote.h"
#include "net/base/load_flags.h"
#include "net/base/net_errors.h"
#include "net/http/http_response_headers.h"
#include "net/traffic_annotation/network_traffic_annotation.h"
#include "services/network/public/cpp/resource_request.h"
#include "services/network/public/cpp/shared_url_loader_factory.h"
#include "services/network/public/cpp/simple_url_loader.h"
#include "services/network/public/mojom/url_response_head.mojom.h"
#include "url/gurl.h"
#include "url/origin.h"

#if BUILDFLAG(IS_ANDROID)
#include "base/android/apk_assets.h"
#endif

namespace blanc {
namespace {
constexpr size_t kMaxBody = 32 * 1024 * 1024;
// The Worker caps a blob at 512 KB; SimpleURLLoader allows 5 MB as a string.
constexpr size_t kMaxResponse = 4 * 1024 * 1024;
constexpr net::NetworkTrafficAnnotationTag kAnnotation = net::DefineNetworkTrafficAnnotation("blanc_sync", R"(
  semantics { sender: "Blanc Sync" description: "End-to-end encrypted sync with the person's other devices."
    trigger: "Sync is on." data: "Ciphertext only." destination: OTHER
    destination_other: "Blanc's sync Worker." }
  policy { cookies_allowed: NO setting: "Sync is off until the person turns it on."
    policy_exception_justification: "Not implemented." })");

SyncPlatform* g_platform = nullptr;

bool ValidStoreName(const std::string& name) {
  if (name.empty() || name.size() > 64 || !base::EndsWith(name, ".json")) return false;
  for (char c : name)
    if (!base::IsAsciiAlpha(c) && !base::IsAsciiDigit(c) && c != '-' && c != '.' && c != '_') return false;
  return name[0] != '.';
}

std::string ReadBundle() {
  std::string script;
#if BUILDFLAG(IS_ANDROID)
  base::MemoryMappedFile::Region region;
  const int fd = base::android::OpenApkAsset("assets/blanc_sync/sync-bundle.js", &region);
  if (fd < 0 || region.size > 16 * 1024 * 1024) return std::string();
  base::File file(fd);
  script.resize(region.size);
  if (!file.ReadAndCheck(region.offset, base::as_writable_byte_span(script))) return std::string();
#else
  auto path = base::CommandLine::ForCurrentProcess()->GetSwitchValuePath("blanc-sync-assets").AppendASCII("sync-bundle.js");
  if (!base::ReadFileToStringWithMaxSize(path, &script, 16 * 1024 * 1024)) return std::string();
#endif
  if (base::ToLowerASCII(base::HexEncode(crypto::hash::Sha256(script))) != kBlancSyncBundleSha256) return std::string();
  return script;
}

using Stores = base::flat_map<std::string, std::vector<uint8_t>>;
Stores ReadStores(base::FilePath dir) {
  Stores out;
  base::FileEnumerator files(dir, false, base::FileEnumerator::FILES, FILE_PATH_LITERAL("*.json"));
  for (auto path = files.Next(); !path.empty(); path = files.Next()) {
    std::string data;
    if (ValidStoreName(path.BaseName().MaybeAsASCII()) && base::ReadFileToStringWithMaxSize(path, &data, kMaxBody))
      out[path.BaseName().MaybeAsASCII()] = std::vector<uint8_t>(data.begin(), data.end());
  }
  return out;
}

class Runner : public mojom::SyncHost {
 public:
  static Runner& Get() { static base::NoDestructor<Runner> runner; return *runner; }
  Runner() = default;

  void Call(std::string method, std::string args, SyncCallback callback) {
    if (ready_) { service_->Call(method, args, std::move(callback)); return; }
    waiting_.push_back({std::move(method), std::move(args), std::move(callback)});
    if (!starting_) Start();
  }

  // mojom::SyncHost
  void Fetch(const std::string& url, const std::string& method, const std::string& headers_json,
             const std::optional<std::vector<uint8_t>>& body, FetchCallback callback) override {
    GURL target(url);
    if (!target.is_valid() || !url::Origin::Create(target).IsSameOriginWith(GURL(g_platform->Endpoint()))) {
      std::move(callback).Run("refused", 0, "{}", {});
      return;
    }
    auto request = std::make_unique<network::ResourceRequest>();
    request->url = target;
    request->method = method;
    request->credentials_mode = network::mojom::CredentialsMode::kOmit;
    request->load_flags = net::LOAD_DISABLE_CACHE;
    std::string content_type = "application/octet-stream";
    if (auto parsed = base::JSONReader::ReadDict(headers_json, base::JSON_PARSE_RFC)) {
      for (auto [name, value] : *parsed) {
        if (!value.is_string()) continue;
        if (base::EqualsCaseInsensitiveASCII(name, "content-type")) content_type = value.GetString();
        else request->headers.SetHeader(name, value.GetString());
      }
    }
    auto loader = network::SimpleURLLoader::Create(std::move(request), kAnnotation);
    loader->SetAllowHttpErrorResults(true);
    if (body) loader->AttachStringForUpload(std::string(body->begin(), body->end()), content_type);
    auto* raw = loader.get();
    auto it = loaders_.insert(loaders_.end(), std::move(loader));
    raw->DownloadToString(g_platform->UrlLoaderFactory().get(),
        base::BindOnce(&Runner::Fetched, base::Unretained(this), it, std::move(callback)), kMaxResponse);
  }
  void WriteStore(const std::string& name, const std::vector<uint8_t>& data) override {
    if (!ValidStoreName(name) || data.size() > kMaxBody) return;
    writer_->PostTask(FROM_HERE, base::BindOnce([](base::FilePath path, std::vector<uint8_t> data) {
      base::CreateDirectory(path.DirName());
      if (!base::ImportantFileWriter::WriteFileAtomically(path, std::string(data.begin(), data.end())))
        LOG(ERROR) << "sync: could not write " << path.BaseName();
    }, g_platform->StoreDir().AppendASCII(name), data));
  }
  void Protect(const std::vector<uint8_t>& data, ProtectCallback callback) override {
    std::move(callback).Run(g_platform->Protect(data));
  }
  void Unprotect(const std::vector<uint8_t>& data, UnprotectCallback callback) override {
    std::move(callback).Run(g_platform->Unprotect(data));
  }
  void Emit(const std::string& event, const std::string& json) override {
    g_platform->OnEvent(event, json);
  }

 private:
  struct Waiting { std::string method, args; SyncCallback callback; };
  using Loaders = std::list<std::unique_ptr<network::SimpleURLLoader>>;

  void Fetched(Loaders::iterator it, FetchCallback callback, std::optional<std::string> body) {
    auto loader = std::move(*it);
    loaders_.erase(it);
    const auto* head = loader->ResponseInfo();
    if (!head || !head->headers) {
      std::move(callback).Run(net::ErrorToString(loader->NetError()), 0, "{}", {});
      return;
    }
    base::DictValue headers;
    size_t iter = 0;
    std::string name, value;
    while (head->headers->EnumerateHeaderLines(&iter, &name, &value)) headers.Set(base::ToLowerASCII(name), value);
    std::string text = body.value_or("");
    std::move(callback).Run("", head->headers->response_code(), base::WriteJson(headers).value_or("{}"),
                            std::vector<uint8_t>(text.begin(), text.end()));
  }

  void Start() {
    CHECK(g_platform);
    starting_ = true;
    base::ThreadPool::PostTaskAndReplyWithResult(FROM_HERE, {base::MayBlock()},
        base::BindOnce([](base::FilePath dir) { return std::make_pair(ReadBundle(), ReadStores(dir)); }, g_platform->StoreDir()),
        base::BindOnce(&Runner::Loaded, base::Unretained(this)));
  }
  void Loaded(std::pair<std::string, Stores> loaded) {
    if (loaded.first.empty()) { Fail("bundle"); return; }
    service_ = content::ServiceProcessHost::Launch<mojom::SyncRunner>(
        content::ServiceProcessHost::Options().WithDisplayName("Blanc Sync").Pass());
    service_.set_disconnect_handler(base::BindOnce(&Runner::Ended, base::Unretained(this)));
    host_.reset();
    service_->Start(loaded.first, loaded.second, g_platform->ConfigJson(), host_.BindNewPipeAndPassRemote(),
                    base::BindOnce(&Runner::Started, base::Unretained(this)));
  }
  void Started(bool ready) {
    if (!ready) { Fail("start"); return; }
    ready_ = true;
    starting_ = false;
    auto pending = std::move(waiting_);
    for (auto& call : pending) service_->Call(call.method, call.args, std::move(call.callback));
  }
  void Ended() {
    service_.reset();
    ready_ = false;
    starting_ = false;
    if (!waiting_.empty()) Start();
  }
  void Fail(const char* why) {
    LOG(ERROR) << "sync: runner failed: " << why;
    starting_ = false;
    auto pending = std::move(waiting_);
    for (auto& call : pending) std::move(call.callback).Run(false, why);
  }

  mojo::Remote<mojom::SyncRunner> service_;
  mojo::Receiver<mojom::SyncHost> host_{this};
  bool ready_ = false, starting_ = false;
  std::list<Waiting> waiting_;
  Loaders loaders_;
  scoped_refptr<base::SequencedTaskRunner> writer_ = base::ThreadPool::CreateSequencedTaskRunner(
      {base::MayBlock(), base::TaskShutdownBehavior::BLOCK_SHUTDOWN});
};
}  // namespace

void SetSyncPlatform(SyncPlatform* platform) { g_platform = platform; }
void SyncCall(std::string method, std::string args_json, SyncCallback callback) {
  Runner::Get().Call(std::move(method), std::move(args_json), std::move(callback));
}
}  // namespace blanc

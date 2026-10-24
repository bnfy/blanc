#include "content/public/common/blanc_research_build.h"
#include "content/public/browser/browser_context.h"
#include "base/command_line.h"
#include "base/files/file_util.h"
#include "base/json/json_writer.h"
#include "base/no_destructor.h"
#include "base/strings/string_number_conversions.h"
#include "base/task/thread_pool.h"
#include "base/unguessable_token.h"
#include "base/trace_event/trace_event.h"
#include "services/network/public/cpp/self_deleting_url_loader_factory.h"
#include "services/network/public/cpp/wrapper_shared_url_loader_factory.h"
// Opt-in disposable-profile diagnostics. No URL, ordering or time-based join.
#include "services/network/public/cpp/resource_request.h"
#include "third_party/blink/public/common/storage_key/storage_key.h"
namespace {
#if BLANC_RESEARCH_HOOKS
void BlancUpdateIdentity(network::ResourceRequest& request, int64_t registration,
                         int64_t version, const GURL& scope,
                         const blink::StorageKey& storage_key, bool private_profile,
                         bool main_script) {
  // Refuse private data before creating an identity or inspecting its URL.
  if (private_profile) return;
  const auto file = base::CommandLine::ForCurrentProcess()->GetSwitchValuePath("blanc-worker-update-log");
  if (file.empty() || registration < 0 || version < 0) return;
  const auto token = "blanc-sw-update/" + base::UnguessableToken::Create().ToString();
  if (request.devtools_request_id.has_value()) return;
  request.devtools_request_id = token;
  base::DictValue row;
  row.Set("token", token); row.Set("registrationId", base::NumberToString(registration));
  row.Set("versionId", base::NumberToString(version)); row.Set("scope", scope.spec());
  row.Set("url", request.url.spec()); row.Set("storageKey", storage_key.Serialize());
  row.Set("private", private_profile); row.Set("mainScript", main_script);
  auto line = base::WriteJson(row); if (!line) return;
  static base::NoDestructor<scoped_refptr<base::SequencedTaskRunner>> writer(
      base::ThreadPool::CreateSequencedTaskRunner({base::MayBlock(), base::TaskShutdownBehavior::BLOCK_SHUTDOWN}));
  (*writer)->PostTask(FROM_HERE, base::BindOnce([](base::FilePath path, std::string value) {
    base::AppendToFile(path, value);
  }, file, *line + "\n"));
}

class BlancUpdateProxy : public network::SelfDeletingURLLoaderFactory {
 public:
  BlancUpdateProxy(mojo::PendingReceiver<network::mojom::URLLoaderFactory> receiver,
      scoped_refptr<network::SharedURLLoaderFactory> target, int64_t registration,
      int64_t version, GURL scope, blink::StorageKey key, bool private_profile,
      bool main_script, base::SelfDeletingPassKey pass);
  void CreateLoaderAndStart(mojo::PendingReceiver<network::mojom::URLLoader> receiver,
      int32_t id, uint32_t options, const network::ResourceRequest& request,
      mojo::PendingRemote<network::mojom::URLLoaderClient> client,
      const net::MutableNetworkTrafficAnnotationTag& annotation) override;
 private:
  ~BlancUpdateProxy() override;
  scoped_refptr<network::SharedURLLoaderFactory> target_;
  int64_t registration_, version_;
  GURL scope_;
  blink::StorageKey key_;
  bool private_, main_;
};
BlancUpdateProxy::BlancUpdateProxy(mojo::PendingReceiver<network::mojom::URLLoaderFactory> receiver,
    scoped_refptr<network::SharedURLLoaderFactory> target, int64_t registration,
    int64_t version, GURL scope, blink::StorageKey key, bool private_profile,
    bool main_script, base::SelfDeletingPassKey pass)
    : SelfDeletingURLLoaderFactory(std::move(receiver), pass), target_(std::move(target)),
      registration_(registration), version_(version), scope_(scope), key_(key),
      private_(private_profile), main_(main_script) {}
BlancUpdateProxy::~BlancUpdateProxy() = default;
void BlancUpdateProxy::CreateLoaderAndStart(mojo::PendingReceiver<network::mojom::URLLoader> receiver,
    int32_t id, uint32_t options, const network::ResourceRequest& request,
    mojo::PendingRemote<network::mojom::URLLoaderClient> client,
    const net::MutableNetworkTrafficAnnotationTag& annotation) {
  network::ResourceRequest tagged(request);
  BlancUpdateIdentity(tagged, registration_, version_, scope_, key_, private_, main_);
  target_->CreateLoaderAndStart(std::move(receiver), id, options, tagged, std::move(client), annotation);
}
scoped_refptr<network::SharedURLLoaderFactory> BlancUpdateFactory(
    scoped_refptr<network::SharedURLLoaderFactory> target, int64_t registration,
    int64_t version, GURL scope, blink::StorageKey key, bool private_profile,
    bool main_script) {
  if (private_profile || !base::CommandLine::ForCurrentProcess()->HasSwitch("blanc-worker-update-log")) return target;
  mojo::PendingRemote<network::mojom::URLLoaderFactory> remote;
  base::MakeSelfDeleting<BlancUpdateProxy>(remote.InitWithNewPipeAndPassReceiver(),
      target, registration, version, scope, key, private_profile, main_script);
  return base::MakeRefCounted<network::WrapperSharedURLLoaderFactory>(std::move(remote));
}
#else
// Opt-in DevTools tracing carries opaque join keys only. No file writer, URL,
// scope or storage key is used, including for private contexts.
class BlancTraceUpdateProxy : public network::SelfDeletingURLLoaderFactory {
 public:
  BlancTraceUpdateProxy(
      mojo::PendingReceiver<network::mojom::URLLoaderFactory> receiver,
      scoped_refptr<network::SharedURLLoaderFactory> target,
      int64_t registration, int64_t version, bool private_profile, bool main_script,
      base::SelfDeletingPassKey pass);
  void CreateLoaderAndStart(
      mojo::PendingReceiver<network::mojom::URLLoader> receiver, int32_t id,
      uint32_t options, const network::ResourceRequest& request,
      mojo::PendingRemote<network::mojom::URLLoaderClient> client,
      const net::MutableNetworkTrafficAnnotationTag& annotation) override;
 private:
  ~BlancTraceUpdateProxy() override;
  scoped_refptr<network::SharedURLLoaderFactory> target_;
  int64_t registration_, version_;
  bool private_, main_script_;
};
BlancTraceUpdateProxy::BlancTraceUpdateProxy(
    mojo::PendingReceiver<network::mojom::URLLoaderFactory> receiver,
    scoped_refptr<network::SharedURLLoaderFactory> target,
    int64_t registration, int64_t version, bool private_profile, bool main_script,
    base::SelfDeletingPassKey pass)
    : SelfDeletingURLLoaderFactory(std::move(receiver), pass),
      target_(std::move(target)), registration_(registration),
      version_(version), private_(private_profile), main_script_(main_script) {}
BlancTraceUpdateProxy::~BlancTraceUpdateProxy() = default;
void BlancTraceUpdateProxy::CreateLoaderAndStart(
    mojo::PendingReceiver<network::mojom::URLLoader> receiver, int32_t id,
    uint32_t options, const network::ResourceRequest& request,
    mojo::PendingRemote<network::mojom::URLLoaderClient> client,
    const net::MutableNetworkTrafficAnnotationTag& annotation) {
  const perfetto::DynamicCategory category("disabled-by-default-blanc.attribution");
  bool tracing = false;
  TRACE_EVENT_CATEGORY_GROUP_ENABLED(category, &tracing);
  if (!tracing || request.devtools_request_id.has_value()) {
    target_->CreateLoaderAndStart(std::move(receiver), id, options, request,
                                 std::move(client), annotation);
    return;
  }
  network::ResourceRequest tagged(request);
  tagged.devtools_request_id =
      "blanc-trace-update/" + base::UnguessableToken::Create().ToString();
  TRACE_EVENT_INSTANT(category, "Blanc.ServiceWorkerUpdateRequest",
                      "request_token", *tagged.devtools_request_id,
                      "registration_id", registration_,
                      "version_id", version_, "private", private_,
                      "main_script", main_script_);
  target_->CreateLoaderAndStart(std::move(receiver), id, options, tagged,
                               std::move(client), annotation);
}
scoped_refptr<network::SharedURLLoaderFactory> BlancUpdateFactory(
    scoped_refptr<network::SharedURLLoaderFactory> target, int64_t registration,
    int64_t version, GURL, blink::StorageKey, bool private_profile, bool main_script) {
  const perfetto::DynamicCategory category("disabled-by-default-blanc.attribution");
  bool tracing = false;
  TRACE_EVENT_CATEGORY_GROUP_ENABLED(
      category, &tracing);
  if (!tracing || registration < 0 || version < 0) return target;
  mojo::PendingRemote<network::mojom::URLLoaderFactory> remote;
  base::MakeSelfDeleting<BlancTraceUpdateProxy>(
      remote.InitWithNewPipeAndPassReceiver(), target, registration, version,
      private_profile, main_script);
  return base::MakeRefCounted<network::WrapperSharedURLLoaderFactory>(
      std::move(remote));
}
#endif
}

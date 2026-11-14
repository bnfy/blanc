#include "blob_transport.h"
#include <algorithm>
#include "base/check.h"
#include "base/functional/bind.h"
#include "base/location.h"
#include "base/time/time.h"
#include "net/base/load_flags.h"
#include "net/base/net_errors.h"
#include "net/http/http_response_headers.h"
#include "net/traffic_annotation/network_traffic_annotation.h"
#include "services/network/public/cpp/resource_request.h"
#include "services/network/public/cpp/simple_url_loader.h"
#include "services/network/public/mojom/url_response_head.mojom.h"
#include "url/gurl.h"
namespace blanc::sync {
namespace {
constexpr char kEndpoint[] = "https://blanc-sync.bnfy-441.workers.dev";
constexpr size_t kMaxUpload = 524288, kMaxResponse = 1024 * 1024;
bool HexAccount(const std::string& s) {
  return s.size() == 64 && std::ranges::all_of(s, [](char c) {
    return (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f');
  });
}
bool Space(const std::string& s) {
  return s.starts_with("space-") && s.size() == 38 &&
      std::ranges::all_of(s.substr(6), [](char c) {
        return (c >= 'a' && c <= 'f') || (c >= '0' && c <= '9');
      });
}
bool Store(const std::string& s) {
  return s == "bookmarks" || s == "settings" || s == "session" ||
      s == "icons" || s == "sends" || s == "spaces" || s == "closed" ||
      s == "shared" || Space(s);
}
}  // namespace
std::optional<std::string> BlobTransport::PathFor(const Request& r) {
  if (r.deadline != Deadline::kNormal && r.deadline != Deadline::kDeparture) return {};
  if (r.deadline == Deadline::kDeparture && r.method != Method::kGet &&
      r.method != Method::kPut) return {};
  if (r.method != Method::kGet && r.method != Method::kPut &&
      r.method != Method::kDeleteAccount && r.method != Method::kDeleteSpace) return {};
  if (!HexAccount(r.account) || r.body.size() > kMaxUpload) return {};
  if (r.method == Method::kDeleteAccount) {
    if (!r.store.empty() || !r.body.empty()) return {};
    return "/v1/blob/" + r.account;
  }
  if (!Store(r.store)) return {};
  if (r.method != Method::kPut && !r.body.empty()) return {};
  if (r.method == Method::kPut && r.body.empty()) return {};
  if (r.method == Method::kDeleteSpace && !Space(r.store)) return {};
  return "/v1/blob/" + r.account + "/" + r.store;
}
BlobTransport::BlobTransport(scoped_refptr<network::SharedURLLoaderFactory> factory)
    : factory_(std::move(factory)), runner_(base::SequencedTaskRunner::GetCurrentDefault()) {
  CHECK(factory_);
}
BlobTransport::~BlobTransport() { Cancel(); }
void BlobTransport::Post(Completed done, Response response) {
  CHECK(runner_->PostTask(FROM_HERE, base::BindOnce(
      [](auto generation, uint64_t expected, Completed done, Response response) {
        if (generation->load() != expected) {
          response = {}; response.net_error = net::ERR_ABORTED;
          response.error = "cancelled";
        }
        std::move(done).Run(std::move(response));
      }, generation_, generation_->load(), std::move(done), std::move(response))));
}
void BlobTransport::Start(Request r, Completed done) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_); CHECK(done);
  const auto path = PathFor(r);
  if (!path || loader_) {
    Response response; response.error = path ? "busy" : "invalid";
    Post(std::move(done), std::move(response)); return;
  }
  // Old Workers treated even store-suffixed DELETE as an account wipe. A
  // positive capability from a successful GET for this account is mandatory.
  if (r.account != capability_account_) space_delete_supported_ = false;
  if (r.method == Method::kDeleteSpace && !space_delete_supported_) {
    Response response; response.error = "space-delete-unsupported";
    Post(std::move(done), std::move(response)); return;
  }
  active_account_ = r.account; active_get_ = r.method == Method::kGet;
  auto request = std::make_unique<network::ResourceRequest>();
  request->url = GURL(std::string(kEndpoint) + *path);
  request->method = r.method == Method::kGet ? "GET" : r.method == Method::kPut ? "PUT" : "DELETE";
  request->credentials_mode = network::mojom::CredentialsMode::kOmit;
  request->redirect_mode = network::mojom::RedirectMode::kError;
  request->load_flags = net::LOAD_DISABLE_CACHE | net::LOAD_BYPASS_CACHE;
  constexpr auto annotation = net::DefineNetworkTrafficAnnotation("blanc_profile_sync_blob", R"(
    semantics {
      sender: "Blanc encrypted profile sync"
      description: "Transfers end-to-end encrypted Personal profile records to the Blanc sync service."
      trigger: "User enables sync or explicitly erases their remote account."
      data: "Opaque derived account locator, encrypted record, optimistic version. No plaintext profile or encryption key."
      destination: OTHER
      destination_other: "Blanc sync service at blanc-sync.bnfy-441.workers.dev"
    }
    policy {
      cookies_allowed: NO
      setting: "Blanc Sync is opt-in and can be disabled in Settings."
      policy_exception_justification: "Not implemented."
    })");
  loader_ = network::SimpleURLLoader::Create(std::move(request), annotation);
  // Also stop redirects at the loader callback: do not rely solely on the
  // factory enforcing ResourceRequest::redirect_mode.
  loader_->SetOnRedirectCallback(base::BindRepeating(
      [](base::WeakPtr<BlobTransport> self, const GURL&,
         const net::RedirectInfo&, const network::mojom::URLResponseHead&,
         std::vector<std::string>*) {
        if (!self) return;
        auto done = std::move(self->pending_);
        self->loader_.reset(); self->space_delete_supported_ = false;
        self->capability_account_.clear();
        Response response; response.net_error = net::ERR_UNSAFE_REDIRECT;
        response.error = "redirect-refused";
        self->Post(std::move(done), std::move(response));
      }, weak_factory_.GetWeakPtr()));
  loader_->SetAllowHttpErrorResults(true);
  loader_->SetTimeoutDuration(base::Seconds(r.deadline == Deadline::kDeparture ? 5 : 30));
  if (r.method == Method::kPut) loader_->AttachStringForUpload(std::move(r.body), "application/json");
  pending_ = std::move(done);
  loader_->DownloadToString(factory_.get(), base::BindOnce(
      &BlobTransport::Finished, weak_factory_.GetWeakPtr()), kMaxResponse);
}
void BlobTransport::Finished(std::optional<std::string> body) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  Response response; response.net_error = loader_->NetError();
  if (const auto* info = loader_->ResponseInfo(); info && info->headers) {
    response.status = info->headers->response_code();
    response.space_delete_supported = info->headers->GetNormalizedHeader("X-Blanc-Space-Delete") == "1";
  }
  if (active_get_) {
    capability_account_ = active_account_;
    space_delete_supported_ = response.net_error == net::OK &&
        (response.status == 200 || response.status == 404) && response.space_delete_supported;
  }
  if (body) response.body = std::move(*body);
  else response.error = "network-or-body-limit";
  auto done = std::move(pending_); loader_.reset();
  Post(std::move(done), std::move(response));
}
void BlobTransport::Cancel() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  generation_->fetch_add(1);
  weak_factory_.InvalidateWeakPtrs(); loader_.reset();
  space_delete_supported_ = false; capability_account_.clear(); active_account_.clear();
  if (pending_) {
    Response response; response.net_error = net::ERR_ABORTED; response.error = "cancelled";
    Post(std::move(pending_), std::move(response));
  }
}
}  // namespace blanc::sync

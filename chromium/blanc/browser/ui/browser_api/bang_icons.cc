// Copyright 2026 Bananify Creative. MIT; see the Blanc repository LICENSE.
#include "blanc/browser/ui/browser_api/bang_icons.h"

#include <algorithm>
#include <utility>

#include "base/base64.h"
#include "base/command_line.h"
#include "base/files/file_util.h"
#include "base/files/important_file_writer.h"
#include "base/functional/bind.h"
#include "base/json/json_reader.h"
#include "base/json/json_writer.h"
#include "base/no_destructor.h"
#include "base/strings/string_util.h"
#include "base/task/sequenced_task_runner.h"
#include "base/task/thread_pool.h"
#include "base/time/time.h"
#include "blanc/island_resources/island_resources.h"
#include "chrome/browser/profiles/profile.h"
#include "content/public/browser/storage_partition.h"
#include "net/http/http_response_headers.h"
#include "net/traffic_annotation/network_traffic_annotation.h"
#include "services/data_decoder/public/cpp/decode_image.h"
#include "services/network/public/cpp/resource_request.h"
#include "services/network/public/cpp/simple_url_loader.h"
#include "services/network/public/mojom/url_response_head.mojom.h"
#include "skia/ext/image_operations.h"
#include "third_party/skia/include/core/SkBitmap.h"
#include "third_party/skia/include/core/SkCanvas.h"
#include "third_party/skia/include/core/SkImage.h"
#include "ui/gfx/codec/png_codec.h"
#include "ui/gfx/geometry/size.h"

namespace blanc::browser_api::bang_icons {
namespace {

constexpr char kUserDataKey[] = "blanc-bang-icons";
constexpr base::FilePath::CharType kStoreFile[] = FILE_PATH_LITERAL("Blanc Bang Icons.json");
constexpr char kPngPrefix[] = "data:image/png;base64,";
// tabicons-model.js: an icon source of at most 256 KB; a kept icon of at most
// 8 KB of data URL.
constexpr size_t kMaxSourceBytes = 256 * 1024;
constexpr size_t kMaxIconData = 8192;
constexpr int kIconSize = 32;

double Now() { return base::Time::Now().InMillisecondsFSinceUnixEpoch(); }

bool ValidIcon(const std::string& icon) {
  if (icon.size() > kMaxIconData || !icon.starts_with(kPngPrefix)) return false;
  std::string bytes;
  return base::Base64Decode(std::string_view(icon).substr(sizeof(kPngPrefix) - 1), &bytes) &&
         bytes.starts_with(std::string_view("\x89PNG\r\n\x1a\n", 8));
}

std::vector<Record> ReadStore(const base::FilePath& path) {
  std::vector<Record> records;
  std::string text;
  if (!base::ReadFileToStringWithMaxSize(path, &text, 4 * 1024 * 1024)) return records;
  auto value = base::JSONReader::Read(text, base::JSON_PARSE_RFC);
  const base::ListValue* list = value && value->is_dict() ? value->GetDict().FindList("records") : nullptr;
  if (!list) return records;
  for (const auto& item : *list) {
    if (!item.is_dict()) continue;
    const auto& dict = item.GetDict();
    const std::string* host = dict.FindString("host");
    const std::string* icon = dict.FindString("icon");
    if (!host || host->empty() || !icon || !ValidIcon(*icon)) continue;
    records.push_back({*host, *icon, dict.FindDouble("fetchedAt"), dict.FindDouble("usedAt").value_or(0)});
    if (records.size() >= kStoreCap) break;
  }
  return records;
}

std::set<std::string> CatalogHosts() {
  std::set<std::string> hosts;
  auto bytes = blanc::island_resources::Find("pages/bangs-catalog.js");
  if (!bytes) return hosts;
  auto array = CatalogArray(base::as_string_view(*bytes));
  if (!array) return hosts;
  auto value = base::JSONReader::Read(*array, base::JSON_ALLOW_TRAILING_COMMAS);
  if (!value || !value->is_list()) return hosts;
  for (const auto& entry : value->GetList()) {
    if (!entry.is_list() || entry.GetList().size() < 4 || !entry.GetList()[3].is_string()) continue;
    const std::string& host = entry.GetList()[3].GetString();
    if (!host.empty()) hosts.insert(base::ToLowerASCII(host));
  }
  return hosts;
}

// Shipping's squarePngData: the image fitted into a transparent 32 px square.
std::optional<std::string> SquarePng(const SkBitmap& source) {
  if (source.drawsNothing() || source.width() <= 0 || source.height() <= 0) return std::nullopt;
  const int longest = std::max(source.width(), source.height());
  const int width = std::max(1, source.width() * kIconSize / longest);
  const int height = std::max(1, source.height() * kIconSize / longest);
  SkBitmap scaled = skia::ImageOperations::Resize(source, skia::ImageOperations::RESIZE_BEST, width, height);
  SkBitmap square;
  if (!square.tryAllocN32Pixels(kIconSize, kIconSize)) return std::nullopt;
  square.eraseColor(SK_ColorTRANSPARENT);
  SkCanvas canvas(square);
  canvas.drawImage(scaled.asImage(), (kIconSize - width) / 2, (kIconSize - height) / 2);
  auto png = gfx::PNGCodec::EncodeBGRASkBitmap(square, /*discard_transparency=*/false);
  if (!png) return std::nullopt;
  std::string icon = kPngPrefix + base::Base64Encode(*png);
  return ValidIcon(icon) ? std::optional<std::string>(std::move(icon)) : std::nullopt;
}

scoped_refptr<base::SequencedTaskRunner> StoreRunner() {
  static base::NoDestructor<scoped_refptr<base::SequencedTaskRunner>> runner(
      base::ThreadPool::CreateSequencedTaskRunner(
          {base::MayBlock(), base::TaskPriority::BEST_EFFORT, base::TaskShutdownBehavior::BLOCK_SHUTDOWN}));
  return *runner;
}

}  // namespace

Service* Service::ForProfile(Profile* profile) {
  if (!profile) return nullptr;
  profile = profile->GetOriginalProfile();
  auto* service = static_cast<Service*>(profile->GetUserData(kUserDataKey));
  if (!service) {
    auto owned = std::make_unique<Service>(profile);
    service = owned.get();
    profile->SetUserData(kUserDataKey, std::move(owned));
  }
  return service;
}

Service::Service(Profile* profile)
    : profile_(profile), store_path_(profile->GetPath().Append(kStoreFile)) {
  StoreRunner()->PostTaskAndReplyWithResult(FROM_HERE, base::BindOnce(&ReadStore, store_path_),
      base::BindOnce(&Service::OnStoreLoaded, weak_factory_.GetWeakPtr()));
  base::ThreadPool::PostTaskAndReplyWithResult(FROM_HERE, {base::TaskPriority::USER_VISIBLE},
      base::BindOnce(&CatalogHosts), base::BindOnce(&Service::OnCatalogLoaded, weak_factory_.GetWeakPtr()));
}

Service::~Service() = default;

void Service::AddObserver(Observer* observer) { observers_.AddObserver(observer); }
void Service::RemoveObserver(Observer* observer) { observers_.RemoveObserver(observer); }

void Service::OnStoreLoaded(std::vector<Record> records) {
  // A fetch that finished first wins; the file adds what is not held yet.
  for (auto& record : records)
    if (!Find(record.host) && records_.size() < kStoreCap) records_.push_back(std::move(record));
}

void Service::OnCatalogLoaded(std::set<std::string> hosts) { catalog_hosts_ = std::move(hosts); }

const Record* Service::Find(const std::string& host) const {
  auto it = std::ranges::find(records_, host, &Record::host);
  return it == records_.end() ? nullptr : &*it;
}

std::optional<std::string> Service::Held(const std::string& host) const {
  const Record* record = Find(host);
  return record ? std::optional<std::string>(record->icon) : std::nullopt;
}

void Service::Request(const std::vector<std::string>& hosts, bool enabled, bool private_active,
                      const std::set<std::string>& custom_hosts) {
  // There is no first-run setup in the fork yet, so setup counts as saved.
  for (const auto& host : hosts) {
    if (!MayFetch(host, enabled, /*setup_complete=*/true, private_active, catalog_hosts_, custom_hosts,
                  Find(host), run_, Now())) continue;
    run_.Started(host);
    queue_.push_back(host);
  }
  Pump();
}

void Service::Touch(const std::vector<std::string>& hosts) {
  std::vector<std::string> held;
  for (const auto& host : hosts)
    if (Find(host)) held.push_back(host);
  if (!held.empty()) SetRecords(TouchRecords(records_, held, Now()));
}

void Service::NoteShown(const std::string& host) { shown_.insert(host); }

void Service::Clear() {
  generation_ += 1;
  // Queued hosts never started: release them so they can be asked again.
  for (const auto& host : queue_) run_.Finished(host, Outcome::kOk, Now());
  queue_.clear();
  SetRecords({});
  const std::set<std::string> shown = std::move(shown_);
  shown_.clear();
  for (const auto& host : shown) Emit(host, std::nullopt);
}

void Service::Pump() {
  while (active_ < kMaxInFlight && !queue_.empty()) {
    const std::string host = queue_.front();
    queue_.pop_front();
    active_ += 1;
    Fetch(host);
  }
}

bool Service::TestMode() const {
#if BUILDFLAG(ENABLE_BLANC_TEST_HOOKS)
  return base::CommandLine::ForCurrentProcess()->HasSwitch("blanc-test");
#else
  return false;
#endif
}

void Service::Fetch(const std::string& host) {
  const uint64_t generation = generation_;
#if BUILDFLAG(ENABLE_BLANC_TEST_HOOKS)
  if (TestMode()) {
    // Offline under the test hook, as shipping's acceptance run is: the stub
    // answers with shipping's 1×1 PNG or a 404; anything else fails.
    requested_.push_back(host);
    const auto answer = test_answers_.find(host);
    int status = 0;
    std::optional<std::string> body;
    if (answer != test_answers_.end() && answer->second == "png") {
      status = 200;
      body.emplace();
      base::Base64Decode(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==", &*body);
    } else if (answer != test_answers_.end() && answer->second == "not-found") {
      status = 404;
    }
    base::SequencedTaskRunner::GetCurrentDefault()->PostTask(FROM_HERE,
        base::BindOnce(&Service::OnFetched, weak_factory_.GetWeakPtr(), host, generation, status, std::move(body)));
    return;
  }
#endif
  auto request = std::make_unique<network::ResourceRequest>();
  request->url = GURL(IconUrl(host));
  request->credentials_mode = network::mojom::CredentialsMode::kOmit;
  request->redirect_mode = network::mojom::RedirectMode::kError;
  auto loader = network::SimpleURLLoader::Create(std::move(request),
      net::DefineNetworkTrafficAnnotation("blanc_bang_icons", R"(
        semantics { sender: "Blanc bang picker"
          description: "Asks Blanc's icon server for the icon of a site in the bundled bang list."
          trigger: "A bang row stays on screen in the address bar's picker, in a normal tab, with bangs on."
          data: "The site's host name from the bundled list; never a custom bang's site; no cookies."
          destination: OTHER }
        policy { cookies_allowed: NO setting: "Settings > General > Bangs."
          policy_exception_justification: "Shipping Blanc's bang icons, ported." })"));
  loader->SetTimeoutDuration(base::Milliseconds(kFetchTimeoutMs));
  loader->SetAllowHttpErrorResults(true);
  auto* pending = loader.get();
  loaders_[host] = std::move(loader);
  pending->DownloadToString(
      profile_->GetDefaultStoragePartition()->GetURLLoaderFactoryForBrowserProcess().get(),
      base::BindOnce(
          [](base::WeakPtr<Service> self, std::string host, uint64_t generation, std::optional<std::string> body) {
            if (!self) return;
            auto it = self->loaders_.find(host);
            int status = 0;
            if (it != self->loaders_.end()) {
              const auto* head = it->second->ResponseInfo();
              status = head && head->headers ? head->headers->response_code() : 0;
              self->loaders_.erase(it);
            }
            self->OnFetched(host, generation, status, std::move(body));
          },
          weak_factory_.GetWeakPtr(), host, generation),
      kMaxSourceBytes);
}

void Service::OnFetched(const std::string& host, uint64_t generation, int status,
                        std::optional<std::string> body) {
  if (status >= 200 && status < 300 && body && !body->empty()) {
    data_decoder::DecodeImageIsolated(base::as_byte_span(*body), data_decoder::mojom::ImageCodec::kDefault,
        /*shrink_to_fit=*/false, /*max_size_in_bytes=*/16 * 1024 * 1024, gfx::Size(kIconSize, kIconSize),
        base::BindOnce(&Service::OnDecoded, weak_factory_.GetWeakPtr(), host, generation));
    return;
  }
  if (status == 404 || status == 410) {
    if (generation == generation_) {
      if (Find(host)) SetRecords(DropRecord(records_, host));
      Emit(host, std::nullopt);
    }
    Finish(host, Outcome::kNotFound);
    return;
  }
  Finish(host, Outcome::kFailed);
}

void Service::OnDecoded(const std::string& host, uint64_t generation, const SkBitmap& bitmap) {
  auto icon = SquarePng(bitmap);
  if (!icon) {
    Finish(host, Outcome::kFailed);
    return;
  }
  if (generation == generation_) {
    SetRecords(PutRecord(records_, host, *icon, Now()));
    Emit(host, *icon);
  }
  Finish(host, Outcome::kOk);
}

void Service::Finish(const std::string& host, Outcome outcome) {
  run_.Finished(host, outcome, Now());
  active_ -= 1;
  Pump();
}

void Service::Emit(const std::string& host, const std::optional<std::string>& icon) {
  if (icon) shown_.insert(host);
  for (auto& observer : observers_) observer.OnBangIconChanged(host, icon);
}

void Service::SetRecords(std::vector<Record> records) {
  records_ = std::move(records);
  base::ListValue list;
  for (const auto& record : records_) {
    base::DictValue item;
    item.Set("host", record.host);
    item.Set("icon", record.icon);
    item.Set("usedAt", record.used_at);
    if (record.fetched_at) item.Set("fetchedAt", *record.fetched_at);
    list.Append(std::move(item));
  }
  std::string text;
  base::JSONWriter::Write(base::DictValue().Set("records", std::move(list)), &text);
  StoreRunner()->PostTask(FROM_HERE, base::BindOnce(
      [](base::FilePath path, std::string text) { base::ImportantFileWriter::WriteFileAtomically(path, text); },
      store_path_, std::move(text)));
}

#if BUILDFLAG(ENABLE_BLANC_TEST_HOOKS)
void Service::SetTestServer(std::map<std::string, std::string> answers) { test_answers_ = std::move(answers); }

std::vector<std::string> Service::StoredHosts() const {
  std::vector<std::string> hosts;
  for (const auto& record : records_) hosts.push_back(record.host);
  return hosts;
}
#endif

}  // namespace blanc::browser_api::bang_icons

// Copyright 2026 Bananify Creative. MIT; see the Blanc repository LICENSE.
#include "blanc/browser/ui/browser_api/search.h"

#include <algorithm>
#include <set>
#include <utility>

#include "base/command_line.h"
#include "base/functional/bind.h"
#include "base/i18n/case_conversion.h"
#include "base/json/json_reader.h"
#include "base/json/json_writer.h"
#include "base/no_destructor.h"
#include "base/strings/string_util.h"
#include "base/strings/utf_string_conversions.h"
#include "blanc/browser/ui/browser_api/search_choice.h"
#include "blanc/browser/ui/browser_api/suggestion_policy.h"
#include "chrome/browser/browser_process.h"
#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/search_engines/template_url_service_factory.h"
#include "chrome/browser/ui/browser_window/public/browser_window_interface.h"
#include "chrome/browser/ui/tabs/tab_strip_model.h"
#include "chrome/common/pref_names.h"
#include "components/prefs/pref_service.h"
#include "components/search_engines/template_url.h"
#include "components/search_engines/template_url_service.h"
#include "content/public/browser/browser_context.h"
#include "content/public/browser/storage_partition.h"
#include "content/public/browser/web_contents.h"
#include "net/base/load_flags.h"
#include "net/http/http_request_headers.h"
#include "net/http/http_response_headers.h"
#include "net/traffic_annotation/network_traffic_annotation.h"
#include "services/network/public/cpp/resource_request.h"
#include "services/network/public/cpp/simple_url_loader.h"
#include "services/network/public/mojom/url_response_head.mojom.h"

namespace blanc::browser_api {
namespace {

constexpr base::TimeDelta kTimeout = base::Milliseconds(2500);
constexpr base::TimeDelta kCacheTtl = base::Seconds(30);
constexpr size_t kMaxCacheEntries = 64;

std::unique_ptr<network::ResourceRequest> SuggestionRequest(const GURL& url,
                                                            const std::string& locale) {
  auto request = std::make_unique<network::ResourceRequest>();
  request->url = url;
  request->method = "GET";
  request->credentials_mode = network::mojom::CredentialsMode::kOmit;
  request->redirect_mode = network::mojom::RedirectMode::kError;
  request->load_flags = net::LOAD_DISABLE_CACHE;
  request->headers.SetHeader(net::HttpRequestHeaders::kAccept,
      "application/json, application/x-suggestions+json;q=0.9, */*;q=0.1");
  if (!locale.empty()) request->headers.SetHeader(net::HttpRequestHeaders::kAcceptLanguage, locale);
  return request;
}

// Shipping's parseOpenSearchSuggestions: [query, [suggestion, ...]].
std::vector<std::string> ParseSuggestions(const std::string& body) {
  std::vector<std::string> out;
  auto payload = base::JSONReader::Read(body, base::JSON_PARSE_RFC);
  if (!payload || !payload->is_list() || payload->GetList().size() < 2 ||
      !payload->GetList()[1].is_list()) return out;
  std::set<std::u16string> seen;
  for (const auto& value : payload->GetList()[1].GetList()) {
    if (!value.is_string()) continue;
    auto text = CleanSuggestion(value.GetString());
    if (!text || !seen.insert(base::i18n::ToLower(base::UTF8ToUTF16(*text))).second) continue;
    out.push_back(std::move(*text));
    if (out.size() >= kMaxSuggestions) break;
  }
  return out;
}

}  // namespace

blanc::custom_search::Settings SelectedSearch(TemplateURLService* service) {
  blanc::custom_search::Settings current;
  const TemplateURL* custom = service->GetTemplateURLForKeyword(kCustomKeyword);
  if (custom) current.custom_template = FromChromiumPattern(custom->url()).value_or("");
  const TemplateURL* selected = service->GetDefaultSearchProvider();
  if (!selected || service->IsExtensionControlledDefaultSearch()) return current;
  if (selected == custom) current.engine = "custom";
  else if (auto name = StockName(selected->prepopulate_id())) current.engine = std::string(*name);
  return current;
}

#if BUILDFLAG(ENABLE_BLANC_TEST_HOOKS)
std::optional<std::vector<std::string>>& TestSuggestionFixture() {
  static base::NoDestructor<std::optional<std::vector<std::string>>> fixture;
  return *fixture;
}
std::vector<TestSuggestionRequest>& TestSuggestionRequests() {
  static base::NoDestructor<std::vector<TestSuggestionRequest>> requests;
  return *requests;
}
#endif

Search::Search(BrowserGetter browser, mojo::PendingReceiver<mojom::Search> receiver,
               mojo::PendingRemote<mojom::SearchClient> client)
    : browser_(std::move(browser)), receiver_(this, std::move(receiver)), client_(std::move(client)) {}

Search::~Search() = default;

std::optional<Search::Engine> Search::CurrentEngine() {
  auto* browser = browser_.Run();
  auto* service = browser
      ? TemplateURLServiceFactory::GetForProfile(browser->GetProfile()->GetOriginalProfile()) : nullptr;
  if (!service) return std::nullopt;
  if (!service->loaded()) {
    service->Load();
    return std::nullopt;
  }
  const auto selected = SelectedSearch(service);
  if (auto label = StockLabel(selected.engine)) return Engine{selected.engine, std::string(*label)};
  // Blanc's custom address, or an engine shipping has no name for: both are
  // labelled with their server and, as shipping's custom engine, never receive
  // typed text before Enter.
  std::string label;
  if (selected.engine == "custom") {
    if (auto valid = blanc::custom_search::Validate(selected.custom_template)) label = valid->display_host;
  } else if (const TemplateURL* other = service->GetDefaultSearchProvider()) {
    label = base::UTF16ToUTF8(other->short_name());
  }
  return Engine{"custom", label};
}

bool Search::SuggestionsOn() {
  auto* browser = browser_.Run();
  return browser && browser->GetProfile()->GetOriginalProfile()->GetPrefs()->GetBoolean(
      prefs::kSearchSuggestEnabled);
}

void Search::Finish(const Engine& engine, std::vector<std::string> suggestions) {
  if (!pending_) return;
  std::move(pending_).Run(mojom::SearchSuggestions::New(engine.id, engine.label, std::move(suggestions)));
}

void Search::SearchSuggestions(const std::string& query, SearchSuggestionsCallback callback) {
  // A new request replaces the one in flight, which answers with nothing.
  loader_.reset();
  if (pending_) {
    auto previous = CurrentEngine().value_or(Engine{"custom", ""});
    Finish(previous, {});
  }
  pending_ = std::move(callback);
  const auto engine = CurrentEngine();
  if (!engine) {
    // Chromium's search engine store is still loading.
    Finish(Engine{"custom", ""}, {});
    return;
  }
  // The opt-out and private tabs are hard stops here, at the trusted
  // boundary; so is bang-shaped text, known or not.
  auto* browser = browser_.Run();
  auto* tab = browser ? browser->GetTabStripModel()->GetActiveWebContents() : nullptr;
  const std::string locale = g_browser_process->GetApplicationLocale();
  const auto url = SuggestionRequestUrl(engine->id, query, locale);
  if (!SuggestionsOn() || !tab || tab->GetBrowserContext()->IsOffTheRecord() ||
      HasBangToken(query) || !IsSuggestionEligible(query) || !url) {
    Finish(*engine, {});
    return;
  }

  const std::string key = engine->id + "\n" + locale + "\n" +
      base::UTF16ToUTF8(base::i18n::ToLower(base::UTF8ToUTF16(base::TrimWhitespaceASCII(query, base::TRIM_ALL))));
  if (auto hit = cache_.find(key); hit != cache_.end()) {
    if (hit->second.expires > base::TimeTicks::Now()) {
      std::erase(cache_order_, key);
      cache_order_.push_back(key);
      Finish(*engine, hit->second.suggestions);
      return;
    }
    cache_.erase(hit);
    std::erase(cache_order_, key);
  }

  auto request = SuggestionRequest(GURL(*url), locale);
#if BUILDFLAG(ENABLE_BLANC_TEST_HOOKS)
  if (base::CommandLine::ForCurrentProcess()->HasSwitch("blanc-test") && TestSuggestionFixture()) {
    // Record the request exactly as it would be sent, then answer with the
    // fixture in the provider's own shape.
    TestSuggestionRequests().push_back({engine->id, std::string(base::TrimWhitespaceASCII(query, base::TRIM_ALL)),
        request->url.spec(),
        request->credentials_mode == network::mojom::CredentialsMode::kOmit ? "omit" : "include"});
    base::ListValue list;
    for (const auto& value : *TestSuggestionFixture()) list.Append(value);
    std::string body;
    base::JSONWriter::Write(base::ListValue().Append(query).Append(std::move(list)), &body);
    OnResponse(*engine, key, std::move(body));
    return;
  }
#endif
  loader_ = network::SimpleURLLoader::Create(std::move(request),
      net::DefineNetworkTrafficAnnotation("blanc_search_suggestions", R"(
        semantics { sender: "Blanc address bar"
          description: "Asks the selected search engine for completions of the text typed in the address bar."
          trigger: "Typing in the address bar with search suggestions on, in a normal tab."
          data: "The typed text and the interface language; no cookies or credentials."
          destination: OTHER }
        policy { cookies_allowed: NO
          setting: "Settings > General > Search > Search suggestions."
          policy_exception_justification: "Shipping Blanc's suggestion service, ported." })"));
  loader_->SetTimeoutDuration(kTimeout);
  auto* browser_profile = browser->GetProfile()->GetOriginalProfile();
  loader_->DownloadToString(
      browser_profile->GetDefaultStoragePartition()->GetURLLoaderFactoryForBrowserProcess().get(),
      base::BindOnce(
          [](base::WeakPtr<Search> self, Engine engine, std::string key, std::optional<std::string> body) {
            if (!self) return;
            const auto* head = self->loader_ ? self->loader_->ResponseInfo() : nullptr;
            const bool ok = body && head && head->headers &&
                head->headers->response_code() >= 200 && head->headers->response_code() < 300;
            self->loader_.reset();
            self->OnResponse(std::move(engine), std::move(key),
                             ok ? std::move(body) : std::nullopt);
          },
          weak_factory_.GetWeakPtr(), *engine, key),
      kMaxSuggestionResponseBytes);
}

void Search::OnResponse(Engine engine, std::string key, std::optional<std::string> body) {
  // Autocomplete never surfaces an error: a failure is simply no suggestions.
  std::vector<std::string> suggestions = body ? ParseSuggestions(*body) : std::vector<std::string>();
  if (body) {
    cache_[key] = Cached{suggestions, base::TimeTicks::Now() + kCacheTtl};
    std::erase(cache_order_, key);
    cache_order_.push_back(key);
    while (cache_order_.size() > kMaxCacheEntries) {
      cache_.erase(cache_order_.front());
      cache_order_.erase(cache_order_.begin());
    }
  }
  // The engine or the opt-out can change while a request is in flight. Never
  // label old-provider completions as the newly selected engine's.
  const auto latest = CurrentEngine();
  if (!latest || latest->id != engine.id || !SuggestionsOn()) {
    Finish(latest.value_or(Engine{"custom", ""}), {});
    return;
  }
  Finish(engine, std::move(suggestions));
}

void Search::Bangs(BangsCallback callback) {
  std::move(callback).Run(mojom::BangsState::New(false, std::vector<mojom::CustomBangPtr>(),
                                                 std::vector<std::string>()));
}

void Search::BangIcons(const std::vector<std::string>& hosts, BangIconsCallback callback) {
  std::move(callback).Run({});
}

}  // namespace blanc::browser_api

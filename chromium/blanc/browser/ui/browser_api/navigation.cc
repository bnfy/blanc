// Copyright 2026 Bananify Creative. MIT; see the Blanc repository LICENSE.
#include "blanc/browser/ui/browser_api/navigation.h"

#include <utility>

#include "base/command_line.h"
#include "base/functional/bind.h"
#include "base/strings/string_util.h"
#include "base/strings/string_number_conversions.h"
#include "base/memory/weak_ptr.h"
#include "base/task/sequenced_task_runner.h"
#include "blanc/browser/ui/browser_api/external_handoff.h"
#include "blanc/browser/ui/browser_api/typed_https_fallback.h"
#include "blanc/browser/ui/modules/selected_shipping.h"
#include "blanc/buildflags.h"
#include "base/no_destructor.h"
#include "chrome/browser/platform_util.h"
#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/ui/browser_window/public/browser_window_interface.h"
#include "chrome/browser/ui/tabs/tab_strip_model.h"
#include "components/security_interstitials/content/stateful_ssl_host_state_delegate.h"
#include "components/sessions/content/session_tab_helper.h"
#include "content/public/browser/browser_context.h"
#include "content/public/browser/navigation_controller.h"
#include "content/public/browser/navigation_handle.h"
#include "content/public/browser/render_frame_host.h"
#include "content/public/browser/web_contents.h"
#include "content/public/browser/web_contents_observer.h"
#include "ui/base/page_transition_types.h"

namespace blanc::browser_api {
namespace {

// Follows one load to its end, then deletes itself. With `fallback_from` set,
// an HTTPS load of that address which fails to connect or fails TLS is tried
// once over HTTP instead (typed_https_fallback.h), and the HTTP load is the
// one followed.
class LoadWatcher : public content::WebContentsObserver {
 public:
  LoadWatcher(content::WebContents* tab, int64_t navigation_id, GURL fallback_from,
              base::OnceCallback<void(std::optional<bool>)> done)
      : content::WebContentsObserver(tab),
        navigation_id_(navigation_id),
        fallback_from_(std::move(fallback_from)),
        done_(std::move(done)) {}

  void DidStartNavigation(content::NavigationHandle* handle) override {
    // A later main-frame load after ours committed supersedes it, as does one
    // that starts while the HTTP attempt waits to begin.
    if ((committed_ || fallback_pending_) && handle->IsInPrimaryMainFrame() &&
        !handle->IsSameDocument() && handle->GetNavigationId() != navigation_id_) {
      Finish(false);
    }
  }
  void DidFinishNavigation(content::NavigationHandle* handle) override {
    if (handle->GetNavigationId() != navigation_id_) return;
    if (!handle->HasCommitted() || handle->IsErrorPage()) {
      // Only the address asked for, never one a redirect reached.
      if (fallback_from_.is_valid() && IsHttpFallbackError(handle->GetNetErrorCode()) &&
          handle->GetURL() == fallback_from_) {
        // Started after this callback returns: a navigation begun from inside
        // another's DidFinishNavigation re-enters the controller.
        fallback_pending_ = true;
        base::SequencedTaskRunner::GetCurrentDefault()->PostTask(
            FROM_HERE, base::BindOnce(&LoadWatcher::StartHttpFallback, weak_factory_.GetWeakPtr()));
        return;
      }
      Finish(false);
    } else {
      committed_ = true;
    }
  }
  void DidStopLoading() override {
    if (committed_) Finish(true);
  }
  void WebContentsDestroyed() override { Finish(false); }

 private:
  void StartHttpFallback() {
    if (!done_ || !fallback_pending_ || !web_contents()) return;
    fallback_pending_ = false;
    GURL::Replacements http;
    http.SetSchemeStr("http");
    const GURL url = fallback_from_.ReplaceComponents(http);
    fallback_from_ = GURL();
    content::WebContents* tab = web_contents();
    // Chromium's HTTPS-Upgrades would turn this http:// load back into the
    // https:// one that just failed. Allow HTTP for the host, as Chrome does
    // itself when its own upgrade of a site fails; the exception lasts a week
    // from the last visit and stays in memory for a private profile.
    if (auto* state = static_cast<StatefulSSLHostStateDelegate*>(
            tab->GetBrowserContext()->GetSSLHostStateDelegate())) {
      state->AllowHttpForHost(url.GetHost(), tab->GetPrimaryMainFrame()->GetStoragePartition());
    }
    content::NavigationController::LoadURLParams params(url);
    params.transition_type = ui::PAGE_TRANSITION_TYPED;
    auto handle = tab->GetController().LoadURLWithParams(params);
    if (!handle) {
      Finish(false);
      return;
    }
    navigation_id_ = handle->GetNavigationId();
  }
  void Finish(bool finished) {
    if (!done_) return;
    Observe(nullptr);
    std::move(done_).Run(finished);
    base::SequencedTaskRunner::GetCurrentDefault()->DeleteSoon(FROM_HERE, this);
  }
  int64_t navigation_id_;
  GURL fallback_from_;
  bool committed_ = false;
  bool fallback_pending_ = false;
  base::OnceCallback<void(std::optional<bool>)> done_;
  base::WeakPtrFactory<LoadWatcher> weak_factory_{this};
};

// Whether acting on a quiet (discarded) tab woke it, or nothing otherwise.
std::optional<bool> Woke(bool was_discarded) {
  return was_discarded ? std::optional<bool>(true) : std::nullopt;
}

}  // namespace

#if BUILDFLAG(ENABLE_BLANC_TEST_HOOKS)
std::vector<std::pair<std::string, bool>>& TestHandoffs() {
  static base::NoDestructor<std::vector<std::pair<std::string, bool>>> handoffs;
  return *handoffs;
}
#endif

Navigation::Navigation(BrowserGetter browser, mojo::PendingReceiver<mojom::Navigation> receiver)
    : browser_(std::move(browser)), receiver_(this, std::move(receiver)) {}

Navigation::~Navigation() = default;

content::WebContents* Navigation::Tab(const std::string& id) {
  int session_id = 0;
  auto* browser = browser_.Run();
  if (!browser || !base::StringToInt(id, &session_id)) return nullptr;
  auto* model = browser->GetTabStripModel();
  for (int i = 0; i < model->count(); ++i) {
    auto* tab = model->GetWebContentsAt(i);
    if (sessions::SessionTabHelper::IdForTab(tab).id() == session_id) return tab;
  }
  return nullptr;
}

void Navigation::Load(content::WebContents* tab, const GURL& url,
                      base::OnceCallback<void(std::optional<bool>)> done, bool http_fallback) {
  // Only web addresses load from typed input; anything else loads nothing.
  if (!url.SchemeIsHTTPOrHTTPS()) {
    std::move(done).Run(std::nullopt);
    return;
  }
  content::NavigationController::LoadURLParams params(url);
  params.transition_type = ui::PAGE_TRANSITION_TYPED;
  auto handle = tab->GetController().LoadURLWithParams(params);
  if (!handle) {
    std::move(done).Run(std::nullopt);
    return;
  }
  // An address from the address bar may drop back to HTTP once
  // (typed_https_fallback.h); a search never does.
  const bool may_fall_back = http_fallback && url.SchemeIs("https") &&
      MayFallBackToHttp(url.host(), url.has_port(), url.has_username() || url.has_password());
  new LoadWatcher(tab, handle->GetNavigationId(), may_fall_back ? url : GURL(), std::move(done));
}

void Navigation::Navigate(const std::string& id, const std::string& url, NavigateCallback callback) {
  auto* tab = Tab(id);
  if (!tab) {
    std::move(callback).Run(std::nullopt);
    return;
  }
  // An OS hand-off is decided on the typed text first, as in shipping:
  // familiar links open directly, custom app links through Chromium's
  // external-protocol prompt (V9). Nothing loads in the tab itself.
  const Handoff handoff = ClassifyExternalNavigation(url, /*trusted=*/true);
  if (handoff == Handoff::kOpen || handoff == Handoff::kConfirm) {
#if BUILDFLAG(ENABLE_BLANC_TEST_HOOKS)
    if (base::CommandLine::ForCurrentProcess()->HasSwitch("blanc-test")) {
      TestHandoffs().emplace_back(url, handoff == Handoff::kConfirm);
      std::move(callback).Run(std::nullopt);
      return;
    }
#endif
    if (handoff == Handoff::kOpen) {
      platform_util::OpenExternal(GURL(url));
    } else if (handoff == Handoff::kConfirm) {
      tab->GetController().LoadURL(GURL(url), content::Referrer(), ui::PAGE_TRANSITION_TYPED, std::string());
    }
    std::move(callback).Run(std::nullopt);
    return;
  }
  Load(tab, GURL(url), std::move(callback), /*http_fallback=*/true);
}

void Navigation::Search(const std::string& id, const std::string& query,
                        const std::optional<std::string>& engine, SearchCallback callback) {
  // The engine argument is ignored, as in the contract: the profile's
  // selected provider decides (TemplateURLService; DuckDuckGo by default).
  auto* tab = Tab(id);
  auto* browser = browser_.Run();
  if (!tab || !browser || base::TrimWhitespaceASCII(query, base::TRIM_ALL).empty()) {
    std::move(callback).Run(nullptr);
    return;
  }
  const auto resolution = blanc::custom_search::ResolveCurrentSelectedShipping(browser->GetProfile(), query);
  if (resolution.status != blanc::custom_search::ShippingStatus::kReady || !resolution.url) {
    // Nothing loads while the provider is loading, changing or unsupported.
    std::move(callback).Run(nullptr);
    return;
  }
#if BUILDFLAG(ENABLE_BLANC_TEST_HOOKS)
  // Under the desktop test hook a search resolves to its URL instead of
  // loading it, as the contract specifies.
  if (base::CommandLine::ForCurrentProcess()->HasSwitch("blanc-test")) {
    std::move(callback).Run(mojom::BoolOrString::NewStringValue(*resolution.url));
    return;
  }
#endif
  Load(tab, GURL(*resolution.url),
       base::BindOnce([](SearchCallback callback, std::optional<bool>) {
         // A started search resolves to nothing, as in the contract.
         std::move(callback).Run(nullptr);
       }, std::move(callback)));
}

void Navigation::GoBack(const std::string& id, GoBackCallback callback) {
  auto* tab = Tab(id);
  if (!tab || !tab->GetController().CanGoBack()) {
    std::move(callback).Run(std::nullopt);
    return;
  }
  const bool discarded = tab->WasDiscarded();
  tab->GetController().GoBack();
  std::move(callback).Run(Woke(discarded));
}

void Navigation::GoForward(const std::string& id, GoForwardCallback callback) {
  auto* tab = Tab(id);
  if (!tab || !tab->GetController().CanGoForward()) {
    std::move(callback).Run(std::nullopt);
    return;
  }
  const bool discarded = tab->WasDiscarded();
  tab->GetController().GoForward();
  std::move(callback).Run(Woke(discarded));
}

void Navigation::Reload(const std::string& id, ReloadCallback callback) {
  auto* tab = Tab(id);
  if (!tab) {
    std::move(callback).Run(std::nullopt);
    return;
  }
  const bool discarded = tab->WasDiscarded();
  tab->GetController().Reload(content::ReloadType::NORMAL, false);
  std::move(callback).Run(Woke(discarded));
}

void Navigation::Stop(const std::string& id, StopCallback callback) {
  if (auto* tab = Tab(id)) tab->Stop();
  std::move(callback).Run();
}

void Navigation::ToggleReaderMode(const std::string& id, ToggleReaderModeCallback callback) {
  std::move(callback).Run(false);
}

}  // namespace blanc::browser_api

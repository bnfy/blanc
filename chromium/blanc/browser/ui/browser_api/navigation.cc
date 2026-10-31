// Copyright 2026 Bananify Creative. MIT; see the Blanc repository LICENSE.
#include "blanc/browser/ui/browser_api/navigation.h"

#include <utility>

#include "base/functional/bind.h"
#include "base/strings/escape.h"
#include "base/strings/string_number_conversions.h"
#include "base/task/sequenced_task_runner.h"
#include "chrome/browser/ui/browser_window/public/browser_window_interface.h"
#include "chrome/browser/ui/tabs/tab_strip_model.h"
#include "components/sessions/content/session_tab_helper.h"
#include "content/public/browser/navigation_controller.h"
#include "content/public/browser/navigation_handle.h"
#include "content/public/browser/web_contents.h"
#include "content/public/browser/web_contents_observer.h"
#include "ui/base/page_transition_types.h"

namespace blanc::browser_api {
namespace {

// Follows one load to its end, then deletes itself.
class LoadWatcher : public content::WebContentsObserver {
 public:
  LoadWatcher(content::WebContents* tab, int64_t navigation_id,
              base::OnceCallback<void(std::optional<bool>)> done)
      : content::WebContentsObserver(tab), navigation_id_(navigation_id), done_(std::move(done)) {}

  void DidStartNavigation(content::NavigationHandle* handle) override {
    // A later main-frame load after ours committed supersedes it.
    if (committed_ && handle->IsInPrimaryMainFrame() && !handle->IsSameDocument() &&
        handle->GetNavigationId() != navigation_id_) {
      Finish(false);
    }
  }
  void DidFinishNavigation(content::NavigationHandle* handle) override {
    if (handle->GetNavigationId() != navigation_id_) return;
    if (!handle->HasCommitted() || handle->IsErrorPage()) Finish(false);
    else committed_ = true;
  }
  void DidStopLoading() override {
    if (committed_) Finish(true);
  }
  void WebContentsDestroyed() override { Finish(false); }

 private:
  void Finish(bool finished) {
    if (!done_) return;
    Observe(nullptr);
    std::move(done_).Run(finished);
    base::SequencedTaskRunner::GetCurrentDefault()->DeleteSoon(FROM_HERE, this);
  }
  const int64_t navigation_id_;
  bool committed_ = false;
  base::OnceCallback<void(std::optional<bool>)> done_;
};

// Whether acting on a quiet (discarded) tab woke it, or nothing otherwise.
std::optional<bool> Woke(bool was_discarded) {
  return was_discarded ? std::optional<bool>(true) : std::nullopt;
}

}  // namespace

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
                      base::OnceCallback<void(std::optional<bool>)> done) {
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
  new LoadWatcher(tab, handle->GetNavigationId(), std::move(done));
}

void Navigation::Navigate(const std::string& id, const std::string& url, NavigateCallback callback) {
  auto* tab = Tab(id);
  if (!tab) {
    std::move(callback).Run(std::nullopt);
    return;
  }
  Load(tab, GURL(url), std::move(callback));
}

void Navigation::Search(const std::string& id, const std::string& query,
                        const std::optional<std::string>& engine, SearchCallback callback) {
  // The engine argument is ignored, as in the contract. Searches still go to
  // Google until search engines move to TemplateURLService (F5).
  auto* tab = Tab(id);
  if (!tab || query.empty()) {
    std::move(callback).Run(nullptr);
    return;
  }
  Load(tab, GURL("https://www.google.com/search?q=" + base::EscapeQueryParamValue(query, false)),
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

}  // namespace blanc::browser_api

// Copyright 2026 Bananify Creative. MIT; see the Blanc repository LICENSE.
#ifndef BLANC_BROWSER_UI_BROWSER_API_NAVIGATION_H_
#define BLANC_BROWSER_UI_BROWSER_API_NAVIGATION_H_

#include <optional>
#include <string>

#include <vector>

#include "base/functional/callback.h"
#include "blanc/buildflags.h"
#include "blanc/common/browser_api/browser_api.mojom.h"
#include "mojo/public/cpp/bindings/pending_receiver.h"
#include "mojo/public/cpp/bindings/receiver.h"
#include "url/gurl.h"

class BrowserWindowInterface;
namespace content { class WebContents; }

namespace blanc::browser_api {

#if BUILDFLAG(ENABLE_BLANC_TEST_HOOKS)
// Typed hand-offs recorded instead of launched under --blanc-test, so a test
// run never opens Mail or another app: {url, whether Chromium would prompt}.
std::vector<std::pair<std::string, bool>>& TestHandoffs();
#endif

// The contract's "navigation" group over the Island window's tab strip. Tab ids
// are Chromium session ids; a tab outside the window is unknown.
class Navigation : public mojom::Navigation {
 public:
  using BrowserGetter = base::RepeatingCallback<BrowserWindowInterface*()>;
  Navigation(BrowserGetter browser, mojo::PendingReceiver<mojom::Navigation> receiver);
  Navigation(const Navigation&) = delete;
  Navigation& operator=(const Navigation&) = delete;
  ~Navigation() override;

  // mojom::Navigation:
  void Navigate(const std::string& id, const std::string& url, NavigateCallback callback) override;
  void Search(const std::string& id, const std::string& query,
              const std::optional<std::string>& engine, SearchCallback callback) override;
  void GoBack(const std::string& id, GoBackCallback callback) override;
  void GoForward(const std::string& id, GoForwardCallback callback) override;
  void Reload(const std::string& id, ReloadCallback callback) override;
  void Stop(const std::string& id, StopCallback callback) override;

 private:
  content::WebContents* Tab(const std::string& id);
  // Loads `url` and reports whether it committed and finished loading (false
  // when superseded or failed), or nothing when no load started.
  void Load(content::WebContents* tab, const GURL& url,
            base::OnceCallback<void(std::optional<bool>)> done);

  BrowserGetter browser_;
  mojo::Receiver<mojom::Navigation> receiver_;
};

}  // namespace blanc::browser_api

#endif  // BLANC_BROWSER_UI_BROWSER_API_NAVIGATION_H_

#include "glance_card_authority.h"

#include "base/check.h"
#include "base/functional/bind.h"
#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/ui/browser_window/public/browser_window_interface.h"
#include "chrome/browser/ui/tabs/tab_strip_model.h"
#include "components/tabs/public/tab_interface.h"
#include "content/public/browser/web_contents.h"
#include "ui/views/controls/webview/webview.h"

namespace blanc::glance::draft {

GlanceCardAuthority::GlanceCardAuthority(BrowserWindowInterface* browser,
    views::WebView* card, views::WebView* page, tabs::TabInterface* main,
    tabs::TabInterface* reference, uint64_t generation)
    : browser_(browser ? browser->GetWeakPtr() : nullptr), card_(card), page_(page),
      main_(main ? main->GetWeakPtr() : nullptr),
      reference_(reference ? reference->GetWeakPtr() : nullptr), generation_(generation) {
  CHECK(browser);
  CHECK(card);
  CHECK(page);
  CHECK(main);
  CHECK(reference);
  CHECK(generation);
  card_.SetTrackEntireViewHierarchy(true);
  page_.SetTrackEntireViewHierarchy(true);
}
GlanceCardAuthority::~GlanceCardAuthority() = default;
base::WeakPtr<GlanceCardAuthority> GlanceCardAuthority::GetWeakPtr() {
  return weak_factory_.GetWeakPtr();
}
base::RepeatingCallback<bool(content::WebContents*, uint64_t)>
GlanceCardAuthority::MakeAuthorizeCallback() {
  return base::BindRepeating(
      [](base::WeakPtr<GlanceCardAuthority> authority,
         content::WebContents* sender, uint64_t generation) {
        return authority && authority->Authorize(sender, generation);
      }, weak_factory_.GetWeakPtr());
}
bool GlanceCardAuthority::Authorize(content::WebContents* sender, uint64_t generation) {
  auto* card = static_cast<views::WebView*>(card_.view());
  auto* page = static_cast<views::WebView*>(page_.view());
  if (!browser_ || !card || !page || card == page || !main_ || !reference_ || !sender ||
      generation != generation_ || sender->IsBeingDestroyed() ||
      card->web_contents() != sender || main_.get() == reference_.get() ||
      main_->GetBrowserWindowInterface() != browser_.get() ||
      reference_->GetBrowserWindowInterface() != browser_.get() ||
      main_->GetProfile() != browser_->GetProfile() ||
      reference_->GetProfile() != browser_->GetProfile() ||
      sender->GetBrowserContext() != browser_->GetProfile() ||
      card->GetBrowserContext() != browser_->GetProfile() ||
      page->GetBrowserContext() != browser_->GetProfile() ||
      !main_->GetContents() || !reference_->GetContents() ||
      main_->GetContents()->GetBrowserContext() != browser_->GetProfile() ||
      sender == main_->GetContents() || sender == reference_->GetContents() ||
      page->web_contents() != reference_->GetContents() ||
      reference_->GetContents()->GetBrowserContext() != browser_->GetProfile() ||
      main_->IsSplit() || reference_->IsSplit() || !main_->IsActivated()) {
    return false;
  }
  auto* model = browser_->GetTabStripModel();
  return model && model->GetActiveTab() == main_.get() &&
      model->GetIndexOfTab(main_.get()) >= 0 &&
      model->GetIndexOfTab(reference_.get()) >= 0;
}
}  // namespace blanc::glance::draft

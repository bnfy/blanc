#include "glance_tab_attachment.h"

#include "base/check.h"
#include "base/functional/bind.h"
#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/ui/views/frame/browser_view.h"
#include "chrome/browser/ui/views/frame/multi_contents_view.h"
#include "content/public/browser/web_contents.h"
#include "ui/views/controls/webview/webview.h"

namespace blanc::glance::draft {

GlanceTabAttachment::GlanceTabAttachment(BrowserView* browser,
                                         views::WebView* page)
    : browser_(browser), page_(page) {
  CHECK(browser_);
  CHECK(page_);
}

GlanceTabAttachment::~GlanceTabAttachment() {
  Detach();
}

bool GlanceTabAttachment::Attach(tabs::TabInterface* tab) {
  if (!tab || tab_ || page_->web_contents() || tab->IsActivated() ||
      tab->IsVisible() || tab->IsSplit() ||
      browser_->multi_contents_view()->IsInSplitView() ||
      tab->GetBrowserWindowInterface() != browser_->browser() ||
      tab->GetProfile() != browser_->GetProfile() ||
      page_->GetBrowserContext() != browser_->GetProfile() ||
      !tab->GetContents() ||
      tab->GetContents()->GetBrowserContext() != browser_->GetProfile() ||
      browser_->GetContentsContainerViewFor(tab->GetContents())) {
    return false;
  }
  tab_ = tab->GetWeakPtr();
  detach_subscription_ = tab->RegisterWillDetach(base::BindRepeating(
      &GlanceTabAttachment::OnWillDetach, weak_factory_.GetWeakPtr()));
  discard_subscription_ = tab->RegisterWillDiscardContents(base::BindRepeating(
      &GlanceTabAttachment::OnWillDiscard, weak_factory_.GetWeakPtr()));
  auto weak = weak_factory_.GetWeakPtr();
  page_->SetWebContents(tab->GetContents());
  if (!weak) {
    return false;
  }
  if (!weak->tab_ || weak->page_->web_contents() != weak->tab_->GetContents()) {
    weak->Detach();
    return false;
  }
  return true;
}

void GlanceTabAttachment::BeforeActiveTabChanged(
    content::WebContents* new_contents) {
  if (tab_ && tab_->GetContents() == new_contents) {
    Detach();
  }
}

void GlanceTabAttachment::Detach() {
  content::WebContents* attached = tab_ ? tab_->GetContents() : nullptr;
  detach_subscription_ = {};
  discard_subscription_ = {};
  tab_.reset();
  if (attached && page_->web_contents() == attached) {
    page_->SetWebContents(nullptr);
  }
}

void GlanceTabAttachment::OnWillDetach(tabs::TabInterface*,
                                       tabs::TabInterface::DetachReason) {
  Detach();
}

void GlanceTabAttachment::OnWillDiscard(tabs::TabInterface*,
                                        content::WebContents*,
                                        content::WebContents*) {
  Detach();
}

}  // namespace blanc::glance::draft

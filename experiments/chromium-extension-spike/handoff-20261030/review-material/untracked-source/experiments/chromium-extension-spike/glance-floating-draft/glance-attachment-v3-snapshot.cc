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
  CHECK(browser);
  CHECK(page);
  browser_.SetTrackEntireViewHierarchy(true);
  page_.SetTrackEntireViewHierarchy(true);
}

GlanceTabAttachment::~GlanceTabAttachment() {
  Detach();
}

bool GlanceTabAttachment::Attach(tabs::TabInterface* tab) {
  auto* browser = static_cast<BrowserView*>(browser_.view());
  auto* page = static_cast<views::WebView*>(page_.view());
  if (!browser || !page || !browser->multi_contents_view() || !tab || tab_ ||
      page->web_contents() || tab->IsActivated() ||
      tab->IsVisible() || tab->IsSplit() ||
      browser->multi_contents_view()->IsInSplitView() ||
      tab->GetBrowserWindowInterface() != browser->browser() ||
      tab->GetProfile() != browser->GetProfile() ||
      page->GetBrowserContext() != browser->GetProfile() ||
      !tab->GetContents() ||
      tab->GetContents()->GetBrowserContext() != browser->GetProfile() ||
      browser->GetContentsContainerViewFor(tab->GetContents())) {
    return false;
  }
  tab_ = tab->GetWeakPtr();
  detach_subscription_ = tab->RegisterWillDetach(base::BindRepeating(
      &GlanceTabAttachment::OnWillDetach, weak_factory_.GetWeakPtr()));
  discard_subscription_ = tab->RegisterWillDiscardContents(base::BindRepeating(
      &GlanceTabAttachment::OnWillDiscard, weak_factory_.GetWeakPtr()));
  auto weak = weak_factory_.GetWeakPtr();
  page->SetWebContents(tab->GetContents());
  if (!weak) {
    return false;
  }
  auto* current_page = static_cast<views::WebView*>(weak->page_.view());
  auto* current_browser = static_cast<BrowserView*>(weak->browser_.view());
  if (!current_page || !current_browser || !current_browser->multi_contents_view() ||
      !weak->tab_ || weak->tab_->IsActivated() || weak->tab_->IsSplit() ||
      current_browser->multi_contents_view()->IsInSplitView() ||
      weak->tab_->GetBrowserWindowInterface() != current_browser->browser() ||
      current_page->web_contents() != weak->tab_->GetContents()) {
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

void GlanceTabAttachment::BeforeSplitView() {
  Detach();
}

void GlanceTabAttachment::Detach() {
  content::WebContents* attached = tab_ ? tab_->GetContents() : nullptr;
  detach_subscription_ = {};
  discard_subscription_ = {};
  tab_.reset();
  auto* page = static_cast<views::WebView*>(page_.view());
  if (page && attached && page->web_contents() == attached) {
    page->SetWebContents(nullptr);
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

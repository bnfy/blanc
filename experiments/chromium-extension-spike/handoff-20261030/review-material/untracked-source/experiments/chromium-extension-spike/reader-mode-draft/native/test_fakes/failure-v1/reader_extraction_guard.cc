// Draft only: not registered, built, or used by the prototype.
#include "reader_extraction_guard.h"

namespace blanc::reader {
ExtractionGuard::ExtractionGuard(BrowserWindowInterface* window,
                                 content::WebContents* source,
                                 EligibilityCheck eligible)
    : content::WebContentsObserver(source),
      eligible_(std::move(eligible)),
      window_(window->GetWeakPtr()),
      profile_(window->GetProfile()->GetWeakPtr()),
      source_(source->GetWeakPtr()) {
  visible_ = source->GetVisibility() == content::Visibility::VISIBLE;
  window->GetTabStripModel()->AddObserver(this);
}
ExtractionGuard::~ExtractionGuard() {
  timer_.Stop();
  completion_.Reset();
}
void ExtractionGuard::DidStartNavigation(content::NavigationHandle* navigation) {
  if (!navigation->IsInPrimaryMainFrame()) return;
  primary_navigations_.insert(navigation->GetNavigationId());
  Cancel();
}
void ExtractionGuard::DidFinishNavigation(content::NavigationHandle* navigation) {
  if (!navigation->IsInPrimaryMainFrame()) return;
  primary_navigations_.erase(navigation->GetNavigationId());
  Cancel();
}
void ExtractionGuard::PrimaryPageChanged(content::Page&) { Cancel(); }
void ExtractionGuard::PrimaryMainFrameRenderProcessGone(base::TerminationStatus) { Cancel(); }
void ExtractionGuard::OnVisibilityChanged(content::Visibility visibility) {
  visible_ = visibility == content::Visibility::VISIBLE;
  if (!visible_) Cancel();
}
void ExtractionGuard::WebContentsDestroyed() {
  source_destroyed_ = true;
  Cancel();
}
void ExtractionGuard::OnTabStripModelChanged(
    TabStripModel*, const TabStripModelChange&, const TabStripSelectionChange&) {
  if (!completion_.is_null() && !CurrentWindowAndSource()) Cancel();
}
void ExtractionGuard::OnTabStripModelDestroyed(TabStripModel*) {
  model_destroyed_ = true;
  Cancel();
}
}  // namespace blanc::reader

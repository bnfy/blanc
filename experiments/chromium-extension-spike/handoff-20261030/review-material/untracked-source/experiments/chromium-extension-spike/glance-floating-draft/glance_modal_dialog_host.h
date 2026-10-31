#ifndef BLANC_GLANCE_FLOATING_DRAFT_MODAL_DIALOG_HOST_H_
#define BLANC_GLANCE_FLOATING_DRAFT_MODAL_DIALOG_HOST_H_

#include "base/memory/raw_ptr.h"
#include "chrome/browser/ui/views/frame/tab_modal_dialog_host.h"

class BrowserView;
class ContentsContainerView;

namespace blanc::glance::draft {

// The BrowserView owner must destroy this host before either view is destroyed.
// Uses Chromium's modal observer and activation behavior; position is based on
// the floating page rather than the main toolbar. Not wired to BrowserView yet.
class GlanceModalDialogHost : public TabModalDialogHost {
 public:
  GlanceModalDialogHost(BrowserView* browser, ContentsContainerView* page);
  ~GlanceModalDialogHost() override;
  gfx::Point GetDialogPosition(const gfx::Size& dialog_size) override;

 private:
  raw_ptr<BrowserView> browser_;
  raw_ptr<ContentsContainerView> page_;
};

}  // namespace blanc::glance::draft
#endif

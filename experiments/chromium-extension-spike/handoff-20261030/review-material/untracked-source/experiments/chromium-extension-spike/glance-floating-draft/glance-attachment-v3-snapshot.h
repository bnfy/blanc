#ifndef BLANC_GLANCE_FLOATING_DRAFT_TAB_ATTACHMENT_H_
#define BLANC_GLANCE_FLOATING_DRAFT_TAB_ATTACHMENT_H_

#include "base/callback_list.h"
#include "base/memory/weak_ptr.h"
#include "components/tabs/public/tab_interface.h"
#include "ui/views/view_tracker.h"

class BrowserView;
namespace content { class WebContents; }
namespace views { class WebView; }

namespace blanc::glance::draft {

// Experimental handoff, not yet wired to BrowserView. Its owner must outlive
// call BeforeActiveTabChanged at the beginning of BrowserView's active-tab
// change, and BeforeSplitView before any split pane attaches a WebContents.
// BrowserView, WebView, and this object are UI-sequence-only.
class GlanceTabAttachment {
 public:
  GlanceTabAttachment(BrowserView* browser, views::WebView* page);
  GlanceTabAttachment(const GlanceTabAttachment&) = delete;
  GlanceTabAttachment& operator=(const GlanceTabAttachment&) = delete;
  ~GlanceTabAttachment();

  bool Attach(tabs::TabInterface* tab);
  void BeforeActiveTabChanged(content::WebContents* new_contents);
  void BeforeSplitView();
  void Detach();

 private:
  void OnWillDetach(tabs::TabInterface* tab,
                    tabs::TabInterface::DetachReason reason);
  void OnWillDiscard(tabs::TabInterface* tab,
                     content::WebContents* old_contents,
                     content::WebContents* new_contents);

  views::ViewTracker browser_;
  views::ViewTracker page_;
  base::WeakPtr<tabs::TabInterface> tab_;
  base::CallbackListSubscription detach_subscription_;
  base::CallbackListSubscription discard_subscription_;
  base::WeakPtrFactory<GlanceTabAttachment> weak_factory_{this};
};

}  // namespace blanc::glance::draft
#endif

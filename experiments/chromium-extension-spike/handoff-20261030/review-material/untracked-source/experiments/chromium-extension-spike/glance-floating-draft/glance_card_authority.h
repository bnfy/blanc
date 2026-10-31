#ifndef BLANC_GLANCE_FLOATING_DRAFT_CARD_AUTHORITY_H_
#define BLANC_GLANCE_FLOATING_DRAFT_CARD_AUTHORITY_H_

#include <cstdint>

#include "base/functional/callback.h"
#include "base/memory/weak_ptr.h"
#include "ui/views/view_tracker.h"

class BrowserWindowInterface;
namespace content { class WebContents; }
namespace tabs { class TabInterface; }
namespace views { class WebView; }

namespace blanc::glance::draft {

// Experimental authority for one floating card generation. A window owner
// must own and destroy it before relinquishing the two views. All methods run
// on the UI sequence. MakeAuthorizeCallback returns false after destruction.
class GlanceCardAuthority {
 public:
  GlanceCardAuthority(BrowserWindowInterface* browser, views::WebView* card,
                      views::WebView* page, tabs::TabInterface* main,
                      tabs::TabInterface* reference, uint64_t generation);
  GlanceCardAuthority(const GlanceCardAuthority&) = delete;
  GlanceCardAuthority& operator=(const GlanceCardAuthority&) = delete;
  ~GlanceCardAuthority();
  base::WeakPtr<GlanceCardAuthority> GetWeakPtr();
  base::RepeatingCallback<bool(content::WebContents*, uint64_t)>
      MakeAuthorizeCallback();
  bool Authorize(content::WebContents* sender, uint64_t generation);
  content::WebContents* ReferenceContents(content::WebContents* sender,
                                          uint64_t generation);

 private:
  base::WeakPtr<BrowserWindowInterface> browser_;
  views::ViewTracker card_;
  views::ViewTracker page_;
  base::WeakPtr<tabs::TabInterface> main_;
  base::WeakPtr<tabs::TabInterface> reference_;
  const uint64_t generation_;
  base::WeakPtrFactory<GlanceCardAuthority> weak_factory_{this};
};
}  // namespace blanc::glance::draft
#endif

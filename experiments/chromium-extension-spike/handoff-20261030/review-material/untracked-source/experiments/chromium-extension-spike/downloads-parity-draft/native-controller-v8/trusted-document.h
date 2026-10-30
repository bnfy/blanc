#ifndef BLANC_DOWNLOADS_TRUSTED_DOCUMENT_H_
#define BLANC_DOWNLOADS_TRUSTED_DOCUMENT_H_

#include <memory>
#include "base/memory/weak_ptr.h"
#include "content/public/browser/weak_document_ptr.h"

class Profile;
namespace content { class RenderFrameHost; class WebContents; }

namespace blanc::downloads_projection {
// Browser-created binding to one host document. Not an IPC endpoint: the
// caller must supply the host, frame and context selected by its owning window.
// In particular this class does not establish which window owns the host.
class TrustedDocument {
 public:
  static std::unique_ptr<TrustedDocument> Bind(content::WebContents* host,
      content::RenderFrameHost* frame, Profile* expected_context);
  ~TrustedDocument();
  // Called with the frame associated with the current browser-owned receiver,
  // never a renderer-supplied frame ID. Actions require and consume activation.
  bool Validate(content::RenderFrameHost* caller, bool consume_activation) const;
 private:
  TrustedDocument(content::WebContents* host, content::RenderFrameHost* frame,
                  Profile* expected_context);
  base::WeakPtr<content::WebContents> host_;
  content::WeakDocumentPtr document_;
  base::WeakPtr<Profile> context_;
};
}  // namespace blanc::downloads_projection
#endif
